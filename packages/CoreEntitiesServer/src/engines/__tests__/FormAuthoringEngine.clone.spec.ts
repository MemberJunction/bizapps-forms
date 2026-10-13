/**
 * `FormAuthoringEngine.Clone` and `.CreateFromTemplate` against the emulated database
 * (`forms-world.ts`), with the real `FormEntityServer` over every Form row.
 *
 * Ported from the browser's `FormCloneService` (#303): every rule it encoded is pinned here — what
 * is never copied, the two-pass id remap, the style shared, provenance on templates only, the copy
 * always Draft and owned by the caller, the two flags that were once forgotten, the binding
 * re-pointed to the copy's, the hard stop on an orphan option, and the binding disabled rather than
 * left mapping another form's questions. New on the server: it is ONE transaction (DW14), and the
 * template-name check runs inside it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIONS,
  AUTHOR,
  AUTOMATIONS,
  BINDINGS,
  DISTRIBUTIONS,
  FORMS,
  OPTIONS,
  PAGES,
  QUESTIONS,
  SCREENS,
  STYLES,
  VERSIONS,
  automationRow,
  bindingRow,
  distributionRow,
  formRow,
  formsWorld,
  optionRow,
  pageRow,
  questionRow,
  rowsOf,
  screenRow,
  versionRow,
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

const entities = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
const { FormAuthoringEngine } = await import('../FormAuthoringEngine.js');
const { FormAuthoringError } = await import('../authoring-errors.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;

const rule = (value: unknown): string => JSON.stringify(value);
const equalsCondition = (questionId: string, value: string) => ({ questionId, op: 'equals', value });

/**
 * A published source form with every kind of child and every kind of id-bearing payload:
 *  - page p2 shows when q1 says yes; question q2 jumps to page p1;
 *  - the knockout ending s1 shows on q2 = b, and is flagged IsDisqualification;
 *  - binding b1 maps q1; automation a1 runs through b1 when q2 = a;
 *  - a Published version and an Active distribution, neither of which a copy may carry.
 */
function sourceTables(): Record<string, FakeRow[]> {
  return {
    [FORMS]: [
      formRow({
        Name: 'Intake',
        Description: 'About intake',
        Status: 'Published',
        StyleID: 'style-1',
        CategoryID: 'cat-1',
        RenderMode: 'OneQuestion',
        Settings: rule({ anonymousAllowed: true, captchaRequired: false }),
        OwnerUserID: 'someone-else',
      }),
    ],
    [VERSIONS]: [versionRow('v1', 1, 'Published')],
    [PAGES]: [
      pageRow({ ID: 'p1', Title: 'Start', DisplayOrder: 0, IsPartialSubmitPoint: true }),
      pageRow({ ID: 'p2', Title: 'More', DisplayOrder: 1, ConditionalRule: rule({ show: { all: [equalsCondition('q1', 'yes')] } }) }),
    ],
    [QUESTIONS]: [
      questionRow({ ID: 'q1', PageID: 'p1', Prompt: 'Name' }),
      questionRow({
        ID: 'q2',
        PageID: 'p2',
        QuestionType: 'SingleChoice',
        Prompt: 'Pick',
        ConditionalRule: rule({ jump: [{ when: { all: [equalsCondition('q2', 'a')] }, target: { kind: 'page', id: 'p1' } }] }),
      }),
    ],
    [OPTIONS]: [optionRow({ ID: 'o1', QuestionID: 'q2', Label: 'A', Value: 'a' }), optionRow({ ID: 'o2', QuestionID: 'q2', Label: 'B', Value: 'b', DisplayOrder: 1 })],
    [SCREENS]: [
      screenRow({ ID: 's1', Title: 'Not eligible', IsDisqualification: true, ConditionalRule: rule({ show: { all: [equalsCondition('q2', 'b')] } }) }),
    ],
    [BINDINGS]: [bindingRow({ ID: 'b1', Name: 'Person' })],
    [AUTOMATIONS]: [
      automationRow({ ID: 'a1', BindingID: 'b1', TargetType: 'Binding', ActionID: null, ConditionalRule: rule({ show: { all: [equalsCondition('q2', 'a')] } }) }),
      automationRow({ ID: 'a2', DisplayOrder: 2 }),
    ],
    [DISTRIBUTIONS]: [distributionRow({ ID: 'd1' })],
    [STYLES]: [],
    [ACTIONS]: [],
  };
}

