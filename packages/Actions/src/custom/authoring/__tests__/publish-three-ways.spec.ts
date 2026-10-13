/**
 * #303 DW4: the same draft, published three ways, yields the same `DefinitionSnapshot`.
 *
 *  (a) the `Forms.PublishForm` operation, through `ExecuteServer` (Authorize, then the engine);
 *  (b) the `Forms: Generate Form From Brief` Action with `PublishImmediately: true` — the Designer
 *      stubbed to return a fixed blueprint;
 *  (c) `FormPublishingEngine.Publish` directly.
 * For (a) and (c) the draft is built from that same blueprint by `FormAuthoringEngine`, the Builder
 * (b) runs too. Each draft is then ENRICHED at publish time with what a blueprint cannot author —
 * a style with a logo, welcome and ending screens, a visibility rule, a jump to an ending, a page
 * rule, an `EntityBinding` step with its binding, and absolute asset URLs the snapshot must
 * relativise — so the comparison covers every part of the snapshot, not just pages and questions. Each runs in a fresh emulated database (forms-core-entities-server's `forms-world`),
 * with the REAL `FormEntityServer` / `FormVersionEntityServer` over every Form and Form Version row.
 * The snapshots must be byte-identical once ids are replaced by their order of first appearance;
 * a snapshot carries no timestamp.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import {
  ACTIONS,
  AUTHOR,
  AUTOMATIONS,
  BINDINGS,
  FORMS,
  OPTIONS,
  PAGES,
  QUESTIONS,
  SCREENS,
  STYLES,
  VERSIONS,
  automationRow,
  bindingRow,
  draftTables,
  formsWorld,
  rowsOf,
  type FakeProvider,
  type FakeRow,
  type ServerSubclasses,
} from '@mj-biz-apps/forms-core-entities-server/testing';
import { FIXED_BLUEPRINT, STUB_DESIGNER, actionParams } from './authoring-harness';

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

vi.mock('@mj-biz-apps/forms-entities', async (importOriginal) => {
  const { WriteThroughEntityBase } = await import('@mj-biz-apps/forms-core-entities-server/testing');
  return {
    ...(await importOriginal<typeof import('@mj-biz-apps/forms-entities')>()),
    mjBizAppsFormsFormEntity: WriteThroughEntityBase,
    mjBizAppsFormsFormVersionEntity: WriteThroughEntityBase,
  };
});

const {
  buildPublishedAutomations,
  buildPublishedDefinition,
  readStoredFormSettings,
} = await import('@mj-biz-apps/forms-entities');
const {
  FormAuthoringEngine,
  FormEntityServer,
  FormPublishingEngine,
  FormVersionEntityServer,
  PublishFormServerOperation,
} = await import('@mj-biz-apps/forms-core-entities-server');
const { GenerateFormFromBriefAction, setFormDesignerModel } = await import('../generate-form.action');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;

/** A fresh database: no forms, the Action the blueprint names registered, the author may update forms. */
function freshWorld(): FakeProvider {
  const tables: Record<string, FakeRow[]> = Object.fromEntries(Object.keys(draftTables()).map((name) => [name, []]));
  tables[ACTIONS] = [{ ID: 'action-email', Name: 'Forms: Send Confirmation Email' }];
  const db = formsWorld(SUBCLASSES, tables, { updatePermissions: { [FORMS]: true } });
  Metadata.Provider = db.provider; // Authorize reads permissions from the process metadata
  worldOf.set(db.provider, db);
  return db;
}

/** The one Published version's stored snapshot. */
function storedSnapshot(db: FakeProvider): string {
  const published = rowsOf(db, VERSIONS).filter((v) => v.Status === 'Published');
  expect(published).toHaveLength(1);
  return String(published[0].DefinitionSnapshot);
}

/** Every id in the database, replaced by its order of first appearance in the snapshot. */
function withoutIds(snapshot: string, db: FakeProvider): string {
  const ids = Object.values(db.tables).flatMap((rows) => rows.map((row) => row.ID));
  const found = ids
    .map((id) => ({ id, at: snapshot.indexOf(`"${id}"`) }))
    .filter((hit) => hit.at >= 0)
    .sort((a, b) => a.at - b.at);
  let normalised = snapshot;
  found.forEach(({ id }, index) => {
    normalised = normalised.split(`"${id}"`).join(`"<id ${index}>"`);
  });
  return normalised;
}

/** The one row of `table` matching `pick`, or a throw — a fixture that silently matched nothing would prove nothing. */
function rowWhere(db: FakeProvider, table: string, pick: (row: FakeRow) => boolean): FakeRow {
  const row = rowsOf(db, table).find(pick);
  if (!row) {
    throw new Error(`fixture: no ${table} row matched`);
  }
  return row;
}

