/**
 * `Forms.CloneForm`, `Forms.CreateFormFromTemplate`, `Forms.ArchiveForm` and `Forms.RestoreForm`
 * through `ExecuteServer` — `Authorize`, then `InternalExecute`, wrapped into a `RemoteOpResult` —
 * over the emulated database with the real entity server subclasses (`forms-world.ts`).
 *
 * DW17 for each: an Authorize refusal (anonymous, magic-link scoped, no Update on Forms), an input
 * refusal and a happy path. The engine's behaviour is pinned in the engine specs; these pin the
 * mapping between the wire and the engine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
  AUTHOR,
  DISTRIBUTIONS,
  FORMS,
  QUESTIONS,
  SCREENS,
  VERSIONS,
  distributionRow,
  draftTables,
  formRow,
  formsWorld,
  rowsOf,
  versionRow,
  type ServerSubclasses,
} from '../../testing/forms-world.js';
import type { FakeRow } from '../../testing/index.js';

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
  return {
    ...actual,
    mjBizAppsFormsFormEntity: WriteThroughEntityBase,
    mjBizAppsFormsFormVersionEntity: WriteThroughEntityBase,
  };
});

const { CloneFormServerOperation, LoadCloneFormOperation } = await import('../CloneFormServerOperation.js');
const { CreateFormFromTemplateServerOperation, LoadCreateFormFromTemplateOperation } = await import(
  '../CreateFormFromTemplateServerOperation.js'
);
const { ArchiveFormServerOperation, LoadArchiveFormOperation } = await import('../ArchiveFormServerOperation.js');
const { RestoreFormServerOperation, LoadRestoreFormOperation } = await import('../RestoreFormServerOperation.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;

/** Anything with `ExecuteServer` — the four operations share its signature. */
interface ServerOperation {
  OperationKey: string;
  ExecuteServer(
    input: unknown,
    context: { provider: IMetadataProvider; user: UserInfo; emitProgress: () => void },
  ): Promise<{ ResultCode?: string; ErrorMessage?: string; Output?: unknown }>;
}

function world(tables: Record<string, FakeRow[]> = draftTables(), canUpdateForms = true) {
  const db = formsWorld(SUBCLASSES, tables, { updatePermissions: { [FORMS]: canUpdateForms } });
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
  { key: 'Forms.CloneForm', make: () => new CloneFormServerOperation(), load: LoadCloneFormOperation, input: { SourceFormID: 'form-1', AsTemplate: false } },
  {
    key: 'Forms.CreateFormFromTemplate',
    make: () => new CreateFormFromTemplateServerOperation(),
    load: LoadCreateFormFromTemplateOperation,
    input: { TemplateKey: 'contact' },
  },
  { key: 'Forms.ArchiveForm', make: () => new ArchiveFormServerOperation(), load: LoadArchiveFormOperation, input: { FormID: 'form-1' } },
  { key: 'Forms.RestoreForm', make: () => new RestoreFormServerOperation(), load: LoadRestoreFormOperation, input: { FormID: 'form-1' } },
] as const;

describe.each(OPERATIONS)('$key — registration and Authorize', ({ key, make, load, input }) => {
  it('is registered under its operation key, with an anchor the server bootstrap calls', () => {
    expect(make().OperationKey).toBe(key);
    expect(load()).toBeUndefined();
  });

  it('refuses an anonymous magic-link session with FORBIDDEN, and writes nothing', async () => {
    const db = world();
    const anonymous = { ...AUTHOR, IsMagicLinkAnonymous: true } as unknown as UserInfo;

    expect((await run(make(), db, input, anonymous)).ResultCode).toBe('FORBIDDEN');
    expect(db.saved).toEqual([]);
  });

  it('refuses a respondent\'s magic-link scope with FORBIDDEN', async () => {
    const db = world();
    const scoped = { ...AUTHOR, MagicLinkScope: { ResourceID: 'dist-1', ResourceType: 'Form Distribution' } } as unknown as UserInfo;

    expect((await run(make(), db, input, scoped)).ResultCode).toBe('FORBIDDEN');
  });

  it('refuses an author without Update on Forms with FORBIDDEN', async () => {
    const db = world(draftTables(), false);

    expect((await run(make(), db, input)).ResultCode).toBe('FORBIDDEN');
    expect(db.saved).toEqual([]);
  });

  it('refuses a provider that is not a server database provider', async () => {
    const db = world();
    const client = { EntityByName: db.provider.EntityByName } as unknown as IMetadataProvider;

    const result = await make().ExecuteServer(input as never, { provider: client, user: AUTHOR, emitProgress: () => undefined });

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toContain(`${key} needs a server database provider`);
  });
});