function world(tables: Record<string, FakeRow[]> = sourceTables(), config: Partial<FakeProviderConfig> = {}) {
  return formsWorld(SUBCLASSES, tables, config);
}

function clone(db: ReturnType<typeof world>, options: { asTemplate: boolean; name?: string; description?: string | null } = { asTemplate: false, name: 'Intake copy' }, sourceId = 'form-1') {
  return FormAuthoringEngine.Instance.Clone(sourceId, db.provider, AUTHOR, options);
}

/** The rows of `table` that belong to the form `formId`. */
function ofForm(db: ReturnType<typeof world>, table: string, formId: string): FakeRow[] {
  return rowsOf(db, table).filter((row) => row.FormID === formId);
}

/** Every table's rows, deep-copied, to compare against after a rolled-back unit of work. */
function snapshot(db: ReturnType<typeof world>): Record<string, FakeRow[]> {
  return structuredClone(db.tables);
}

let db: ReturnType<typeof world>;
beforeEach(() => {
  db = world();
  logged.length = 0;
});

describe('Clone — what the copy is', () => {
  it('copies the whole authored tree into a new form, in ONE transaction, and counts it', async () => {
    const result = await clone(db);

    expect(db.transactions).toEqual(['begin', 'commit']);
    expect(result).toMatchObject({
      pageCount: 2,
      questionCount: 2,
      optionCount: 2,
      screenCount: 1,
      automationCount: 2,
      bindingCount: 1,
      templateSourceFormId: null,
      warnings: [],
    });
    expect(result.formId).not.toBe('form-1');
    expect(ofForm(db, PAGES, result.formId)).toHaveLength(2);
    expect(ofForm(db, QUESTIONS, result.formId)).toHaveLength(2);
    expect(ofForm(db, SCREENS, result.formId)).toHaveLength(1);
    expect(ofForm(db, BINDINGS, result.formId)).toHaveLength(1);
    expect(ofForm(db, AUTOMATIONS, result.formId)).toHaveLength(2);
    const newQuestionIds = ofForm(db, QUESTIONS, result.formId).map((q) => q.ID);
    expect(rowsOf(db, OPTIONS).filter((o) => newQuestionIds.includes(String(o.QuestionID)))).toHaveLength(2);
  });

  it('never copies versions or distributions — the copy has never been published and has no link', async () => {
    const result = await clone(db);

    expect(ofForm(db, VERSIONS, result.formId)).toEqual([]);
    expect(ofForm(db, DISTRIBUTIONS, result.formId)).toEqual([]);
    expect(rowsOf(db, VERSIONS)).toHaveLength(1);
    expect(rowsOf(db, DISTRIBUTIONS)).toHaveLength(1);
  });

  it('is always Draft (a Published source included), owned by the caller, sharing the source style', async () => {
    const result = await clone(db);

    const copy = rowsOf(db, FORMS).find((f) => f.ID === result.formId);
    expect(copy).toMatchObject({
      Name: 'Intake copy',
      Description: 'About intake',
      Status: 'Draft',
      OwnerUserID: AUTHOR.ID,
      StyleID: 'style-1',
      CategoryID: 'cat-1',
      RenderMode: 'OneQuestion',
      Settings: rule({ anonymousAllowed: true, captchaRequired: false }),
      IsTemplate: false,
      TemplateSourceFormID: null,
    });
  });

  it('as a template: IsTemplate, Draft, and its TemplateSourceFormID names the source', async () => {
    const result = await clone(db, { asTemplate: true, name: 'Intake template' });

    expect(result.templateSourceFormId).toBe('form-1');
    expect(rowsOf(db, FORMS).find((f) => f.ID === result.formId)).toMatchObject({
      IsTemplate: true,
      Status: 'Draft',
      TemplateSourceFormID: 'form-1',
    });
  });

  it('a form made from a template records no provenance — edits never propagate, so no link implies they do', async () => {
    db = world({ ...sourceTables(), [FORMS]: [formRow({ IsTemplate: true, TemplateSourceFormID: 'older-form' })] });

    const result = await clone(db, { asTemplate: false, name: 'From template' });

    expect(rowsOf(db, FORMS).find((f) => f.ID === result.formId)).toMatchObject({ IsTemplate: false, TemplateSourceFormID: null });
  });

  it('derives a name from the source when none is given, and keeps or clears the description as asked', async () => {
    const derived = await clone(db, { asTemplate: false, name: '   ' });
    const cleared = await clone(db, { asTemplate: false, description: null });
    const replaced = await clone(db, { asTemplate: false, description: 'New words' });

    const byId = (id: string) => rowsOf(db, FORMS).find((f) => f.ID === id);
    expect(byId(derived.formId)).toMatchObject({ Name: 'Intake (copy)', Description: 'About intake' });
    expect(byId(cleared.formId)?.Description).toBeNull();
    expect(byId(replaced.formId)?.Description).toBe('New words');
  });

  it('carries IsPartialSubmitPoint and IsDisqualification — the two flags a column-by-column copy once dropped', async () => {
    const result = await clone(db);

    expect(ofForm(db, PAGES, result.formId).find((p) => p.Title === 'Start')?.IsPartialSubmitPoint).toBe(true);
    expect(ofForm(db, SCREENS, result.formId)[0].IsDisqualification).toBe(true);
  });
});