/**
 * What an author adds in the builder after the blueprint: written straight into the tables of
 * `db`, against the questions and pages the blueprint produced, just before publish reads them.
 */
function enrichDraft(db: FakeProvider, formId: string): void {
  const email = rowWhere(db, QUESTIONS, (q) => q.Prompt === 'Email');
  const count = rowWhere(db, QUESTIONS, (q) => q.Prompt === '+1 count');
  const food = rowWhere(db, PAGES, (p) => p.Title === 'Food');
  const vegan = rowWhere(db, OPTIONS, (o) => o.Label === 'Vegan');
  count.ConditionalRule = JSON.stringify({
    show: { all: [{ questionId: email.ID, op: 'isAnswered' }] },
    jump: [{ when: { all: [{ questionId: count.ID, op: 'greaterThan', value: 5 }] }, target: { kind: 'ending', id: 'end-full' } }],
  });
  food.ConditionalRule = JSON.stringify({ show: { all: [{ questionId: email.ID, op: 'isAnswered' }] } });
  vegan.ImageURL = 'http://localhost:4000/forms/asset/0b5f3c1e-8a2d-4c6f-9e1a-7d3b2c4e5f61';
  rowWhere(db, FORMS, (f) => f.ID === formId).StyleID = 'style-1';
  db.tables[STYLES].push({
    ID: 'style-1',
    CSSVariables: JSON.stringify({ '--mjf-accent': '#123456' }),
    CustomCSS: '.x{}',
    LogoURL: 'http://localhost:4000/forms/asset/0b5f3c1e-8a2d-4c6f-9e1a-7d3b2c4e5f62',
  });
  const screen = (row: Partial<FakeRow> & { ID: string }): FakeRow => ({
    FormID: formId, ScreenType: 'Ending', Title: row.ID, Body: null, ButtonLabel: null, MediaURL: null, RedirectURL: null,
    DisplayOrder: 0, ConditionalRule: null, IsDefault: false, IsDisqualification: false, SocialLinks: null, ...row,
  });
  db.tables[SCREENS].push(
    screen({ ID: 'welcome', ScreenType: 'Welcome', Title: 'Hello', MediaURL: 'http://localhost:4000/forms/asset/0b5f3c1e-8a2d-4c6f-9e1a-7d3b2c4e5f63' }),
    screen({ ID: 'end-full', Title: 'We are full', DisplayOrder: 1, IsDisqualification: true }),
    screen({ ID: 'end-thanks', Title: 'Thanks', DisplayOrder: 2, IsDefault: true, Body: 'See you' }),
  );
  db.tables[BINDINGS].push(
    bindingRow({
      ID: 'bind-1',
      FormID: formId,
      FieldMappings: JSON.stringify({ version: 1, fields: [{ targetField: 'Email', source: { kind: 'question', questionId: email.ID } }] }),
    }),
  );
  db.tables[AUTOMATIONS].push(
    automationRow({ ID: 'auto-bind', FormID: formId, TargetType: 'EntityBinding', ActionID: null, BindingID: 'bind-1', DisplayOrder: 5 }),
  );
}

/** Which emulated database each provider belongs to, so the publish spy can enrich the right one. */
const worldOf = new Map<unknown, FakeProvider>();

async function draftFromBlueprint(db: FakeProvider): Promise<string> {
  const built = await FormAuthoringEngine.Instance.BuildFromBlueprint(FIXED_BLUEPRINT, db.provider, AUTHOR);
  return built.formId;
}

let original: IMetadataProvider | undefined;
beforeEach(() => {
  try {
    original = Metadata.Provider;
  } catch {
    original = undefined;
  }
  setFormDesignerModel(STUB_DESIGNER);
  // Every path publishes through the engine; enrich the draft just before it reads, on every path
  // alike — including (b), where build and publish are one call.
  const publishOriginal = FormPublishingEngine.prototype.Publish;
  vi.spyOn(FormPublishingEngine.Instance, 'Publish').mockImplementation(function (this: unknown, formId, provider, user) {
    const db = worldOf.get(provider);
    if (!db) {
      throw new Error('fixture: publish on a provider no spec world owns');
    }
    enrichDraft(db, formId);
    return publishOriginal.call(FormPublishingEngine.Instance, formId, provider, user);
  });
});
afterEach(() => {
  Metadata.Provider = original as IMetadataProvider;
  vi.restoreAllMocks();
  worldOf.clear();
});

