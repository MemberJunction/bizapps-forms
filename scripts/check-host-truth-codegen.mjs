#!/usr/bin/env node
/**
 * Gate: build a database from ONLY what this repo ships, run CodeGen against it, and fail if CodeGen
 * wants to change anything.
 *
 * ── THE QUESTION NOTHING ELSE ASKS ──────────────────────────────────────────────────────────────
 * Every other check here reads the REPOSITORY. check-distribution-seed.mjs reads literals in SQL
 * text; check-codegen-append.mjs reads a diff — and its CHECK 2 is diff-scoped on purpose, because
 * nine merged migrations predate the rule and a whole-tree version would be permanently red. That
 * scoping has a consequence nobody could act on: the moment a migration merges without its CodeGen
 * output there is no diff left to scope to, so the omission becomes invisible forever.
 *
 * Two shipped that way. #201 (`V202609091600` added FormResponse.FormDistributionID with no
 * EntityField row — every Form Response save failed on a host, silently, because BaseEntity.Set on a
 * field with no EntityField row is a no-op) and #219 (a Signature→Doodle rename that skipped the
 * EntityFieldValue.Sequence rewrite). Both carried a "RUN mj:codegen AFTER APPLYING THIS" banner,
 * which is the one instruction a host cannot follow: `mj app install` puts __mj_BizAppsForms in the
 * host's excludeSchemas, so the host's CodeGen never runs against our schema. `migrations/` is the
 * only channel we have. Neither defect was found by CI; an unrelated MJ upgrade found them.
 *
 * So this check reads the ARTEFACT instead of the repository: it builds what a host builds and looks
 * at it. See issue #220.
 *
 * ── THE VERDICT IS A FILE, NOT AN EXIT CODE ─────────────────────────────────────────────────────
 * `mj codegen` exits 0 and reports {"success":true} whether or not the database it just looked at was
 * complete — measured on both a converged and an unconverged database. Its only signal is the capture
 * it writes into mj.config.cjs's SQLOutput.folderPath: the SQL a host would have to run. A converged
 * database produces NO capture file at all, so the verdict is binary rather than a judgement call.
 * We compare the folder before and after, so a capture a developer already had staged is neither
 * destroyed nor mistaken for our answer.
 *
 * ── WHY THIS SCRIPT HOLDS NO DATABASE CONNECTION ────────────────────────────────────────────────
 * It takes an EXISTING, EMPTY database and never creates or drops one. `.env` on a dev machine points
 * at the shared database MJ's host serves; a check that could DROP DATABASE is one bug away from
 * taking it. Emptiness is verified rather than trusted, from `mj migrate`'s own first stdout line —
 * the same signal the root CLAUDE.md teaches — and a run against the database named in .env is
 * refused outright.
 *
 * Node stdlib only, like every other gate here: a dependency problem must never be the reason nobody
 * finds out.
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The `mj migrate -t` tag a host sitting at our declared floor would be on. */
export function coreMigrationTag(mjVersionRange) {
  const lowerBound = /(?:^|\s)>=\s*(\d+)\.(\d+)\.(\d+)/.exec(mjVersionRange ?? '');
  if (!lowerBound) {
    throw new Error(
      `mj-app.json's mjVersionRange ${JSON.stringify(mjVersionRange)} has no '>=X.Y.Z' lower bound, ` +
        'so the core migration tag cannot be derived. Pass --core-tag vX.Y.Z to say it explicitly.',
    );
  }
  const [, major, minor, patch] = lowerBound;
  return `v${major}.${minor}.${patch}`;
}

/**
 * What `mj migrate` said about the database it started on. stdout only — the spinner is on stderr.
 *
 * Fails CLOSED: output we cannot read reports `fresh: false`, because reading "the database was
 * empty" out of silence is the one mistake that would make this whole check meaningless.
 */
export function readMigrateStart(stdout) {
  const text = stdout ?? '';
  if (text.includes('No prior migration history detected')) {
    return { fresh: true, installedVersion: null };
  }
  const watermark = /Detected installed migration version:\s*(\S+)/.exec(text);
  return { fresh: false, installedVersion: watermark ? watermark[1] : null };
}

/** How many trailing lines of a CLI's stdout may be searched for its result document. */
const RESULT_SEARCH_LINES = 20;