describe('Clone — the two-pass id remap', () => {
  it('rewrites every rule to name the COPY\'s questions and pages, never the source\'s', async () => {
    const result = await clone(db);

    const questionId = (prompt: string) => ofForm(db, QUESTIONS, result.formId).find((q) => q.Prompt === prompt)?.ID;
    const pageId = (title: string) => ofForm(db, PAGES, result.formId).find((p) => p.Title === title)?.ID;
    const [newQ1, newQ2, newP1] = [questionId('Name'), questionId('Pick'), pageId('Start')];

    // A rule on an EARLIER row names a LATER question — why this cannot be one pass.
    expect(JSON.parse(String(ofForm(db, PAGES, result.formId).find((p) => p.Title === 'More')?.ConditionalRule))).toEqual({
      show: { all: [equalsCondition(String(newQ1), 'yes')] },
    });
    expect(JSON.parse(String(ofForm(db, QUESTIONS, result.formId).find((q) => q.ID === newQ2)?.ConditionalRule))).toEqual({
      jump: [{ when: { all: [equalsCondition(String(newQ2), 'a')] }, target: { kind: 'page', id: newP1 } }],
    });
    expect(JSON.parse(String(ofForm(db, SCREENS, result.formId)[0].ConditionalRule))).toEqual({ show: { all: [equalsCondition(String(newQ2), 'b')] } });
    const viaBinding = ofForm(db, AUTOMATIONS, result.formId).find((a) => a.TargetType === 'Binding');
    expect(JSON.parse(String(viaBinding?.ConditionalRule))).toEqual({ show: { all: [equalsCondition(String(newQ2), 'a')] } });
    const [binding] = ofForm(db, BINDINGS, result.formId);
    expect(JSON.parse(String(binding.FieldMappings)).fields[0].source).toEqual({ kind: 'question', questionId: newQ1 });
  });

  it('points each copied option and question at the copy\'s question and page', async () => {
    const result = await clone(db);

    const copiedPages = ofForm(db, PAGES, result.formId).map((p) => p.ID);
    const copiedQuestions = ofForm(db, QUESTIONS, result.formId);
    expect(copiedQuestions.every((q) => copiedPages.includes(String(q.PageID)))).toBe(true);
    const pick = copiedQuestions.find((q) => q.Prompt === 'Pick');
    expect(rowsOf(db, OPTIONS).filter((o) => o.QuestionID === pick?.ID).map((o) => o.Label)).toEqual(['A', 'B']);
  });

  it('runs an automation through the COPY\'s binding — never the source form\'s map', async () => {
    const result = await clone(db);

    const [binding] = ofForm(db, BINDINGS, result.formId);
    const viaBinding = ofForm(db, AUTOMATIONS, result.formId).find((a) => a.TargetType === 'Binding');
    expect(viaBinding?.BindingID).toBe(binding.ID);
    expect(viaBinding?.BindingID).not.toBe('b1');
  });

  it('drops — and reports — a reference to a question the copy does not have', async () => {
    const tables = sourceTables();
    tables[SCREENS] = [screenRow({ ID: 's1', ConditionalRule: rule({ show: { all: [equalsCondition('q-gone', 'x')] } }) })];
    db = world(tables);

    const result = await clone(db);

    expect(ofForm(db, SCREENS, result.formId)[0].ConditionalRule).toBeNull();
    expect(result.warnings).toEqual(['screen visibility rule: 1 reference to a question that was not copied was removed.']);
    // Logged once, with the forms and the user, so an operator sees it without the author.
    expect(logged.filter((m) => m.includes('not copied'))).toEqual([expect.stringMatching(/form-1.*author-1/)]);
  });

  it('copies a binding whose mappings cannot be carried over as Disabled, and says so', async () => {
    const tables = sourceTables();
    tables[BINDINGS] = [bindingRow({ ID: 'b1', Name: 'Person', FieldMappings: 'not json' })];
    db = world(tables);

    const result = await clone(db);

    const [binding] = ofForm(db, BINDINGS, result.formId);
    expect(binding.Status).toBe('Disabled');
    expect(result.warnings).toContain('Entity binding "Person" was copied as Disabled because its field mappings could not be carried over.');
    expect(rowsOf(db, BINDINGS).find((b) => b.ID === 'b1')?.Status).toBe('Active');
  });

  it('stops — writing nothing — at an option whose question was not copied, rather than corrupt the source', async () => {
    const runViews = db.provider.RunViews.bind(db.provider);
    vi.spyOn(db.provider, 'RunViews').mockImplementation(async (params, user) => {
      const results = await runViews(params, user);
      if (params[0]?.EntityName === OPTIONS) {
        results[0].Results.push(optionRow({ ID: 'stray', QuestionID: 'q-elsewhere', Label: 'Stray' }));
      }
      return results;
    });
    const before = snapshot(db);

    await expect(clone(db)).rejects.toThrow(/Option "Stray" belongs to question q-elsewhere, which was not copied/);

    expect(db.transactions).toEqual(['begin', 'rollback']);
    expect(db.tables).toEqual(before);
  });
});

