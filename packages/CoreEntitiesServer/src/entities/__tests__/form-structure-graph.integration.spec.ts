/**
 * The builder's structural edits, through the path the browser takes, against a REAL SQL Server —
 * DW14 of spec #303, builder half:
 *  - a page with three questions, each with options, is deleted by ONE `MJ.SaveEntityGraph` call
 *    whose payload carries nothing but the page's key — the server re-loads the page, and its
 *    delete cascades through the questions and their options (`FormQuestionEntityServer` loads a
 *    question's options before it deletes it) in one transaction;
 *  - a forced failure later in the same graph leaves EVERYTHING as it was: the page, its
 *    questions and their options all still there, and nothing new written;
 *  - a reorder is one call that rewrites every moved row;
 *  - a new question with its options, inserted above the others, is one call, and the rows the
 *    caller created come back saved (the result the browser adopts);
 *  - a cross-section move rewrites the question's page and both sections' order in one call;
 *  - moving the default ending clears the old one before setting the new one inside the same
 *    transaction, so `UQ_FormScreen_OneDefaultEndingPerForm` never sees two;
 *  - a structural edit writes NONE of the form's own columns from the builder's copy: a rename
 *    committed while the edit was open survives it, and so does an archive done from another tab
 *    (both reverted before fix round 1 of #303 Task 10a; the reviewer's probes, made specs).
 *
 * The graph is built by `FormStructureGraph` — the same module the builder uses — and committed
 * the way the browser commits it: serialized exactly as `BaseEntity` serializes a graph for the
 * wire, and run through `SaveEntityGraphOperation.ExecuteServer`, which rebuilds the records as
 * their SERVER subclasses and saves them. A fake provider cannot prove any of this; the cascade and
 * the rollback are claims about what the database does.
 *
 * OPT-IN. Skipped unless `FORMS_INTEGRATION_DB` is set; needs the sandbox database
 * (`MJ_Forms303_Edge`; connection from the repo `.env`). Run it with:
 *
 *   cd packages/CoreEntitiesServer && FORMS_INTEGRATION_DB=1 npx vitest run src/entities/__tests__/form-structure-graph.integration.spec.ts
 *
 * Every fixture form it builds is deleted in `afterAll`, whether the tests passed or not.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import '../../index.js'; // registers the entity server subclasses the graph save rebuilds rows as
import {
  EntitySaveOptions,
  SaveEntityGraphOperation,
  SetProvider,
  type DatabaseProviderBase,
  type UserInfo,
} from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
  FormStructureGraph,
  type mjBizAppsFormsFormEntity,
  type mjBizAppsFormsFormPageEntity,
  type mjBizAppsFormsFormQuestionEntity,
} from '@mj-biz-apps/forms-entities';
import { FormAuthoringEngine } from '../../engines/FormAuthoringEngine.js';
import { FORMS_ENTITY } from '../../shared/entity-names.js';

const ENABLED = Boolean(process.env.FORMS_INTEGRATION_DB);

interface Pool {
  connect(): Promise<Pool>;
  close(): Promise<void>;
}

interface World {
  provider: DatabaseProviderBase;
  system: UserInfo;
  formIds: string[];
  close: () => Promise<void>;
}

let world: World | undefined;

async function openWorld(): Promise<World> {
  process.loadEnvFile(fileURLToPath(new URL('../../../../../.env', import.meta.url)));
  const sql = createRequire(import.meta.url)('mssql') as { ConnectionPool: new (config: object) => Pool };
  const { SQLServerDataProvider, SQLServerProviderConfigData } = await import('@memberjunction/sqlserver-dataprovider');
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    options: { trustServerCertificate: true, encrypt: false },
    pool: { max: 5 },
  }).connect();
  const provider = new SQLServerDataProvider();
  await provider.Config(new SQLServerProviderConfigData(pool as never, process.env.MJ_CORE_SCHEMA ?? '__mj', 0));
  SetProvider(provider);
  await UserCache.Instance.Refresh(provider);
  const system = UserCache.Instance.GetSystemUser();
  if (!system) {
    throw new Error(`No system user in ${process.env.DB_DATABASE}; the integration spec needs MJ's core data.`);
  }
  return { provider, system, formIds: [], close: () => pool.close() };
}

const choice = (prompt: string) => ({
  type: 'SingleChoice' as const,
  prompt,
  options: [{ label: `${prompt} A` }, { label: `${prompt} B` }],
});

/** A Draft form: page 1 has one question; page 2 has three, each with two options. */
async function buildFixture(w: World): Promise<string> {
  const built = await FormAuthoringEngine.Instance.BuildFromBlueprint(
    {
      name: `#303 structure-graph fixture ${randomUUID()}`,
      pages: [
        { title: 'One', questions: [{ type: 'ShortText', prompt: 'Name' }] },
        { title: 'Two', questions: [choice('Colour'), choice('Size'), choice('Fit')] },
      ],
    },
    w.provider,
    w.system,
  );
  w.formIds.push(built.formId);
  return built.formId;
}

