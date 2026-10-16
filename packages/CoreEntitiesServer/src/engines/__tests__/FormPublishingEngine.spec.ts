/**
 * `FormPublishingEngine.Publish` against the emulated database (`forms-world.ts`), with the REAL
 * `FormEntityServer` / `FormVersionEntityServer` over every Form and Form Version row — so each test
 * proves both what publish writes and that the invariants let the engine write it.
 *
 * The steps it ports from the browser's `publish.service.ts`, and the spec that pins each:
 *  - rule gate → "refuses broken rules"
 *  - reads (style degrades; settings, automations, live versions, max version refuse) → "reads"
 *  - new version = max + 1 → "version numbers"
 *  - retire incumbents BEFORE the replacement goes live → "retire then publish"
 *  - Form.Status Published → "first publish"
 *  - one transaction, nothing left behind on failure → "rollback"
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import {
  AUTHOR,
  AUTOMATIONS,
  BINDINGS,
  FORMS,
  PAGES,
  QUESTIONS,
  STYLES,
  VERSIONS,
  automationRow,
  bindingRow,
  draftTables,
  formRow,
  formsWorld,
  pageRow,
  questionRow,
  rowsOf,
  versionRow,
  type ServerSubclasses,
} from '../../testing/forms-world.js';
import type { FakeProviderConfig, FakeRow } from '../../testing/index.js';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

const logged = vi.hoisted(() => ({ errors: [] as string[], statuses: [] as string[] }));
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return {
    ...actual,
    LogError: (message: string) => logged.errors.push(message),
    LogStatus: (message: string) => logged.statuses.push(message),
  };
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

const { FormPublishingEngine, FormPublishError, PUBLISH_IN_PROGRESS_MESSAGE } = await import('../FormPublishingEngine.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;

function world(tables: Record<string, FakeRow[]> = draftTables(), config: Partial<FakeProviderConfig> = {}) {
  return formsWorld(SUBCLASSES, tables, config);
}

function publish(db: ReturnType<typeof world>, formId = '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', user: UserInfo = AUTHOR) {
  return FormPublishingEngine.Instance.Publish(formId, db.provider, user);
}

/** What `publish` threw, so a test can assert on it and on what was left behind. */
async function refusal(db: ReturnType<typeof world>, formId = '4d81af18-d0fe-5b39-b7de-6a0eb70c5766'): Promise<InstanceType<typeof FormPublishError>> {
  const caught = await publish(db, formId).then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(caught).toBeInstanceOf(FormPublishError);
  return caught as InstanceType<typeof FormPublishError>;
}

function versions(db: ReturnType<typeof world>): FakeRow[] {
  return rowsOf(db, VERSIONS);
}

function snapshotOf(row: FakeRow): PublishedFormDefinition {
  return JSON.parse(String(row.DefinitionSnapshot)) as PublishedFormDefinition;
}

beforeEach(() => {
  logged.errors.length = 0;
  logged.statuses.length = 0;
});

