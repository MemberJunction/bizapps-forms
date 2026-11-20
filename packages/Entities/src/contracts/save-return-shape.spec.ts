import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where the shipped migrations live, from this spec's location in the package. */
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'migrations');

/**
 * MJ 6.2+ (commit `f033cb970b`, shipped in `>=6.2.0-edge.5` and `6.2.1`) supports
 * `SaveReturnMode: 'datestamps_only'` natively across `SQLServerDataProvider`,
 * `PostgreSQLDataProvider`, `BaseEntity`, and `CodeGenLib`.
 *
 * `FormResponseAnswer` and `FormAutomationRun` are write-heavy entities configured with
 * `SaveReturnMode: 'datestamps_only'` and `TrackRecordChanges: false`. Their `spCreate`/`spUpdate`
 * procedures return only `[ID], [__mj_CreatedAt], [__mj_UpdatedAt]` directly from the base table
 * (avoiding BaseView joins and wide `NVARCHAR(MAX)` payload roundtrips on every save).
 *
 * A host runs whatever the LAST migration defining a sproc says, so this reads that definition
 * rather than a fixed file: the shipped end state must keep the `datestamps_only` shape on every
 * result branch (including `spUpdate`'s `SELECT TOP 0` branch), keep `@FormAutomationEventID` on
 * `FormAutomationRun`, and pair the sprocs atomically with the `Entity.Configuration` /
 * `TrackRecordChanges` update.
 */
const SAVE_SPROCS = [
  { sproc: 'spCreateFormResponseAnswer', table: 'FormResponseAnswer' },
  { sproc: 'spUpdateFormResponseAnswer', table: 'FormResponseAnswer' },
  { sproc: 'spCreateFormAutomationRun', table: 'FormAutomationRun' },
  { sproc: 'spUpdateFormAutomationRun', table: 'FormAutomationRun' },
] as const;

/** The body of the last shipped `CREATE PROCEDURE` for `sproc`, up to its batch's `GO`. */
function lastShippedDefinition(sproc: string): { file: string; body: string } {
  // Any spelling that (re)defines the procedure counts — CREATE, ALTER or CREATE OR ALTER, bracketed
  // or not — so a regression written another way cannot hide behind an older definition.
  const header = new RegExp(
    String.raw`(?:CREATE|ALTER)(?:\s+OR\s+ALTER)?\s+PROC(?:EDURE)?\s+\[?\$\{flyway:defaultSchema\}\]?\.\[?${sproc}\]?(?![\w])`,
    'gi',
  );
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let last: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const match of sql.matchAll(header)) {
      const at = match.index;
      const end = sql.slice(at).search(/^\s*GO\s*$/m);
      last = { file, body: end === -1 ? sql.slice(at) : sql.slice(at, at + end) };
    }
  }
  if (!last) throw new Error(`no shipped migration defines ${sproc}`);
  return last;
}

describe('save sprocs return datestamps_only from the base table on MJ 6.2+', () => {
  for (const { sproc, table } of SAVE_SPROCS) {
    it(`${sproc} selects [ID], [__mj_CreatedAt], [__mj_UpdatedAt] from ${table} on every branch`, () => {
      const { file, body } = lastShippedDefinition(sproc);
      // Every SELECT that starts a line is a result set MJ reads back on Save — including
      // spUpdate's `IF @@ROWCOUNT = 0` branch (`SELECT TOP 0 ... WHERE 1=0`), which must match
      // the 3-column datestamps_only shape too.
      const selects = [...body.matchAll(/^\s*SELECT\s+(?:TOP\s+0\s+)?(.+?)\s+FROM\s+(\S+)/gim)];
      expect(selects.length, `${sproc} in ${file} has no SELECT`).toBeGreaterThan(0);
      for (const select of selects) {
        expect(`${select[1]} FROM ${select[2]}`, `${sproc} in ${file}: ${select[0].trim()}`).toBe(
          `[ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [\${flyway:defaultSchema}].[${table}]`,
        );
      }
    });
  }

  // V202610172100 added FormAutomationRun.FormAutomationEventID; a redefinition that drops the
  // parameter would silently stop the outbox from linking a run to its event.
  for (const sproc of ['spCreateFormAutomationRun', 'spUpdateFormAutomationRun']) {
    it(`${sproc} still takes @FormAutomationEventID`, () => {
      const { file, body } = lastShippedDefinition(sproc);
      expect(body, `${sproc} in ${file}`).toMatch(/@FormAutomationEventID\s+uniqueidentifier/);
    });
  }

  it('last migration defining the datestamps_only sprocs also sets Entity.Configuration and TrackRecordChanges atomically', () => {
    const { file } = lastShippedDefinition('spCreateFormResponseAnswer');
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    expect(sql, `${file} must disable TrackRecordChanges atomically`).toMatch(/\[TrackRecordChanges\]\s*=\s*0/);
    expect(sql, `${file} must set SaveReturnMode = datestamps_only atomically`).toMatch(/SaveReturnMode.*datestamps_only/);
  });
});
