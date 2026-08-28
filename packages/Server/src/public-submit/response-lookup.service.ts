/**
 * Find an existing `FormResponse` for the current anonymous session + distribution — the
 * shared lookup behind two Phase-1 gaps:
 *
 *  - **Dedupe (Task 1):** before creating a FINAL (Complete) response, detect that this
 *    session already Completed this form and short-circuit rather than writing a second row.
 *  - **Partial upsert / promotion (Task 4):** find the session's in-flight `Partial` row so
 *    autosaves update it in place, and so a final submit promotes it instead of duplicating.
 *
 * Identity key: `(AnonymousSessionID, FormDistributionID via FormVersionID's form, Status)`.
 * The `FormResponse` row does NOT carry a distribution FK (schema has FormID + FormVersionID +
 * AnonymousSessionID — confirmed, no DistributionID column), so we key on `FormVersionID` +
 * `AnonymousSessionID`. Within one distribution's published version this is exactly the
 * "same session, same form/version" bucket the plan intends; a session that spans two
 * distributions of the same published version shares a version, which is acceptable for
 * Phase-1 dedupe (the durable guard is still the per-distribution quota).
 *
 * All reads go through the per-request provider with the anonymous `contextUser`; RunView
 * results are checked for `.Success` (RunView never throws). Callers decide fail-open vs
 * fail-closed from the returned `ok` flag.
 */
import type { UserInfo } from '@memberjunction/core';
import { escapeSqlString, quoteSqlString } from '@mj-biz-apps/forms-entities';
import type { mjBizAppsFormsFormResponseEntityType } from '@mj-biz-apps/forms-entities';
import type { DefinitionRunViewProvider } from './definition-loader.service';
import { FORM_RESPONSE_ENTITY } from './entity-names';
import { RESUMABLE_RESPONSE_STATUSES, UNCOUNTED_BY_QUOTA } from './response-status';
import type { FormResponseStatus } from './response-status';

/** The identity of the session+form whose response we are looking up. */
export interface ResponseLookupKey {
  formVersionId: string;
  sessionId: string;
}

/**
 * Result of a lookup. Flat (non-discriminated) shape so field access is safe under this
 * package's non-`strictNullChecks` compile (matches persistence/definition-loader).
 *
 *  - `ok:false`             the lookup query itself failed (caller decides fail policy).
 *  - `ok:true, response`    a matching row was found.
 *  - `ok:true, response=∅`  no matching row (the common first-submit case).
 */
export interface ResponseLookupResult {
  ok: boolean;
  response?: mjBizAppsFormsFormResponseEntityType;
}

/**
 * Load the most-recent response for `(session, version)` in any of `statuses`, or none.
 *
 * A SET rather than one status because the two callers ask different questions: the partial
 * upsert wants exactly `Partial`, while dedupe wants "already sealed" — which is every terminal
 * status, not just `Complete`. Passing one status meant dedupe could only ever name one of them,
 * and the one it named was the one that predated `Disqualified`.
 */
export async function findSessionResponse(
  provider: DefinitionRunViewProvider,
  key: ResponseLookupKey,
  statuses: ReadonlyArray<FormResponseStatus>,
  contextUser: UserInfo,
): Promise<ResponseLookupResult> {
  // A blank session id cannot be correlated to a prior row — treat as "no match" (never
  // collapse distinct un-sessioned submissions into one).
  if (!key.sessionId || statuses.length === 0) {
    return { ok: true, response: undefined };
  }
  const result = await provider.RunView<mjBizAppsFormsFormResponseEntityType>(
    {
      EntityName: FORM_RESPONSE_ENTITY,
      ExtraFilter:
        `FormVersionID=${quoteSqlString(key.formVersionId)} ` +
        `AND AnonymousSessionID=${quoteSqlString(key.sessionId)} ` +
        `AND Status IN (${statuses.map(quoteSqlString).join(', ')})`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object',
      MaxRows: 1,
    },
    contextUser,
  );
  if (!result.Success) {
    return { ok: false };
  }
  return { ok: true, response: result.Results[0] };
}

/**
 * Escape a value for a SQL `LIKE` predicate, then wrap it as a quoted literal. Escapes the
 * ESCAPE-designated `\`, plus the wildcards `%` and `_`, so a client id embedded in the JSON
 * is matched literally (defense-in-depth — a valid UUID has none of these characters).
 *
 * Stays local, deliberately, while the plain-literal helper it used to sit beside moved to
 * `@mj-biz-apps/forms-entities`: wildcard escaping is a property of the LIKE PREDICATE, not of SQL
 * string literals, and the two filters below are the only place in the repo that uses one. Hoisting
 * it would offer every call site a function that silently changes what their `=` comparison means.
 * The quote-doubling half is the shared rule and is delegated; the wildcard half is this file's.
 */
