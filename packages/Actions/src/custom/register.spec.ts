import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { BaseEntity } from '@memberjunction/core';
import { LoadFormsActions } from './register';

// Force the @RegisterClass decorators to run.
LoadFormsActions();

/** The seam-S3 names are a hard contract — WP-B invokes these by name. */
const S3_ACTION_NAMES = [
  'Forms: Upsert Respondent Person',
  'Forms: Send Confirmation Email',
  'Forms: Create Followup Task',
  'Forms: Analyze Written Responses',
] as const;

const AUTHORING_ACTION_NAMES = [
  'Forms: Generate Form From Brief',
  'Forms: Create Form From Template',
  'Forms: Bind Response To Entity',
] as const;

/**
 * Entities the on-submit actions WRITE but this package does not generate, paired with the
 * generated class each one must resolve THROUGH.
 *
 * Expectations are declared HERE rather than imported from `register`, and by class NAME rather
 * than by identity: importing `@mj-biz-apps/common-entities` for a value would itself register
 * these classes, so the test would pass whether or not the shipped module registered anything.
 * Naming them is the only assertion that survives that trap.
 *
 * "Through", not "to". `MJ_BizApps_Tasks: Tasks` resolves to bizapps-tasks' own `TaskEntity`,
 * a hand-written subclass the tasks package registers at a higher priority over the generated
 * one — legitimate, and the reason this asserts the prototype CHAIN rather than the resolved
 * class name. Pinning the exact name would fail the moment a sibling app adds a subclass, which
 * is a change that keeps the typed accessors rather than losing them.
 */
const SIBLING_ENTITY_CLASSES: ReadonlyArray<readonly [entityName: string, generatedClass: string]> = [
  ['MJ_BizApps_Common: People', 'mjBizAppsCommonPersonEntity'],
  ['MJ_BizApps_Tasks: Tasks', 'mjBizAppsTasksTaskEntity'],
  ['MJ_BizApps_Tasks: Task Links', 'mjBizAppsTasksTaskLinkEntity'],
  ['MJ_BizApps_Tasks: Task Types', 'mjBizAppsTasksTaskTypeEntity'],
];

/** Class names from `cls` up through its prototype chain, so a subclass still shows its base. */
function classChain(cls: unknown): string[] {
  const names: string[] = [];
  for (let c = cls; typeof c === 'function'; c = Object.getPrototypeOf(c)) {
    names.push(c.name);
  }
  return names;
}

describe('action registration', () => {
  it('LoadFormsActions reports all seven action classes', () => {
    expect(LoadFormsActions()).toBe(7);
  });

  it.each([...S3_ACTION_NAMES, ...AUTHORING_ACTION_NAMES])(
    'resolves "%s" from the class factory by exact name',
    (name) => {
      const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(BaseAction, name);
      expect(instance).toBeInstanceOf(BaseAction);
    },
  );
});

/**
 * Importing this package must be enough to make the sibling apps' entity classes resolvable.
 *
 * `GetEntityObject` does not fail when a generated subclass is missing — MJ's ClassFactory falls
 * back to a plain `BaseEntity`, on which `person.FirstName = 'Ada'` lands on a JS own-property the
 * entity never reads. The record then saves as all-nulls, or fails validation naming fields the
 * code demonstrably set. That is issue #60: `Forms: Upsert Respondent Person` wrote
 * `First Name cannot be null` for responses whose First name answer was right there in the row.
 *
 * The registration is a property of what this package IMPORTS, so this is where it is pinned.
 * Actions can only carry `import type` for these classes — a type import is erased, which is
 * exactly how the dependency went phantom in the first place.
 */
describe('sibling entity class registration', () => {
  it.each(SIBLING_ENTITY_CLASSES)(
    'importing the package registers a generated class for "%s"',
    (entityName, generatedClass) => {
      const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, entityName);
      expect(classChain(registration?.SubClass)).toContain(generatedClass);
    },
  );
});