async function count(w: World, sql: string): Promise<number> {
  const [row] = await w.provider.ExecuteSQL<{ n: number }>(sql, undefined, undefined, w.system);
  return row.n;
}

/** What the fixture's page 2 holds right now, straight from the tables. */
async function pageTwoFootprint(w: World, pageId: string): Promise<{ pages: number; questions: number; options: number }> {
  return {
    pages: await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormPage WHERE ID='${pageId}'`),
    questions: await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestion WHERE PageID='${pageId}'`),
    options: await count(
      w,
      `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestionOption o JOIN __mj_BizAppsForms.FormQuestion q ON q.ID = o.QuestionID WHERE q.PageID='${pageId}'`,
    ),
  };
}

/** The builder's view of the form: the record, and its pages and questions as plain view rows. */
async function builderRows(w: World, formId: string) {
  const form = await w.provider.GetEntityObject<mjBizAppsFormsFormEntity>(FORMS_ENTITY.Form, w.system);
  if (!(await form.Load(formId))) {
    throw new Error(`Fixture form ${formId} could not be loaded.`);
  }
  const pages = await w.provider.RunView<mjBizAppsFormsFormPageEntity>(
    { EntityName: FORMS_ENTITY.FormPage, ExtraFilter: `FormID='${formId}'`, OrderBy: 'DisplayOrder', ResultType: 'entity_object' },
    w.system,
  );
  const questions = await w.provider.RunView<mjBizAppsFormsFormQuestionEntity>(
    { EntityName: FORMS_ENTITY.FormQuestion, ExtraFilter: `FormID='${formId}'`, OrderBy: 'DisplayOrder', ResultType: 'entity_object' },
    w.system,
  );
  const [one, two] = pages.Results;
  return {
    form,
    one,
    two,
    onTwo: questions.Results.filter((q) => q.PageID === two.ID),
  };
}

/**
 * Commit the root the way the browser does: one `MJ.SaveEntityGraph` call carrying the root's
 * fields and its serialized companions, executed server-side. Counts the calls, and keeps the
 * server's refusal for the assertion.
 */
function viaTheWire(w: World) {
  const sent = { calls: 0, error: '' };
  const commit = async (root: mjBizAppsFormsFormEntity): Promise<boolean> => {
    sent.calls += 1;
    const result = await new SaveEntityGraphOperation().ExecuteServer(
      {
        EntityName: root.EntityInfo.Name,
        Fields: root.GetAll(),
        Companions: await root.SerializeCompanions(),
        IsExistingRecord: root.IsSaved,
      },
      { provider: w.provider, user: w.system, emitProgress: () => undefined },
    );
    if (result.Success && result.Output?.Success) {
      // What `BaseEntity.applyGraphResult` does in the browser: the root takes the row the server
      // returned, then its collections take the result graph.
      await root.LoadFromData(result.Output.Fields, true);
      await root.DeserializeCompanions(result.Output.Companions ?? [], 'result');
      return true;
    }
    sent.error = result.ErrorMessage ?? result.Output?.ErrorMessage ?? 'no reason';
    return false;
  };
  return { sent, commit };
}