function sqlLikeLiteral(value: string): string {
  const escaped = escapeSqlString(value.replace(/[\\%_]/g, (ch) => `\\${ch}`));
  return `'%${escaped}%'`;
}

/**
 * Load a response by its exact id + version in ANY status, guarded by the SourceMetadata
 * client-id proof. Used to detect an idempotent repeat FINAL submit that carries the same
 * client response id (the row was already promoted to Complete, so the `Partial`-only
 * adopt/session lookups miss it). Returns the row so the pipeline can short-circuit to the
 * existing id instead of writing a second Complete. Fail-open on a query error.
 */
export async function findResponseById(
  provider: DefinitionRunViewProvider,
  key: { responseId: string; formVersionId: string },
  contextUser: UserInfo,
): Promise<ResponseLookupResult> {
  if (!key.responseId) {
    return { ok: true, response: undefined };
  }
  const result = await provider.RunView<mjBizAppsFormsFormResponseEntityType>(
    {
      EntityName: FORM_RESPONSE_ENTITY,
      ExtraFilter:
        `ID=${quoteSqlString(key.responseId)} ` +
        `AND FormVersionID=${quoteSqlString(key.formVersionId)} ` +
        `AND SourceMetadata LIKE ${sqlLikeLiteral(`"clientResponseId":"${key.responseId}"`)} ESCAPE '\\'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object',
      MaxRows: 1,
    },
    contextUser,
  );
  if (!result.Success) {
    return { ok: false };
  }
  return { ok: true, response: result.Results[0] };
}

/**
 * Count the rows for a published version that NO QUOTA bounds — the in-flight autosaves, and
 * the knockouts.
 *
 * The durable, request-context-independent bound on partial-write abuse. The per-caller ceilings
 * are sliding windows held in one process's memory, so they bound a RATE and nothing else: a
 * caller who paces themselves under every window, or who spreads across addresses, accumulates
 * rows for as long as they care to. Partial writes are otherwise ungated entirely — Turnstile and
 * both quotas apply only to COMPLETE submissions — so this count is what actually stops the table
 * growing without limit.
 *
 * `Disqualified` belongs in the count for the same reason `Partial` does, and it is easy to miss
 * because the status is TERMINAL: terminal only means nothing more is coming for that respondent,
 * not that anything bounded how many were created. A knockout is never a completion, so no quota
 * ever counts it — leaving this ceiling reading zero while a caller answering "no" created rows
 * without limit, needing neither a session nor a client id.
 *
 * Keyed on `FormVersionID`, not a distribution id, because `FormResponse` carries no distribution
 * FK — the same key dedupe and same-session upsert already use. Runs under the elevated principal
 * (the anonymous respondent cannot READ responses). `count_only` returns `TotalRowCount` without
 * materializing rows. Fail-CLOSED: on a count error we report the cap as reached so a database blip
 * cannot become an unbounded-write hole (the caller turns that into a refused partial, which the
 * widget silently retries — autosave is fail-soft).
 */
export async function countPartialResponses(
  provider: DefinitionRunViewProvider,
  key: Pick<ResponseLookupKey, 'formVersionId'>,
  contextUser: UserInfo,
): Promise<{ ok: boolean; count: number }> {
  const result = await provider.RunView<mjBizAppsFormsFormResponseEntityType>(
    {
      EntityName: FORM_RESPONSE_ENTITY,
      ExtraFilter:
        `FormVersionID=${quoteSqlString(key.formVersionId)} ` +
        `AND Status IN (${UNCOUNTED_BY_QUOTA.map(quoteSqlString).join(', ')})`,
      ResultType: 'count_only',
    },
    contextUser,
  );
  if (!result.Success) {
    return { ok: false, count: 0 };
  }
  return { ok: true, count: result.TotalRowCount };
}

/** Identity for adopting a client-supplied response id: the id PLUS its required owner/version. */
export interface OwnedResponseLookupKey {
  responseId: string;
  formVersionId: string;
  sessionId: string;
}

/**
 * Resolve a client-supplied `responseId` to a candidate Partial row when the anonymous session id
 * is BLANK (the common public-submit case — see source-metadata.service for why `sessionId` is
 * routinely empty). The id is the correlator: the widget mints a 122-bit random UUID, uses it as
 * the FormResponse primary key, AND records it in `SourceMetadata.clientResponseId`. A row is
 * returned only when it matches on `(ID, FormVersionID)`, is still `Partial`, AND its stored
 * `SourceMetadata` carries that same client id — so a row created WITHOUT a client id (legacy /
 * different flow) is never returned for a guessed PK.
 *
 * WHAT THIS DOES NOT DECIDE (issue #78). It asks nothing about who OWNS the row, and it must not:
 * this function used to be documented as "ownership is proven by the id itself", which made the
 * session gate opt-in — a caller who simply omitted `x-session-id` came down this path instead of
 * {@link findOwnedResponseById} and got another session's partial. Ownership is now settled once,
 * at the write, by `applyResponseIdentity` in persistence.service, which refuses any row whose
 * stored `AnonymousSessionID` is non-empty and is not the caller's. A candidate returned here that
 * belongs to somebody else is therefore refused rather than adopted.
 *
 * A blank/absent `responseId` returns "no match" without querying. A query error returns
 * `ok:false` so the caller falls back (never adopts an unverified row).
 */
export async function findAdoptableResponseById(
  provider: DefinitionRunViewProvider,
  key: Pick<OwnedResponseLookupKey, 'responseId' | 'formVersionId'>,
  contextUser: UserInfo,
): Promise<ResponseLookupResult> {
  if (!key.responseId) {
    return { ok: true, response: undefined };
  }
  const result = await provider.RunView<mjBizAppsFormsFormResponseEntityType>(
    {
      EntityName: FORM_RESPONSE_ENTITY,
      ExtraFilter:
        `ID=${quoteSqlString(key.responseId)} ` +
        `AND FormVersionID=${quoteSqlString(key.formVersionId)} ` +
        `AND Status IN (${RESUMABLE_RESPONSE_STATUSES.map(quoteSqlString).join(', ')}) ` +
        // Require the row to carry this exact client id in its SourceMetadata JSON — proves the
        // PK was minted by the widget (not a guessed/foreign id), the ownership capability when
        // there is no session to key on.
        `AND SourceMetadata LIKE ${sqlLikeLiteral(`"clientResponseId":"${key.responseId}"`)} ESCAPE '\\'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object',
      MaxRows: 1,
    },
    contextUser,
  );
  if (!result.Success) {
    return { ok: false };
  }
  return { ok: true, response: result.Results[0] };
}

