/**
 * Reading the affected-row count `Dialect.AffectedRowCountSQL` appends to a DML statement — the one
 * place two writers (the quota slot and the automation outbox settle) learn whether their
 * conditional UPDATE matched.
 */

/** The column alias the count is read back under. */
export const AFFECTED_ROWS_ALIAS = 'AffectedRows';

/**
 * The count, read case-insensitively; a driver that returns it as a string still reads. `undefined`
 * when it is missing or not a number — a fault the caller must refuse and log, never a zero.
 */
export function affectedRows(rows: Record<string, unknown>[] | undefined): number | undefined {
  const row = rows?.[0];
  if (!row) {
    return undefined;
  }
  const key = Object.keys(row).find((k) => k.toLowerCase() === AFFECTED_ROWS_ALIAS.toLowerCase());
  const value = key === undefined ? undefined : Number(row[key]);
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}