describe('first publish', () => {
  it('writes version 1 as Published, stores its snapshot by the row\'s own id, and publishes the form', async () => {
    const db = world();

    const result = await publish(db);

    const [row] = versions(db);
    expect(row).toMatchObject({ FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', VersionNumber: 1, Status: 'Published' });
    expect(row.PublishedAt).toBeInstanceOf(Date);
    // Save first, snapshot second: the snapshot names the id the row was GIVEN, with no reconcile.
    expect(snapshotOf(row).formVersionId).toBe(row.ID);
    expect(result).toEqual({
      formVersionId: row.ID,
      versionNumber: 1,
      retiredVersionIds: [],
      definition: snapshotOf(row),
    });
    expect(rowsOf(db, FORMS)[0].Status).toBe('Published');
  });

  it('runs as ONE transaction', async () => {
    const db = world();

    await publish(db);

    expect(db.transactions).toEqual(['begin', 'commit']);
  });

  it('builds the snapshot from the stored rows, through the contracts builder', async () => {
    const db = world();

    const { definition } = await publish(db);

    expect(definition.pages).toHaveLength(1);
    expect(definition.pages[0].questions.map((q) => q.prompt)).toEqual(['Your name', 'Colour']);
    // Options in DisplayOrder, not in the order the query returned them.
    expect(definition.pages[0].questions[1].options.map((o) => o.label)).toEqual(['Red', 'Blue']);
    expect(definition.automations).toEqual([]);
    expect(definition.endScreens).toEqual([]);
  });

  it('reads with two batched view calls and no per-row view', async () => {
    const db = world();
    const runViews = vi.spyOn(db.provider, 'RunViews');
    const runView = vi.spyOn(db.provider, 'RunView');

    await publish(db);

    // The second batch exists because options hang off questions and the style off the form, so
    // neither is addressable until the first batch has answered.
    expect(runViews).toHaveBeenCalledTimes(2);
    expect(runView).not.toHaveBeenCalled();
  });

  it('leaves an already-Published form\'s status alone on a republish', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ Status: 'Published' })];
    tables[VERSIONS] = [versionRow('v1', 1, 'Published')];
    const db = world(tables);

    await publish(db);

    expect(db.saved.filter((s) => s.entityName === FORMS)).toHaveLength(0);
  });
});

describe('a question with no page', () => {
  // `FormQuestion.PageID` is nullable, and the builder folds such a question onto the first page,
  // so the form looked normal and still failed to publish with "Cannot read properties of null".
  it('is published on the page with the lowest DisplayOrder, whatever order the pages come back in', async () => {
    const tables = draftTables();
    tables[PAGES] = [pageRow({ ID: 'p2', Title: 'Second', DisplayOrder: 1 }), pageRow({ ID: 'p1', Title: 'First', DisplayOrder: 0 })];
    tables[QUESTIONS] = [questionRow({ ID: 'q1', Prompt: 'Your name' }), questionRow({ ID: 'q-loose', Prompt: 'Pageless', PageID: null, DisplayOrder: 5 })];
    const db = world(tables);

    const { definition } = await publish(db);

    expect(definition.pages.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(definition.pages[0].questions.map((q) => q.prompt)).toEqual(['Your name', 'Pageless']);
  });

  it('is still refused when the form has no page at all to put it on', async () => {
    const tables = draftTables();
    tables[PAGES] = [];
    tables[QUESTIONS] = [questionRow({ ID: 'q-loose', PageID: null })];

    const caught = await refusal(world(tables));

    expect(caught.message).toMatch(/no page/i);
  });
});

describe('publishing an archived form', () => {
  it('returns a Closed form to Published — the status rule reads the version this transaction just promoted', async () => {
    // FormEntityServer allows Closed → Published only when a Published version of the form exists.
    // Here none did before this publish: the check passes only because its read joins the
    // transaction and sees the row promoted a moment earlier.
    const tables = draftTables();
    tables[FORMS] = [formRow({ Status: 'Closed' })];
    tables[VERSIONS] = [versionRow('v1', 1, 'Retired')];
    tables['MJ_BizApps_Forms: Form Distributions'] = [{ ID: 'd1', FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Status: 'Closed', IsActive: false }];
    const db = world(tables);

    const result = await publish(db);

    expect(rowsOf(db, FORMS)[0].Status).toBe('Published');
    expect(versions(db).find((v) => v.ID === result.formVersionId)?.Status).toBe('Published');
    // Archiving closed its links; publishing again does not reopen them — that is the author's call.
    expect(rowsOf(db, 'MJ_BizApps_Forms: Form Distributions')[0]).toMatchObject({ Status: 'Closed', IsActive: false });
  });
});

describe('retire then publish', () => {
  it('retires the live version and returns its id', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ Status: 'Published' })];
    tables[VERSIONS] = [versionRow('v1', 1, 'Published')];
    const db = world(tables);

    const result = await publish(db);

    expect(result.retiredVersionIds).toEqual(['v1']);
    expect(versions(db).map((v) => [v.ID, v.VersionNumber, v.Status])).toEqual([
      ['v1', 1, 'Retired'],
      [result.formVersionId, 2, 'Published'],
    ]);
  });

  it('retires every live version, not just the newest — older databases held several', async () => {
    const tables = draftTables();
    tables[VERSIONS] = [versionRow('v1', 1, 'Published'), versionRow('v2', 2, 'Published')];
    const db = world(tables);

    const result = await publish(db);

    expect(result.retiredVersionIds.sort()).toEqual(['v1', 'v2']);
    expect(versions(db).filter((v) => v.Status === 'Published').map((v) => v.ID)).toEqual([result.formVersionId]);
  });

  it('demotes the incumbent BEFORE the replacement becomes Published (UQ_FormVersion_OnePublishedPerForm)', async () => {
    const tables = draftTables();
    tables[VERSIONS] = [versionRow('v1', 1, 'Published')];
    const db = world(tables);

    await publish(db);

    const writes = db.saved.filter((s) => s.entityName === VERSIONS).map((s) => `${s.values.VersionNumber}:${s.values.Status}`);
    expect(writes).toEqual(['2:Draft', '1:Retired', '2:Published']);
  });

  it('touches no other form\'s versions', async () => {
    const tables = draftTables();
    tables[VERSIONS] = [versionRow('other', 1, 'Published', 'e9d89f6f-e43c-5d1d-aef7-c46815bbb36a')];
    const db = world(tables);

    await publish(db);

    expect(versions(db).find((v) => v.ID === 'other')?.Status).toBe('Published');
  });
});

