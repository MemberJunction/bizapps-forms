/**
 * `FormReportingEngine` against a REAL SQL Server provider — what the fake-provider specs cannot prove,
 * because each is a claim about the database or about MJ:
 *  - DW16 on real SQL: the three Approved reporting queries (`metadata/queries/SQL/*.sql`), run through
 *    MJ's `RunQuery` as the system user, produce the same summary as the old browser aggregation over
 *    the same rows read back from the database;
 *  - the queries' run permissions admit the system user, and their Nunjucks parameters bind;
 *  - the list's and the detail's field lists, filters and `ORDER BY … , ID` are valid against the real
 *    views (including `FormAutomationRun.WorkQueueMessageID`), and paging neither repeats nor skips.
 *
 * OPT-IN. Skipped unless `FORMS_INTEGRATION_DB` is set; it needs the sandbox database
 * (`MJ_Forms303_Edge`; connection from the repo `.env`) with this branch's metadata pushed. Run with:
 *
 *   cd packages/CoreEntitiesServer && FORMS_INTEGRATION_DB=1 npx vitest run src/reporting/__tests__/FormReportingEngine.integration.spec.ts
 *
 * It builds its own published form from the parity fixture's pages, inserts the fixture's responses
 * and answers under fresh ids, and deletes every row it wrote in `afterAll`, pass or fail. Two fixture
 * answers are left out here, both covered by the fake-provider parity spec: the file upload (its
 * `FileID` is a foreign key to an `MJ: Files` row the fixture does not create) and the answer to a
 * deleted question (a foreign key to a question row the fixture does not have).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import '../../index.js'; // registers the entity server subclasses the fixture build relies on
import { SetProvider, type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { QueryEngine } from '@memberjunction/core-entities';
import type { FormBlueprint, PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { FormAuthoringEngine } from '../../engines/FormAuthoringEngine.js';
import { FormReportingEngine } from '../../engines/FormReportingEngine.js';
import { FORMS_ENTITY } from '../../shared/entity-names.js';
import { browserReport, expectedFromBrowser, FIXTURE_MATRIX_CELLS } from './browser-parity.js';
import { ANSWERS, DEFINITION, DELETED_QUESTION, FORM_ID, Q, RESPONSES, VERSION_ID, gid, type FixtureAnswer, type FixtureResponse } from './parity-fixture.js';

const ENABLED = Boolean(process.env.FORMS_INTEGRATION_DB);

interface World {
  provider: DatabaseProviderBase;
  system: UserInfo;
  formId: string;
  versionId: string;
  definition: PublishedFormDefinition;
  responseIds: string[];
  close: () => Promise<void>;
}

/** A minimal connection-pool surface, so the spec carries no `mssql` types. */
interface Pool {
  connect(): Promise<Pool>;
  close(): Promise<void>;
}

let world: World | undefined;

/** The parity fixture's pages as a blueprint, so the engine under test builds and publishes the form. */
function fixtureBlueprint(): FormBlueprint {
  return {
    name: `Task 9 reporting fixture ${randomUUID()}`,
    pages: DEFINITION.pages.map((page) => ({
      title: page.title,
      questions: page.questions.map((q) => ({
        type: q.type,
        prompt: q.prompt,
        options: q.options.length ? q.options.map((o) => ({ label: o.label, value: o.value, matrixAxis: o.matrixAxis })) : undefined,
      })),
    })),
  };
}

const sqlText = (value: string | null): string => (value === null ? 'NULL' : `N'${value.replace(/'/g, "''")}'`);
const sqlInstant = (value: Date | null): string => (value === null ? 'NULL' : `'${value.toISOString()}'`);
const sqlNumber = (value: number | null): string => (value === null ? 'NULL' : String(value));
const sqlBit = (value: boolean | null): string => (value === null ? 'NULL' : value ? '1' : '0');

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
    pool: { max: 10 },
  }).connect();
  const provider = new SQLServerDataProvider();
  await provider.Config(new SQLServerProviderConfigData(pool as never, process.env.MJ_CORE_SCHEMA ?? '__mj', 0));
  SetProvider(provider);
  await UserCache.Instance.Refresh(provider);
  const system = UserCache.Instance.GetSystemUser();
  if (!system) {
    throw new Error(`No system user in ${process.env.DB_DATABASE}; the integration spec needs MJ's core data.`);
  }
  // MJAPI loads QueryEngine at startup (`@RegisterForStartup`); `RunQuery` resolves query names
  // through it, so a bare provider has to load it the same way.
  await QueryEngine.Instance.Config(false, system, provider);
  const built = await FormAuthoringEngine.Instance.BuildFromBlueprint(fixtureBlueprint(), provider, system, { publishImmediately: true });
  const version = await provider.RunView<{ ID: string; DefinitionSnapshot: string }>(
    { EntityName: FORMS_ENTITY.FormVersion, ExtraFilter: `FormID='${built.formId}' AND Status='Published'`, Fields: ['ID', 'DefinitionSnapshot'], ResultType: 'simple' },
    system,
  );
  const [published] = version.Results;
  return {
    provider,
    system,
    formId: built.formId,
    versionId: published.ID,
    definition: JSON.parse(published.DefinitionSnapshot) as PublishedFormDefinition,
    responseIds: [],
    close: () => pool.close(),
  };
}

