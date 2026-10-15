/**
 * `FormAutomationEngine.SaveAutomation`, `.Reorder` and `.Remove` against the emulated database
 * (`forms-world.ts`), with the real `FormEntityServer` over every Form row.
 *
 * These are the Automate tab's rules (`automation-tab.component.ts`), moved server-side so each verb
 * is ONE unit of work: the binding, the seeded built-ins, the step and the form's authoritative mark
 * land together or not at all — where the tab wrote them one save at a time and compensated by hand.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase } from '@memberjunction/core';
import {
  ACTIONS,
  AUTHOR,
  AUTOMATIONS,
  BINDINGS,
  FORMS,
  automationRow,
  bindingRow,
  draftTables,
  formRow,
  formsWorld,
  rowsOf,
  type ServerSubclasses,
} from '../../testing/forms-world.js';
import type { FakeProviderConfig, FakeRow } from '../../testing/index.js';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

const logged = vi.hoisted(() => [] as string[]);
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: (m: string) => logged.push(m), LogStatus: (m: string) => logged.push(m) };
});

vi.mock('@mj-biz-apps/forms-entities', async () => {
  const actual = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
  const { WriteThroughEntityBase } = await import('../../testing/write-through-entity.js');
  return {
    ...actual,
    mjBizAppsFormsFormEntity: WriteThroughEntityBase,
    mjBizAppsFormsFormVersionEntity: WriteThroughEntityBase,
  };
});

const { FormAutomationEngine, FormAutomationError } = await import('../FormAutomationEngine.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;

const LEGACY_ACTIONS: FakeRow[] = [
  { ID: '9b887c71-d83c-5330-a450-ba098c4cf688', Name: 'Forms: Upsert Respondent Person' },
  { ID: '1cae6ebc-cc17-5499-9a76-4f581a4ef5e6', Name: 'Forms: Send Confirmation Email' },
  { ID: 'bf449272-8beb-53c7-805d-e512cd8bcb86', Name: 'Forms: Create Followup Task' },
  { ID: '059eba45-32df-5c22-ad2b-83acf30afc0a', Name: 'Forms: Analyze Written Responses' },
];

const CONFIGURED = JSON.stringify({ onSubmitMode: 'Configured' });

function world(t: Partial<Record<string, FakeRow[]>> = {}, config: Partial<FakeProviderConfig> = {}) {
  const tables = { ...draftTables(), [ACTIONS]: LEGACY_ACTIONS, ...t } as Record<string, FakeRow[]>;
  return formsWorld(SUBCLASSES, tables, config);
}

const engine = () => FormAutomationEngine.Instance;
const steps = (db: ReturnType<typeof world>) => rowsOf(db, AUTOMATIONS);
const settingsOf = (db: ReturnType<typeof world>) => JSON.parse(String(rowsOf(db, FORMS)[0].Settings ?? '{}')) as Record<string, unknown>;

async function refusal(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected a refusal');
    },
    (err: unknown) => err as InstanceType<typeof FormAutomationError>,
  );
}

/** Everything the "database" holds that an automation verb could touch, for nothing-written checks. */
function snapshotOf(db: ReturnType<typeof world>) {
  return JSON.stringify({ forms: rowsOf(db, FORMS), steps: steps(db), bindings: rowsOf(db, BINDINGS) });
}

beforeEach(() => {
  logged.length = 0;
});