describe('version numbers', () => {
  it('takes the highest existing number plus one, whatever its status and whatever order the rows come in', async () => {
    const tables = draftTables();
    tables[VERSIONS] = [versionRow('v3', 3, 'Retired'), versionRow('v7', 7, 'Draft'), versionRow('v5', 5, 'Retired')];
    const db = world(tables);

    const { versionNumber } = await publish(db);

    expect(versionNumber).toBe(8);
  });

  it('maps a version-number collision to "another publish is in progress"', async () => {
    const db = world(draftTables(), {
      failSaveWhen: (entity, values) =>
        entity === VERSIONS && values.Status === 'Draft'
          ? "Violation of UNIQUE KEY constraint 'UQ_FormVersion_Form_VersionNumber'. Cannot insert duplicate key."
          : false,
    });

    const error = await refusal(db);

    expect(error.message).toBe(PUBLISH_IN_PROGRESS_MESSAGE);
    expect(versions(db)).toEqual([]);
  });

  it('maps a one-published-per-form collision to the same message', async () => {
    const db = world(draftTables(), {
      failSaveWhen: (entity, values) =>
        entity === VERSIONS && values.Status === 'Published'
          ? "Cannot insert duplicate key row in object with unique index 'UQ_FormVersion_OnePublishedPerForm'."
          : false,
    });

    expect((await refusal(db)).message).toBe(PUBLISH_IN_PROGRESS_MESSAGE);
    expect(versions(db)).toEqual([]);
  });
});