describe('Forms.CloneForm', () => {
  it('copies the form and returns the copy, its provenance, its counts and any warnings', async () => {
    const db = world();

    const result = await run(new CloneFormServerOperation(), db, { SourceFormID: 'form-1', Name: 'Copy', AsTemplate: false });

    expect(result.ResultCode).toBe('SUCCESS');
    const copy = rowsOf(db, FORMS).find((f) => f.Name === 'Copy');
    expect(result.Output).toEqual({
      FormID: copy?.ID,
      TemplateSourceFormID: null,
      PageCount: 1,
      QuestionCount: 2,
      OptionCount: 2,
      ScreenCount: 0,
      AutomationCount: 0,
      BindingCount: 0,
      Warnings: [],
    });
  });

  it('as a template (save-as-template): TemplateSourceFormID is the source, and the name is checked', async () => {
    const tables = draftTables();
    tables[FORMS] = [...tables[FORMS], formRow({ ID: 'tpl-1', Name: 'Taken', IsTemplate: true })];
    const db = world(tables);

    const saved = await run(new CloneFormServerOperation(), db, { SourceFormID: 'form-1', Name: 'Intake template', AsTemplate: true });
    const duplicate = await run(new CloneFormServerOperation(), db, { SourceFormID: 'form-1', Name: 'TAKEN', AsTemplate: true });

    expect(saved.Output).toMatchObject({ TemplateSourceFormID: 'form-1' });
    expect(duplicate.ResultCode).toBe('EXECUTION_ERROR');
    expect(duplicate.ErrorMessage).toBe('A template called “TAKEN” already exists. Give this one a name that tells them apart.');
  });

  it('passes Description through: absent keeps the source\'s, null clears it', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ Description: 'Original' })];
    const db = world(tables);

    await run(new CloneFormServerOperation(), db, { SourceFormID: 'form-1', Name: 'Kept', AsTemplate: false });
    await run(new CloneFormServerOperation(), db, { SourceFormID: 'form-1', Name: 'Cleared', Description: null, AsTemplate: false });

    expect(rowsOf(db, FORMS).find((f) => f.Name === 'Kept')?.Description).toBe('Original');
    expect(rowsOf(db, FORMS).find((f) => f.Name === 'Cleared')?.Description).toBeNull();
  });

  it.each([
    [{ AsTemplate: false }, 'Forms.CloneForm: SourceFormID is required.'],
    [{ SourceFormID: '  ', AsTemplate: false }, 'Forms.CloneForm: SourceFormID is required.'],
    [{ SourceFormID: 'form-1' }, 'Forms.CloneForm: AsTemplate must be true or false.'],
    [{ SourceFormID: 'form-1', AsTemplate: 'yes' }, 'Forms.CloneForm: AsTemplate must be true or false.'],
    [{ SourceFormID: 'form-1', AsTemplate: false, Name: 42 }, 'Forms.CloneForm: Name must be text when given.'],
    [{ SourceFormID: 'form-1', AsTemplate: false, Description: 7 }, 'Forms.CloneForm: Description must be text or null when given.'],
  ])('refuses %j, naming the operation', async (input, message) => {
    const db = world();

    const result = await run(new CloneFormServerOperation(), db, input);

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toBe(message);
    expect(db.saved).toEqual([]);
  });
});

