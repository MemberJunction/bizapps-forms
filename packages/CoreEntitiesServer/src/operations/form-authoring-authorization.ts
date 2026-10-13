/**
 * Who may run a Forms AUTHORING operation (publish, clone, template, archive/restore, distribution
 * and automation verbs) — one rule, applied by every one of them from its `Authorize()` (spec #303 §2)
 * — and its READING twin for the response-reporting operations ({@link responseReadingRefusal}).
 *
 * `Authorize()` is the only gate an operation controls. MJ enforces `RequiredScope` (`forms:read` /
 * `forms:write` on the Forms operations) only for API-key sessions — a ceiling on what a key may
 * reach, not the authorization — an in-process `.Execute()` skips the resolver gates entirely, and an anonymous
 * magic-link session can reach any Active operation — so without this, a respondent's public link
 * would be a credential for publishing forms. The rule:
 *  - never an anonymous or magic-link-scoped session (`IsMagicLinkAnonymous`, `MagicLinkScope`),
 *    whatever roles it carries — checked on the two `UserInfo` flags directly, because
 *    `IsScopeLimitedPrincipal` is not exported from `@memberjunction/server`;
 *  - otherwise, Update permission on `MJ_BizApps_Forms: Forms` (the precedent the share-link claims
 *    resolver set for Form Distributions, before it became `Forms.GetDistributionClaims`);
 *  - and, for a share-link operation, the rights it needs on `MJ_BizApps_Forms: Form Distributions`
 *    ({@link distributionAuthoringRefusal}).
 * Fails closed: an unknown entity or a lookup that throws refuses.
 */