describe('Clone — the copy carries every column it should', () => {
  /**
   * The column guard, executed: each child row is seeded with a distinct value in EVERY settable
   * column of its generated class (read off the class itself, so a column CodeGen adds later is in
   * the list the moment it exists), and the copy must hold the same value — unless the column is
   * one a copy deliberately re-points or mints, listed here with why.
   */
  const NEVER_COPIED: Readonly<Record<string, string>> = {
    ID: 'the copy is a new row with a new primary key',
    FormID: 'the copy belongs to the new form',
    PageID: 're-pointed to the copied page (asserted in the remap specs)',
    QuestionID: 're-pointed to the copied question (asserted in the remap specs)',
    BindingID: 're-pointed to the copied binding (asserted in the remap specs)',
  };

  const CHILDREN = [
    { table: PAGES, entityClass: entities.mjBizAppsFormsFormPageEntity },
    { table: QUESTIONS, entityClass: entities.mjBizAppsFormsFormQuestionEntity },
    { table: OPTIONS, entityClass: entities.mjBizAppsFormsFormQuestionOptionEntity },
    { table: SCREENS, entityClass: entities.mjBizAppsFormsFormScreenEntity },
    { table: BINDINGS, entityClass: entities.mjBizAppsFormsFormEntityBindingEntity },
    { table: AUTOMATIONS, entityClass: entities.mjBizAppsFormsFormAutomationEntity },
  ] as const;

  function settableColumns(entityClass: object): string[] {
    const prototype = (entityClass as { prototype: object }).prototype;
    return Object.entries(Object.getOwnPropertyDescriptors(prototype))
      .filter(([, descriptor]) => typeof descriptor.set === 'function')
      .map(([name]) => name);
  }

  /** A value the remap leaves byte-identical: a score condition names no question. */
  const UNTOUCHED_RULE = rule({ show: { all: [{ source: 'score', op: 'gte', value: 1 }] } });
  const UNTOUCHED_MAPPINGS = rule({ version: 1, fields: [{ targetField: 'Email', source: { kind: 'static', value: 'x' } }] });

  function seededRow(table: string, columns: readonly string[], ids: Record<string, string>): FakeRow {
    const row: FakeRow = { ID: ids[table] };
    for (const column of columns) {
      row[column] = `${table}.${column}`;
    }
    return {
      ...row,
      ID: ids[table],
      FormID: 'form-1',
      PageID: ids[PAGES],
      QuestionID: ids[QUESTIONS],
      BindingID: ids[BINDINGS],
      ConditionalRule: UNTOUCHED_RULE,
      FieldMappings: UNTOUCHED_MAPPINGS,
      Status: 'Active',
    };
  }

  it('reads a real column list off the generated classes', () => {
    // If this found nothing, every assertion below would pass vacuously.
    expect(settableColumns(entities.mjBizAppsFormsFormScreenEntity)).toContain('IsDisqualification');
    expect(settableColumns(entities.mjBizAppsFormsFormPageEntity)).toContain('IsPartialSubmitPoint');
  });

  /**
   * The root row the same way. Its plan-decided columns are excluded with why; the rest are copied
   * by hand in `copyForm`, so a Form column CodeGen adds later fails here until it is carried.
   */
  const FORM_NOT_COPIED: Readonly<Record<string, string>> = {
    ID: 'the copy is a new row with a new primary key',
    Name: 'from the plan: given, or derived (asserted in the name specs)',
    Status: 'always Draft (asserted in "is always Draft")',
    OwnerUserID: 'the caller (asserted in "is always Draft")',
    IsTemplate: 'from the plan: asTemplate',
    TemplateSourceFormID: 'the source on a template, null on a form (asserted in the provenance specs)',
  };

  it('carries every settable column of the Form row it does not decide itself', async () => {
    const columns = settableColumns(entities.mjBizAppsFormsFormEntity);
    expect(columns).toContain('CategoryID');
    const source: FakeRow = { ID: 'form-1' };
    for (const column of columns) {
      source[column] = `form.${column}`;
    }
    db = world({ ...sourceTables(), [FORMS]: [{ ...source, ID: 'form-1', IsTemplate: false, Status: 'Draft' }] });

    const result = await clone(db, { asTemplate: false });

    const copy = rowsOf(db, FORMS).find((f) => f.ID === result.formId);
    const missing = columns.filter((column) => !(column in FORM_NOT_COPIED)).filter((column) => copy?.[column] !== source[column]);
    expect(missing, 'copy it in copyForm, or add it to FORM_NOT_COPIED with the reason').toEqual([]);
  });

  it('carries every settable column of every child row', async () => {
    const ids: Record<string, string> = {
      [PAGES]: 'p1', [QUESTIONS]: 'q1', [OPTIONS]: 'o1', [SCREENS]: 's1', [BINDINGS]: 'b1', [AUTOMATIONS]: 'a1',
    };
    const tables = sourceTables();
    for (const { table, entityClass } of CHILDREN) {
      tables[table] = [seededRow(table, settableColumns(entityClass), ids)];
    }
    db = world(tables);

    const result = await clone(db);

    const copiedQuestionId = ofForm(db, QUESTIONS, result.formId)[0].ID;
    for (const { table, entityClass } of CHILDREN) {
      const source = tables[table][0];
      const copy = table === OPTIONS
        ? rowsOf(db, OPTIONS).find((o) => o.QuestionID === copiedQuestionId)
        : ofForm(db, table, result.formId)[0];
      const missing = settableColumns(entityClass)
        .filter((column) => !(column in NEVER_COPIED))
        .filter((column) => copy?.[column] !== source[column]);
      expect(missing, `${table}: copy it in form-clone.ts, or add it to NEVER_COPIED with the reason`).toEqual([]);
    }
  });
});

