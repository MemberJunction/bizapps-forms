/**
 * The three automation-editing operations through `ExecuteServer` — `Authorize`, then
 * `InternalExecute`, wrapped into a `RemoteOpResult` — over the emulated database with the real
 * `FormEntityServer` (#303 Task 7).
 *
 * DW17 for each: Authorize refusals (anonymous, magic-link scoped, no Update on Forms), an input
 * refusal and a happy path. The verbs' behaviour is pinned in `FormAutomationEngine.edit.spec.ts`;
 * these pin the wire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { AUTHOR, AUTOMATIONS, FORMS, automationRow, draftTables, formRow, formsWorld, rowsOf, type ServerSubclasses } from '../../testing/forms-world.js';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@mj-biz-apps/forms-entities', async () => {
  const actual = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
  const { WriteThroughEntityBase } = await import('../../testing/write-through-entity.js');
  return { ...actual, mjBizAppsFormsFormEntity: WriteThroughEntityBase, mjBizAppsFormsFormVersionEntity: WriteThroughEntityBase };
});

const { SaveAutomationServerOperation, LoadSaveAutomationOperation } = await import('../SaveAutomationServerOperation.js');
const { ReorderAutomationsServerOperation, LoadReorderAutomationsOperation } = await import('../ReorderAutomationsServerOperation.js');
const { RemoveAutomationServerOperation, LoadRemoveAutomationOperation } = await import('../RemoveAutomationServerOperation.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;
const FORM = '11111111-1111-4111-8111-111111111111';

interface ServerOperation {
  OperationKey: string;
  RequiredScope?: string;
  ExecuteServer(
    input: unknown,
    context: { provider: IMetadataProvider; user: UserInfo; emitProgress: () => void },
  ): Promise<{ ResultCode?: string; ErrorMessage?: string; Output?: unknown; Success?: boolean }>;
}

function world(grants: { forms?: boolean } = {}) {
  const db = formsWorld(
    SUBCLASSES,
    {
      ...draftTables(),
      [FORMS]: [formRow({ ID: FORM, Settings: JSON.stringify({ onSubmitMode: 'Configured' }) })],
      [AUTOMATIONS]: [
        automationRow({ ID: 'a', FormID: FORM, DisplayOrder: 1 }),
        automationRow({ ID: 'b', FormID: FORM, DisplayOrder: 2 }),
      ],
    },
    { updatePermissions: { [FORMS]: grants.forms ?? true } },
  );
  // `Authorize` receives no provider, so it reads permissions from the process metadata.
  Metadata.Provider = db.provider;
  return db;
}

function run(operation: ServerOperation, db: ReturnType<typeof world>, input: unknown, user: UserInfo = AUTHOR) {
  return operation.ExecuteServer(input, { provider: db.provider, user, emitProgress: () => undefined });
}

let original: IMetadataProvider | undefined;
beforeEach(() => {
  try {
    original = Metadata.Provider;
  } catch {
    original = undefined;
  }
});
afterEach(() => {
  Metadata.Provider = original as IMetadataProvider;
});

const OPERATIONS = [
  {
    key: 'Forms.SaveAutomation',
    make: () => new SaveAutomationServerOperation(),
    load: LoadSaveAutomationOperation,
    input: { FormID: FORM, Automation: { Name: 'Notify', TargetType: 'Action', ActionID: 'act-1' } },
    badInput: { Automation: { Name: 'Notify', TargetType: 'Action', ActionID: 'act-1' } },
    badReason: /Forms\.SaveAutomation: FormID is required/,
  },
  {
    key: 'Forms.ReorderAutomations',
    make: () => new ReorderAutomationsServerOperation(),
    load: LoadReorderAutomationsOperation,
    input: { FormID: FORM, OrderedAutomationIDs: ['b', 'a'] },
    badInput: { FormID: FORM, OrderedAutomationIDs: 'b,a' },
    badReason: /Forms\.ReorderAutomations: OrderedAutomationIDs must be a list of step ids/,
  },
  {
    key: 'Forms.RemoveAutomation',
    make: () => new RemoveAutomationServerOperation(),
    load: LoadRemoveAutomationOperation,
    input: { FormAutomationID: 'a' },
    badInput: {},
    badReason: /Forms\.RemoveAutomation: FormAutomationID is required/,
  },
] as const;

describe.each(OPERATIONS)('$key', ({ key, make, load, input, badInput, badReason }) => {
  it('is registered under its operation key, with an anchor the server bootstrap calls', () => {
    expect(make().OperationKey).toBe(key);
    expect(load()).toBeUndefined();
  });

  it('carries the forms:write API-key scope', () => {
    expect(make().RequiredScope).toBe('forms:write');
  });

  it('refuses an anonymous magic-link session with FORBIDDEN, and writes nothing', async () => {
    const db = world();
    const anonymous = { ...AUTHOR, IsMagicLinkAnonymous: true } as unknown as UserInfo;

    expect((await run(make(), db, input, anonymous)).ResultCode).toBe('FORBIDDEN');
    expect(db.saved).toEqual([]);
    expect(db.deleted).toEqual([]);
  });

  it("refuses a respondent's magic-link scope with FORBIDDEN", async () => {
    const db = world();
    const scoped = { ...AUTHOR, MagicLinkScope: { ResourceID: 'd1', ResourceType: 'Form Distribution' } } as unknown as UserInfo;

    expect((await run(make(), db, input, scoped)).ResultCode).toBe('FORBIDDEN');
    expect(db.saved).toEqual([]);
  });

  it('refuses an author without Update on Forms with FORBIDDEN', async () => {
    const db = world({ forms: false });

    expect((await run(make(), db, input)).ResultCode).toBe('FORBIDDEN');
    expect(db.saved).toEqual([]);
  });

  it('refuses a malformed payload, naming the operation and the field', async () => {
    const db = world();

    const result = await run(make(), db, badInput);

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toMatch(badReason);
    expect(db.saved).toEqual([]);
  });
});

describe('happy paths, mapped to the generated output types', () => {
  it('SaveAutomation returns the step, its order and what it seeded', async () => {
    const db = world();

    const result = await run(new SaveAutomationServerOperation(), db, OPERATIONS[0].input);

    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Output).toMatchObject({ FormEntityBindingID: null, DisplayOrder: 3, SeededAutomationIDs: [] });
  });

  it('ReorderAutomations returns every step in run order', async () => {
    const db = world();

    const result = await run(new ReorderAutomationsServerOperation(), db, OPERATIONS[1].input);

    expect(result.Output).toEqual({
      Automations: [
        { FormAutomationID: 'b', DisplayOrder: 1 },
        { FormAutomationID: 'a', DisplayOrder: 2 },
      ],
    });
  });

  it('RemoveAutomation returns the step, its form and the binding it kept', async () => {
    const db = world();

    const result = await run(new RemoveAutomationServerOperation(), db, OPERATIONS[2].input);

    expect(result.Output).toEqual({ FormAutomationID: 'a', FormID: FORM, RetainedBindingID: null, SeededAutomationIDs: [] });
    expect(rowsOf(db, AUTOMATIONS).map((s) => s.ID)).toEqual(['b']);
  });

  it("an engine refusal reaches the caller as the engine's own sentence, never provider text", async () => {
    const db = world();

    const result = await run(new ReorderAutomationsServerOperation(), db, { FormID: FORM, OrderedAutomationIDs: ['a'] });

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toMatch(/every step/);
  });
});