import { EntityPermissionType, LogStatus, Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { FORM_ENTITY_NAME } from '../entities/FormEntityServer.js';
import { FORMS_ENTITY } from '../shared/entity-names.js';

/** The slice of a provider the rule reads: entity metadata, for the user's permissions. */
export type FormPermissionSource = Pick<IMetadataProvider, 'EntityByName'>;

/** Why `user`'s SESSION may not `act` on forms (author them, read their responses), or `null`. */
function sessionRefusal(user: UserInfo | undefined, act: string): string | null {
  if (!user) {
    return 'there is no user on the request';
  }
  if (user.IsMagicLinkAnonymous) {
    return `an anonymous magic-link session cannot ${act}`;
  }
  if (user.MagicLinkScope) {
    return `a magic-link session is scoped to the resource it was issued for and cannot ${act}`;
  }
  return null;
}

/** Why `user` may not author forms, or `null` when they may. A pure read — logs nothing. */
export function formAuthoringRefusal(user: UserInfo | undefined, metadata: FormPermissionSource): string | null {
  const session = sessionRefusal(user, 'author forms');
  if (session || !user) {
    return session;
  }
  return entityRightRefusal(FORM_ENTITY_NAME, 'CanUpdate', user, metadata);
}

/**
 * The entities the response-reporting operations read (`Forms.GetResponseSummary`,
 * `Forms.ListResponses`, `Forms.GetResponseDetail`): the form, the version that labels the answers,
 * the responses and their answers. The satellite sections of a response's detail (automation runs,
 * created records, file details) are not required: they degrade, each reported as unavailable.
 */
export const RESPONSE_REPORTING_ENTITIES = [
  FORMS_ENTITY.Form,
  FORMS_ENTITY.FormVersion,
  FORMS_ENTITY.FormResponse,
  FORMS_ENTITY.FormResponseAnswer,
] as const;

/**
 * Why `user` may not read a form's responses, or `null` when they may: never an anonymous or
 * magic-link-scoped session — a respondent's link is not a credential for everyone's answers — and
 * otherwise Read on every one of {@link RESPONSE_REPORTING_ENTITIES}. A pure read, like
 * {@link formAuthoringRefusal}, and fail-closed the same way.
 *
 * Read, not Update: a reviewer who may not edit a form may still read what it collected. The summary
 * then runs its queries as the system user (`reporting/report-queries.ts`); this rule is what stands
 * between that elevation and the caller.
 */
export function responseReadingRefusal(user: UserInfo | undefined, metadata: FormPermissionSource): string | null {
  const session = sessionRefusal(user, "read a form's responses");
  if (session || !user) {
    return session;
  }
  for (const entityName of RESPONSE_REPORTING_ENTITIES) {
    const refusal = entityRightRefusal(entityName, 'CanRead', user, metadata);
    if (refusal) {
      return refusal;
    }
  }
  return null;
}

/** A right on Form Distributions a share-link operation can need, beyond authoring forms. */
export type DistributionRight = 'CanCreate' | 'CanUpdate';

/**
 * Why `user` may not run a share-link operation needing `rights` on Form Distributions, or `null`
 * when they may. The authoring rule first — so a magic-link session is refused whatever rights its
 * role carries — then each right. A pure read, like {@link formAuthoringRefusal}.
 *
 * Checked up front rather than left to the entity save that would refuse anyway: a refusal here is
 * `FORBIDDEN` with the reason in the log, where a refused save is an execution error after the
 * operation had already started work. `CanUpdate` is needed even to issue a link — the provisioning
 * hook writes the new link's credential back with a second, update save.
 */
export function distributionAuthoringRefusal(
  user: UserInfo | undefined,
  metadata: FormPermissionSource,
  rights: readonly DistributionRight[],
): string | null {
  const authoring = formAuthoringRefusal(user, metadata);
  if (authoring || !user) {
    return authoring;
  }
  for (const right of rights) {
    const refusal = entityRightRefusal(FORMS_ENTITY.FormDistribution, right, user, metadata);
    if (refusal) {
      return refusal;
    }
  }
  return null;
}

/**
 * The entities whose rows the response SUMMARY reads as the system user (`FormReportingEngine`):
 * the responses and their answers. Their row filters are what that elevation would otherwise drop.
 */
export const RESPONSE_SUMMARY_ROW_ENTITIES = [FORMS_ENTITY.FormResponse, FORMS_ENTITY.FormResponseAnswer] as const;

/**
 * Why `user` may not have a form's response summary computed for them by the system user, or `null`.
 *
 * The summary runs its queries and its answer read as the system user, so MJ's row filtering — which
 * every read as the caller applies (`GetEffectiveRowFilterWhereClause`: a role's RLS filter, and an API
 * key's row filter, which no role lifts) — would not. A caller whose READ of responses or answers
 * carries any such filter may see only some responses through `Forms.ListResponses`, and must not get
 * aggregates over all of them here, so they are refused. Fails closed: an entity missing from the
 * metadata, or a lookup that throws, refuses. A pure read — logs nothing.
 */
export function responseRowFilterRefusal(user: UserInfo, metadata: FormPermissionSource): string | null {
  for (const entityName of RESPONSE_SUMMARY_ROW_ENTITIES) {
    try {
      const entity = metadata.EntityByName(entityName);
      if (!entity) {
        return `${entityName} is not in this host's metadata, so the user's row filters on it cannot be checked`;
      }
      if (entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '').trim() !== '') {
        return `the user's reads of ${entityName} are row-filtered`;
      }
    } catch (err) {
      return `the user's row filters on ${entityName} could not be read (${err instanceof Error ? err.message : String(err)})`;
    }
  }
  return null;
}

/** Every entity right a Forms operation checks. */
type EntityRight = DistributionRight | 'CanRead';

const RIGHT_NAMES: Record<EntityRight, string> = { CanCreate: 'Create', CanUpdate: 'Update', CanRead: 'Read' };

