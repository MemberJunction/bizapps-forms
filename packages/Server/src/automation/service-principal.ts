/**
 * Resolve the principal that on-submit automations run as.
 *
 * The respondent is anonymous and holds create-only grants on the two response entities. Anything
 * an automation does downstream — upserting a Person, writing a bound record — needs rights the
 * respondent must never be given, so the work runs as a separate, configured identity. This is
 * MJ's own `widgetGuestElevation` shape: eligibility is checked against the caller, and only the
 * WORK runs elevated.
 *
 * Two rules make that safe rather than merely convenient:
 *
 * 1. **It fails closed.** A misconfigured principal returns null and the automation does not run.
 *    The tempting fallback — "use the system user if the configured one is missing" — silently
 *    restores the broad grants the dedicated principal exists to avoid, at exactly the moment
 *    nobody is watching, and it would do so on a fresh deployment where the seed had not been
 *    applied yet. A skipped automation is visible and recoverable; an over-privileged one is not.
 * 2. **The caller never chooses it.** There is no parameter here that a request can influence.
 */
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { LogError } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';

/** Name of the user automations run as, overridable per deployment. */
export const AUTOMATION_PRINCIPAL_ENV = 'FORMS_AUTOMATION_USER';

/**
 * The expected principal name.
 *
 * The ROLE (`Forms Automation Runner`) and its grants on the Forms-owned entities ship as mj-sync
 * metadata. The USER itself is a deployment step, deliberately: it is an identity in someone
 * else's directory, and the grants it needs on BINDING TARGET entities are whatever that
 * deployment has decided a form may write — which is precisely the ceiling this design does not
 * get to choose on an operator's behalf. Until that user exists, automations stay off and say so.
 */
export const DEFAULT_AUTOMATION_PRINCIPAL = 'Forms Automation Service';

/**
 * The configured automation principal, or null when it cannot be resolved.
 *
 * Callers MUST treat null as "do not run this automation". Returning null rather than throwing is
 * deliberate: a missing principal is a deployment problem, not a respondent's problem, and it must
 * never turn a successful submission into a failed one — the answers are the irreplaceable part.
 */
export function resolveAutomationPrincipal(
  userName: string = process.env[AUTOMATION_PRINCIPAL_ENV] ?? DEFAULT_AUTOMATION_PRINCIPAL,
): UserInfo | null {
  const user = UserCache.Users.find((u) => u.Name?.trim().toLowerCase() === userName.trim().toLowerCase());
  if (!user) {
    LogError(
      `Forms automations are disabled: no user named "${userName}" exists. ` +
        `Seed the automation principal, or set ${AUTOMATION_PRINCIPAL_ENV} to an existing user. ` +
        `Automations will NOT fall back to the system user.`,
    );
    return null;
  }
  if (!user.IsActive) {
    LogError(`Forms automations are disabled: the automation principal "${userName}" is inactive.`);
    return null;
  }
  return user;
}
