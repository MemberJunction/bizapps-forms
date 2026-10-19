/**
 * `FormAuthoringEngine.BuildFromBlueprint` against the emulated database (`forms-world.ts`).
 *
 * Moved from forms-actions' `buildFormFromBlueprint` (#303) with two behaviour changes, each pinned
 * below: it writes in ONE transaction (a failure leaves no form at all), and it no longer writes a
 * Draft `FormVersion` (nothing read it, and publish numbering is max + 1, so it only made the first
 * published version v2). `publishImmediately` publishes inside the same transaction.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormBlueprint } from '@mj-biz-apps/forms-entities';
import {
  ACTIONS,
  AUTHOR,
  AUTOMATIONS,
  FORMS,
  OPTIONS,
  PAGES,
  QUESTIONS,
  VERSIONS,
  draftTables,
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

const { FormAuthoringEngine } = await import('../FormAuthoringEngine.js');
const { FormAuthoringError } = await import('../authoring-errors.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;

/** An empty database — no forms yet — with two Actions registered. */
function emptyTables(): Record<string, FakeRow[]> {
  const tables = draftTables();
  for (const name of Object.keys(tables)) {
    tables[name] = [];
  }
  tables[ACTIONS] = [
    { ID: 'action-email', Name: 'Forms: Send Confirmation Email' },
    { ID: 'action-task', Name: 'Forms: Create Followup Task' },
    { ID: 'action-quote', Name: "Forms: O'Brien Step" },
  ];
  return tables;
}

function world(config: Partial<FakeProviderConfig> = {}) {
  return formsWorld(SUBCLASSES, emptyTables(), config);
}

const blueprint: FormBlueprint = {
  name: 'Event RSVP',
  renderMode: 'Scroll',
  confirmationMessage: 'See you there!',
  pages: [
    {
      title: 'RSVP',
      questions: [
        { type: 'Email', prompt: 'Email', isRequired: true },
        { type: 'Number', prompt: '+1 count', settings: { min: 0, max: 10 } },
        {
          type: 'MultiChoice',
          prompt: 'Dietary restrictions',
          options: [{ label: 'Vegan' }, { label: 'None', value: 'none' }],
        },
        // Non-choice with stray options — the builder must NOT persist options for it.
        { type: 'ShortText', prompt: 'Name', options: [{ label: 'ignored' }] },
      ],
    },
  ],
};

function build(db: ReturnType<typeof world>, bp: FormBlueprint = blueprint, options = {}) {
  return FormAuthoringEngine.Instance.BuildFromBlueprint(bp, db.provider, AUTHOR, options);
}

const withAutomations = (automations: FormBlueprint['automations']): FormBlueprint => ({ ...blueprint, automations });

let db: ReturnType<typeof world>;
beforeEach(() => {
  db = world();
  logged.length = 0;
});