/** The machine-readable result the CLI prints as the last line of stdout, or null. */
export function readCliResult(stdout) {
  const lines = (stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const floor = Math.max(0, lines.length - RESULT_SEARCH_LINES);
  for (let i = lines.length - 1; i >= floor; i--) {
    if (!lines[i].startsWith('{')) continue;
    try {
      return JSON.parse(lines[i]);
    } catch {
      // Not the result document — a progress line can begin with a brace. Keep looking; if no line
      // parses, the caller gets null and treats that as a failure, so nothing is swallowed.
    }
  }
  return null;
}

/** Capture files that appeared during the run — never the ones that were already there. */
export function newCaptureFiles({ before, after }) {
  const alreadyThere = new Set(before);
  return after.filter((name) => !alreadyThere.has(name)).sort();
}

/**
 * What a capture file is asking a host to run, condensed. Metadata writes first — those are the
 * defect class this gate exists for — then the object DDL that came with them.
 */
export function summarizeCapture(sql) {
  const counts = new Map();
  const bump = (label) => counts.set(label, (counts.get(label) ?? 0) + 1);

  const metadataWrite = /\b(INSERT INTO|UPDATE|DELETE FROM)\s+\[?\$\{mjSchema\}\]?\.\[?(\w+)\]?/gi;
  for (const [, verb, table] of (sql ?? '').matchAll(metadataWrite)) {
    bump(`${verb.toUpperCase()} \${mjSchema}.${table}`);
  }
  const objectDdl = /\b(CREATE|DROP|ALTER)\s+(VIEW|PROCEDURE|TRIGGER|INDEX|TABLE|FUNCTION)\b/gi;
  for (const [, verb, kind] of (sql ?? '').matchAll(objectDdl)) {
    bump(`${verb.toUpperCase()} ${kind.toUpperCase()}`);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The database this checkout works against — the one a clean-room run must never be. */
export function workingDatabaseName({ envFileText, processEnv }) {
  if (processEnv?.DB_DATABASE) return processEnv.DB_DATABASE;
  const assignment = /^[ \t]*DB_DATABASE[ \t]*=[ \t]*(['"]?)([^'"\n#]+?)\1[ \t]*$/m.exec(envFileText ?? '');
  return assignment ? assignment[2] : null;
}

const require = createRequire(import.meta.url);

/**
 * Per-step ceilings. The core chain is 85 migrations and took 4m11s on a developer laptop; a cold CI
 * runner is slower. Capped rather than open-ended so a hung child is reported as a hung child.
 */
const STEP_TIMEOUT_MS = { migrateCore: 45 * 60_000, migrateApp: 15 * 60_000, codegen: 30 * 60_000 };

/** Where CodeGen writes its capture — read from mj.config.cjs so this decision lives in one place. */
function captureDirectory() {
  const folder = require(path.join(REPO_ROOT, 'mj.config.cjs'))?.SQLOutput?.folderPath;
  if (!folder) {
    throw new Error('mj.config.cjs has no SQLOutput.folderPath, so there is no capture folder to read.');
  }
  return path.resolve(REPO_ROOT, folder);
}

function listCaptures(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith('.sql'));
}

/**
 * The MJ CLI, never bare. `/opt/homebrew/bin/mj` is two majors behind the pinned one and would run a
 * 5.x CLI against a 6.1 database without saying so.
 */
function mjCommand() {
  const local = path.join(REPO_ROOT, 'node_modules', '.bin', 'mj');
  if (existsSync(local)) return { command: local, prefix: [] };
  return { command: 'npx', prefix: ['--no-install', 'mj'] };
}

/**
 * Run one `mj` step. Progress goes straight to our stderr so a long chain is watchable; stdout is
 * captured because that is where the CLI puts its findings.
 */
function runMj({ label, args, database, timeout }) {
  const { command, prefix } = mjCommand();
  process.stderr.write(`\n── ${label}\n`);
  const child = spawnSync(command, [...prefix, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout,
    // dotenv does not overwrite a variable already in the environment, so this — not an edit to
    // .env — is what points the CLI at the clean room.
    env: { ...process.env, DB_DATABASE: database },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (child.error?.code === 'ETIMEDOUT') {
    throw new Error(`${label}: no answer within ${Math.round(timeout / 60_000)} minutes — giving up rather than waiting forever.`);
  }
  if (child.error) throw new Error(`${label}: could not run ${command} — ${child.error.message}`);
  const stdout = child.stdout ?? '';
  process.stdout.write(stdout);
  if (child.status !== 0) {
    throw new Error(
      `${label}: mj exited ${child.status}.\n` +
        (stdout.trim() ? `Its last words on stdout:\n${stdout.trim().split('\n').slice(-15).join('\n')}\n` : '') +
        'If the failure mentions "The login already has an account under a different user name", the ' +
        'database was not created owned by [sa] — see docs/database-operations.md §4.',
    );
  }
  return stdout;
}

function parseArgs(argv) {
  const options = { database: null, commonMigrations: '../bizapps-common/migrations', tasksMigrations: '../bizapps-tasks/migrations', coreTag: null };
  const byFlag = { '--database': 'database', '--common-migrations': 'commonMigrations', '--tasks-migrations': 'tasksMigrations', '--core-tag': 'coreTag' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = byFlag[argv[i]];
    if (!key) throw new Error(`Unknown option ${argv[i]}. Known: ${Object.keys(byFlag).join(', ')}.`);
    if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value.`);
    options[key] = argv[i + 1];
  }
  return options;
}

/** Everything that must be true before a single migration runs. */
function checkPreconditions(options) {
  if (!options.database) {
    throw new Error(
      'A clean-room database name is required: --database <name>.\n' +
        'It must already exist, be EMPTY, and be owned by [sa]. Create one with:\n' +
        "  docker exec sql-mj-it /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P \"$DB_PASSWORD\" -C -Q \\\n" +
        '    "CREATE DATABASE [MJ_HostTruth]; ALTER AUTHORIZATION ON DATABASE::[MJ_HostTruth] TO [sa];"',
    );
  }
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(options.database)) {
    throw new Error(`--database ${JSON.stringify(options.database)} is not a plain identifier; refusing to pass it on.`);
  }
  const envPath = path.join(REPO_ROOT, '.env');
  const working = workingDatabaseName({
    envFileText: existsSync(envPath) ? readFileSync(envPath, 'utf8') : null,
    processEnv: process.env,
  });
  if (working && working === options.database) {
    throw new Error(
      `--database ${options.database} is the database this checkout already works against. A clean-room ` +
        'build would run every migration into it; refusing. Name a throwaway database instead.',
    );
  }
  for (const [what, dir] of [
    ['this repo', path.join(REPO_ROOT, 'migrations')],
    ['bizapps-common (--common-migrations)', path.resolve(REPO_ROOT, options.commonMigrations)],
    ['bizapps-tasks (--tasks-migrations)', path.resolve(REPO_ROOT, options.tasksMigrations)],
  ]) {
    if (!existsSync(dir)) {
      throw new Error(
        `No migrations directory for ${what} at ${dir}. Forms' baseline cannot apply without common ` +
          'and tasks — FormResponse.RespondentPersonID has a hard FK to MJ_BizApps_Common: People.',
      );
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  checkPreconditions(options);

  const coreTag = options.coreTag ?? coreMigrationTag(require(path.join(REPO_ROOT, 'mj-app.json')).mjVersionRange);
  const capture = captureDirectory();
  const before = listCaptures(capture);

  console.log(`Host-truth build of ${options.database}: core ${coreTag}, then common, tasks, forms, then CodeGen.`);

  const coreOut = runMj({ label: `core migrations (${coreTag})`, args: ['migrate', '-t', coreTag], database: options.database, timeout: STEP_TIMEOUT_MS.migrateCore });
  const start = readMigrateStart(coreOut);
  if (!start.fresh) {
    throw new Error(
      `${options.database} is not empty — mj reported ${start.installedVersion ? `installed migration version ${start.installedVersion}` : 'no fresh-install line at all'}. ` +
        'A clean room must start from nothing, or it proves nothing. Drop and recreate it.',
    );
  }

  runMj({ label: 'bizapps-common migrations', args: ['migrate', '--schema', '__mj_BizAppsCommon', '--dir', options.commonMigrations], database: options.database, timeout: STEP_TIMEOUT_MS.migrateApp });
  runMj({ label: 'bizapps-tasks migrations', args: ['migrate', '--schema', '__mj_BizAppsTasks', '--dir', options.tasksMigrations], database: options.database, timeout: STEP_TIMEOUT_MS.migrateApp });
  runMj({ label: 'this repo\'s migrations', args: ['migrate', '--schema', '__mj_BizAppsForms', '--dir', './migrations'], database: options.database, timeout: STEP_TIMEOUT_MS.migrateApp });

  const codegenOut = runMj({
    label: 'CodeGen, database pass only',
    // --skip-commands: the AFTER commands build four packages, which makes the exit code report
    // unrelated build failures. --no-ai: advanced generation is LLM-driven and an assertion cannot
    // rest on non-reproducible output.
    args: ['codegen', '--skipfiles', '--skip-commands', '--no-ai', '--no-banner', '--format', 'json'],
    database: options.database,
    timeout: STEP_TIMEOUT_MS.codegen,
  });
  const result = readCliResult(codegenOut);
  if (!result || result.command !== 'codegen' || result.success !== true || result.data?.skippedDb !== false) {
    throw new Error(
      'Could not confirm CodeGen ran its database pass, so its silence proves nothing. Its result ' +
        `document was ${result ? JSON.stringify(result) : 'absent from stdout'}.`,
    );
  }

  const appeared = newCaptureFiles({ before, after: listCaptures(capture) });
  if (appeared.length === 0) {
    console.log(`\n✅ Converged. What this repo ships builds a database CodeGen wants to change nothing about.`);
    console.log(`   ${options.database} is still there; drop it when you are done with it.`);
    return;
  }

  console.error(`\n❌ NOT converged. CodeGen wants ${appeared.length} change set(s) that no migration ships:`);
  for (const name of appeared) {
    const file = path.join(capture, name);
    console.error(`\n   ${path.relative(REPO_ROOT, file)}`);
    for (const { label, count } of summarizeCapture(readFileSync(file, 'utf8'))) {
      console.error(`     ${String(count).padStart(4)} × ${label}`);
    }
  }
  console.error(
    '\nEvery line of that is SQL a host would need and will never run — `mj app install` excludes ' +
      '__mj_BizAppsForms from the host\'s CodeGen, so migrations/ is the only channel. Append the ' +
      'output to the migration that caused it (docs/database-operations.md §2), or ship a new one.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