/** Why `user` lacks `right` on `entityName`, or `null`. Fails closed: an unknown entity or a throwing lookup refuses. */
function entityRightRefusal(entityName: string, right: EntityRight, user: UserInfo, metadata: FormPermissionSource): string | null {
  try {
    const entity = metadata.EntityByName(entityName);
    if (!entity) {
      return `${entityName} is not in this host's metadata, so its permissions cannot be checked`;
    }
    return entity.GetUserPermisions(user)?.[right] === true ? null : `the user lacks ${RIGHT_NAMES[right]} permission on ${entityName}`;
  } catch (err) {
    return `the user's permissions on ${entityName} could not be read (${err instanceof Error ? err.message : String(err)})`;
  }
}

/**
 * Check `user` against the rule and LOG a refusal (the operation's caller only ever sees
 * `FORBIDDEN`, so the log is where the reason lives). Returns the refusal, or `null` when allowed —
 * for a caller that reports the reason itself, such as the authoring Actions.
 *
 * `metadata` defaults to the process-global provider because `BaseRemotableOperation.Authorize`
 * receives no provider. That is not the multi-provider hazard it looks like: entity permissions are
 * process-global metadata, identical on every provider instance in the process — MJ's own Work
 * Queue operations authorize the same way (`operatorAuthorization.ts`).
 */
export function refuseFormAuthoring(
  caller: string,
  user: UserInfo,
  metadata: FormPermissionSource = Metadata.Provider,
): string | null {
  const refusal = formAuthoringRefusal(user, metadata);
  if (refusal) {
    LogStatus(`[Forms] ${caller} refused for user ${user?.ID ?? '(none)'}: ${refusal}.`);
  }
  return refusal;
}

/** `Authorize()` for an authoring operation: {@link refuseFormAuthoring}, as a yes/no. */
export function authorizeFormAuthoring(
  operationKey: string,
  user: UserInfo,
  metadata: FormPermissionSource = Metadata.Provider,
): boolean {
  return refuseFormAuthoring(operationKey, user, metadata) === null;
}

/**
 * `Authorize()` for a share-link operation: {@link distributionAuthoringRefusal}, logged like
 * {@link refuseFormAuthoring}, as a yes/no. `metadata` defaults to the process-global provider for
 * the reason given there.
 */
export function authorizeDistributionAuthoring(
  operationKey: string,
  user: UserInfo,
  rights: readonly DistributionRight[],
  metadata: FormPermissionSource = Metadata.Provider,
): boolean {
  const refusal = distributionAuthoringRefusal(user, metadata, rights);
  if (refusal) {
    LogStatus(`[Forms] ${operationKey} refused for user ${user?.ID ?? '(none)'}: ${refusal}.`);
  }
  return refusal === null;
}

/**
 * `Authorize()` for a response-reporting operation: {@link responseReadingRefusal}, logged like
 * {@link refuseFormAuthoring}, as a yes/no. `metadata` defaults to the process-global provider for
 * the reason given there.
 */
/**
 * `Authorize` for `Forms.GetResponseSummary`: the response-reading rule, then the row-filter check
 * ({@link responseRowFilterRefusal}). The summary runs its queries as the system user, so a caller
 * whose reads of responses or answers are row-filtered is refused HERE — as `FORBIDDEN`, the code
 * every client reads as "not yours" — and not only by the engine (which keeps its own copy for an
 * in-process caller that skips `Authorize`).
 */
export function authorizeResponseSummary(
  operationKey: string,
  user: UserInfo,
  metadata: FormPermissionSource = Metadata.Provider,
): boolean {
  const refusal = responseReadingRefusal(user, metadata) ?? (user ? responseRowFilterRefusal(user, metadata) : null);
  if (refusal) {
    LogStatus(`[Forms] ${operationKey} refused for user ${user?.ID ?? '(none)'}: ${refusal}.`);
  }
  return refusal === null;
}

export function authorizeResponseReading(
  operationKey: string,
  user: UserInfo,
  metadata: FormPermissionSource = Metadata.Provider,
): boolean {
  const refusal = responseReadingRefusal(user, metadata);
  if (refusal) {
    LogStatus(`[Forms] ${operationKey} refused for user ${user?.ID ?? '(none)'}: ${refusal}.`);
  }
  return refusal === null;
}
