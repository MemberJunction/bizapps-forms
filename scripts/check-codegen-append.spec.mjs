#!/usr/bin/env node
/**
 * Spec for the CodeGen-append gate. Two jobs, and the second is the one that matters:
 *   1. the classifier is right about this repo's real migrations, and
 *   2. the gate FAILS when it should — a gate nobody has watched fail is indistinguishable
 *      from one that returns pass.
 *
 * Node stdlib only, run with `node --test`, matching scripts/check-migration-order.spec.mjs.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import {
  findAppSchemaDDL,
  carriesCodeGenOutput,
  hasBanner,
  findCodeGenNoneReason,
  classifyMigration,
  stripSqlComments,
  trackedCaptureFiles,
  changedMigrations,
  addedMigrations,
  readAt,
  OUTPUT_SHIPPED_LATER,
} from './check-codegen-append.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

// ── The classifier's own vocabulary ──────────────────────────────────────────────────────────
test('DDL detection is scoped to our own schema placeholder', () => {
  assert.deepEqual(
    findAppSchemaDDL('ALTER TABLE [${flyway:defaultSchema}].[Form] ADD X BIT;'),
    ['ALTER TABLE Form']
  );
  // A core-schema grant produces no Forms CodeGen output and must not be nagged about.
  assert.deepEqual(findAppSchemaDDL('UPDATE [${mjSchema}].[Role] SET Name = N\'x\';'), []);
});

test('prose mentioning DDL in a comment does not count as DDL', () => {
  assert.deepEqual(findAppSchemaDDL('-- CREATE TABLE [${flyway:defaultSchema}].[Nope]\nSELECT 1;'), []);
});

test('the banner this repo actually uses is recognised', () => {
  assert.equal(hasBanner('-- CodeGen output (appended) — regenerated; do not hand-edit below this line.'), true);
  assert.equal(hasBanner('-- CodeGen output (appended)'), true);
  assert.equal(hasBanner('-- some other comment'), false);
});

test('@codegen-none reads a reason on its own line only', () => {
  assert.equal(findCodeGenNoneReason('-- @codegen-none: the default is hand-written in three places'),
    'the default is hand-written in three places');
  // Horizontal whitespace only: `\s*` would swallow the newline and adopt the next statement.
  assert.equal(findCodeGenNoneReason('-- @codegen-none:\nALTER TABLE x ADD y INT;'), '');
  assert.equal(findCodeGenNoneReason('nothing here'), null);
});

test('hand-authored EntityFieldValue rows count as CodeGen output', () => {
  assert.equal(carriesCodeGenOutput("UPDATE [${mjSchema}].[EntityFieldValue] SET [Value] = N'Doodle';"), true);
});

// ── The gate must FAIL on the things it exists to catch ──────────────────────────────────────
test('FIRES: DDL with no CodeGen output and no stated reason', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD NewCol BIT NOT NULL DEFAULT 0;');
  assert.equal(v.length, 1);
  assert.match(v[0], /ships no CodeGen output/);
});

test('FIRES: @codegen-none with no reason', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    '-- @codegen-none:\nALTER TABLE [${flyway:defaultSchema}].[Form] ADD NewCol BIT;');
  assert.equal(v.length, 1);
  assert.match(v[0], /carries no reason/);
});

test('FIRES: @codegen-none on a CREATE TABLE, which is always false', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    '-- @codegen-none: nothing to generate\nCREATE TABLE [${flyway:defaultSchema}].[Thing] (ID UNIQUEIDENTIFIER);');
  assert.equal(v.length, 1);
  assert.match(v[0], /always false/);
});

test('FIRES: a description change that never writes EntityField.Description', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    "EXEC sp_updateextendedproperty @name = N'MS_Description', @value = N'new text';");
  assert.equal(v.length, 1);
  assert.match(v[0], /EntityField\.Description/);
});

test('FIRES: a NEW migration ships CodeGen output with no banner', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD X BIT;\nCREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateForm] AS SELECT 1;',
    { isNew: true });
  assert.equal(v.length, 1);
  assert.match(v[0], /banner/);
});

test('does NOT fire on the same file when it is merely modified', () => {
  // History cannot be retrofitted (migrations/README.md,
  // "Add a NEW seed migration; never edit an existing one"), so the banner rule is for new files.
  assert.deepEqual(classifyMigration('migrations/V1__x.sql',
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD X BIT;\nCREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateForm] AS SELECT 1;',
    { isNew: false }), []);
});

test('does NOT fire on DDL that ships its output under the banner', () => {
  assert.deepEqual(classifyMigration('migrations/V1__x.sql',
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD X BIT;\n-- CodeGen output (appended)\nCREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateForm] AS SELECT 1;',
    { isNew: true }), []);
});

// ── Calibration against this repo's real history ─────────────────────────────────────────────
// Three migrations are expected to flag, and each is understood. If this list changes, either
// the classifier drifted or someone edited history — both need a human.
const KNOWN_HISTORICAL_FLAGS = [
  'migrations/V202608182100__v0.11.x__Element_Parity_And_Screens.sql',
  'migrations/V202608191200__v0.11.x__Ending_Screen_Social_Links.sql',
  'migrations/V202609011500__v0.12.x__Captcha_Opt_In_By_Default.sql',
];

test('the classifier is calibrated against the whole migration directory', () => {
  const files = execFileSync('git', ['ls-files', 'migrations/*.sql'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();
  assert.ok(files.length >= 31, `expected the shipped migration set, got ${files.length}`);
  const flagged = files.filter((f) => classifyMigration(f, read(f)).length > 0);
  assert.deepEqual(flagged.sort(), [...KNOWN_HISTORICAL_FLAGS].sort());
});

test('the four banner-bearing migrations are recognised as shipping output', () => {
  for (const f of [
    'migrations/V202606301305__v0.1.x_FormDistribution_PublicLinkToken.sql',
    'migrations/V202608211000__v0.11.x__Form_Templates.sql',
    'migrations/V202608211600__v0.11.x__Form_Template_Source.sql',
    'migrations/V202608252340__v0.12.x__Rules_And_Branching.sql',
  ]) {
    assert.equal(hasBanner(read(f)), true, `${f} should carry the banner`);
    assert.deepEqual(classifyMigration(f, read(f)), [], `${f} should be clean`);
  }
});

test('the description-only migration is clean because it writes EntityField.Description too', () => {
  const f = 'migrations/V202608302200__v0.12.x__Link_Credential_Lifecycle.sql';
  assert.deepEqual(classifyMigration(f, read(f)), []);
});

// ── Fix round 1: real correctness gaps found in review ───────────────────────────────────────
// Each of these reproduces a bug the reviewer found in the first cut of the classifier. The
// calibration test above is unaffected -- none of the 31 real migrations depended on any of them.

test('bare UPDATE of EntityField is a hand-patch, not CodeGen output', () => {
  assert.equal(
    carriesCodeGenOutput("UPDATE [${mjSchema}].[EntityField] SET Sequence = 5 WHERE Name = 'X';"),
    false
  );
});

test('INSERT INTO EntityField counts as CodeGen output (new field rows)', () => {
  assert.equal(
    carriesCodeGenOutput("INSERT INTO [${mjSchema}].[EntityField] (ID, Name) VALUES ('x', 'y');"),
    true
  );
});

test('FIRES: an unrelated bare EntityField UPDATE does not excuse DDL that ships no output', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    "ALTER TABLE [${flyway:defaultSchema}].[Form] ADD NewCol BIT NOT NULL DEFAULT 0;\n" +
    "UPDATE [${mjSchema}].[EntityField] SET Sequence = 5 WHERE Name = 'Unrelated';");
  assert.equal(v.length, 1);
  assert.match(v[0], /ships no CodeGen output/);
});

test('FIRES: a description obligation is not satisfied by the word "Description" merely appearing nearby', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    "EXEC sp_updateextendedproperty @name = N'MS_Description', @value = N'new text';\n" +
    "UPDATE [${mjSchema}].[EntityField] SET Sequence = 5 WHERE Description IS NOT NULL;");
  assert.equal(v.length, 1);
  assert.match(v[0], /EntityField\.Description/);
});

test('FIRES: @codegen-none excuses only the tables it names, not every DDL statement in the file', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    '-- @codegen-none: the first one is a CHECK on an int\n' +
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD CONSTRAINT CK_a CHECK (N > 0);\n' +
    'ALTER TABLE [${flyway:defaultSchema}].[FormPage] ADD RealNewCol NVARCHAR(50);');
  assert.equal(v.length, 1);
  assert.match(v[0], /FormPage/);
});

test('does NOT fire when @codegen-none names every table its DDL touches', () => {
  assert.deepEqual(classifyMigration('migrations/V1__x.sql',
    '-- @codegen-none: Form and FormPage only get a CHECK constraint, no metadata to generate\n' +
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD CONSTRAINT CK_a CHECK (N > 0);\n' +
    'ALTER TABLE [${flyway:defaultSchema}].[FormPage] ADD CONSTRAINT CK_b CHECK (N > 0);'), []);
});

test('FIRES: DDL against the literal schema name is not invisible', () => {
  assert.deepEqual(
    findAppSchemaDDL('CREATE TABLE [__mj_BizAppsForms].[Thing] (ID UNIQUEIDENTIFIER);'),
    ['CREATE TABLE Thing']
  );
  const v = classifyMigration('migrations/V1__x.sql',
    'CREATE TABLE [__mj_BizAppsForms].[Thing] (ID UNIQUEIDENTIFIER);');
  assert.equal(v.length, 1);
  assert.match(v[0], /ships no CodeGen output/);
});

test('FIRES: the banner is present but nothing generated follows it', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD X BIT;\n-- CodeGen output (appended)\n',
    { isNew: true });
  assert.equal(v.length, 1);
  assert.match(v[0], /nothing generated follows|empty section/);
});

test('sp_addextendedproperty counts as touching an extended property, same as sp_updateextendedproperty', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    "EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'new text';");
  assert.equal(v.length, 1);
  assert.match(v[0], /EntityField\.Description/);
});

test('stripSqlComments removes line and block comments but keeps code', () => {
  assert.equal(
    stripSqlComments('SELECT 1; -- a comment\n/* block\ncomment */SELECT 2;'),
    'SELECT 1; \nSELECT 2;'
  );
});