describe('Clone — nothing is left behind on failure (DW14)', () => {
  it.each([PAGES, QUESTIONS, OPTIONS, SCREENS, BINDINGS, AUTOMATIONS])(
    'a %s insert that fails leaves no Form row and no child row',
    async (failing) => {
      db = world(sourceTables(), { failSaveWhen: (entity) => (entity === failing ? 'disk full' : false) });
      const before = snapshot(db);

      await expect(clone(db)).rejects.toThrow(/disk full/);

      expect(db.transactions).toEqual(['begin', 'rollback']);
      expect(db.tables).toEqual(before);
      expect(rowsOf(db, FORMS)).toHaveLength(1);
    },
  );

  it('a failed pass-two rewrite rolls back the rows pass one wrote', async () => {
    // The binding's first save still maps q1; the rewrite is the save that names the copy's question.
    db = world(sourceTables(), {
      failSaveWhen: (entity, values) => (entity === BINDINGS && !String(values.FieldMappings).includes('"q1"') ? 'rewrite refused' : false),
    });
    const before = snapshot(db);

    await expect(clone(db)).rejects.toThrow(/rewrite refused/);

    expect(db.tables).toEqual(before);
  });

  it('logs the failure once, naming the source form and the user', async () => {
    db = world(sourceTables(), { failSaveWhen: (entity) => (entity === SCREENS ? 'disk full' : false) });

    await expect(clone(db)).rejects.toThrow();

    expect(logged.filter((m) => m.includes('disk full'))).toEqual([expect.stringMatching(/form-1.*author-1/)]);
  });
});