/**
 * Two more Complete responses, here only, whose colour answers differ from the option value `g` by
 * case (`G`) and by a trailing space (`g `). The database's collation is case- and trailing-space-
 * insensitive, so a value-counts query grouping on the TEXT would merge them with `g` — and report
 * whichever spelling came first. The browser compared exactly, and so must the server.
 */
const CASE_VARIANT_RESPONSES: FixtureResponse[] = [9, 10].map((n) => ({
  ...RESPONSES[0],
  ID: gid(1000 + n),
  StartedAt: new Date('2026-09-09T10:00:00Z'),
  SubmittedAt: new Date('2026-09-09T10:02:00Z'),
  AnonymousSessionID: `session-${n}`,
  FormID: FORM_ID,
  FormVersionID: VERSION_ID,
}));
const CASE_VARIANT_ANSWERS: FixtureAnswer[] = [
  { ...ANSWERS[0], ID: gid(6001), ResponseID: gid(1009), QuestionID: Q.colour, TextValue: 'G' },
  { ...ANSWERS[0], ID: gid(6002), ResponseID: gid(1010), QuestionID: Q.colour, TextValue: 'g ' },
];

/** The fixture's rows under this database's ids: questions by prompt, responses and answers fresh. */
function remapFixture(w: World): { responses: FixtureResponse[]; answers: FixtureAnswer[] } {
  const realByPrompt = new Map(w.definition.pages.flatMap((p) => p.questions).map((q) => [q.prompt, q.id]));
  const fixtureQuestions = DEFINITION.pages.flatMap((p) => p.questions);
  const questionId = new Map(fixtureQuestions.map((q) => [q.id, realByPrompt.get(q.prompt) ?? '']));
  const allResponses = [...RESPONSES, ...CASE_VARIANT_RESPONSES];
  const responseId = new Map(allResponses.map((r) => [r.ID, randomUUID().toUpperCase()]));
  const responses = allResponses.map((r) => ({ ...r, ID: responseId.get(r.ID) ?? '', FormID: w.formId, FormVersionID: w.versionId }));
  const answers = [...ANSWERS, ...CASE_VARIANT_ANSWERS].filter((a) => a.QuestionID !== DELETED_QUESTION && a.QuestionID !== Q.upload).map((a) => ({
    ...a,
    ID: randomUUID().toUpperCase(),
    ResponseID: responseId.get(a.ResponseID) ?? '',
    QuestionID: questionId.get(a.QuestionID) ?? '',
  }));
  w.responseIds = responses.map((r) => r.ID);
  return { responses, answers };
}

async function insertFixture(w: World, responses: FixtureResponse[], answers: FixtureAnswer[]): Promise<void> {
  for (const r of responses) {
    await w.provider.ExecuteSQL(
      `INSERT INTO __mj_BizAppsForms.FormResponse (ID, FormID, FormVersionID, Status, StartedAt, SubmittedAt, AnonymousSessionID)
       VALUES ('${r.ID}', '${r.FormID}', '${r.FormVersionID}', '${r.Status}', ${sqlInstant(r.StartedAt)}, ${sqlInstant(r.SubmittedAt)}, ${sqlText(r.AnonymousSessionID)})`,
      undefined,
      undefined,
      w.system,
    );
  }
  for (const a of answers) {
    await w.provider.ExecuteSQL(
      `INSERT INTO __mj_BizAppsForms.FormResponseAnswer (ID, ResponseID, QuestionID, TextValue, NumericValue, DateValue, BooleanValue, JSONValue)
       VALUES ('${a.ID}', '${a.ResponseID}', '${a.QuestionID}', ${sqlText(a.TextValue)}, ${sqlNumber(a.NumericValue)}, ${sqlInstant(a.DateValue)}, ${sqlBit(a.BooleanValue)}, ${sqlText(a.JSONValue)})`,
      undefined,
      undefined,
      w.system,
    );
  }
}

/** The rows as the browser read them: `simple` RunViews over the form's responses and answers. */
async function readBack(w: World): Promise<{ responses: FixtureResponse[]; answers: FixtureAnswer[] }> {
  const [responses, answers] = await w.provider.RunViews(
    [
      { EntityName: FORMS_ENTITY.FormResponse, ExtraFilter: `FormID='${w.formId}'`, ResultType: 'simple', IgnoreMaxRows: true },
      {
        EntityName: FORMS_ENTITY.FormResponseAnswer,
        ExtraFilter: `ResponseID IN (SELECT ID FROM __mj_BizAppsForms.vwFormResponses WHERE FormID='${w.formId}')`,
        ResultType: 'simple',
        IgnoreMaxRows: true,
      },
    ],
    w.system,
  );
  return { responses: responses.Results as FixtureResponse[], answers: answers.Results as FixtureAnswer[] };
}

