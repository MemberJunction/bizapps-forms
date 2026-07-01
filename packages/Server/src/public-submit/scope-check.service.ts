/**
 * Anonymous-scope authorization for the public submit pipeline (FORMS_BUILD_PLAN §4).
 *
 * The submission rides an anonymous magic-link session. MJ synthesizes the session's
 * roles from its `mj_scopes` claim onto the `UserInfo`, and authorization is enforced
 * from those scopes — never from accreted DB roles. The WP-A "Form Respondent" role
 * grants **CanCreate on Form Responses / Form Response Answers ONLY**.
 *
 * This guard enforces exactly that grant:
 *  1. CanCreate must be present on BOTH response entities.
 *  2. CanCreate must NOT be present on the published-form definition entities
 *     (Forms / Form Versions / Form Distributions) — that would be privilege
 *     accretion and is rejected.
 *
 * It uses the live, per-user aggregated permissions (`EntityInfo.GetUserPermisions`),
 * so a mis-scoped session is denied regardless of how the role was assembled.
 */
import type { EntityInfo, UserInfo } from '@memberjunction/core';
import {
  FORM_RESPONSE_ENTITY,
  FORM_RESPONSE_ANSWER_ENTITY,
  FORM_DEFINITION_NO_CREATE_ENTITIES,
} from './entity-names';

/**
 * The narrow capability the scope check needs — just entity-definition lookup. Both the
 * per-request `DatabaseProviderBase` (submit pipeline) and a global `Metadata` (upload
 * endpoint) satisfy this, so the same guard is reused across both entry points without
 * requiring the full `IMetadataProvider` surface.
 */
export interface ScopeMetadataProvider {
  EntityByName(entityName: string): EntityInfo | undefined;
}

/** Outcome of the scope check; `reason` is set only on denial. */
export interface ScopeCheckResult {
  allowed: boolean;
  reason?: string;
}

/** True if the user holds CanCreate on the named entity, per aggregated permissions. */
function userCanCreate(provider: ScopeMetadataProvider, entityName: string, user: UserInfo): boolean {
  const entity = provider.EntityByName(entityName);
  if (!entity) {
    return false;
  }
  return entity.GetUserPermisions(user).CanCreate;
}

/**
 * Verify the anonymous session may create responses and nothing more. Returns a
 * denial (never throws) so the resolver can map it to a clean `FormSubmissionResult`.
 */
export function checkRespondentScope(provider: ScopeMetadataProvider, user: UserInfo): ScopeCheckResult {
  if (!userCanCreate(provider, FORM_RESPONSE_ENTITY, user)) {
    return { allowed: false, reason: 'Session is not authorized to create form responses.' };
  }
  if (!userCanCreate(provider, FORM_RESPONSE_ANSWER_ENTITY, user)) {
    return { allowed: false, reason: 'Session is not authorized to create form response answers.' };
  }

  for (const definitionEntity of FORM_DEFINITION_NO_CREATE_ENTITIES) {
    if (userCanCreate(provider, definitionEntity, user)) {
      return {
        allowed: false,
        reason: `Privilege accretion detected: session has create access on "${definitionEntity}".`,
      };
    }
  }
  return { allowed: true };
}