describe('refusals write nothing', () => {
  function expectNothingWritten(db: ReturnType<typeof world>): void {
    expect(versions(db)).toEqual([]);
    expect(rowsOf(db, FORMS)[0].Status).toBe('Draft');
  }

  it('refuses broken rules, carrying them so a caller can retract the refusal later', async () => {
    const tables = draftTables();
    tables[QUESTIONS] = [
      questionRow({
        ID: 'q1',
        Prompt: 'Your name',
        ConditionalRule: JSON.stringify({ show: { all: [{ questionId: 'gone', op: 'equals', value: 'x' }] } }),
      }),
    ];
    const db = world(tables);

    const error = await refusal(db);

    expect(error.message).toMatch(/^Publish refused — 1 broken rule would ship with this form\./);
    expect(error.brokenRules).toHaveLength(1);
    expectNothingWritten(db);
  });

  it('refuses a rule the strict parser rejects, naming the question, and writes nothing (DW6)', async () => {
    const tables = draftTables();
    tables[QUESTIONS] = [questionRow({ ID: 'q1', Prompt: 'Age', ValidationRule: JSON.stringify({ min: 'zero' }) })];
    const db = world(tables);

    const error = await refusal(db);

    expect(error.message).toMatch(/^Cannot publish: the question "Age" \(q1\) ValidationRule cannot be read/);
    expect(error.brokenRules).toBeUndefined();
    expectNothingWritten(db);
  });

  it('refuses stored settings the schema rejects', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ Settings: '{"quota":"lots"}' })];
    const db = world(tables);

    expect((await refusal(db)).message).toMatch(/Settings cannot be read/);
    expectNothingWritten(db);
  });

  it('refuses an automation whose binding settings cannot be read, naming the binding', async () => {
    const tables = draftTables();
    tables[AUTOMATIONS] = [automationRow({ ID: 'a1', TargetType: 'EntityBinding', ActionID: null, BindingID: 'b1' })];
    tables[BINDINGS] = [bindingRow({ ID: 'b1', Name: 'Applicant', IdentityRule: '{"mode":"Sometimes"}' })];
    const db = world(tables);

    expect((await refusal(db)).message).toMatch(/binding "Applicant" \(b1\) IdentityRule of automation "a1" \(a1\) cannot be read/);
    expectNothingWritten(db);
  });

  it('refuses a binding step whose binding is gone, saying so — and what to do', async () => {
    const tables = draftTables();
    tables[AUTOMATIONS] = [automationRow({ ID: 'a1', Name: 'Write applicant', TargetType: 'EntityBinding', ActionID: null, BindingID: 'b-gone' })];
    const db = world(tables);

    expect((await refusal(db)).message).toBe(
      'Cannot publish: automation "Write applicant" (a1) runs binding b-gone, which no longer exists. ' +
        'Remove the step or link it to an existing binding. Nothing was published.',
    );
    expectNothingWritten(db);
  });

  it('refuses a template — templates are never published', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ IsTemplate: true })];
    const db = world(tables);

    expect((await refusal(db)).message).toMatch(/is a template/);
    expectNothingWritten(db);
  });

  it('refuses a form that does not exist', async () => {
    const db = world();

    expect((await refusal(db, 'b96cd1d3-6127-5e65-94e2-aef3a6d1a9a1')).message).toMatch(/b96cd1d3-6127-5e65-94e2-aef3a6d1a9a1 does not exist/);
    expect(versions(db)).toEqual([]);
  });
});

describe('reads', () => {
  it.each([
    [AUTOMATIONS, /automations/],
    [BINDINGS, /automations/],
    [VERSIONS, /versions/],
    [FORMS, /form/],
    [PAGES, /pages/],
    [QUESTIONS, /questions/],
  ])('refuses when %s cannot be read, rather than publishing a guess', async (entity, why) => {
    const db = world(draftTables(), { failRunViewFor: entity });

    const error = await refusal(db);

    expect(error.message).toMatch(why);
    expect(error.message).toMatch(/nothing was published/i);
    expect(versions(db)).toEqual([]);
  });

  it('degrades an unreadable style to the defaults, logged — a theme is not worth a refusal', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ StyleID: 'style-1' })];
    const db = world(tables, { failRunViewFor: STYLES });

    const { definition } = await publish(db);

    expect(definition.styleTokens).toEqual({ cssVariables: {} });
    expect(logged.errors.join('\n')).toMatch(/style-1/);
  });

  it('carries the linked style into the snapshot', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ StyleID: 'style-1' })];
    tables[STYLES] = [{ ID: 'style-1', CSSVariables: JSON.stringify({ '--mjf-accent': '#123456' }), CustomCSS: null, LogoURL: null }];
    const db = world(tables);

    const { definition } = await publish(db);

    expect(definition.styleTokens.cssVariables['--mjf-accent']).toBe('#123456');
  });

  it('freezes each binding\'s settings beside the automation that runs it', async () => {
    const tables = draftTables();
    tables[AUTOMATIONS] = [automationRow({ ID: 'a1', TargetType: 'EntityBinding', ActionID: null, BindingID: 'b1' })];
    tables[BINDINGS] = [bindingRow({ ID: 'b1', Status: 'Disabled' })];
    const db = world(tables);

    const { definition } = await publish(db);

    expect(definition.automations[0].binding).toMatchObject({ targetEntityName: 'MJ_BizApps_Common: People', status: 'Disabled' });
  });
});

