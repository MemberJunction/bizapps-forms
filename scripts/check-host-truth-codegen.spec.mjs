import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coreMigrationTag,
  newCaptureFiles,
  readCliResult,
  readMigrateStart,
  summarizeCapture,
  workingDatabaseName,
} from './check-host-truth-codegen.mjs';

test('coreMigrationTag reads the floor of the declared range and drops the prerelease', () => {
  assert.equal(coreMigrationTag('>=6.1.0-edge.5 <7.0.0'), 'v6.1.0');
  assert.equal(coreMigrationTag('>=5.31.0 <6.0.0'), 'v5.31.0');
  assert.equal(coreMigrationTag('>= 6.1.0-edge.5 <7.0.0'), 'v6.1.0');
});

test('coreMigrationTag refuses a range with no lower bound rather than guessing one', () => {
  assert.throws(() => coreMigrationTag('^6.1.0'), /lower bound/i);
  assert.throws(() => coreMigrationTag(''), /lower bound/i);
});

test('readMigrateStart recognises the fresh-install line', () => {
  const stdout = 'No prior migration history detected — treating as a fresh install (baseline + later migrations).\nMigrating to v6.1.0\n';
  assert.deepEqual(readMigrateStart(stdout), { fresh: true, installedVersion: null });
});

test('readMigrateStart reports the watermark of a database that is NOT empty', () => {
  const stdout = 'Detected installed migration version: 202609132006 — fetching only migrations newer than it.\n';
  assert.deepEqual(readMigrateStart(stdout), { fresh: false, installedVersion: '202609132006' });
});

test('readMigrateStart treats output it cannot read as NOT fresh', () => {
  // Fail closed: an unreadable start line must never be read as "the database was empty".
  assert.deepEqual(readMigrateStart('Migrating to v6.1.0\n'), { fresh: false, installedVersion: null });
  assert.deepEqual(readMigrateStart(''), { fresh: false, installedVersion: null });
});

test('readCliResult returns the JSON document the CLI puts on its last stdout line', () => {
  const stdout = [
    'MJ startup: task mode — engine pre-warm skipped',
    '{"version":"1","success":true,"command":"codegen","data":{"skippedDb":false,"skippedFiles":true},"errors":[]}',
  ].join('\n');
  assert.equal(readCliResult(stdout).success, true);
  assert.equal(readCliResult(stdout).data.skippedDb, false);
});

test('readCliResult skips a log line that merely begins with a brace', () => {
  const stdout = [
    '{ not json at all',
    '{"version":"1","success":true,"command":"codegen","data":{},"errors":[]}',
    '',
  ].join('\n');
  assert.equal(readCliResult(stdout).command, 'codegen');
});

test('readCliResult returns null when the CLI printed no result document', () => {
  assert.equal(readCliResult('just some text\n'), null);
  assert.equal(readCliResult(''), null);
});

test('newCaptureFiles reports only what appeared during the run', () => {
  assert.deepEqual(
    newCaptureFiles({ before: ['CodeGen_Run_A.sql'], after: ['CodeGen_Run_A.sql', 'CodeGen_Run_B.sql'] }),
    ['CodeGen_Run_B.sql'],
  );
  assert.deepEqual(newCaptureFiles({ before: [], after: [] }), []);
  // A file the developer already had staged is NOT our verdict — the check must not destroy or
  // claim someone else's capture.
  assert.deepEqual(newCaptureFiles({ before: ['x.sql'], after: ['x.sql'] }), []);
});

test('summarizeCapture names the metadata writes a host would be missing', () => {
  const sql = `
    INSERT INTO [\${mjSchema}].[EntityField]
       ([ID],[EntityID]) VALUES ('a','b');
    INSERT INTO [\${mjSchema}].[EntityField]
       ([ID],[EntityID]) VALUES ('c','d');
    UPDATE [\${mjSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='e';
    INSERT INTO [\${mjSchema}].[EntityRelationship] ([ID]) VALUES ('f');
    CREATE VIEW [\${flyway:defaultSchema}].[vwFormDistributions] AS SELECT 1;
    DROP VIEW [\${flyway:defaultSchema}].[vwFormDistributions];
  `;
  assert.deepEqual(summarizeCapture(sql), [
    { label: 'INSERT INTO ${mjSchema}.EntityField', count: 2 },
    { label: 'CREATE VIEW', count: 1 },
    { label: 'DROP VIEW', count: 1 },
    { label: 'INSERT INTO ${mjSchema}.EntityRelationship', count: 1 },
    { label: 'UPDATE ${mjSchema}.EntityFieldValue', count: 1 },
  ]);
});

test('summarizeCapture is empty for SQL that changes nothing', () => {
  assert.deepEqual(summarizeCapture('-- nothing to do\n'), []);
});

test('workingDatabaseName prefers the process environment over the .env file', () => {
  assert.equal(
    workingDatabaseName({ envFileText: "DB_DATABASE='MJ_ATS_Dev'\n", processEnv: { DB_DATABASE: 'MJ_Other' } }),
    'MJ_Other',
  );
});

test('workingDatabaseName reads the .env file in either quoting style', () => {
  assert.equal(workingDatabaseName({ envFileText: "DB_DATABASE='MJ_ATS_Dev'\n", processEnv: {} }), 'MJ_ATS_Dev');
  assert.equal(workingDatabaseName({ envFileText: 'DB_DATABASE=MJ_ATS_Dev\n', processEnv: {} }), 'MJ_ATS_Dev');
  assert.equal(workingDatabaseName({ envFileText: 'DB_DATABASE="MJ_ATS_Dev"  \n', processEnv: {} }), 'MJ_ATS_Dev');
});

test('workingDatabaseName ignores a commented-out assignment and a missing file', () => {
  assert.equal(workingDatabaseName({ envFileText: "# DB_DATABASE='MJ_ATS_Dev'\n", processEnv: {} }), null);
  assert.equal(workingDatabaseName({ envFileText: null, processEnv: {} }), null);
});