describe('Clone — refusals', () => {
  it('refuses a source that does not exist, writing nothing', async () => {
    await expect(clone(db, { asTemplate: false }, 'form-missing')).rejects.toThrow(/form-missing does not exist/);
    expect(rowsOf(db, FORMS)).toHaveLength(1);
  });

  it('refuses rather than copy around a gap when a child read fails', async () => {
    db = world(sourceTables(), { failRunViewFor: AUTOMATIONS });

    await expect(clone(db)).rejects.toThrow(/Could not read the form's automations/);
    expect(rowsOf(db, FORMS)).toHaveLength(1);
  });

  it('refuses a provider that cannot hold a transaction', async () => {
    db = world(sourceTables(), { noTransactions: true });

    await expect(clone(db)).rejects.toThrow(/entity transactions/);
  });

  it('refuses a blank source id before touching the database', async () => {
    await expect(clone(db, { asTemplate: false }, '  ')).rejects.toThrow(FormAuthoringError);
    expect(db.transactions).toEqual([]);
  });
});

describe('Clone as a template — the name must tell it apart', () => {
  function withTemplate(name: string): Record<string, FakeRow[]> {
    const tables = sourceTables();
    tables[FORMS] = [...tables[FORMS], formRow({ ID: 'tpl-1', Name: name, IsTemplate: true, Status: 'Draft' })];
    return tables;
  }

  it('refuses a name another template has — trimmed, any case — and writes nothing', async () => {
    db = world(withTemplate('Client Intake'));
    const before = snapshot(db);

    await expect(clone(db, { asTemplate: true, name: '  client intake ' })).rejects.toThrow(
      'A template called “client intake” already exists. Give this one a name that tells them apart.',
    );
    expect(db.tables).toEqual(before);
  });

  it('logs that refusal as a status, not an error', async () => {
    db = world(withTemplate('Client Intake'));

    const error = await clone(db, { asTemplate: true, name: 'Client Intake' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FormAuthoringError);
    expect((error as InstanceType<typeof FormAuthoringError>).fault).toBe(false);
  });

  it('also matches a stored name that carries stray spaces', async () => {
    db = world(withTemplate('  Client Intake  '));

    await expect(clone(db, { asTemplate: true, name: 'client intake' })).rejects.toThrow(/already exists/);
  });

  it('with no name, a form saved as a template keeps the form\'s name', async () => {
    const result = await clone(db, { asTemplate: true });

    expect(rowsOf(db, FORMS).find((f) => f.ID === result.formId)?.Name).toBe('Intake');
  });

  it('with no name, a TEMPLATE copied as a template gets a name of its own instead of colliding with itself', async () => {
    db = world({ ...sourceTables(), [FORMS]: [formRow({ Name: 'Client intake', IsTemplate: true })] });

    const result = await clone(db, { asTemplate: true });

    expect(rowsOf(db, FORMS).find((f) => f.ID === result.formId)).toMatchObject({ Name: 'Client intake (copy)', IsTemplate: true });
  });

  it('a FORM with that name does not block a template', async () => {
    const result = await clone(db, { asTemplate: true, name: 'Intake' });

    expect(rowsOf(db, FORMS).find((f) => f.ID === result.formId)?.Name).toBe('Intake');
  });

  it('a working copy is never name-checked', async () => {
    db = world(withTemplate('Intake copy'));

    await expect(clone(db, { asTemplate: false, name: 'Intake copy' })).resolves.toMatchObject({ pageCount: 2 });
  });

  it('refuses rather than guess when the template names cannot be read', async () => {
    const runView = db.provider.RunView.bind(db.provider);
    vi.spyOn(db.provider, 'RunView').mockImplementation(async (params, user) =>
      params.EntityName === FORMS && String(params.ExtraFilter).includes('IsTemplate')
        ? { Success: false, Results: [], ErrorMessage: 'timeout' } as unknown as Awaited<ReturnType<typeof runView>>
        : runView(params, user),
    );

    await expect(clone(db, { asTemplate: true, name: 'New template' })).rejects.toThrow(/template names could not be read \(timeout\)/);
    expect(rowsOf(db, FORMS)).toHaveLength(1);
  });
});

describe('CreateFromTemplate', () => {
  function withSavedTemplate(): Record<string, FakeRow[]> {
    const tables = sourceTables();
    tables[FORMS] = [formRow({ Name: 'Client intake', IsTemplate: true, Status: 'Draft', TemplateSourceFormID: 'origin' })];
    tables[VERSIONS] = [];
    tables[DISTRIBUTIONS] = [];
    return tables;
  }

  it('from a saved template: a Draft working form named after the template, with no provenance', async () => {
    db = world(withSavedTemplate());

    const result = await FormAuthoringEngine.Instance.CreateFromTemplate({ templateFormId: 'form-1' }, db.provider, AUTHOR);

    expect(rowsOf(db, FORMS).find((f) => f.ID === result.formId)).toMatchObject({
      Name: 'Client intake',
      IsTemplate: false,
      Status: 'Draft',
      TemplateSourceFormID: null,
      OwnerUserID: AUTHOR.ID,
    });
    expect(ofForm(db, QUESTIONS, result.formId)).toHaveLength(2);
    expect(result.warnings).toEqual([]);
    expect(db.transactions).toEqual(['begin', 'commit']);
  });

  it('from a saved template: takes the name it is given', async () => {
    db = world(withSavedTemplate());

    const result = await FormAuthoringEngine.Instance.CreateFromTemplate({ templateFormId: 'form-1' }, db.provider, AUTHOR, { name: 'Spring intake' });

    expect(rowsOf(db, FORMS).find((f) => f.ID === result.formId)?.Name).toBe('Spring intake');
  });

  it('refuses a form that is not a template — CloneForm copies forms', async () => {
    const before = snapshot(db);

    await expect(FormAuthoringEngine.Instance.CreateFromTemplate({ templateFormId: 'form-1' }, db.provider, AUTHOR)).rejects.toThrow(
      /form-1 is not a template/,
    );
    expect(db.tables).toEqual(before);
  });

  it('from a saved template: a child that fails leaves no Form row (DW14)', async () => {
    db = world(withSavedTemplate(), { failSaveWhen: (entity) => (entity === OPTIONS ? 'disk full' : false) });
    const before = snapshot(db);

    await expect(FormAuthoringEngine.Instance.CreateFromTemplate({ templateFormId: 'form-1' }, db.provider, AUTHOR)).rejects.toThrow(/disk full/);
    expect(db.tables).toEqual(before);
  });

  it('from a starter key (any case): the starter blueprint as a Draft form owned by the caller', async () => {
    db = world({ ...sourceTables(), [FORMS]: [], [PAGES]: [], [QUESTIONS]: [], [OPTIONS]: [] });

    const result = await FormAuthoringEngine.Instance.CreateFromTemplate({ templateKey: 'RSVP' }, db.provider, AUTHOR);

    expect(rowsOf(db, FORMS)).toEqual([expect.objectContaining({ ID: result.formId, Name: 'Event RSVP', Status: 'Draft', OwnerUserID: AUTHOR.ID })]);
    expect(rowsOf(db, QUESTIONS).length).toBeGreaterThan(0);
    expect(ofForm(db, VERSIONS, result.formId)).toEqual([]);
  });

  it('from a starter key: takes the name it is given', async () => {
    db = world({ ...sourceTables(), [FORMS]: [] });

    const result = await FormAuthoringEngine.Instance.CreateFromTemplate({ templateKey: 'contact' }, db.provider, AUTHOR, { name: 'Say hello' });

    expect(rowsOf(db, FORMS).find((f) => f.ID === result.formId)?.Name).toBe('Say hello');
  });

  it('from a starter key: a child that fails leaves no Form row (DW14)', async () => {
    db = world({ ...sourceTables(), [FORMS]: [], [PAGES]: [], [QUESTIONS]: [] }, { failSaveWhen: (entity) => (entity === QUESTIONS ? 'disk full' : false) });

    await expect(FormAuthoringEngine.Instance.CreateFromTemplate({ templateKey: 'rsvp' }, db.provider, AUTHOR)).rejects.toThrow(/disk full/);
    expect(rowsOf(db, FORMS)).toEqual([]);
    expect(rowsOf(db, PAGES)).toEqual([]);
  });

  it('refuses an unknown starter key, naming the ones there are', async () => {
    await expect(FormAuthoringEngine.Instance.CreateFromTemplate({ templateKey: 'nope' }, db.provider, AUTHOR)).rejects.toThrow(
      "Unknown template key 'nope'. Known templates: contact, rsvp, nps, lead-capture, application.",
    );
    expect(db.transactions).toEqual([]);
  });
});