describe('SaveAutomation — adding a step', () => {
  it('orders it one past the highest step and gives it the tab\'s defaults', async () => {
    const db = world({
      [FORMS]: [formRow({ Settings: CONFIGURED })],
      [AUTOMATIONS]: [automationRow({ ID: '9b9fd2e0-50ef-5070-a285-1a667dd7dfcc', DisplayOrder: 1 }), automationRow({ ID: '10f32e6a-4879-5613-9a55-06419323127a', DisplayOrder: 6 })],
    });

    const out = await engine().SaveAutomation(
      { FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Automation: { Name: 'Notify', TargetType: 'Action', ActionID: 'ddfaf3fc-441e-5e8a-9c63-84f224b0ee91' } },
      db.provider,
      AUTHOR,
    );

    // Highest + 1, not count + 1: after a deletion a count lands on a number already in use.
    expect(out.DisplayOrder).toBe(7);
    expect(steps(db).find((s) => s.ID === out.FormAutomationID)).toMatchObject({
      FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
      Name: 'Notify',
      TargetType: 'Action',
      ActionID: 'ddfaf3fc-441e-5e8a-9c63-84f224b0ee91',
      Trigger: 'OnComplete',
      ExecutionMode: 'Sync',
      ContinueOnError: true,
      IsActive: true,
      DisplayOrder: 7,
    });
    expect(out.SeededAutomationIDs).toEqual([]);
    expect(db.transactions).toEqual(['begin', 'commit']);
  });

  it('on the form\'s first step, seeds the four built-ins it was running and marks the form authoritative — one transaction', async () => {
    const db = world({ [FORMS]: [formRow({ Settings: JSON.stringify({ quota: 50 }) })] });

    const out = await engine().SaveAutomation(
      { FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Automation: { Name: 'Notify', TargetType: 'Action', ActionID: 'ddfaf3fc-441e-5e8a-9c63-84f224b0ee91' } },
      db.provider,
      AUTHOR,
    );

    const seeded = steps(db).filter((s) => out.SeededAutomationIDs.includes(String(s.ID)));
    expect(seeded.map((s) => [s.Name, s.ActionID, s.DisplayOrder, s.ExecutionMode, s.ContinueOnError])).toEqual([
      ['Forms: Upsert Respondent Person', '9b887c71-d83c-5330-a450-ba098c4cf688', 1, 'Sync', true],
      ['Forms: Send Confirmation Email', '1cae6ebc-cc17-5499-9a76-4f581a4ef5e6', 2, 'Sync', true],
      ['Forms: Create Followup Task', 'bf449272-8beb-53c7-805d-e512cd8bcb86', 3, 'Sync', true],
      ['Forms: Analyze Written Responses', '059eba45-32df-5c22-ad2b-83acf30afc0a', 4, 'Sync', true],
    ]);
    expect(out.DisplayOrder).toBe(5);
    // The author's other settings survive the mark.
    expect(settingsOf(db)).toMatchObject({ onSubmitMode: 'Configured', quota: 50 });
    expect(db.transactions).toEqual(['begin', 'commit']);
  });

  it('skips a built-in this host does not have, and orders past the highest one it DID write', async () => {
    const db = world({ [ACTIONS]: LEGACY_ACTIONS.filter((a) => a.ID !== '1cae6ebc-cc17-5499-9a76-4f581a4ef5e6') });

    const out = await engine().SaveAutomation(
      { FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Automation: { Name: 'Notify', TargetType: 'Action', ActionID: 'ddfaf3fc-441e-5e8a-9c63-84f224b0ee91' } },
      db.provider,
      AUTHOR,
    );

    expect(steps(db).filter((s) => out.SeededAutomationIDs.includes(String(s.ID))).map((s) => s.DisplayOrder)).toEqual([1, 3, 4]);
    expect(out.DisplayOrder).toBe(5);
  });

  it('seeds nothing on a form already running its own steps, even with none left — removing them all meant "run nothing"', async () => {
    const db = world({ [FORMS]: [formRow({ Settings: CONFIGURED })] });

    const out = await engine().SaveAutomation(
      { FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Automation: { Name: 'Notify', TargetType: 'Action', ActionID: 'ddfaf3fc-441e-5e8a-9c63-84f224b0ee91' } },
      db.provider,
      AUTHOR,
    );

    expect(out.SeededAutomationIDs).toEqual([]);
    expect(steps(db)).toHaveLength(1);
    expect(out.DisplayOrder).toBe(1);
  });

  it('creates a binding with the step that runs it, resolving the target entity by name', async () => {
    const db = world({ [FORMS]: [formRow({ Settings: CONFIGURED })] });
    const fieldMappings = JSON.stringify({ version: 1, fields: [{ targetField: 'Email', source: { kind: 'question', questionId: 'q1' } }] });
    const identityRule = JSON.stringify({ mode: 'MatchThenCreate', match: [{ targetField: 'Email', normalize: 'LowerCaseTrim' }] });
    const mergePolicy = JSON.stringify({ default: 'neverBlank', fields: { Email: 'writeOnce' } });

    const out = await engine().SaveAutomation(
      {
        FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
        Automation: { Name: 'Send to People', TargetType: 'EntityBinding' },
        Binding: { TargetEntityName: 'MJ_BizApps_Common: People', FieldMappings: fieldMappings, IdentityRule: identityRule, MergePolicy: mergePolicy },
      },
      db.provider,
      AUTHOR,
    );

    const binding = rowsOf(db, BINDINGS).find((b) => b.ID === out.FormEntityBindingID);
    expect(binding).toMatchObject({
      FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
      TargetEntityName: 'MJ_BizApps_Common: People',
      FieldMappings: fieldMappings,
      IdentityRule: identityRule,
      MergePolicy: mergePolicy,
      Status: 'Active',
    });
    expect(String(binding?.TargetEntityID)).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(binding?.Name)).toMatch(/^Send responses to /);
    expect(steps(db).find((s) => s.ID === out.FormAutomationID)).toMatchObject({ TargetType: 'EntityBinding', BindingID: out.FormEntityBindingID });
  });

  it.each([
    ['an identity rule the executor cannot read', { IdentityRule: '{"mode":"Sometimes"}' }, /identity rule/i],
    ['field mappings that are not JSON', { FieldMappings: '{not json' }, /field mappings/i],
    ['a merge policy the executor cannot read', { MergePolicy: '{"default":"whatever"}' }, /merge policy/i],
  ])('refuses %s, and writes nothing', async (_label, override, reason) => {
    const db = world();
    const before = snapshotOf(db);

    const failure = await refusal(
      engine().SaveAutomation(
        {
          FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
          Automation: { Name: 'Send', TargetType: 'EntityBinding' },
          Binding: {
            TargetEntityName: 'MJ_BizApps_Common: People',
            FieldMappings: JSON.stringify({ version: 1, fields: [{ targetField: 'Email', source: { kind: 'question', questionId: 'q1' } }] }),
            IdentityRule: JSON.stringify({ mode: 'AlwaysCreate' }),
            ...override,
          },
        },
        db.provider,
        AUTHOR,
      ),
    );

    expect(failure).toBeInstanceOf(FormAutomationError);
    expect(failure.message).toMatch(reason);
    expect(failure.fault).toBe(false);
    expect(snapshotOf(db)).toBe(before);
  });

  it('refuses a target entity this host does not have', async () => {
    const db = world();
    (db.provider as unknown as { EntityByName: (n: string) => unknown }).EntityByName = () => undefined;

    const failure = await refusal(
      engine().SaveAutomation(
        {
          FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
          Automation: { Name: 'Send', TargetType: 'EntityBinding' },
          Binding: { TargetEntityName: 'Nope: Things', FieldMappings: '{"version":1,"fields":[]}', IdentityRule: '{"mode":"AlwaysCreate"}' },
        },
        db.provider,
        AUTHOR,
      ),
    );

    expect(failure.message).toMatch(/Nope: Things/);
    expect(rowsOf(db, BINDINGS)).toEqual([]);
  });

  it.each([
    ['an EntityBinding step with no binding', { Automation: { Name: 'x', TargetType: 'EntityBinding' } }, /needs a binding/i],
    ['an Action step with a binding', { Automation: { Name: 'x', TargetType: 'Action', ActionID: '4f3f2898-69e3-5a0d-820a-c4e87987dbce' }, Binding: { TargetEntityName: 'T', FieldMappings: '{}', IdentityRule: '{}' } }, /only an EntityBinding step/i],
    ['an Action step with no action', { Automation: { Name: 'x', TargetType: 'Action' } }, /ActionID/],
    ['an Agent step with no agent', { Automation: { Name: 'x', TargetType: 'Agent' } }, /AgentID/],
    ['an Action step naming an agent', { Automation: { Name: 'x', TargetType: 'Action', ActionID: '4f3f2898-69e3-5a0d-820a-c4e87987dbce', AgentID: '7f2912ae-8839-56d9-8964-72ce313e806f' } }, /AgentID/],
    ['a step with no name', { Automation: { Name: '  ', TargetType: 'Action', ActionID: '4f3f2898-69e3-5a0d-820a-c4e87987dbce' } }, /name/i],
    ['a condition the evaluator cannot read', { Automation: { Name: 'x', TargetType: 'Action', ActionID: '4f3f2898-69e3-5a0d-820a-c4e87987dbce', ConditionalRule: '{"show":42}' } }, /condition/i],
    ['a negative timeout', { Automation: { Name: 'x', TargetType: 'Action', ActionID: '4f3f2898-69e3-5a0d-820a-c4e87987dbce', TimeoutMS: -1 } }, /TimeoutMS/],
  ])('refuses %s', async (_label, input, reason) => {
    const db = world();
    const before = snapshotOf(db);

    const failure = await refusal(engine().SaveAutomation({ FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', ...input } as never, db.provider, AUTHOR));

    expect(failure.message).toMatch(reason);
    expect(snapshotOf(db)).toBe(before);
  });

  it('writes nothing at all when one of its saves fails — no binding, no built-ins, no mark', async () => {
    const failing = world({}, { failSaveWhen: (entity, values) => entity === AUTOMATIONS && values.Name === 'Send' });
    const before = snapshotOf(failing);

    const failure = await refusal(
      engine().SaveAutomation(
        {
          FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
          Automation: { Name: 'Send', TargetType: 'EntityBinding' },
          Binding: {
            TargetEntityName: 'MJ_BizApps_Common: People',
            FieldMappings: JSON.stringify({ version: 1, fields: [] }),
            IdentityRule: JSON.stringify({ mode: 'AlwaysCreate' }),
          },
        },
        failing.provider,
        AUTHOR,
      ),
    );

    expect(failure.fault).toBe(true);
    expect(snapshotOf(failing)).toBe(before);
    expect(failing.transactions).toEqual(['begin', 'rollback']);
  });

  it('refuses a form that does not exist', async () => {
    const db = world();

    const failure = await refusal(
      engine().SaveAutomation(
        { FormID: '99999999-9999-4999-8999-999999999999', Automation: { Name: 'x', TargetType: 'Action', ActionID: '4f3f2898-69e3-5a0d-820a-c4e87987dbce' } },
        db.provider,
        AUTHOR,
      ),
    );

    expect(failure.message).toMatch(/does not exist/);
  });

  it('refuses a form whose stored settings cannot be read — the mark would overwrite them', async () => {
    const db = world({ [FORMS]: [formRow({ Settings: '{broken' })] });

    const failure = await refusal(
      engine().SaveAutomation({ FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Automation: { Name: 'x', TargetType: 'Action', ActionID: '4f3f2898-69e3-5a0d-820a-c4e87987dbce' } }, db.provider, AUTHOR),
    );

    expect(failure.message).toMatch(/settings/i);
    expect(steps(db)).toEqual([]);
  });
});

describe('SaveAutomation — changing a step', () => {
  function withStep(overrides: Partial<FakeRow> = {}) {
    return world({
      [FORMS]: [formRow({ Settings: CONFIGURED })],
      [AUTOMATIONS]: [
        automationRow({ ID: 'd9e9c362-350a-5c97-a1c5-2b498f56b29c', DisplayOrder: 3, ContinueOnError: true, Description: 'keep me', ...overrides }),
        automationRow({ ID: '547914bd-5281-529e-9631-2a5422f918e7', FormID: 'e9d89f6f-e43c-5d1d-aef7-c46815bbb36a' }),
      ],
      [BINDINGS]: [bindingRow({ ID: 'bind-1' }), bindingRow({ ID: 'bind-2' })],
    });
  }

  it('changes only what it is given; the rest — and its place in the order — stay as stored', async () => {
    const db = withStep();

    await engine().SaveAutomation(
      { FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Automation: { ID: 'd9e9c362-350a-5c97-a1c5-2b498f56b29c', ExecutionMode: 'Async', IsActive: false } },
      db.provider,
      AUTHOR,
    );

    expect(steps(db).find((s) => s.ID === 'd9e9c362-350a-5c97-a1c5-2b498f56b29c')).toMatchObject({
      ExecutionMode: 'Async',
      IsActive: false,
      ContinueOnError: true,
      Description: 'keep me',
      DisplayOrder: 3,
    });
  });

  it('clears a field given as null', async () => {
    const db = withStep();

    await engine().SaveAutomation({ FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Automation: { ID: 'd9e9c362-350a-5c97-a1c5-2b498f56b29c', Description: null } }, db.provider, AUTHOR);

    expect(steps(db).find((s) => s.ID === 'd9e9c362-350a-5c97-a1c5-2b498f56b29c')?.Description).toBeNull();
  });

  it('refuses a step of another form', async () => {
    const db = withStep();

    const failure = await refusal(
      engine().SaveAutomation({ FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Automation: { ID: '547914bd-5281-529e-9631-2a5422f918e7', IsActive: false } }, db.provider, AUTHOR),
    );

    expect(failure.message).toMatch(/does not belong|does not exist/);
  });

  it('refuses a change of target type — remove the step and add another', async () => {
    const db = withStep();

    const failure = await refusal(
      engine().SaveAutomation({ FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Automation: { ID: 'd9e9c362-350a-5c97-a1c5-2b498f56b29c', TargetType: 'Agent' } } as never, db.provider, AUTHOR),
    );

    expect(failure.message).toMatch(/TargetType/);
  });

  it("updates the step's own binding in the same transaction", async () => {
    const db = withStep({ TargetType: 'EntityBinding', ActionID: null, BindingID: 'bind-1' });
    const identityRule = JSON.stringify({ mode: 'MatchOrSkip', match: [{ targetField: 'Email' }] });

    await engine().SaveAutomation(
      { FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Automation: { ID: 'd9e9c362-350a-5c97-a1c5-2b498f56b29c' }, Binding: { ID: 'bind-1', IdentityRule: identityRule, Status: 'Disabled' } },
      db.provider,
      AUTHOR,
    );

    expect(rowsOf(db, BINDINGS).find((b) => b.ID === 'bind-1')).toMatchObject({ IdentityRule: identityRule, Status: 'Disabled' });
    expect(db.transactions).toEqual(['begin', 'commit']);
  });

  it('refuses to update a binding the step does not run', async () => {
    const db = withStep({ TargetType: 'EntityBinding', ActionID: null, BindingID: 'bind-1' });

    const failure = await refusal(
      engine().SaveAutomation({ FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Automation: { ID: 'd9e9c362-350a-5c97-a1c5-2b498f56b29c' }, Binding: { ID: 'bind-2', Status: 'Disabled' } }, db.provider, AUTHOR),
    );

    expect(failure.message).toMatch(/bind-2/);
    expect(rowsOf(db, BINDINGS).find((b) => b.ID === 'bind-2')?.Status).toBe('Active');
  });
});

describe('Reorder', () => {
  function threeSteps() {
    return world({
      [FORMS]: [formRow({ Settings: CONFIGURED })],
      [AUTOMATIONS]: [
        automationRow({ ID: '4f3f2898-69e3-5a0d-820a-c4e87987dbce', DisplayOrder: 1 }),
        automationRow({ ID: '3f10dbe8-4cbd-5e31-9b1f-af0cb9dda9cf', DisplayOrder: 2 }),
        automationRow({ ID: '1ff6f1ba-cdfb-59a8-ae74-97e0383b1629', DisplayOrder: 3, ExecutionMode: 'Async' }),
      ],
    });
  }

  it('rewrites every step\'s DisplayOrder to the given order in one transaction', async () => {
    const db = threeSteps();

    const out = await engine().Reorder('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', ['3f10dbe8-4cbd-5e31-9b1f-af0cb9dda9cf', '4f3f2898-69e3-5a0d-820a-c4e87987dbce', '1ff6f1ba-cdfb-59a8-ae74-97e0383b1629'], db.provider, AUTHOR);

    expect(out).toEqual([
      { FormAutomationID: '3f10dbe8-4cbd-5e31-9b1f-af0cb9dda9cf', DisplayOrder: 1 },
      { FormAutomationID: '4f3f2898-69e3-5a0d-820a-c4e87987dbce', DisplayOrder: 2 },
      { FormAutomationID: '1ff6f1ba-cdfb-59a8-ae74-97e0383b1629', DisplayOrder: 3 },
    ]);
    expect(Object.fromEntries(steps(db).map((s) => [s.ID, s.DisplayOrder]))).toEqual({ '4f3f2898-69e3-5a0d-820a-c4e87987dbce': 2, '3f10dbe8-4cbd-5e31-9b1f-af0cb9dda9cf': 1, '1ff6f1ba-cdfb-59a8-ae74-97e0383b1629': 3 });
    expect(db.transactions).toEqual(['begin', 'commit']);
  });

  it('refuses an order placing a background step ahead of a sequential one — the runner would not honour it', async () => {
    const db = threeSteps();

    const failure = await refusal(engine().Reorder('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', ['1ff6f1ba-cdfb-59a8-ae74-97e0383b1629', '4f3f2898-69e3-5a0d-820a-c4e87987dbce', '3f10dbe8-4cbd-5e31-9b1f-af0cb9dda9cf'], db.provider, AUTHOR));

    expect(failure.message).toMatch(/Sync/);
    expect(steps(db).map((s) => s.DisplayOrder)).toEqual([1, 2, 3]);
  });

  it.each([
    ['a step missing', ['4f3f2898-69e3-5a0d-820a-c4e87987dbce', '3f10dbe8-4cbd-5e31-9b1f-af0cb9dda9cf']],
    ['a step twice', ['4f3f2898-69e3-5a0d-820a-c4e87987dbce', '4f3f2898-69e3-5a0d-820a-c4e87987dbce', '3f10dbe8-4cbd-5e31-9b1f-af0cb9dda9cf', '1ff6f1ba-cdfb-59a8-ae74-97e0383b1629']],
    ['a step of no such id', ['4f3f2898-69e3-5a0d-820a-c4e87987dbce', '3f10dbe8-4cbd-5e31-9b1f-af0cb9dda9cf', '1ff6f1ba-cdfb-59a8-ae74-97e0383b1629', 'zzz']],
  ])('refuses an order with %s — it must name every step exactly once', async (_label, order) => {
    const db = threeSteps();

    const failure = await refusal(engine().Reorder('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', order, db.provider, AUTHOR));

    expect(failure.message).toMatch(/every/i);
  });

  it('a save failing part-way leaves the old order intact', async () => {
    const db = world(
      {
        [FORMS]: [formRow({ Settings: CONFIGURED })],
        [AUTOMATIONS]: [automationRow({ ID: '4f3f2898-69e3-5a0d-820a-c4e87987dbce', DisplayOrder: 1 }), automationRow({ ID: '3f10dbe8-4cbd-5e31-9b1f-af0cb9dda9cf', DisplayOrder: 2 })],
      },
      { failSaveWhen: (entity, values) => entity === AUTOMATIONS && values.ID === '4f3f2898-69e3-5a0d-820a-c4e87987dbce' },
    );

    await refusal(engine().Reorder('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', ['3f10dbe8-4cbd-5e31-9b1f-af0cb9dda9cf', '4f3f2898-69e3-5a0d-820a-c4e87987dbce'], db.provider, AUTHOR));

    expect(Object.fromEntries(steps(db).map((s) => [s.ID, s.DisplayOrder]))).toEqual({ '4f3f2898-69e3-5a0d-820a-c4e87987dbce': 1, '3f10dbe8-4cbd-5e31-9b1f-af0cb9dda9cf': 2 });
    expect(db.transactions).toEqual(['begin', 'rollback']);
  });
});

describe('Remove', () => {
  it('deletes the step and keeps its binding — the binding\'s ledger outlives the step', async () => {
    const db = world({
      [FORMS]: [formRow({ Settings: CONFIGURED })],
      [AUTOMATIONS]: [automationRow({ ID: 'd9e9c362-350a-5c97-a1c5-2b498f56b29c', TargetType: 'EntityBinding', ActionID: null, BindingID: 'bind-1' })],
      [BINDINGS]: [bindingRow({ ID: 'bind-1' })],
    });

    const out = await engine().Remove('d9e9c362-350a-5c97-a1c5-2b498f56b29c', db.provider, AUTHOR);

    expect(out).toEqual({ FormAutomationID: 'd9e9c362-350a-5c97-a1c5-2b498f56b29c', FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', RetainedBindingID: 'bind-1', SeededAutomationIDs: [] });
    expect(steps(db)).toEqual([]);
    expect(rowsOf(db, BINDINGS).map((b) => b.ID)).toEqual(['bind-1']);
  });

  it('marks the form authoritative, so removing the LAST step means "run nothing", not "run the built-ins"', async () => {
    // A pre-0.8.0 form: four backfilled rows and no mode, which infers `configured` while rows remain.
    const db = world({ [AUTOMATIONS]: [automationRow({ ID: '52bc3eb6-5188-58e2-855c-073221c427a6' })] });

    await engine().Remove('52bc3eb6-5188-58e2-855c-073221c427a6', db.provider, AUTHOR);

    expect(settingsOf(db).onSubmitMode).toBe('Configured');
  });

  it('reports the built-ins it seeded when the removal is what turns the form\'s own steps on', async () => {
    // A form explicitly on Legacy dispatch whose (unreachable) steps are being edited: the mark that
    // the removal writes switches dispatch to its own steps, so the four built-ins it was running
    // are seeded — and the caller is told which rows those are.
    const db = world({
      [FORMS]: [formRow({ Settings: JSON.stringify({ onSubmitMode: 'Legacy' }) })],
      [AUTOMATIONS]: [automationRow({ ID: '734e0b5a-09ff-5f57-8b69-de427afd664b', DisplayOrder: 1 }), automationRow({ ID: 'stale-2', DisplayOrder: 2 })],
    });

    const out = await engine().Remove('734e0b5a-09ff-5f57-8b69-de427afd664b', db.provider, AUTHOR);

    expect(out.SeededAutomationIDs).toHaveLength(4);
    expect(steps(db).filter((s) => out.SeededAutomationIDs.includes(String(s.ID))).map((s) => s.Name)).toEqual([
      'Forms: Upsert Respondent Person',
      'Forms: Send Confirmation Email',
      'Forms: Create Followup Task',
      'Forms: Analyze Written Responses',
    ]);
  });

  it('refuses a step that does not exist', async () => {
    const db = world();

    const failure = await refusal(engine().Remove('99999999-9999-4999-8999-999999999999', db.provider, AUTHOR));

    expect(failure.message).toMatch(/does not exist/);
  });
});

describe('every verb needs a server provider that can hold a transaction', () => {
  it('refuses rather than writing row by row', async () => {
    const db = world({}, { noTransactions: true });

    await expect(engine().Remove('x', db.provider as DatabaseProviderBase, AUTHOR)).rejects.toThrow(/transaction/);
  });
});

it.each(['SaveAutomation', 'Reorder', 'Remove'] as const)('%s refuses malformed IDs before reading', async (verb) => {
  const db = world({}, { failRunViewFor: verb === 'Remove' ? AUTOMATIONS : FORMS });
  const result = verb === 'SaveAutomation' ? engine().SaveAutomation({ FormID: 'invalid-guid', Automation: { Name: 'test', TargetType: 'Action', ActionID: '11111111-1111-4111-8111-111111111111' } }, db.provider, AUTHOR)
    : verb === 'Reorder' ? engine().Reorder('invalid-guid', [], db.provider, AUTHOR) : engine().Remove('invalid-guid', db.provider, AUTHOR);
  const error = await refusal(result);
  expect(error.fault).toBe(false);
  expect(error.message).toMatch(/valid.*ID/i);
});
