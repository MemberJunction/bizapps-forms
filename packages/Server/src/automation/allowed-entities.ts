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
 * writes at all — the two settings are commissioned together.
 */
export const ALLOWED_BINDING_ENTITIES_ENV = 'FORMS_BINDING_ALLOWED_ENTITIES';

/** The configured allow-list, or null when unrestricted. */
export function allowedBindingEntities(raw: string | undefined = process.env[ALLOWED_BINDING_ENTITIES_ENV]): ReadonlySet<string> | null {
  if (raw === undefined) {
    return null;
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