describe('one draft, three ways to publish it (#303 DW4)', () => {
  it('produces byte-identical snapshots apart from ids', async () => {
    // (a) the operation
    const viaOperation = freshWorld();
    const formA = await draftFromBlueprint(viaOperation);
    const opResult = await new PublishFormServerOperation().ExecuteServer(
      { FormID: formA },
      { provider: viaOperation.provider, user: AUTHOR, emitProgress: () => undefined },
    );
    expect(opResult.ResultCode).toBe('SUCCESS');

    // (b) the Action, building and publishing in one go
    const viaAction = freshWorld();
    const params = actionParams(viaAction.provider, AUTHOR, { Brief: 'an RSVP', PublishImmediately: true });
    const actionResult = await new GenerateFormFromBriefAction().Run(params);
    expect(actionResult.Success).toBe(true);

    // (c) the engine
    const viaEngine = freshWorld();
    const formC = await draftFromBlueprint(viaEngine);
    await FormPublishingEngine.Instance.Publish(formC, viaEngine.provider, AUTHOR);

    const a = withoutIds(storedSnapshot(viaOperation), viaOperation);
    const b = withoutIds(storedSnapshot(viaAction), viaAction);
    const c = withoutIds(storedSnapshot(viaEngine), viaEngine);
    expect(b).toBe(a);
    expect(c).toBe(a);
    // Guard against comparing three trivial snapshots: every enriched part is really in there.
    const raw = storedSnapshot(viaOperation);
    const snapshot = JSON.parse(raw);
    expect(snapshot.pages).toHaveLength(2);
    expect(snapshot.pages[1].conditionalRule.show).toBeDefined();
    expect(snapshot.pages[0].questions[1].conditionalRule.jump[0].target).toEqual({ kind: 'ending', id: 'end-full' });
    expect(snapshot.automations.map((x: { targetType: string }) => x.targetType)).toEqual(['Action', 'EntityBinding']);
    expect(snapshot.automations[1].binding.targetEntityName).toBe('MJ_BizApps_Common: People');
    expect(snapshot.welcomeScreen.title).toBe('Hello');
    expect(snapshot.endScreens.map((e: { id: string }) => e.id)).toEqual(['end-full', 'end-thanks']);
    expect(snapshot.styleTokens).toMatchObject({ customCSS: '.x{}', logoURL: '/forms/asset/0b5f3c1e-8a2d-4c6f-9e1a-7d3b2c4e5f62' });
    // Absolute asset URLs were relativised (#270) on every path.
    expect(raw).not.toContain('http://localhost');
    expect(raw).toContain('/forms/asset/0b5f3c1e-8a2d-4c6f-9e1a-7d3b2c4e5f61');
  });

  it('leaves each database in the same state: one form, Published, one Published version 1', async () => {
    for (const publishVia of ['operation', 'action', 'engine'] as const) {
      const db = freshWorld();
      if (publishVia === 'action') {
        await new GenerateFormFromBriefAction().Run(actionParams(db.provider, AUTHOR, { Brief: 'x', PublishImmediately: true }));
      } else {
        const formId = await draftFromBlueprint(db);
        if (publishVia === 'operation') {
          await new PublishFormServerOperation().ExecuteServer({ FormID: formId }, { provider: db.provider, user: AUTHOR, emitProgress: () => undefined });
        } else {
          await FormPublishingEngine.Instance.Publish(formId, db.provider, AUTHOR);
        }
      }
      expect(rowsOf(db, FORMS).map((f) => f.Status), publishVia).toEqual(['Published']);
      expect(rowsOf(db, VERSIONS).map((v) => [v.VersionNumber, v.Status]), publishVia).toEqual([[1, 'Published']]);
    }
  });

  it('the builder\'s snapshot of the same rows (the contracts builder over its tree) is the engine\'s, byte for byte', async () => {
    const db = freshWorld();
    const formId = await draftFromBlueprint(db);
    const { formVersionId } = await FormPublishingEngine.Instance.Publish(formId, db.provider, AUTHOR);

    // The builder's in-memory tree: pages holding their questions holding their options, as
    // `BuilderStateService` loads them, plus the automations and settings publish.service reads.
    const form = rowWhere(db, FORMS, (f) => f.ID === formId);
    const tree = {
      form: form as never,
      pages: rowsOf(db, PAGES).map((page) => ({
        entity: page as never,
        questions: rowsOf(db, QUESTIONS)
          .filter((q) => q.PageID === page.ID)
          .map((q) => ({ entity: q as never, options: rowsOf(db, OPTIONS).filter((o) => o.QuestionID === q.ID) as never[] })),
      })),
      screens: rowsOf(db, SCREENS) as never[],
    };
    const settings = readStoredFormSettings(String(form.Settings));
    expect(settings.ok).toBe(true);
    const automations = buildPublishedAutomations(rowsOf(db, AUTOMATIONS) as never[], rowsOf(db, BINDINGS) as never[]);
    const builderSnapshot = buildPublishedDefinition(
      tree,
      rowWhere(db, STYLES, (st) => st.ID === form.StyleID) as never,
      formVersionId,
      automations,
      undefined,
      settings.ok ? settings.value : undefined,
    );

    expect(JSON.stringify(builderSnapshot)).toBe(storedSnapshot(db));
  });
});