describe('Forms.CreateFormFromTemplate', () => {
  it('from a starter key: returns the new Draft form', async () => {
    const db = world({ ...draftTables(), [FORMS]: [] });

    const result = await run(new CreateFormFromTemplateServerOperation(), db, { TemplateKey: 'contact', Name: 'Hello' });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(rowsOf(db, FORMS)).toEqual([expect.objectContaining({ ID: (result.Output as { FormID: string }).FormID, Name: 'Hello', Status: 'Draft' })]);
    // A starter names nothing by id, so it has nothing to report — but the field is always there.
    expect(result.Output).toEqual({ FormID: rowsOf(db, FORMS)[0].ID, Warnings: [] });
  });

  it('from a saved template: returns the new Draft form', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ IsTemplate: true, Name: 'Client intake' })];
    const db = world(tables);

    const result = await run(new CreateFormFromTemplateServerOperation(), db, { TemplateFormID: 'form-1' });

    expect(result.ResultCode).toBe('SUCCESS');
    const formId = (result.Output as { FormID: string }).FormID;
    expect(rowsOf(db, FORMS).find((f) => f.ID === formId)).toMatchObject({ Name: 'Client intake', IsTemplate: false, Status: 'Draft' });
    expect(rowsOf(db, QUESTIONS).filter((q) => q.FormID === formId)).toHaveLength(2);
    expect(result.Output).toEqual({ FormID: formId, Warnings: [] });
  });

  it('from a saved template: returns what the copy could not carry over, for the author to fix', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ IsTemplate: true, Name: 'Client intake' })];
    tables[SCREENS] = [
      { ID: 's1', FormID: 'form-1', ScreenType: 'Ending', Title: 'Done', DisplayOrder: 0, ConditionalRule: JSON.stringify({ show: { all: [{ questionId: 'q-gone', op: 'equals', value: 'x' }] } }) },
    ];
    const db = world(tables);

    const result = await run(new CreateFormFromTemplateServerOperation(), db, { TemplateFormID: 'form-1' });

    expect(result.ResultCode).toBe('SUCCESS');
    expect((result.Output as { Warnings: string[] }).Warnings).toEqual([
      'screen visibility rule: 1 reference to a question that was not copied was removed.',
    ]);
  });

  it.each([
    [{}, 'Forms.CreateFormFromTemplate: exactly one of TemplateFormID or TemplateKey is required.'],
    [{ TemplateFormID: ' ', TemplateKey: '' }, 'Forms.CreateFormFromTemplate: exactly one of TemplateFormID or TemplateKey is required.'],
    [{ TemplateFormID: 'form-1', TemplateKey: 'contact' }, 'Forms.CreateFormFromTemplate: exactly one of TemplateFormID or TemplateKey is required.'],
    [{ TemplateKey: 'contact', Name: false }, 'Forms.CreateFormFromTemplate: Name must be text when given.'],
  ])('refuses %j, naming the operation', async (input, message) => {
    const db = world();

    const result = await run(new CreateFormFromTemplateServerOperation(), db, input);

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toBe(message);
    expect(db.saved).toEqual([]);
  });

  it('carries the engine\'s refusal of an unknown key back as the error message', async () => {
    const result = await run(new CreateFormFromTemplateServerOperation(), world(), { TemplateKey: 'nope' });

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toMatch(/^Unknown template key 'nope'/);
  });
});

describe('Forms.ArchiveForm / Forms.RestoreForm', () => {
  function lifecycleTables(status: string, published: boolean): Record<string, FakeRow[]> {
    return {
      ...draftTables(),
      [FORMS]: [formRow({ Status: status })],
      [VERSIONS]: published ? [versionRow('v1', 1, 'Published')] : [],
      [DISTRIBUTIONS]: [distributionRow({ ID: 'd1' })],
    };
  }

  it('archive returns Closed, and the link is closed with it', async () => {
    const db = world(lifecycleTables('Published', true));

    const result = await run(new ArchiveFormServerOperation(), db, { FormID: 'form-1' });

    expect(result).toMatchObject({ ResultCode: 'SUCCESS', Output: { FormID: 'form-1', Status: 'Closed' } });
    expect(rowsOf(db, DISTRIBUTIONS)[0].Status).toBe('Closed');
  });

  it.each([
    [true, 'Published'],
    [false, 'Draft'],
  ])('restore with a published version = %s returns %s', async (published, status) => {
    const db = world(lifecycleTables('Closed', published));

    const result = await run(new RestoreFormServerOperation(), db, { FormID: 'form-1' });

    expect(result).toMatchObject({ ResultCode: 'SUCCESS', Output: { FormID: 'form-1', Status: status } });
  });

  it.each([
    [() => new ArchiveFormServerOperation(), 'Forms.ArchiveForm'],
    [() => new RestoreFormServerOperation(), 'Forms.RestoreForm'],
  ])('refuses a missing FormID (%#), naming the operation', async (make, key) => {
    const db = world();

    for (const input of [{}, { FormID: ' ' }, null]) {
      const result = await run(make(), db, input);
      expect(result.ResultCode).toBe('EXECUTION_ERROR');
      expect(result.ErrorMessage).toBe(`${key}: FormID is required.`);
    }
    expect(db.saved).toEqual([]);
  });
});