/**
 * Resolve a CLIENT-SUPPLIED `responseId` (the widget's autosave hint) to a row this session is
 * allowed to keep editing. The row is returned ONLY when it matches on ALL of `(ID,
 * AnonymousSessionID, FormVersionID)` and is still `Partial`, so a guessed/leaked id from another
 * anonymous session comes back empty here — letting a same-session widget thread its own partial
 * back in without offering it anybody else's.
 *
 * This narrows what the pipeline LOOKS FOR; it is not what makes "never adopt another session's
 * row" true, and reading it as though it were is how that invariant came to be optional (issue
 * #78). A caller who never reaches this function — no `x-session-id`, or a different one — used to
 * reach a foreign row by another route entirely. The invariant is enforced once, at the write, by
 * `applyResponseIdentity` in persistence.service; every route passes through it.
 *
 * A blank/absent `responseId` or `sessionId` returns "no match" without querying. A query error
 * returns `ok:false` so callers fall back to the session-key lookup (fail-open to a fresh row,
 * never to a foreign row).
 */
export async function findOwnedResponseById(
  provider: DefinitionRunViewProvider,
  key: OwnedResponseLookupKey,
  contextUser: UserInfo,
): Promise<ResponseLookupResult> {
  if (!key.responseId || !key.sessionId) {
    return { ok: true, response: undefined };
  }
  const result = await provider.RunView<mjBizAppsFormsFormResponseEntityType>(
    {
      EntityName: FORM_RESPONSE_ENTITY,
      ExtraFilter:
        `ID=${quoteSqlString(key.responseId)} ` +
        `AND AnonymousSessionID=${quoteSqlString(key.sessionId)} ` +
        `AND FormVersionID=${quoteSqlString(key.formVersionId)} ` +
        `AND Status IN (${RESUMABLE_RESPONSE_STATUSES.map(quoteSqlString).join(', ')})`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object',
      MaxRows: 1,
    },
    contextUser,
  );
  if (!result.Success) {
    return { ok: false };
  }
  return { ok: true, response: result.Results[0] };
}
