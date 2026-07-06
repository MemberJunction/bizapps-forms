/**
 * Per-distribution response quota (FORMS_BUILD_PLAN §4 / S1).
 *
 * The durable cap is `FormDistribution.MaxResponses` measured against
 * `ResponseCount`. A `null`/absent MaxResponses means unlimited. The form-level
 * `FormSettings.quota` is an additional optional cap counted across the whole form.
 *
 * This module only DECIDES; incrementing `ResponseCount` happens in the persistence
 * service after a successful Save so we never burn quota on a failed write.
 */
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type {
  FormSettings,
  mjBizAppsFormsFormDistributionEntityType,
  mjBizAppsFormsFormResponseEntityType,
} from '@mj-biz-apps/forms-entities';
import { FORM_RESPONSE_ENTITY } from './entity-names';

/** Whether a new (complete) response would exceed the distribution's cap. */
export function distributionQuotaExceeded(dist: mjBizAppsFormsFormDistributionEntityType): boolean {
  if (dist.MaxResponses === null || dist.MaxResponses === undefined) {
    return false;
  }
  return dist.ResponseCount >= dist.MaxResponses;
}

/**
 * Whether the form-level quota (if set) is reached. Counts existing `Complete`
 * responses for the form via RunView (checked for `.Success`).
 */
export async function formQuotaExceeded(
  provider: DatabaseProviderBase,
  formId: string,
  settings: FormSettings,
  contextUser: UserInfo,
): Promise<boolean> {
  if (settings.quota === undefined) {
    return false;
  }
  const result = await provider.RunView<mjBizAppsFormsFormResponseEntityType>(
    {
      EntityName: FORM_RESPONSE_ENTITY,
      ExtraFilter: `FormID='${formId.replace(/'/g, "''")}' AND Status='Complete'`,
      ResultType: 'count_only',
    },
    contextUser,
  );
  if (!result.Success) {
    // Fail-closed on a count error: do not silently allow over-quota writes.
    return true;
  }
  return result.TotalRowCount >= settings.quota;
}
