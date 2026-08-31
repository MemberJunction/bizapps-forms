/**
 * The one way these scripts talk to SQL Server.
 *
 * Every smoke script shells into `sqlcmd` inside the dev container, and until this module existed
 * each carried its own copy of the two helpers below. The copies had already drifted — two
 * spellings of `sql()` differing in buffer size, column separator and error text — and the
 * container name was wrong in all of them at once when the per-app databases were retired
 * (WORKSPACE.md, 2026-08-21), so every script failed with `No such container: forms-sql` and none
 * of them could report it. A smoke test that cannot run is a smoke test that is not protecting
 * anything, and five copies of a constant is five chances to miss one.
 *
 * Credentials come from the process environment, never from parsing `.env` here: a password may
 * legitimately contain the characters a naive parser treats as syntax. Run these scripts as
 *   set -a && . ./.env && set +a && node smoke/<script>.mjs
 */
import { spawnSync } from 'node:child_process';

/**
 * The SQL Server container these scripts shell into.
 *
 * Defaults to the workspace's shared container. It was `forms-sql` until the per-app databases
 * were retired and every app moved onto one server.
 */
export const SQL_CONTAINER = process.env.FORMS_SQL_CONTAINER || 'sql-mj-it';

/**
 * Fail with the runnable command rather than a stack trace about `undefined`.
 *
 * Call this at the top of any script that touches the database. Without it a missing `.env`
 * surfaces as an authentication error from sqlcmd, which reads as "wrong password" and sends
 * people looking in the wrong place.
 */
export function requireDbEnv(scriptName) {
  const env = process.env;
  if (!env.DB_PASSWORD || !env.DB_DATABASE) {
    console.error(`Source .env first: set -a && . ./.env && set +a && node smoke/${scriptName}`);
    process.exit(1);
  }
}

/**
 * Prefix a batch with the session options SQL Server requires of the statements in it.
 *
 * `sqlcmd` is the only client in this workspace that defaults `QUOTED_IDENTIFIER` to OFF; tedious —
 * and therefore every write the shipped code makes through MJ — defaults it ON. SQL Server refuses
 * INSERT/UPDATE/DELETE against a table carrying a FILTERED index while the option is off, with
 * `Msg 1934` naming the option but not the index. So `V202608272250`'s
 * `UQ_FormVersion_OnePublishedPerForm` broke every sqlcmd write to `FormVersion` — three smoke
 * scripts patch `DefinitionSnapshot`, and `seed-binding-smoke` failing there took `smoke:file-links`
 * down with it thirty seconds later, reported as "the binding itself did not run".
 *
 * Applied to EVERY batch rather than the statements known to need it, and here rather than at the
 * two call sites, because the next filtered index is the thing to survive: it will be added to some
 * other table by someone who has never read this file, and the failure it causes points at a
 * session option instead of at the index that made it matter.
 */
export function withSessionOptions(query) {
  return `SET QUOTED_IDENTIFIER ON; ${query}`;
}

/**
 * The one place a batch is handed to sqlcmd, so {@link withSessionOptions} cannot be skipped by a
 * future helper: flags vary between {@link sql} and {@link sqlWide}, the batch does not.
 */
function run(flags, query, maxBuffer) {
  const env = process.env;
  const res = spawnSync(
    'docker',
    ['exec', SQL_CONTAINER, '/opt/mssql-tools18/bin/sqlcmd', '-S', 'localhost', '-d', env.DB_DATABASE,
      '-U', env.DB_USERNAME, '-P', env.DB_PASSWORD, '-C', '-b', ...flags, '-Q', withSessionOptions(query)],
    { encoding: 'utf8', maxBuffer },
  );
  if (res.status !== 0) {
    throw new Error(`sqlcmd failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

/**
 * Run a statement (or batch) and return its output, trimmed.
 *
 * `-b` makes sqlcmd exit non-zero on a SQL error. Without it a mistyped column name comes back as
 * error TEXT where data was expected and flows onward as if it were a value — keep it.
 *
 * `SET NOCOUNT ON` is prefixed so `(N rows affected)` never lands in a parsed result, and columns
 * are separated by `|` so a multi-column row can be split. A single-column read is unaffected by
 * the separator, which is why one helper serves both shapes.
 */
export function sql(query) {
  return run(['-h', '-1', '-W', '-s', '|'], `SET NOCOUNT ON; ${query}`, 64 * 1024 * 1024).trim();
}

/**
 * Run a query whose single column may exceed sqlcmd's 256-character default — a JSON document,
 * typically.
 *
 * `-y 0` lifts that truncation but is mutually exclusive with both `-W` and `-h`, so this is a
 * separate invocation rather than a flag on {@link sql}, and the header row it therefore prints is
 * stripped here. Truncation is the nastiest kind of failure to leave in: the output still looks
 * like JSON, it is just half a document.
 */
export function sqlWide(query) {
  return run(['-y', '0'], query, 64 * 1024 * 1024)
    .split('\n')
    // Drop sqlcmd's column header and its dashed rule; keep the payload lines.
    .filter((line) => !/^JSON_/.test(line) && !/^-+$/.test(line.trim()) && line.trim() !== '')
    .join('')
    .trim();
}