describe('BuildFromBlueprint', () => {
  it('persists a form, one page, four questions and two options — and no version', async () => {
    const result = await build(db);

    expect(result).toMatchObject({ pageCount: 1, questionCount: 4, optionCount: 2, automationCount: 0, published: null });
    expect(rowsOf(db, FORMS)).toHaveLength(1);
    expect(rowsOf(db, PAGES)).toHaveLength(1);
    expect(rowsOf(db, QUESTIONS)).toHaveLength(4);
    expect(rowsOf(db, OPTIONS)).toHaveLength(2);
    // #303: the Draft FormVersion is gone. Nothing read its id, and publish numbers from max + 1.
    expect(rowsOf(db, VERSIONS)).toHaveLength(0);
    expect(result.formId).toBe(rowsOf(db, FORMS)[0].ID);
  });

  it('writes in ONE transaction', async () => {
    await build(db);

    expect(db.transactions).toEqual(['begin', 'commit']);
  });

  it('sets the form to Draft with the right render mode, owner and settings JSON', async () => {
    await build(db, blueprint, { ownerUserId: 'owner-9' });

    const [form] = rowsOf(db, FORMS);
    expect(form).toMatchObject({ Name: 'Event RSVP', Status: 'Draft', RenderMode: 'Scroll', OwnerUserID: 'owner-9' });
    const settings = JSON.parse(String(form.Settings));
    expect(settings).toMatchObject({ confirmationMessage: 'See you there!', anonymousAllowed: true, captchaRequired: false });
    // Absent is what every form built to date carries: "infer, as the server always did".
    expect(settings.onSubmitMode).toBeUndefined();
  });

  it('records that a form authoring its own automations runs only those', async () => {
    await build(db, { ...blueprint, onSubmitMode: 'Configured' });

    expect(JSON.parse(String(rowsOf(db, FORMS)[0].Settings)).onSubmitMode).toBe('Configured');
  });

  it('wires each question to the form and page, and serializes per-type settings', async () => {
    await build(db);

    const [form] = rowsOf(db, FORMS);
    const [page] = rowsOf(db, PAGES);
    for (const q of rowsOf(db, QUESTIONS)) {
      expect(q).toMatchObject({ FormID: form.ID, PageID: page.ID });
    }
    const numberQ = rowsOf(db, QUESTIONS).find((q) => q.QuestionType === 'Number');
    expect(JSON.parse(String(numberQ?.Settings))).toEqual({ min: 0, max: 10 });
  });

  it('defaults an option value to its label when omitted', async () => {
    await build(db);

    expect(rowsOf(db, OPTIONS).find((o) => o.Label === 'Vegan')?.Value).toBe('Vegan');
  });

  it('leaves NO form behind when a later row fails — the whole build rolls back', async () => {
    // Before #303 each row committed on its own, so this left a form with a page and no questions.
    db = world({ failSaveWhen: (entity) => (entity === QUESTIONS ? 'question insert failed' : false) });

    await expect(build(db)).rejects.toThrow(/Failed to save FormQuestion/);

    expect(db.transactions).toEqual(['begin', 'rollback']);
    expect(rowsOf(db, FORMS)).toEqual([]);
    expect(rowsOf(db, PAGES)).toEqual([]);
  });

  it('refuses a blueprint the schema rejects, before writing anything', async () => {
    const bad = { ...blueprint, onSubmitMode: 'Legacy', automations: [{ actionName: 'Forms: Send Confirmation Email' }] } as FormBlueprint;

    await expect(build(db, bad)).rejects.toThrow(FormAuthoringError);
    expect(db.transactions).toEqual([]);
  });

  it('refuses a provider that cannot hold a transaction', async () => {
    db = world({ noTransactions: true });

    await expect(build(db)).rejects.toThrow(/entity transactions/);
    expect(rowsOf(db, FORMS)).toEqual([]);
  });
});

describe('BuildFromBlueprint + authored automations', () => {
  it('writes one row per authored step, in the order they were authored', async () => {
    await build(db, withAutomations([{ actionName: 'Forms: Create Followup Task' }, { actionName: 'Forms: Send Confirmation Email' }]));

    const rows = rowsOf(db, AUTOMATIONS);
    expect(rows.map((r) => r.ActionID)).toEqual(['action-task', 'action-email']);
    expect(rows.map((r) => r.DisplayOrder)).toEqual([1, 2]);
    expect(rows.every((r) => r.TargetType === 'Action')).toBe(true);
    expect(JSON.parse(String(rowsOf(db, FORMS)[0].Settings)).onSubmitMode).toBe('Configured');
  });

  it('treats an empty list as "run nothing", not as "say nothing"', async () => {
    await build(db, withAutomations([]));

    expect(rowsOf(db, AUTOMATIONS)).toHaveLength(0);
    expect(JSON.parse(String(rowsOf(db, FORMS)[0].Settings)).onSubmitMode).toBe('Configured');
  });

  it('defaults a step to the settings the legacy runner used, and honours explicit ones', async () => {
    await build(
      db,
      withAutomations([
        { actionName: 'Forms: Send Confirmation Email' },
        { actionName: 'Forms: Create Followup Task', trigger: 'OnCompleteOrPartial', executionMode: 'Async', continueOnError: false, isActive: false },
      ]),
    );

    const [first, second] = rowsOf(db, AUTOMATIONS);
    expect(first).toMatchObject({ Trigger: 'OnComplete', ExecutionMode: 'Sync', ContinueOnError: true, IsActive: true });
    expect(second).toMatchObject({ Trigger: 'OnCompleteOrPartial', ExecutionMode: 'Async', ContinueOnError: false, IsActive: false });
  });

  it('refuses a step naming an Action this deployment lacks — and writes NO form, opening no transaction', async () => {
    await expect(build(db, withAutomations([{ actionName: 'Forms: Not Installed Here' }]))).rejects.toThrow(
      /no Action named "Forms: Not Installed Here"/,
    );

    expect(rowsOf(db, FORMS)).toEqual([]);
    expect(db.transactions).toEqual([]);
  });

  it('refuses rather than guessing when the Action catalogue cannot be read', async () => {
    db = world({ failRunViewFor: ACTIONS });

    await expect(build(db, withAutomations([{ actionName: 'Forms: Send Confirmation Email' }]))).rejects.toThrow(
      /Could not read the Action catalogue/,
    );
    expect(rowsOf(db, FORMS)).toEqual([]);
  });

  it('does not read the Action catalogue at all when no steps are authored', async () => {
    const runView = vi.spyOn(db.provider, 'RunView');

    await build(db);

    expect(runView.mock.calls.filter(([params]) => params.EntityName === ACTIONS)).toHaveLength(0);
  });

  it('escapes a quote in an Action name instead of building broken SQL', async () => {
    const runView = vi.spyOn(db.provider, 'RunView');

    await build(db, withAutomations([{ actionName: "Forms: O'Brien Step" }]));

    expect(runView.mock.calls[0][0].ExtraFilter).toContain("''Brien");
    expect(rowsOf(db, AUTOMATIONS)[0].ActionID).toBe('action-quote');
  });
});

