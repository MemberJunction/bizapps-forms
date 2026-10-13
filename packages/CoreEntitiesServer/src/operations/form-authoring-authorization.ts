/**
 * Who may run a Forms AUTHORING operation (publish, clone, template, archive/restore, distribution
 * and automation verbs) — one rule, applied by every one of them from its `Authorize()` (spec #303 §2).
 *
 * `Authorize()` is the only gate an operation controls. MJ enforces `RequiredScope` only for API-key
 * sessions, an in-process `.Execute()` skips the resolver gates entirely, and an anonymous
 * magic-link session can reach any Active operation — so without this, a respondent's public link
 * would be a credential for publishing forms. The rule:
 *  - never an anonymous or magic-link-scoped session (`IsMagicLinkAnonymous`, `MagicLinkScope`),
 *    whatever roles it carries — checked on the two `UserInfo` flags directly, because
 *    `IsScopeLimitedPrincipal` is not exported from `@memberjunction/server`;
 *  - otherwise, Update permission on `MJ_BizApps_Forms: Forms` (the `canUpdateDistributions`
 *    precedent in the share-link claims service).
 * Fails closed: an unknown entity or a lookup that throws refuses.
 */
import { LogStatus, Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { FORM_ENTITY_NAME } from '../entities/FormEntityServer.js';

/** The slice of a provider the rule reads: entity metadata, for the user's permissions. */
export type FormPermissionSource = Pick<IMetadataProvider, 'EntityByName'>;

/** Why `user` may not author forms, or `null` when they may. A pure read — logs nothing. */
export function formAuthoringRefusal(user: UserInfo | undefined, metadata: FormPermissionSource): string | null {
  if (!user) {
    return 'there is no user on the request';
  }
  if (user.IsMagicLinkAnonymous) {
    return 'an anonymous magic-link session cannot author forms';
  }
  if (user.MagicLinkScope) {
    return 'a magic-link session is scoped to the resource it was issued for and cannot author forms';
  }
  try {
    const entity = metadata.EntityByName(FORM_ENTITY_NAME);
    if (!entity) {
      return `${FORM_ENTITY_NAME} is not in this host's metadata, so its permissions cannot be checked`;
    }
    return entity.GetUserPermisions(user)?.CanUpdate === true
      ? null
      : `the user lacks Update permission on ${FORM_ENTITY_NAME}`;
  } catch (err) {
    return `the user's permissions on ${FORM_ENTITY_NAME} could not be read (${err instanceof Error ? err.message : String(err)})`;
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