async function deleteEverything(w: World): Promise<void> {
  const statements = [
    `DELETE a FROM __mj_BizAppsForms.FormResponseAnswer a JOIN __mj_BizAppsForms.FormResponse r ON r.ID = a.ResponseID WHERE r.FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormResponse WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormDistribution WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormVersion WHERE FormID = '${w.formId}'`,
    `DELETE o FROM __mj_BizAppsForms.FormQuestionOption o JOIN __mj_BizAppsForms.FormQuestion q ON q.ID = o.QuestionID WHERE q.FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormQuestion WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormPage WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormScreen WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormAutomation WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.Form WHERE ID = '${w.formId}'`,
  ];
  for (const statement of statements) {
    await w.provider.ExecuteSQL(statement, undefined, undefined, w.system);
  }
}

describe.skipIf(!ENABLED)('FormReportingEngine on SQL Server', () => {
  beforeAll(async () => {
    world = await openWorld();
    const { responses, answers } = remapFixture(world);
    await insertFixture(world, responses, answers);
  }, 120_000);

  afterAll(async () => {
    if (!world) {
      return;
    }
    try {
      await deleteEverything(world);
    } finally {
      await world.close();
    }
  }, 60_000);

  it('DW16 on real SQL: the summary equals the old browser aggregation over the same rows, section by section', async () => {
    const w = world!;
    const rows = await readBack(w);
    const expected = expectedFromBrowser(browserReport(w.definition, rows.responses, rows.answers), FIXTURE_MATRIX_CELLS);

    const summary = await FormReportingEngine.Instance.GetResponseSummary({ formId: w.formId }, w.provider, w.system);

    const { PartialPlusDisqualified, ...headline } = expected.Summary;
    expect(summary.Summary).toMatchObject(headline);
    expect(summary.Summary.PartialResponses + summary.Summary.DisqualifiedResponses).toBe(PartialPlusDisqualified);
    // The real SQL's GUIDs come back upper case; the snapshot's are whatever publish wrote. Compare folded.
    const folded = <T>(value: T): unknown => JSON.parse(JSON.stringify(value).toLowerCase());
    expect(folded(summary.Profile)).toEqual(folded(expected.Profile));
    expect(folded(summary.Questions)).toEqual(folded(expected.Questions));
    expect(folded(summary.OpenText)).toEqual(folded(expected.OpenText));
    expect(folded(summary.Funnel)).toEqual(folded(expected.Funnel));
    expect(summary).toMatchObject({ LabelVersionID: w.versionId, InsightAnswersCapped: false });
    expect(summary.Summary).toMatchObject({ TotalResponses: 7, PartialResponses: 2, DisqualifiedResponses: 1, TypicalCompletionSeconds: 120 });
  });

  it('counts choice values by their exact text: G and "g " are not the option g', async () => {
    const w = world!;

    const summary = await FormReportingEngine.Instance.GetResponseSummary({ formId: w.formId }, w.provider, w.system);

    const colour = summary.Questions.find((c) => c.Prompt === 'Favourite colour');
    expect(colour?.Buckets.map((b) => [b.Label, b.Count])).toEqual([
      ['Other (not an option)', 3],
      ['Green', 2],
      ['Red', 1],
      ['Blue', 0],
    ]);
  });

  it('pages the list on the real view without repeating or skipping, with the count_only total', async () => {
    const w = world!;
    const seen: string[] = [];
    for (let startRow = 0; startRow < 10; startRow += 3) {
      const page = await FormReportingEngine.Instance.ListResponses({ formId: w.formId, startRow, maxRows: 3, includeAnswers: true }, w.provider, w.system);
      expect(page.TotalRowCount).toBe(10);
      seen.push(...page.Rows.map((r) => r.ResponseID.toUpperCase()));
    }

    expect(seen).toHaveLength(10);
    expect(new Set(seen)).toEqual(new Set(w.responseIds));
  });

  it('reads one response’s detail through the real views, WorkQueueMessageID column included', async () => {
    const w = world!;
    const withName = w.responseIds[0];

    const detail = await FormReportingEngine.Instance.GetResponseDetail({ responseId: withName }, w.provider, w.system);

    expect(detail.Response).toMatchObject({ Status: 'Complete', SubmittedAt: '2026-09-01T10:02:00.000Z' });
    expect(detail.Answers.length).toBeGreaterThan(10);
    expect(detail).toMatchObject({ AutomationRuns: [], BindingRecords: [], UnavailableSections: [] });
    expect(detail.LabelFormVersionID.toUpperCase()).toBe(w.versionId.toUpperCase());
  });
});
