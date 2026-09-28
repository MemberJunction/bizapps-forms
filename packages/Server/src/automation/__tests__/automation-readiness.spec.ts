/**
 * The boot-time report on whether the automation principal holds the grants the shipped on-submit
 * automations need (#239).
 *
 * A missing runner grant has shipped six times (#60 three times, AI Prompt Runs, #239, #269), and each
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
  describeDurableDispatch,
  TASK_GRAPH_ENTITIES,
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

  it("names Read on bizapps-tasks' Task Type Status — Create Followup Task silently loses the default status without it (#269)", () => {
    const perms = grantedLookup();
    perms.set('MJ_BizApps_Tasks: Task Type Status', { CanRead: false, CanCreate: false, CanUpdate: false });

    const reasons = assessAutomationReadiness(PRINCIPAL, (name) => perms.get(name));

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("lacks Read on 'MJ_BizApps_Tasks: Task Type Status'");
  });

  it("names Create on bizapps-tasks' Task Activities — the followup task's 'Created' audit row is lost silently without it (#269)", () => {
    const perms = grantedLookup();
    perms.set('MJ_BizApps_Tasks: Task Activities', { CanRead: false, CanCreate: false, CanUpdate: false });

    const reasons = assessAutomationReadiness(PRINCIPAL, (name) => perms.get(name));

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("lacks Create on 'MJ_BizApps_Tasks: Task Activities'");
  });

  it("gives the Record Geo Codes grant the Activity's geocode as its reason — a Person save never geocodes (#269)", () => {
    // People's Geo* fields are all virtual, and core geocodes only an entity with a writable geo
    // field. The row the runner writes is for the Activity Common.LogActivity saves.
    const grant = AUTOMATION_RUNNER_GRANTS.find((g) => g.entityName === 'MJ: Record Geo Codes');
    expect(grant?.reason).toContain('Common.LogActivity');
    expect(grant?.reason).toContain('Activity');
    expect(grant?.reason).not.toMatch(/People is one|creates or updates/);
  });

  it('names Update on Record Geo Codes — geocoding re-saves the row it just created (#269)', () => {
    const perms = grantedLookup();
    perms.set('MJ: Record Geo Codes', { CanRead: true, CanCreate: true, CanUpdate: false });

    const reasons = assessAutomationReadiness(PRINCIPAL, (name) => perms.get(name));

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("lacks Update on 'MJ: Record Geo Codes'");
  });
});

describe('describeDurableDispatch', () => {
  const none: EffectivePermissions = { CanRead: false, CanCreate: false, CanUpdate: false };
  const create: EffectivePermissions = { CanRead: true, CanCreate: true, CanUpdate: true };

  const readOnly: EffectivePermissions = { CanRead: true, CanCreate: false, CanUpdate: false };
  const createOnly: EffectivePermissions = { CanRead: false, CanCreate: true, CanUpdate: false };

  /** A lookup that returns `grants[entity]`, and `none` for any entity not named. */
  function lookupOf(grants: Record<string, EffectivePermissions>): (name: string) => EffectivePermissions {
    return (name) => grants[name] ?? none;
  }

  it('says durable actions run in-process, by design, when the principal cannot write the task graph', () => {
    const line = describeDurableDispatch(PRINCIPAL, () => none);
    expect(line).toContain(`'${PRINCIPAL}'`);
    expect(line).toContain('cannot submit MJ task graphs');
    expect(line).toContain('run in-process');
    expect(line).toContain('deliberate');
    expect(line).toContain('queued tasks execute as the system user');
    expect(line).toContain('bizapps-common#195');
  });

  it('names every per-submit line core logs on the in-process path, so operators do not chase them', () => {
    const line = describeDurableDispatch(PRINCIPAL, () => none);
    expect(line).toContain('MJ: Task Types');
    expect(line).toContain('[TaskGraphService] Submit failed');
    expect(line).toContain('asked for durable dispatch but ran inline instead');
  });

  it('does not promise one refusal: a principal with Read on MJ: Task Types is refused a create instead', () => {
    // Measured on MJ 6.1.4: Read on MJ: Task Types without Create on MJ: Tasks still reads "cannot",
    // and core then logs "Does NOT have permission to Create MJ: Task Types records", not a refused read.
    const line = describeDurableDispatch(
      PRINCIPAL,
      lookupOf({ 'MJ: Task Types': readOnly }),
    );
    expect(line).toContain('run in-process');
    expect(line).toContain('a refused read or create on MJ: Task Types or MJ: Tasks');
  });

  it('does not claim the in-process run is always inside the submission: no submitter means after the save commits', () => {
    const line = describeDurableDispatch(PRINCIPAL, () => none);
    expect(line).toContain('after its save commits');
  });

  it('tells the operator to remove a hand-added task-graph grant, because queued tasks run as system', () => {
    const line = describeDurableDispatch(PRINCIPAL, () => create);
    expect(line).toContain('can submit MJ task graphs');
    expect(line).toContain("MJ's dispatcher executes queued tasks as the system user");
    for (const entity of TASK_GRAPH_ENTITIES) expect(line).toContain(entity);
  });

  it('names the issue unambiguously, since the line is read outside this repo', () => {
    const line = describeDurableDispatch(PRINCIPAL, () => create);
    expect(line).toContain('MemberJunction/bizapps-forms#269');
    expect(line).not.toMatch(/\(#269\)/);
  });

  it('can submit with only Create on MJ: Tasks and Read on MJ: Task Types: a one-node graph writes no dependency', () => {
    const line = describeDurableDispatch(
      PRINCIPAL,
      lookupOf({ 'MJ: Tasks': createOnly, 'MJ: Task Types': readOnly }),
    );
    expect(line).toContain('can submit MJ task graphs');
  });

  it('can submit with Create on MJ: Task Types instead of Read: the first submit creates the AI Workflow type', () => {
    const line = describeDurableDispatch(
      PRINCIPAL,
      lookupOf({ 'MJ: Tasks': createOnly, 'MJ: Task Types': createOnly }),
    );
    expect(line).toContain('can submit MJ task graphs');
  });

  it('cannot submit with Create on MJ: Tasks alone: the task type can be neither found nor created', () => {
    const line = describeDurableDispatch(PRINCIPAL, lookupOf({ 'MJ: Tasks': createOnly }));
    expect(line).toContain('run in-process');
  });

  it('cannot submit with Read and Create on MJ: Task Types but nothing on MJ: Tasks', () => {
    const line = describeDurableDispatch(
      PRINCIPAL,
      lookupOf({ 'MJ: Task Types': { CanRead: true, CanCreate: true, CanUpdate: false } }),
    );
    expect(line).toContain('run in-process');
  });

  it('treats a core without the task-graph entities as unable to submit, without throwing', () => {
    expect(describeDurableDispatch(PRINCIPAL, () => undefined)).toContain('run in-process');
  });

  it('is not part of the grant floor: the readiness report never asks for task-graph writes', () => {
    for (const entity of TASK_GRAPH_ENTITIES) {
      expect(AUTOMATION_RUNNER_GRANTS.some((g) => g.entityName === entity)).toBe(false);
    }
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