describe('rollback', () => {
  it('a failed form-status write rolls the whole publish back: the incumbent is live again', async () => {
    const tables = draftTables();
    tables[VERSIONS] = [versionRow('v1', 1, 'Published')];
    const db = world(tables, {
      failSaveWhen: (entity, values) => (entity === FORMS && values.Status === 'Published' ? 'form row locked' : false),
    });

    const error = await refusal(db);

    expect(error.message).not.toMatch(/form row locked/);
    expect(logged.errors.join(" ")).toContain("form row locked");
    expect(db.transactions).toEqual(['begin', 'rollback']);
    expect(versions(db).map((v) => [v.ID, v.Status])).toEqual([['v1', 'Published']]);
    expect(rowsOf(db, FORMS)[0].Status).toBe('Draft');
  });
});

describe('the engine is the writer the invariants allow', () => {
  it('a version promoted WITHOUT the engine flag is refused by the same harness (sanity)', async () => {
    const db = world();
    const version = (await db.provider.GetEntityObject(VERSIONS, AUTHOR)) as unknown as Record<string, unknown> & {
      NewRecord(): boolean;
      Save(): Promise<boolean>;
      LatestResult: { CompleteMessage: string } | null;
    };
    version.NewRecord();
    Object.assign(version, { FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', VersionNumber: 1, Status: 'Published', DefinitionSnapshot: '{}' });

    expect(await version.Save()).toBe(false);
    expect(version.LatestResult?.CompleteMessage).toMatch(/only the publishing engine/);
  });
});

describe('guards', () => {
  it('refuses a provider that cannot hold a transaction — a publish must never land half-written', async () => {
    const db = world(draftTables(), { noTransactions: true });

    await expect(publish(db)).rejects.toThrow(/entity transactions/);
    expect(versions(db)).toEqual([]);
  });

  it('refuses a blank form id before reading anything', async () => {
    const db = world();
    const runViews = vi.spyOn(db.provider, 'RunViews');

    await expect(publish(db, '  ')).rejects.toThrow(/form id is required/i);
    expect(runViews).not.toHaveBeenCalled();
  });

  it('refuses without a user', async () => {
    const db = world();

    await expect(
      FormPublishingEngine.Instance.Publish('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider as DatabaseProviderBase, undefined as unknown as UserInfo),
    ).rejects.toThrow(/user/i);
  });

  it('logs every refusal with the form and the user', async () => {
    const tables = draftTables();
    tables[FORMS] = [formRow({ IsTemplate: true })];
    const db = world(tables);

    await refusal(db);

    expect([...logged.statuses, ...logged.errors].join('\n')).toMatch(/4d81af18-d0fe-5b39-b7de-6a0eb70c5766.*author-1|author-1.*4d81af18-d0fe-5b39-b7de-6a0eb70c5766/);
  });
});

it('keeps provider read diagnostics out of the publish refusal', async () => {
  const db = world(draftTables(), { failRunViewFor: QUESTIONS });
  const error = await refusal(db);
  expect(error.message).not.toContain('forced runview failure');
  expect(logged.errors.join(' ')).toContain('forced runview failure');
});

it('refuses malformed form IDs before attempting a publish read', async () => {
  const db = world(draftTables(), { failRunViewFor: FORMS });
  const error = await refusal(db, 'invalid-guid');
  expect(error.fault).toBe(false);
  expect(error.message).toMatch(/valid.*ID/i);
  expect(db.transactions).toEqual([]);
});

it('logs an unexpected provider exception without returning its SQL to the author', async () => {
  const db = world();
  const detail = 'SELECT private_column FROM private_database';
  vi.spyOn(db.provider, 'RunViews').mockRejectedValue(new Error(detail));
  const error = await publish(db).catch((e: unknown) => e);
  expect((error as Error).message).not.toContain(detail);
  expect(error).toBeInstanceOf(FormPublishError);
  expect(logged.errors.join(' ')).toContain(detail);
});
