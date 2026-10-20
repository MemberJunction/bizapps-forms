import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where the shipped migrations live, from this spec's location in the package. */
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'migrations');

/**
 * #315: every published MJ (6.1.6, 6.2.0-edge.4) saves with
 * `INSERT INTO @ResultTable EXEC <sproc>`, where `@ResultTable` holds every column of the entity's
 * BASE VIEW. A sproc whose closing SELECT returns anything narrower — #310's
 * `SaveReturnMode: datestamps_only` shape, `SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM
 * <base table>` — fails every save with SQL error 213. The three-column return needs MJ#5804,
 * which is in no MJ tag.
 *
 * A host runs whatever the LAST migration defining a sproc says, so this reads that definition
 * rather than a fixed file: the shipped end state is what has to be a full-row return.
 */
const SAVE_SPROCS = [
  { sproc: 'spCreateFormResponseAnswer', view: 'vwFormResponseAnswers' },
  { sproc: 'spUpdateFormResponseAnswer', view: 'vwFormResponseAnswers' },
  { sproc: 'spCreateFormAutomationRun', view: 'vwFormAutomationRuns' },
  { sproc: 'spUpdateFormAutomationRun', view: 'vwFormAutomationRuns' },
] as const;

/** The body of the last shipped `CREATE PROCEDURE` for `sproc`, up to its batch's `GO`. */
function lastShippedDefinition(sproc: string): { file: string; body: string } {
  const header = `CREATE PROCEDURE [\${flyway:defaultSchema}].[${sproc}]`;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let last: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    let at = sql.indexOf(header);
    while (at !== -1) {
      const end = sql.slice(at).search(/^\s*GO\s*$/m);
      last = { file, body: end === -1 ? sql.slice(at) : sql.slice(at, at + end) };
      at = sql.indexOf(header, at + header.length);
    }
  }
  if (!last) throw new Error(`no shipped migration defines ${sproc}`);
  return last;
}

describe('save sprocs return the full base-view row (#315)', () => {
  for (const { sproc, view } of SAVE_SPROCS) {
    it(`${sproc} ends by selecting every column from ${view}`, () => {
      const { file, body } = lastShippedDefinition(sproc);
      const selects = [...body.matchAll(/^\s*SELECT\s+(.+?)\s+FROM\s+(\S+)/gim)];
      const closing = selects[selects.length - 1];
      expect(closing, `${sproc} in ${file} has no SELECT`).toBeDefined();
      expect(`${closing[1]} FROM ${closing[2]}`, `${sproc} in ${file}`).toBe(
        `* FROM [\${flyway:defaultSchema}].[${view}]`,
      );
    });
  }

  // V202610172100 added FormAutomationRun.FormAutomationEventID; a restore that drops the
  // parameter would silently stop the outbox from linking a run to its event.
  for (const sproc of ['spCreateFormAutomationRun', 'spUpdateFormAutomationRun']) {
    it(`${sproc} still takes @FormAutomationEventID`, () => {
      const { file, body } = lastShippedDefinition(sproc);
      expect(body, `${sproc} in ${file}`).toMatch(/@FormAutomationEventID\s+uniqueidentifier/);
    });
  }
});
