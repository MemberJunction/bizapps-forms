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
 *  2. CanCreate must NOT be present on ANY other entity — an ALLOW-list, not a deny-list.
 *     The guard used to deny-list only the three published-form definition entities
 *     (Forms / Form Versions / Form Distributions), which left create access on every
 *     other entity in the database (MJ core tables included) unchecked. Create access
 *     anywhere outside the allow-list is privilege accretion and is rejected.
 *
 * It uses the live, per-user aggregated permissions (`EntityInfo.GetUserPermisions`),
 * so a mis-scoped session is denied regardless of how the role was assembled.
 */
import type { EntityInfo, UserInfo } from '@memberjunction/core';
import { FORMS_ENTITY } from '../shared/entity-names.js';

/**
 * The ONLY entities the anonymous respondent session may hold CanCreate on — the two the submit
 * pipeline writes. Create access on anything else is privilege accretion.
 */
export const RESPONDENT_CREATABLE_ENTITIES: readonly string[] = [
  FORMS_ENTITY.FormResponse,
  FORMS_ENTITY.FormResponseAnswer,
];

/**
 * The narrow capability the scope check needs — entity-definition lookup, plus the full entity
 * list the allow-list sweep walks. Both the per-request `DatabaseProviderBase` (submit pipeline)
 * and a global `Metadata` (upload endpoint) satisfy this, so the same guard is reused across both
 * entry points without requiring the full `IMetadataProvider` surface.
 */
export interface ScopeMetadataProvider {
  EntityByName(entityName: string): EntityInfo | undefined;
  /** Every entity the provider knows — what the allow-list sweep judges CanCreate over. */
  readonly Entities: EntityInfo[];
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
 * denial (never throws) so `FormSubmissionEngine.SaveResponse` can answer it as an ordinary refusal.
 */
export function checkRespondentScope(provider: ScopeMetadataProvider, user: UserInfo): ScopeCheckResult {
  if (!userCanCreate(provider, FORMS_ENTITY.FormResponse, user)) {
    return { allowed: false, reason: 'Session is not authorized to create form responses.' };
  }
  if (!userCanCreate(provider, FORMS_ENTITY.FormResponseAnswer, user)) {
    return { allowed: false, reason: 'Session is not authorized to create form response answers.' };
  }

  // The allow-list sweep: create access anywhere OUTSIDE the two response entities is accretion,
  // whichever entity carries it. Names are compared case-insensitively, as `EntityByName` does.
  const creatable = new Set(RESPONDENT_CREATABLE_ENTITIES.map((name) => name.toLowerCase()));
  for (const entity of provider.Entities) {
    if (creatable.has(entity.Name.trim().toLowerCase())) {
      continue;
    }
    if (entity.GetUserPermisions(user).CanCreate) {
      return {
        allowed: false,
        reason: `Privilege accretion detected: session has create access on "${entity.Name}".`,
      };
    }
  }
  return { allowed: true };
}