describe('BuildFromBlueprint with publishImmediately', () => {
  it('builds and publishes as one unit of work: version 1, Published, the form Published', async () => {
    const result = await build(db, blueprint, { publishImmediately: true });

    expect(result.published?.versionNumber).toBe(1);
    expect(rowsOf(db, VERSIONS).map((v) => [v.VersionNumber, v.Status])).toEqual([[1, 'Published']]);
    expect(rowsOf(db, FORMS)[0].Status).toBe('Published');
    // The publish joins the build's transaction as a savepoint.
    expect(db.transactions).toEqual(['begin', 'begin:nested', 'commit:nested', 'commit']);
  });

  it('publishes the snapshot of exactly what it just built', async () => {
    const result = await build(db, blueprint, { publishImmediately: true });

    const questions = result.published?.definition.pages[0].questions ?? [];
    expect(questions.map((q) => q.prompt)).toEqual(['Email', '+1 count', 'Dietary restrictions', 'Name']);
    expect(questions[2].options.map((o) => o.value)).toEqual(['Vegan', 'none']);
  });

  it('a refused publish leaves NOTHING behind — the caller asked for a published form or nothing', async () => {
    db = world({ failSaveWhen: (entity, values) => (entity === VERSIONS && values.Status === 'Published' ? 'disk full' : false) });

    await expect(
      build(db, withAutomations([{ actionName: 'Forms: Send Confirmation Email' }]), { publishImmediately: true }),
    ).rejects.toThrow(/Could not|Failed to save/);

    // The publish's savepoint rolls back, then the build's transaction does.
    expect(db.transactions).toEqual(['begin', 'begin:nested', 'rollback:nested', 'rollback']);
    for (const table of [FORMS, PAGES, QUESTIONS, OPTIONS, AUTOMATIONS, VERSIONS]) {
      expect(rowsOf(db, table), table).toEqual([]);
    }
  });

  it('logs a failure inside the nested publish ONCE, at the outermost boundary, with the form and the user', async () => {
    const runViews = vi.spyOn(db.provider, 'RunViews').mockRejectedValue(new Error('connection reset'));

    await expect(build(db, blueprint, { publishImmediately: true })).rejects.toThrow(/failed on the server/);

    expect(runViews).toHaveBeenCalled();
    const mentions = logged.filter((m) => m.includes('connection reset'));
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatch(/Event RSVP.*author-1/);
  });

  it('logs a nested publish refusal once too', async () => {
    db = world({ failSaveWhen: (entity, values) => (entity === VERSIONS && values.Status === 'Published' ? 'disk full' : false) });

    await expect(build(db, blueprint, { publishImmediately: true })).rejects.toThrow(/Could not|Failed to save/);

    expect(logged.filter((m) => m.includes('disk full'))).toHaveLength(1);
  });
});

it.each(['begin', 'commit'] as const)('retains the nested publish transaction %s diagnostic in the single outer log', async (stage) => {
  const db = world();
  const diagnostic = 'SQL connection failed on private-host during nested publication';
  const begin = db.provider.BeginEntityTransaction.bind(db.provider);
  vi.spyOn(db.provider, 'BeginEntityTransaction').mockImplementation(async () => {
    const nested = db.provider.TransactionDepth > 0;
    if (nested && stage === 'begin') {
      throw new Error(diagnostic);
    }
    const scope = await begin();
    return nested && stage === 'commit'
      ? { ...scope, Commit: async () => { throw new Error(diagnostic); } }
      : scope;
  });

  const error = await build(db, blueprint, { publishImmediately: true }).catch((error: unknown) => error);

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).not.toContain(diagnostic);
  expect(logged).toHaveLength(1);
  expect(logged[0]).toContain(diagnostic);
  expect(logged[0]).toMatch(/Event RSVP.*author-1/);
  expect(rowsOf(db, FORMS)).toEqual([]);
  expect(rowsOf(db, VERSIONS)).toEqual([]);
});