describe.skipIf(!ENABLED)('FormStructureGraph through MJ.SaveEntityGraph on SQL Server (DW14)', () => {
  beforeAll(async () => {
    world = await openWorld();
  }, 120_000);

  afterAll(async () => {
    if (!world) {
      return;
    }
    try {
      for (const formId of world.formIds) {
        for (const statement of [
          `DELETE o FROM __mj_BizAppsForms.FormQuestionOption o JOIN __mj_BizAppsForms.FormQuestion q ON q.ID = o.QuestionID WHERE q.FormID = '${formId}'`,
          `DELETE FROM __mj_BizAppsForms.FormQuestion WHERE FormID = '${formId}'`,
          `DELETE FROM __mj_BizAppsForms.FormPage WHERE FormID = '${formId}'`,
          `DELETE FROM __mj_BizAppsForms.FormScreen WHERE FormID = '${formId}'`,
          `DELETE FROM __mj_BizAppsForms.Form WHERE ID = '${formId}'`,
        ]) {
          await world.provider.ExecuteSQL(statement, undefined, undefined, world.system);
        }
      }
    } finally {
      await world.close();
    }
  }, 60_000);

  it('deletes a page of three questions with options in ONE call, cascading on the server', async () => {
    const w = world!;
    const formId = await buildFixture(w);
    const { form, one, two } = await builderRows(w, formId);
    expect(await pageTwoFootprint(w, two.ID)).toEqual({ pages: 1, questions: 3, options: 6 });

    const graph = await FormStructureGraph.Open(form, w.provider, w.system);
    graph.RemovePage(await graph.StagePage(two));
    const wire = viaTheWire(w);
    const result = await graph.Save(wire.commit);

    expect(wire.sent.error).toBe('');
    expect(result).toEqual({ ok: true });
    expect(wire.sent.calls).toBe(1);
    expect(await pageTwoFootprint(w, two.ID)).toEqual({ pages: 0, questions: 0, options: 0 });
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestion WHERE PageID='${one.ID}'`)).toBe(1);
  }, 60_000);

  it('leaves the page, its questions and their options untouched when a later write in the same graph fails', async () => {
    const w = world!;
    const formId = await buildFixture(w);
    const { form, one, two } = await builderRows(w, formId);

    const graph = await FormStructureGraph.Open(form, w.provider, w.system);
    graph.RemovePage(await graph.StagePage(two));
    // A new question on page 1 that the database must refuse: its FormID names no form.
    const doomed = await graph.AddQuestion(await graph.StagePage(one));
    doomed.QuestionType = 'ShortText';
    doomed.Prompt = 'Refused';
    doomed.IsRequired = false;
    doomed.DisplayOrder = 1;
    doomed.FormID = randomUUID();
    const wire = viaTheWire(w);
    const result = await graph.Save(wire.commit);

    expect(result.ok).toBe(false);
    expect(wire.sent.calls).toBe(1);
    expect(await pageTwoFootprint(w, two.ID)).toEqual({ pages: 1, questions: 3, options: 6 });
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestion WHERE Prompt='Refused' AND PageID='${one.ID}'`)).toBe(0);
  }, 60_000);

  it('rewrites a reordered page in ONE call', async () => {
    const w = world!;
    const formId = await buildFixture(w);
    const { form, two, onTwo } = await builderRows(w, formId);
    const reversed = [...onTwo].reverse();

    const graph = await FormStructureGraph.Open(form, w.provider, w.system);
    const stagedPage = await graph.StagePage(two);
    for (const [index, question] of reversed.entries()) {
      (await graph.StageQuestion(stagedPage, question)).DisplayOrder = index;
    }
    const wire = viaTheWire(w);
    const result = await graph.Save(wire.commit);

    expect(result).toEqual({ ok: true });
    expect(wire.sent.calls).toBe(1);
    const stored = await w.provider.ExecuteSQL<{ ID: string }>(
      `SELECT ID FROM __mj_BizAppsForms.FormQuestion WHERE PageID='${two.ID}' ORDER BY DisplayOrder`,
      undefined,
      undefined,
      w.system,
    );
    expect(stored.map((r) => r.ID.toLowerCase())).toEqual(reversed.map((q) => q.ID.toLowerCase()));
    // The caller's own rows took the stored order back, so their next autosave cannot undo it.
    expect(reversed.map((q) => q.DisplayOrder)).toEqual([0, 1, 2]);
  }, 60_000);

  it('inserts a question with options at the top of a page in ONE call, and hands back saved rows', async () => {
    const w = world!;
    const formId = await buildFixture(w);
    const { form, two, onTwo } = await builderRows(w, formId);

    const graph = await FormStructureGraph.Open(form, w.provider, w.system);
    const stagedPage = await graph.StagePage(two);
    const added = await graph.AddQuestion(stagedPage);
    added.QuestionType = 'SingleChoice';
    added.Prompt = 'Inserted';
    added.IsRequired = false;
    added.DisplayOrder = 0;
    const options = [await graph.AddOption(added), await graph.AddOption(added)];
    options.forEach((option, index) => {
      option.Label = `Inserted ${index}`;
      option.DisplayOrder = index;
      option.IsDefault = false;
    });
    for (const [index, question] of onTwo.entries()) {
      (await graph.StageQuestion(stagedPage, question)).DisplayOrder = index + 1;
    }
    const wire = viaTheWire(w);
    const result = await graph.Save(wire.commit);

    expect(wire.sent.error).toBe('');
    expect(result).toEqual({ ok: true });
    expect(wire.sent.calls).toBe(1);
    expect(added.IsSaved).toBe(true);
    expect(options.every((o) => o.IsSaved)).toBe(true);
    const stored = await w.provider.ExecuteSQL<{ ID: string; Prompt: string }>(
      `SELECT ID, Prompt FROM __mj_BizAppsForms.FormQuestion WHERE PageID='${two.ID}' ORDER BY DisplayOrder`,
      undefined,
      undefined,
      w.system,
    );
    expect(stored.map((r) => r.Prompt)).toEqual(['Inserted', ...onTwo.map((q) => q.Prompt)]);
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestionOption WHERE QuestionID='${added.ID}'`)).toBe(2);
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestion WHERE ID='${added.ID}' AND FormID='${formId}'`)).toBe(1);
  }, 60_000);

  it('moves a question to another section, renumbering both, in ONE call', async () => {
    const w = world!;
    const formId = await buildFixture(w);
    const { form, one, two, onTwo } = await builderRows(w, formId);
    const [moved, ...left] = onTwo;

    const graph = await FormStructureGraph.Open(form, w.provider, w.system);
    const stagedOne = await graph.StagePage(one);
    (await graph.StageQuestion(stagedOne, moved)).DisplayOrder = 1;
    const stagedTwo = await graph.StagePage(two);
    for (const [index, question] of left.entries()) {
      (await graph.StageQuestion(stagedTwo, question)).DisplayOrder = index;
    }
    const wire = viaTheWire(w);
    const result = await graph.Save(wire.commit);

    expect(result).toEqual({ ok: true });
    expect(wire.sent.calls).toBe(1);
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestion WHERE ID='${moved.ID}' AND PageID='${one.ID}' AND DisplayOrder=1`)).toBe(1);
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestionOption WHERE QuestionID='${moved.ID}'`)).toBe(2);
    expect(moved.PageID?.toLowerCase()).toBe(one.ID.toLowerCase());
  }, 60_000);

  it('moves the default ending in ONE call without tripping the one-default index', async () => {
    const w = world!;
    const formId = await buildFixture(w);
    const { form } = await builderRows(w, formId);

    // Two endings, the first the default — written through a graph too.
    const setup = await FormStructureGraph.Open(form, w.provider, w.system);
    const first = await setup.AddScreen();
    const second = await setup.AddScreen();
    for (const [screen, order, isDefault] of [[first, 0, true], [second, 1, false]] as const) {
      screen.ScreenType = 'Ending';
      screen.Title = `Ending ${order}`;
      screen.DisplayOrder = order;
      screen.IsDefault = isDefault;
    }
    expect(await setup.Save(viaTheWire(w).commit)).toEqual({ ok: true });
    await form.Load(formId);

    const move = await FormStructureGraph.Open(form, w.provider, w.system);
    (await move.StageScreen(first)).IsDefault = false;
    (await move.StageScreen(second)).IsDefault = true;
    const wire = viaTheWire(w);
    const result = await move.Save(wire.commit);

    expect(wire.sent.error).toBe('');
    expect(result).toEqual({ ok: true });
    expect(wire.sent.calls).toBe(1);
    const defaults = await w.provider.ExecuteSQL<{ ID: string }>(
      `SELECT ID FROM __mj_BizAppsForms.FormScreen WHERE FormID='${formId}' AND ScreenType='Ending' AND IsDefault=1`,
      undefined,
      undefined,
      w.system,
    );
    expect(defaults.map((r) => r.ID.toLowerCase())).toEqual([second.ID.toLowerCase()]);
    expect([first.IsDefault, second.IsDefault]).toEqual([false, true]);
  }, 60_000);

  it("keeps a rename committed while the structural edit was open — the edit sends none of the form's columns", async () => {
    const w = world!;
    const formId = await buildFixture(w);
    const { form, one } = await builderRows(w, formId);

    const graph = await FormStructureGraph.Open(form, w.provider, w.system);
    // The rename lands while the structural edit is being staged.
    const elsewhere = await w.provider.GetEntityObject<mjBizAppsFormsFormEntity>(FORMS_ENTITY.Form, w.system);
    await elsewhere.Load(formId);
    elsewhere.Name = 'Renamed by the author';
    const opts = new EntitySaveOptions();
    opts.SkipRelatedCollections = true;
    expect(await elsewhere.Save(opts)).toBe(true);
    const added = await graph.AddQuestion(await graph.StagePage(one));
    added.QuestionType = 'ShortText';
    added.Prompt = 'Added';
    added.IsRequired = false;
    added.DisplayOrder = 1;
    const result = await graph.Save(viaTheWire(w).commit);

    expect(result).toEqual({ ok: true });
    const [row] = await w.provider.ExecuteSQL<{ Name: string }>(`SELECT Name FROM __mj_BizAppsForms.Form WHERE ID='${formId}'`, undefined, undefined, w.system);
    expect(row.Name).toBe('Renamed by the author');
    // ...and the builder's record took the stored name back rather than keeping its stale one.
    expect(form.Name).toBe('Renamed by the author');
  }, 60_000);

  it('keeps an archive done from another tab — the edit does not put the form back to Draft', async () => {
    const w = world!;
    const formId = await buildFixture(w);
    const { form, one } = await builderRows(w, formId);
    const other = await w.provider.GetEntityObject<mjBizAppsFormsFormEntity>(FORMS_ENTITY.Form, w.system);
    await other.Load(formId);
    other.Status = 'Closed';
    expect(await other.Save()).toBe(true);

    const graph = await FormStructureGraph.Open(form, w.provider, w.system);
    const added = await graph.AddQuestion(await graph.StagePage(one));
    added.QuestionType = 'ShortText';
    added.Prompt = 'Added';
    added.IsRequired = false;
    added.DisplayOrder = 1;
    const result = await graph.Save(viaTheWire(w).commit);

    expect(result).toEqual({ ok: true });
    const [row] = await w.provider.ExecuteSQL<{ Status: string }>(`SELECT Status FROM __mj_BizAppsForms.Form WHERE ID='${formId}'`, undefined, undefined, w.system);
    expect(row.Status).toBe('Closed');
    expect(form.Status).toBe('Closed');
  }, 60_000);

  it('a page title edited elsewhere survives a reorder of that page', async () => {
    const w = world!;
    const formId = await buildFixture(w);
    const { form, two, onTwo } = await builderRows(w, formId);
    await w.provider.ExecuteSQL(`UPDATE __mj_BizAppsForms.FormPage SET Title='Retitled elsewhere' WHERE ID='${two.ID}'`, undefined, undefined, w.system);

    const graph = await FormStructureGraph.Open(form, w.provider, w.system);
    const stagedPage = await graph.StagePage(two);
    for (const [index, question] of [...onTwo].reverse().entries()) {
      (await graph.StageQuestion(stagedPage, question)).DisplayOrder = index;
    }
    expect(await graph.Save(viaTheWire(w).commit)).toEqual({ ok: true });

    const [row] = await w.provider.ExecuteSQL<{ Title: string }>(`SELECT Title FROM __mj_BizAppsForms.FormPage WHERE ID='${two.ID}'`, undefined, undefined, w.system);
    expect(row.Title).toBe('Retitled elsewhere');
    expect(two.Title).toBe('Retitled elsewhere');
  }, 60_000);

  it('Forms.DeleteTemplate removes a template and its whole tree in one transaction (fix round 1)', async () => {
    const w = world!;
    const formId = await buildFixture(w);
    const copy = await FormAuthoringEngine.Instance.Clone(formId, w.provider, w.system, { asTemplate: true, name: `#303 template ${randomUUID()}` });
    w.formIds.push(copy.formId);
    const templateId = copy.formId;
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestion WHERE FormID='${templateId}'`)).toBe(4);

    const deleted = await FormAuthoringEngine.Instance.DeleteTemplate(templateId, w.provider, w.system);

    expect(deleted).toMatchObject({ pageCount: 2, questionCount: 4, optionCount: 6 });
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.Form WHERE ID='${templateId}'`)).toBe(0);
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestion WHERE FormID='${templateId}'`)).toBe(0);
    // The form it was saved from is untouched.
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestion WHERE FormID='${formId}'`)).toBe(4);
  }, 60_000);

  it('Forms.DeleteTemplate refuses a working form and deletes nothing', async () => {
    const w = world!;
    const formId = await buildFixture(w);

    await expect(FormAuthoringEngine.Instance.DeleteTemplate(formId, w.provider, w.system)).rejects.toThrow(/is a form, not a template/);
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestion WHERE FormID='${formId}'`)).toBe(4);
  }, 60_000);
});
