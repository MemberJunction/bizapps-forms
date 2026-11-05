/**
 * Who may run a RESPONDENT operation (`Forms.GetRespondentForm`, `Forms.SaveResponse`) — one rule,
 * applied by both from their `Authorize()` (spec #303 §2, §6).
 *
 * Both operations are deliberately unscoped (no `RequiredScope`): MJ enforces a scope only for
 * API-key sessions, and these are reached only by an anonymous magic-link session. So `Authorize` is
 * the whole gate, and it must not stop at "is this a magic-link session": a session minted for one
 * link would otherwise be a credential for every form on the host. The rule:
 *  - the caller holds a magic-link session with a scope claim (`UserInfo.MagicLinkScope.ResourceID`,
 *    minted by the server into the JWT, so the browser cannot choose it); and
 *  - that claim names THE DISTRIBUTION the input slug resolves to — an ordinary public-link session —
 *    or a RESPONSE whose `FormDistributionID` is that distribution — a resume session (#138).
 *
 * The reads run as the CALLER, on the request's provider: the respondent role's row filters
 * (`Respondent Own Distribution`, `Respondent Own Response`) already return nothing for a foreign
 * link, and the explicit comparison below is the second layer — the one that holds on a host whose
 * filters were edited, and the one a test can see. A slug that resolves to nothing the session may
 * read is refused like a foreign one, so the answer is no oracle for which slugs exist.
 *
 * A request with NO slug is not this rule's to refuse: there is no link to bind against and nothing
 * is done without one — the operation's input check refuses it (`EXECUTION_ERROR`), which is what a
 * malformed request should get. Every other failure here, including a read that fails, refuses.
 */
import { LogStatus, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names.js';

/** The slice of a provider the rule reads through. */
export type RespondentReadProvider = Pick<IRunViewProvider, 'RunView'>;

/** Why `user` may not use the link `slug` names, or `null` when they may. Reads; logs nothing. */
export async function respondentSessionRefusal(
  slug: unknown,
  user: UserInfo | undefined,
  provider: RespondentReadProvider | undefined,
): Promise<string | null> {
  if (!user) {
    return 'there is no user on the request';
  }
  const scope = fold(user.MagicLinkScope?.ResourceID);
  if (!scope) {
    return 'only a magic-link session scoped to a share link may use the respondent operations';
  }
  const linkSlug = typeof slug === 'string' ? slug.trim() : '';
  if (!linkSlug) {
    return null; // nothing to bind against; the operation refuses the input itself
  }
  if (!provider) {
    return 'no provider was handed to the operation, so the link cannot be resolved';
  }
  const distribution = await readOne<{ ID: string }>(provider, user, FORMS_ENTITY.FormDistribution, `Slug=${quoteSqlString(linkSlug)}`, ['ID']);
  if (typeof distribution === 'string') {
    return distribution;
  }
  if (!distribution) {
    return `the slug '${linkSlug}' names no link this session may read`;
  }
  const linkId = fold(distribution.ID);
  if (scope === linkId) {
    return null; // a public-link session for this very link
  }
  const response = await readOne<{ ID: string; FormDistributionID: string | null }>(
    provider,
    user,
    FORMS_ENTITY.FormResponse,
    `ID=${quoteSqlString(scope)}`,
    ['ID', 'FormDistributionID'],
  );
  if (typeof response === 'string') {
    return response;
  }
  if (response && fold(response.FormDistributionID) === linkId) {
    return null; // a resume session for a response of this link
  }
  return `the session is scoped to ${scope}, which is neither link '${linkSlug}' nor a response of it`;
}

/**
 * `Authorize()` for a respondent operation: {@link respondentSessionRefusal}, with the reason LOGGED
 * (the caller only ever sees `FORBIDDEN`) — never with a token or an answer.
 */
export async function authorizeRespondent(
  operationKey: string,
  slug: unknown,
  user: UserInfo,
  provider: RespondentReadProvider | undefined,
): Promise<boolean> {
  let refusal: string | null;
  try {
    refusal = await respondentSessionRefusal(slug, user, provider);
  } catch (err) {
    refusal = `the session's link could not be checked (${err instanceof Error ? err.message : String(err)})`;
  }
  if (refusal) {
    LogStatus(`[Forms] ${operationKey} refused for user ${user?.ID ?? '(none)'}: ${refusal}.`);
  }
  return refusal === null;
}

/** The one row a filter names, `undefined` for none, or why the read failed (a refusal). */
async function readOne<T>(
  provider: RespondentReadProvider,
  user: UserInfo,
  entityName: string,
  filter: string,
  fields: string[],
): Promise<T | undefined | string> {
  const result = await provider.RunView<T>({ EntityName: entityName, ExtraFilter: filter, Fields: fields, ResultType: 'simple', MaxRows: 1 }, user);
  if (!result.Success) {
    return `the link could not be checked (reading ${entityName} failed: ${result.ErrorMessage})`;
  }
  return result.Results[0];
}

/** GUIDs case-folded: MJ mints them lower-case and SQL Server hands them back upper-case. */
function fold(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Re-typed for the operations, which hold an `IMetadataProvider`. */
export function readProviderOf(provider: IMetadataProvider | undefined): RespondentReadProvider | undefined {
  const candidate = provider as Partial<RespondentReadProvider> | undefined;
  return candidate && typeof candidate.RunView === 'function' ? (candidate as RespondentReadProvider) : undefined;
}
