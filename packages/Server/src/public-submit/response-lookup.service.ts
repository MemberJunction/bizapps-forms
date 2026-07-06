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
import type { mjBizAppsFormsFormResponseEntityType } from '@mj-biz-apps/forms-entities';
import type { DefinitionRunViewProvider } from './definition-loader.service';
import { FORM_RESPONSE_ENTITY } from './entity-names';

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

/** Escape a string literal for safe inclusion in a RunView `ExtraFilter`. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Load the most-recent response for `(session, version)` in the given status, or none.
 * `status` narrows to 'Complete' (dedupe) or 'Partial' (upsert/promote).
 */
export async function findSessionResponse(
  provider: DefinitionRunViewProvider,
  key: ResponseLookupKey,
  status: 'Complete' | 'Partial',
  contextUser: UserInfo,
): Promise<ResponseLookupResult> {
  // A blank session id cannot be correlated to a prior row — treat as "no match" (never
  // collapse distinct un-sessioned submissions into one).
  if (!key.sessionId) {
    return { ok: true, response: undefined };
  }
  const result = await provider.RunView<mjBizAppsFormsFormResponseEntityType>(
    {
      EntityName: FORM_RESPONSE_ENTITY,
      ExtraFilter:
        `FormVersionID=${sqlString(key.formVersionId)} ` +
        `AND AnonymousSessionID=${sqlString(key.sessionId)} ` +
        `AND Status=${sqlString(status)}`,
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
 */
function sqlLikeLiteral(value: string): string {
  const escaped = value.replace(/[\\%_]/g, (ch) => `\\${ch}`).replace(/'/g, "''");
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
        `ID=${sqlString(key.responseId)} ` +
        `AND FormVersionID=${sqlString(key.formVersionId)} ` +
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

/** Identity for adopting a client-supplied response id: the id PLUS its required owner/version. */
export interface OwnedResponseLookupKey {
  responseId: string;
  formVersionId: string;
  sessionId: string;
}

/**
 * Resolve a client-supplied `responseId` to an adoptable Partial row when the anonymous
 * session id is BLANK (the common public-submit case — see source-metadata.service for why
 * `sessionId` is routinely empty). Ownership is proven by the id itself: the widget mints a
 * 122-bit random UUID, uses it as the FormResponse primary key, AND records it in
 * `SourceMetadata.clientResponseId`. We adopt the row only when it matches on
 * `(ID, FormVersionID)`, is still `Partial`, AND its stored `SourceMetadata` carries that same
 * client id — so a row created WITHOUT a client id (legacy / different flow) is never adopted
 * by a guessed PK.
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
        `ID=${sqlString(key.responseId)} ` +
        `AND FormVersionID=${sqlString(key.formVersionId)} ` +
        `AND Status='Partial' ` +
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
 * AnonymousSessionID, FormVersionID)` and is still `Partial` — so a guessed/leaked id from
 * another anonymous session can never be adopted (it fails the `AnonymousSessionID` predicate
 * and comes back empty). This preserves the pipeline's "never adopt another session's row"
 * invariant while still letting a same-session widget thread its own partial back in.
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
        `ID=${sqlString(key.responseId)} ` +
        `AND AnonymousSessionID=${sqlString(key.sessionId)} ` +
        `AND FormVersionID=${sqlString(key.formVersionId)} ` +
        `AND Status='Partial'`,
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
