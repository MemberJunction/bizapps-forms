/**
 * Response quotas (FORMS_BUILD_PLAN §4 / S1; made atomic by #303 Task 8).
 *
 * Two caps, both on COMPLETIONS only (a partial save and a knockout never consume a slot):
 *  - the distribution's `MaxResponses`, measured against its `ResponseCount`; `null` is unlimited;
 *  - the form-level `FormSettings.quota`, counted across every link of the form.
 *
 * WHY THE DISTRIBUTION CAP IS AN UPDATE, NOT A READ. It used to be read-then-write: the submit read
 * `ResponseCount`, compared it to the cap, and a separate entity save incremented it after the
 * response was written. Two concurrent final submits on the last slot both read N-1, both passed,
 * and both counted — `MaxResponses` exceeded, and `persistence.service.ts` said in a comment that
 * there was no transaction to stop it. {@link consumeDistributionSlot} is now the authority: ONE
 * conditional `UPDATE … WHERE ResponseCount < MaxResponses` inside the submit's transaction. The
 * database serialises the two writers on the row; the second sees the first's increment and
 * matches zero rows, which IS the quota refusal, and its transaction rolls back everything it wrote.
 * {@link distributionQuotaExceeded} survives only as the cheap early refusal (and the respondent-host
 * door's "this link is full"), never as the decision.
 *
 * Both statements run through `ExecuteSQL` on the SAME provider instance the submit's
 * `RunInEntityTransaction` opened, which is what enlists them in that transaction.
 */
import { LogError } from '@memberjunction/core';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import type { FormSettings, mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names.js';

/** The column alias the affected-row count is read back under. */
const AFFECTED = 'AffectedRows';

/**
 * Whether a new completion would exceed the distribution's cap, judged on a row read earlier.
 *
 * A PRE-CHECK: it lets a link that is already full refuse before captcha, validation and the write
 * are paid for. It decides nothing under concurrency — {@link consumeDistributionSlot} does.
 */
export function distributionQuotaExceeded(dist: mjBizAppsFormsFormDistributionEntityType): boolean {
  if (dist.MaxResponses === null || dist.MaxResponses === undefined) {
    return false;
  }
  return dist.ResponseCount >= dist.MaxResponses;
}

/**
 * Take one completion slot on the distribution, atomically — or report that none is left.
 *
 * `true`: the row's `ResponseCount` went up by one. `false`: the cap is reached (or the row is
 * gone), nothing was changed, and the caller must roll its transaction back. Must run inside the
 * caller's transaction on `provider`; a thrown database error propagates (the caller's transaction
 * rolls back on it like any other).
 */
export async function consumeDistributionSlot(
  provider: DatabaseProviderBase,
  distributionId: string,
  contextUser: UserInfo,
): Promise<boolean> {
  const table = tableOf(provider, FORMS_ENTITY.FormDistribution);
  const q = (name: string): string => provider.QuoteIdentifier(name);
  const update =
    `UPDATE ${table} SET ${q('ResponseCount')} = ${q('ResponseCount')} + 1 ` +
    `WHERE ${q('ID')} = ${quoteSqlString(distributionId)} ` +
    `AND (${q('MaxResponses')} IS NULL OR ${q('ResponseCount')} < ${q('MaxResponses')})`;
  const rows = await provider.ExecuteSQL<Record<string, unknown>>(
    provider.Dialect.AffectedRowCountSQL(update, AFFECTED),
    undefined,
    undefined,
    contextUser,
  );
  const affected = affectedRows(rows);
  if (affected === undefined) {
    // Refuse (fail closed), but this is a fault, not a full link: say so, or it reads as one.
    LogError(
      `[Forms] Distribution ${distributionId}: the response-slot UPDATE returned no readable affected-row ` +
        `count (${JSON.stringify(rows?.[0] ?? null)}); the submission is refused as if the link were full.`,
    );
    return false;
  }
  return affected === 1;
}

/**
 * Whether the form-level quota (if set) is already reached — read under an update lock on the form
 * row, so two completions of one form cannot both pass it.
 *
 * The lock is what makes this a decision rather than a guess: a second submit to the same form
 * waits on it until the first commits, and its count then sees the first's `Complete` row. It is
 * taken only when the form HAS a quota, so a form without one pays nothing. Lock order is form, then
 * distribution — the order archiving takes them — so the two cannot deadlock each other.
 *
 * Fail-closed: a count that cannot be read reports the quota as reached, and logs why.
 */
export async function formQuotaReached(
  provider: DatabaseProviderBase,
  formId: string,
  settings: Pick<FormSettings, 'quota'>,
  contextUser: UserInfo,
): Promise<boolean> {
  if (settings.quota === undefined) {
    return false;
  }
  const form = tableOf(provider, FORMS_ENTITY.Form);
  const q = (name: string): string => provider.QuoteIdentifier(name);
  const where = `${q('ID')} = ${quoteSqlString(formId)}`;
  const lock =
    provider.PlatformKey === 'postgresql'
      ? `SELECT ${q('ID')} FROM ${form} WHERE ${where} FOR UPDATE`
      : `SELECT ${q('ID')} FROM ${form} WITH (UPDLOCK, HOLDLOCK) WHERE ${where}`;
  await provider.ExecuteSQL(lock, undefined, undefined, contextUser);
  const result = await provider.RunView(
    {
      EntityName: FORMS_ENTITY.FormResponse,
      ExtraFilter: `FormID=${quoteSqlString(formId)} AND Status='Complete'`,
      ResultType: 'count_only',
    },
    contextUser,
  );
  if (!result.Success) {
    // Fail closed, but log the fault: the respondent can only be told "quota reached".
    LogError(
      `[Forms] Form ${formId}: the form-quota count failed (${result.ErrorMessage ?? 'no error message'}); ` +
        'the submission is refused as if the quota were reached.',
    );
    return true;
  }
  return result.TotalRowCount >= settings.quota;
}

/** The base table of a Forms entity, quoted for this provider's dialect. */
function tableOf(provider: DatabaseProviderBase, entityName: string): string {
  const entity = provider.EntityByName(entityName);
  if (!entity) {
    throw new Error(`"${entityName}" is not in this host's metadata, so its quota cannot be enforced.`);
  }
  return provider.QuoteSchemaAndView(entity.SchemaName, entity.BaseTable);
}

/**
 * The count `AffectedRowCountSQL` reports. A driver that hands the column back under a different
 * case, or as a string, still reads; anything unreadable is `undefined`, which the caller refuses
 * and logs — a missing count is a fault, not a full link.
 */
function affectedRows(rows: Record<string, unknown>[] | undefined): number | undefined {
  const row = rows?.[0];
  if (!row) {
    return undefined;
  }
  const key = Object.keys(row).find((k) => k.toLowerCase() === AFFECTED.toLowerCase());
  const value = key === undefined ? undefined : Number(row[key]);
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}