// ── The CLI ──────────────────────────────────────────────────────────────────────────────────

test('CHECK 1 is clean on the current tree', () => {
  assert.deepEqual(trackedCaptureFiles(REPO_ROOT), [],
    'a CodeGen_Run_*.sql is tracked — the tree has regressed');
});

test('CHECK 1 is whole-tree, so it sees a capture wherever it lands', () => {
  // The incident (a23b598) committed 14 run files and touched no top-level migration, so a
  // diff-scoped or has_migrations-gated version would not have run at all.
  const out = execFileSync('git', ['ls-files', '--', '*CodeGen_Run_*.sql'],
    { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(out.trim(), '');
});

test('CHECK 1 counts TRACKED files, not files on disk', () => {
  // 14 run files sit untracked in migrations/codegen/ on a developer machine. A pure-fs check
  // would fail every local run and teach people to ignore the gate.
  const onDisk = execFileSync('bash',
    ['-c', 'ls migrations/codegen/CodeGen_Run_*.sql 2>/dev/null | wc -l'],
    { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  assert.ok(Number(onDisk) >= 0);
  assert.deepEqual(trackedCaptureFiles(REPO_ROOT), []);
});

test('the CLI exits 0 with no arguments on a clean tree', () => {
  const r = execFileSync('node', ['scripts/check-codegen-append.mjs'],
    { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.match(r, /No CodeGen capture files are tracked/);
});

test('FIRES: the CLI exits 1 when a base ref cannot be diffed', () => {
  assert.throws(
    () => execFileSync('node',
      ['scripts/check-codegen-append.mjs', 'no-such-ref-aaaa', 'HEAD'],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' }),
    (err) => {
      assert.equal(err.status, 1);
      // The unfetched-base case must be named as itself, never mistaken for a clean run.
      assert.match(String(err.stderr), /Could not diff/);
      return true;
    }
  );
});

test('changedMigrations lists only top-level migration SQL', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  // A commit against itself changes nothing; the point is the shape, not the contents.
  assert.deepEqual(changedMigrations(head, head, REPO_ROOT), []);
});

// ── Fix round 2: the gate's primary path, end to end ─────────────────────────────────────────
// Issue #160's definition of done: "a spec that watches it fail." Until now the spec watched the
// CLASSIFIER fail; the real git-diff -> readAt -> classify -> violation -> exit 1 wiring in
// main() was never driven. Built from real history rather than mocked git, and pinned to this
// migration's own add-commit (never HEAD) -- a HEAD-ending range would pull in unrelated
// migrations and drift these expectations every time the branch grows.
const CAPTCHA_MIGRATION = 'migrations/V202609011500__v0.12.x__Captcha_Opt_In_By_Default.sql';
const CAPTCHA_ADD = execFileSync('git',
  ['log', '--diff-filter=A', '--format=%H', '--', CAPTCHA_MIGRATION],
  { cwd: REPO_ROOT, encoding: 'utf8' }).trim().split('\n').pop();
const CAPTCHA_BEFORE = execFileSync('git', ['rev-parse', `${CAPTCHA_ADD}^`],
  { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

test('FIRES end-to-end: the real CLI exits 1 on a genuine CHECK 2 violation from history', () => {
  assert.throws(
    () => execFileSync('node',
      ['scripts/check-codegen-append.mjs', CAPTCHA_BEFORE, CAPTCHA_ADD],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' }),
    (err) => {
      assert.equal(err.status, 1);
      const stderr = String(err.stderr);
      assert.match(stderr, /V202609011500__v0\.12\.x__Captcha_Opt_In_By_Default\.sql/);
      assert.match(stderr, /ships no CodeGen output/);
      return true;
    }
  );
});

test('addedMigrations reports the migration at its own add-commit', () => {
  assert.deepEqual(addedMigrations(CAPTCHA_BEFORE, CAPTCHA_ADD, REPO_ROOT), [CAPTCHA_MIGRATION]);
});

test('readAt returns file contents at a sha, and null when the path does not exist there', () => {
  const sql = readAt(CAPTCHA_ADD, CAPTCHA_MIGRATION, REPO_ROOT);
  assert.match(sql, /ALTER TABLE/i);
  assert.equal(readAt(CAPTCHA_ADD, 'migrations/Does_Not_Exist.sql', REPO_ROOT), null);
});

// ── Fix round 2: the OUTPUT_SHIPPED_LATER guard branches ─────────────────────────────────────
// Both guards live inside main(), not in a pure export, so reaching them means running the real
// CLI. Neither failure mode ("the named remedy doesn't exist" / "the named remedy regressed")
// exists anywhere in this repo's real history -- they are exactly the failures the guards exist
// to prevent, so real history has none to reproduce. This builds a throwaway git repo under the
// OS temp dir to manufacture them: created and torn down per run, nothing written to this
// repository or under migrations/.
let fixture;

before(() => {
  const dir = mkdtempSync(join(tmpdir(), 'codegen-gate-fixture-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '--quiet');
  git('config', 'user.email', 'fixture@test.local');
  git('config', 'user.name', 'Fixture');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, 'migrations'));
  writeFileSync(join(dir, 'README.md'), 'throwaway fixture repo for the OUTPUT_SHIPPED_LATER guards\n');
  git('add', '.');
  git('commit', '-m', 'root');
  const root = git('rev-parse', 'HEAD').trim();

  // Named to match a real OUTPUT_SHIPPED_LATER key: DDL that ships no output of its own.
  const flagged = 'V202608182100__v0.11.x__Element_Parity_And_Screens.sql';
  writeFileSync(join(dir, 'migrations', flagged),
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD FixtureCol BIT NOT NULL DEFAULT 0;\n');
  git('add', '.');
  git('commit', '-m', 'add flagged migration; its remedy does not exist yet');
  const missingRemedySha = git('rev-parse', 'HEAD').trim();

  // The map's remedy for `flagged` -- present at this commit, but carrying no CodeGen output.
  const remedy = 'V202608191300__v0.11.x__Element_Parity_Metadata_Backfill.sql';
  writeFileSync(join(dir, 'migrations', remedy), '-- a placeholder that ships nothing\nSELECT 1;\n');
  git('add', '.');
  git('commit', '-m', 'add the named remedy, but it ships no CodeGen output');
  const regressedRemedySha = git('rev-parse', 'HEAD').trim();

  fixture = { dir, root, missingRemedySha, regressedRemedySha };
});

after(() => {
  if (fixture) rmSync(fixture.dir, { recursive: true, force: true });
});

test('FIRES: OUTPUT_SHIPPED_LATER names a remedy that does not exist at head', () => {
  assert.throws(
    () => execFileSync('node',
      [join(REPO_ROOT, 'scripts/check-codegen-append.mjs'), fixture.root, fixture.missingRemedySha],
      { cwd: fixture.dir, encoding: 'utf8', stdio: 'pipe' }),
    (err) => {
      assert.equal(err.status, 1);
      assert.match(String(err.stderr), /does not exist at/);
      return true;
    }
  );
});

test('FIRES: OUTPUT_SHIPPED_LATER names a remedy that carries no CodeGen output', () => {
  assert.throws(
    () => execFileSync('node',
      [join(REPO_ROOT, 'scripts/check-codegen-append.mjs'), fixture.root, fixture.regressedRemedySha],
      { cwd: fixture.dir, encoding: 'utf8', stdio: 'pipe' }),
    (err) => {
      assert.equal(err.status, 1);
      assert.match(String(err.stderr), /exemption no longer holds/);
      return true;
    }
  );
});

test('OUTPUT_SHIPPED_LATER only names remedies that are real and still carry CodeGen output', () => {
  const tracked = new Set(execFileSync('git', ['ls-files', 'migrations/*.sql'],
    { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean));
  for (const [flaggedName, remedyName] of OUTPUT_SHIPPED_LATER) {
    const remedyPath = `migrations/${remedyName}`;
    assert.ok(tracked.has(remedyPath), `${remedyName}: named as ${flaggedName}'s remedy but is not tracked`);
    assert.equal(carriesCodeGenOutput(read(remedyPath)), true,
      `${remedyName}: named as ${flaggedName}'s remedy but carries no CodeGen output`);
  }
});
