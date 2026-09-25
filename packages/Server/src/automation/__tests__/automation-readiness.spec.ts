/**
 * The boot-time report on whether the automation principal holds the grants the shipped on-submit
 * automations need (#239).
 *
 * A missing runner grant has shipped five times (#60 three times, AI Prompt Runs, #239), and each
 * time the only symptom was a best-effort, per-submit log line nobody connected to an install-time
 * permission. These pin the report's behaviour, and — the drift pin at the bottom — that the grant
 * table it checks is exactly the one the app ships in `metadata/`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_RUNNER_GRANTS,
  assessAutomationReadiness,
  type EffectivePermissions,
} from '../automation-readiness.js';

const PRINCIPAL = 'Forms Automation Service';
const TASK_TYPES = 'MJ_BizApps_Tasks: Task Types';

/** Every grant satisfied exactly — the state a correctly migrated host is in. */
function grantedLookup(): Map<string, EffectivePermissions> {
  return new Map(
    AUTOMATION_RUNNER_GRANTS.map((g) => [
      g.entityName,
      { CanRead: g.read, CanCreate: g.create, CanUpdate: g.update },
    ]),
  );
}

describe('assessAutomationReadiness', () => {
  it('names the entity, the missing verb and the principal when Read on Task Types is missing', () => {
    const perms = grantedLookup();
    perms.set(TASK_TYPES, { CanRead: false, CanCreate: false, CanUpdate: false });

    const reasons = assessAutomationReadiness(PRINCIPAL, (name) => perms.get(name));

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain(`'${PRINCIPAL}' lacks Read on '${TASK_TYPES}'`);
  });

  it('names every missing verb on one entity in a single reason', () => {
    const perms = grantedLookup();
    perms.set('MJ_BizApps_Common: Activities', { CanRead: false, CanCreate: false, CanUpdate: false });

    const reasons = assessAutomationReadiness(PRINCIPAL, (name) => perms.get(name));

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("lacks Read, Create on 'MJ_BizApps_Common: Activities'");
  });

  it('reports nothing when every grant is held', () => {
    const perms = grantedLookup();
    expect(assessAutomationReadiness(PRINCIPAL, (name) => perms.get(name))).toEqual([]);
  });

  it('does not ask for more than the floor: a wider grant is still ready', () => {
    const everything: EffectivePermissions = { CanRead: true, CanCreate: true, CanUpdate: true };
    expect(assessAutomationReadiness(PRINCIPAL, () => everything)).toEqual([]);
  });

  it('skips an entity this host does not have (e.g. bizapps-common < 5.35 has no Activities)', () => {
    const perms = grantedLookup();
    perms.delete('MJ_BizApps_Common: Activities');
    expect(assessAutomationReadiness(PRINCIPAL, (name) => perms.get(name))).toEqual([]);
  });

  it('reports one reason per under-granted entity', () => {
    const none: EffectivePermissions = { CanRead: false, CanCreate: false, CanUpdate: false };
    const reasons = assessAutomationReadiness(PRINCIPAL, () => none);
    expect(reasons).toHaveLength(AUTOMATION_RUNNER_GRANTS.length);
  });
});

/**
 * DRIFT PIN. The grant table above and `metadata/entity-permissions/.entity-permissions.json` state
 * the same decision in two places; this keeps them equal in both directions, so a grant added to
 * the metadata without the table (the report goes blind to it) or to the table without the
 * metadata (the report flags a grant nothing ships) fails here rather than on a host.
 */
describe('AUTOMATION_RUNNER_GRANTS matches the shipped metadata', () => {
  interface PermissionRecord {
    fields: {
      EntityID: string;
      RoleID: string;
      CanRead: boolean;
      CanCreate: boolean;
      CanUpdate: boolean;
    };
  }
  const RUNNER_ROLE = '@lookup:MJ: Roles.Name=Forms Automation Runner';
  const ENTITY_LOOKUP = '@lookup:MJ: Entities.Name=';
  const metadataPath = fileURLToPath(
    new URL('../../../../../metadata/entity-permissions/.entity-permissions.json', import.meta.url),
  );

  function shippedRunnerGrants(): string[] {
    const records = JSON.parse(readFileSync(metadataPath, 'utf8')) as PermissionRecord[];
    return records
      .filter((r) => r.fields.RoleID === RUNNER_ROLE)
      .map((r) => {
        expect(r.fields.EntityID.startsWith(ENTITY_LOOKUP)).toBe(true);
        const entity = r.fields.EntityID.slice(ENTITY_LOOKUP.length);
        return `${entity} R=${r.fields.CanRead} C=${r.fields.CanCreate} U=${r.fields.CanUpdate}`;
      })
      .sort();
  }

  it('lists exactly the Forms Automation Runner records, with the same Read/Create/Update flags', () => {
    const table = AUTOMATION_RUNNER_GRANTS.map(
      (g) => `${g.entityName} R=${g.read} C=${g.create} U=${g.update}`,
    ).sort();
    const shipped = shippedRunnerGrants();
    expect(shipped.length).toBeGreaterThan(0);
    expect(table).toEqual(shipped);
  });

  it('gives every grant a reason', () => {
    for (const g of AUTOMATION_RUNNER_GRANTS) {
      expect(g.reason.trim().length).toBeGreaterThan(0);
    }
  });
});
