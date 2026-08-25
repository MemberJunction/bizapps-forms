/**
 * Guard for the entities these actions WRITE but this package does not generate.
 *
 * Forms excludes the sibling apps' schemas from CodeGen (`excludeSchemas` in mj.config.cjs), so
 * `MJ_BizApps_Common: People` and the `MJ_BizApps_Tasks:` entities reach the actions as classes
 * owned by `@mj-biz-apps/common-entities` / `@mj-biz-apps/tasks-entities`. `custom/register.ts`
 * imports both packages so those classes register on load, and `register.spec.ts` pins that. This
 * file exists for when that guarantee does not hold anyway — a host resolving an older sibling
 * package that predates an entity, or a future action reaching for a fifth entity nobody added to
 * the registration list.
 *
 * WHY A GUARD AT ALL, when the failure "cannot" happen: because of how it fails when it does.
 * `Metadata.GetEntityObject` does not throw for an unregistered entity — MJ's ClassFactory falls
 * back to a plain `BaseEntity`, which carries `Get`/`Set` but none of the generated typed
 * accessors. `person.FirstName = 'Ada'` then defines a JS own-property the entity never reads, and
 * the save reports `First Name cannot be null` for a field the code demonstrably set. Issue #60
 * cost a full diagnosis session to that message, because every part of it is true and none of it
 * points at the cause.
 *
 * The check is on the REGISTRY, not on the returned instance. An `instanceof` test against the
 * generated class would be the obvious shape and the wrong one: it would also reject every test
 * fake, which forces the actions' own specs to stop exercising the real code path — trading a
 * silent production bug for a silent testing one.
 */
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

/**
 * `null` when every name has a generated class registered; otherwise an operator-readable
 * explanation naming the entities that do not and what to do about it.
 *
 * Pure read — no I/O, no mutation. Callers use it as a guard clause before any business logic.
 */
export function explainMissingEntityClasses(entityNames: readonly string[]): string | null {
  const missing = entityNames.filter(
    (name) => !MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, name),
  );
  if (missing.length === 0) {
    return null;
  }
  return (
    `No generated entity class is registered for ${missing.map((n) => `'${n}'`).join(', ')}. ` +
    'MJ would fall back to a plain BaseEntity, whose missing typed accessors silently discard ' +
    'every field this action sets — so the record would save as nulls rather than fail here. ' +
    "Ensure this host loads the package owning the entity (Forms' own actions barrel imports " +
    '@mj-biz-apps/common-entities and @mj-biz-apps/tasks-entities for exactly this reason).'
  );
}
