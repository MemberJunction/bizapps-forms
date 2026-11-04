import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coreMigrationTag,
  newCaptureFiles,
  readCliResult,
  readMigrateStart,
  settlingPassAccepts,
  summarizeCapture,
  workingDatabaseName,
} from './check-host-truth-codegen.mjs';

// A host at a prerelease floor runs that prerelease, so its tag keeps the suffix. Dropping it once
// passed only because the GA tag happened to exist (`>=6.1.0-edge.5` → v6.1.0); at `>=6.2.0-edge.3`,
// before 6.2.0 shipped, the derived `v6.2.0` named no tag and the CI job died cloning it (#304).
test('coreMigrationTag reads the floor of the declared range, prerelease included', () => {
  assert.equal(coreMigrationTag('>=6.2.0-edge.3 <7.0.0'), 'v6.2.0-edge.3');
  assert.equal(coreMigrationTag('>=6.1.0-edge.5 <7.0.0'), 'v6.1.0-edge.5');
  assert.equal(coreMigrationTag('>=5.31.0 <6.0.0'), 'v5.31.0');
  assert.equal(coreMigrationTag('>= 6.1.0-edge.5 <7.0.0'), 'v6.1.0-edge.5');
});

// The room is built with common and tasks on it, so it sits at the HIGHEST floor of the three: a
// host cannot run bizapps-common 5.54 (>=6.1.5) on core 6.1.0-edge.6, whatever ours admits. Taking
// only our floor built that impossible room the day common 5.54 shipped, and its first migration
// called a core procedure parameter edge.6 does not have (#306 CI).
test('coreMigrationTag takes the highest floor across every app the room installs', () => {
  assert.equal(coreMigrationTag('>=6.1.0-edge.6 <7.0.0', '>=6.1.5 <7.0.0', '>=6.1.0-edge.6 <7.0.0'), 'v6.1.5');
  assert.equal(coreMigrationTag('>=6.1.5 <7.0.0', '>=6.1.0-edge.6 <7.0.0'), 'v6.1.5');
  assert.equal(coreMigrationTag('>=6.2.0-edge.3 <7.0.0', '>=6.1.5 <7.0.0'), 'v6.2.0-edge.3');
  assert.equal(coreMigrationTag('>=6.1.0-edge.6 <7.0.0', '>=6.1.0-edge.10 <7.0.0'), 'v6.1.0-edge.10');
  assert.equal(coreMigrationTag('>=6.1.0 <7.0.0', '>=6.1.0-edge.6 <7.0.0'), 'v6.1.0');
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

// MJ 6.2 made an includeSchemas entry that matches no schema a CodeGen FAILURE (it was a warning).
// Pass 1 runs before our migrations, so our own schema cannot exist yet and every 6.2 run failed
// there. Pass 1 may accept exactly that failure, and nothing broader.
const OWN = ['__mj_BizAppsForms', '__mj_bizappsforms'];
const FAILED = {
  command: 'codegen',
  success: false,
  data: { skippedDb: false },
  errors: [{ context: 'MANAGE_METADATA', message: 'Metadata management reported a failure; see the errors logged above' }],
};
const UNMATCHED_OURS =
  '\u001b[37m   includeSchemas entries [__mj_BizAppsForms, __mj_bizappsforms] match no schema in the database; check for a typo or a dropped schema\u001b[0m';

test('settlingPassAccepts accepts a clean run', () => {
  const ok = { command: 'codegen', success: true, data: { skippedDb: false } };
  assert.equal(settlingPassAccepts({ result: ok, stderr: '', ownSchemas: OWN }), true);
});

test('settlingPassAccepts accepts our own not-yet-created schema as the only failure', () => {
  const stderr =
    `- Handling SQL Script Execution...\n${UNMATCHED_OURS}\n` +
    '✖ ERROR managing metadata (refresh applied; downstream will use latest available state)\n' +
    '✖ MJ CodeGen finished with 1 failure(s) — 494 entities in 26.03s\n';
  assert.equal(settlingPassAccepts({ result: FAILED, stderr, ownSchemas: OWN }), true);
});

test('settlingPassAccepts refuses when another schema is the unmatched one', () => {
  const stderr = '   includeSchemas entry [__mj_SomethingElse] match no schema in the database; check for a typo\n';
  assert.equal(settlingPassAccepts({ result: FAILED, stderr, ownSchemas: OWN }), false);
});

test('settlingPassAccepts refuses when any other error was logged alongside', () => {
  const stderr = `${UNMATCHED_OURS}\n✖ ERROR managing metadata\n✖ Failed to create entity for table Foo\n`;
  assert.equal(settlingPassAccepts({ result: FAILED, stderr, ownSchemas: OWN }), false);
});

// MJ's logError lines inside metadata management carry no ✖ (manage-metadata.ts logs e.g.
// '   Error creating new entities'); they fold into the same single MANAGE_METADATA error.
test('settlingPassAccepts refuses a plain MJ "Error …" line from the same phase', () => {
  const stderr =
    `${UNMATCHED_OURS}\n\u001b[37m   Error creating new entities: Invalid column name 'Foo'\u001b[0m\n` +
    '✖ ERROR managing metadata (refresh applied; downstream will use latest available state)\n';
  assert.equal(settlingPassAccepts({ result: FAILED, stderr, ownSchemas: OWN }), false);
});

test('settlingPassAccepts refuses another phase failing, a skipped database pass, or no result', () => {
  const twoPhases = { ...FAILED, errors: [...FAILED.errors, { context: 'SQL_GENERATION', message: 'x' }] };
  assert.equal(settlingPassAccepts({ result: twoPhases, stderr: UNMATCHED_OURS, ownSchemas: OWN }), false);
  assert.equal(settlingPassAccepts({ result: { ...FAILED, data: { skippedDb: true } }, stderr: UNMATCHED_OURS, ownSchemas: OWN }), false);
  assert.equal(settlingPassAccepts({ result: null, stderr: UNMATCHED_OURS, ownSchemas: OWN }), false);
});
