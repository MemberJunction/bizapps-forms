/**
 * Which entities a binding on this deployment may write.
 *
 * The service principal's own grants are the hard ceiling — nothing here can widen them. This is
 * the second, narrower gate: without it, anyone who can author a form can reach every entity the
 * principal can touch, which quietly turns "can build a form" into "can write anything the
 * automation runner can write". Two gates because they fail differently: the grant is enforced by
 * the database and cannot be bypassed, while this one can be read at authoring time to tell an
 * author no BEFORE a respondent hits it.
 *
 * Configured as a comma-separated list of entity names. Unset means unrestricted, which is the
 * right default only because a deployment that has not provisioned the principal has no automation
 * writes at all — the two settings are commissioned together. Because "commissioned together" is a
 * convention and not a mechanism, an unset list on a deployment that DOES run automations is
 * announced at ERROR level at first use ({@link allowedBindingEntities}'s one caller runs only
 * after the principal resolved, so firing there is exactly the "principal configured but list
 * unset" condition), and `FORMS_BINDING_REQUIRE_ALLOWLIST=true` is the opt-in that fails CLOSED —
 * unset list then permits nothing — for deployments that want the gate mandatory. Opt-in rather
 * than the default because flipping existing unrestricted deployments to default-deny would
 * silently break every binding they run today.
 */
import { LogError } from '@memberjunction/core';

export const ALLOWED_BINDING_ENTITIES_ENV = 'FORMS_BINDING_ALLOWED_ENTITIES';

/** Opt-in env flag: `true` makes an UNSET allowlist mean "permit nothing" instead of "unrestricted". */
export const REQUIRE_BINDING_ALLOWLIST_ENV = 'FORMS_BINDING_REQUIRE_ALLOWLIST';

let notedUnsetAllowlist = false;

/** The configured allow-list, or null when unrestricted. */
export function allowedBindingEntities(
  raw: string | undefined = process.env[ALLOWED_BINDING_ENTITIES_ENV],
  requireRaw: string | undefined = process.env[REQUIRE_BINDING_ALLOWLIST_ENV],
): ReadonlySet<string> | null {
  if (raw === undefined) {
    const failClosed = (requireRaw ?? '').trim().toLowerCase() === 'true';
    noteUnsetAllowlistOnce(failClosed);
    // Fail closed when the deployment asked for it: an empty set permits nothing, same as an
    // operator who set the variable and cleared its value (below).
    return failClosed ? new Set() : null;
  }
  const names = raw
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  // An empty or whitespace-only setting means "permit nothing", not "permit everything". Someone
  // who sets the variable and then clears its value is narrowing, and reading that as unrestricted
  // would do the exact opposite of what they asked.
  return new Set(names);
}

/**
 * Say ONCE per process, at error level, what an unset allowlist means on this deployment. Fires
 * at first use, which — through this module's one caller, `runConfiguredAutomations` — is only
 * reached after the automation principal resolved, so a deployment with no principal (and thus no
 * automation writes at all) never sees it.
 */
function noteUnsetAllowlistOnce(failClosed: boolean): void {
  if (notedUnsetAllowlist) {
    return;
  }
  notedUnsetAllowlist = true;
  if (failClosed) {
    LogError(
      `[Forms] ${REQUIRE_BINDING_ALLOWLIST_ENV}=true and ${ALLOWED_BINDING_ENTITIES_ENV} is not set: ` +
        `entity bindings are DISABLED (failing closed, as opted into). Set ${ALLOWED_BINDING_ENTITIES_ENV} ` +
        'to the comma-separated entity names bindings on this deployment may write.',
    );
  } else {
    LogError(
      `[Forms] ${ALLOWED_BINDING_ENTITIES_ENV} is not set: form entity bindings are UNRESTRICTED — ` +
        'anyone who can author a form can bind answers into ANY entity the automation principal ' +
        `can write. Set ${ALLOWED_BINDING_ENTITIES_ENV} to a comma-separated allowlist of entity ` +
        `names, or set ${REQUIRE_BINDING_ALLOWLIST_ENV}=true to fail closed until one is configured.`,
    );
  }
}

/** Test-only: forget that the unset-allowlist notice has been emitted. */
export function resetBindingAllowlistNoticeForTests(): void {
  notedUnsetAllowlist = false;
}
