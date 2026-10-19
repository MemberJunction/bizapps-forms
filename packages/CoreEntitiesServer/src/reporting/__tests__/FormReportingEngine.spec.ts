/**
 * `FormReportingEngine` against the emulated database: who each read runs as, what each method
 * refuses, how the list pages, and what the detail carries. The summary's figures are held to the old
 * browser aggregation by `FormReportingEngine.parity.spec.ts`; this pins the engine around them.
 */
import { describe, expect, it, vi } from 'vitest';
import { LogError } from '@memberjunction/core';
import { MAX_RESPONSE_PAGE_SIZE } from '@mj-biz-apps/forms-entities';
import { FormReportingEngine, ROW_RESTRICTED_SUMMARY_MESSAGE, SUMMARY_NOT_AVAILABLE_MESSAGE } from '../../engines/FormReportingEngine.js';
import { FormReportingError } from '../reporting-errors.js';
import { REPORT_QUERY } from '../report-queries.js';
import { fakeEntityId, makeDefinition, makeVersion, type FakeProvider } from '../../testing/index.js';
import { ANSWERS, DEFINITION, FORM_ID, Q, RESPONSES, VERSION_ID, gid } from './parity-fixture.js';
import { ANSWERS as ANSWER_TABLE, READER, RESPONSES as RESPONSE_TABLE, RUNS, SYSTEM, UPLOADS, VERSIONS, reportingWorld, type ReportingFixture } from './reporting-world.js';

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

const engine = FormReportingEngine.Instance;
const OTHER_FORM = gid(3);
const OTHER_VERSION = gid(4);
const RETIRED_VERSION = gid(5);

function version(id: string, formId: string, versionNumber: number, status: string, snapshot: string | null = JSON.stringify({ ...DEFINITION, formVersionId: id })) {
  return { ...makeVersion(DEFINITION), ID: id, FormID: formId, VersionNumber: versionNumber, Status: status, DefinitionSnapshot: snapshot };
}

function fixture(overrides: Partial<ReportingFixture> = {}): ReportingFixture {
  return {
    forms: [
      { ID: FORM_ID, Name: 'Parity fixture', Status: 'Published' },
      { ID: OTHER_FORM, Name: 'Another form', Status: 'Draft' },
    ],
    versions: [version(VERSION_ID, FORM_ID, 2, 'Published'), version(RETIRED_VERSION, FORM_ID, 1, 'Retired'), version(OTHER_VERSION, OTHER_FORM, 1, 'Published')],
    responses: RESPONSES.map((r) => ({ ...r })),
    answers: ANSWERS.map((a) => ({ ...a })),
    ...overrides,
  };
}

async function refusal(work: Promise<unknown>): Promise<FormReportingError> {
  const err = await work.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(err instanceof FormReportingError)) {
    throw new Error(`expected a FormReportingError, got ${String(err)}`);
  }
  return err;
}

const usersOf = (db: FakeProvider, entityName: string) => db.viewCalls.filter((c) => c.params.EntityName === entityName).map((c) => c.user);

describe('GetResponseSummary', () => {
  it('runs every query and the answer read as the SYSTEM user, and reads the form and its labels as the caller', async () => {
    const db = reportingWorld(fixture());

    await engine.GetResponseSummary({ formId: FORM_ID }, db.provider, READER, { systemUser: SYSTEM });

    expect(db.queryCalls.map((c) => [c.params.QueryName, c.user])).toEqual([
      [REPORT_QUERY.CompletionStats, SYSTEM],
      [REPORT_QUERY.ValueCounts, SYSTEM],
      [REPORT_QUERY.FunnelReach, SYSTEM],
    ]);
    expect(db.queryCalls.every((c) => JSON.stringify(c.params.Parameters) === JSON.stringify({ FormID: FORM_ID }))).toBe(true);
    expect(new Set(usersOf(db, ANSWER_TABLE))).toEqual(new Set([SYSTEM]));
    expect(new Set(usersOf(db, VERSIONS))).toEqual(new Set([READER]));
  });

  it('reads only the Complete responses’ answers to profiled, written and Matrix questions, in bounded pages', async () => {
    const db = reportingWorld(fixture());

    await engine.GetResponseSummary({ formId: FORM_ID }, db.provider, READER, { systemUser: SYSTEM });

    const reads = db.viewCalls.filter((c) => c.params.EntityName === ANSWER_TABLE && c.params.ResultType === 'simple');
    expect(reads).toHaveLength(1);
    const filter = String(reads[0].params.ExtraFilter);
    for (const id of [Q.name, Q.email, Q.phone, Q.contact, Q.address, Q.matrix, Q.essay, Q.upload]) {
      expect(filter).toContain(id);
    }
    for (const id of [Q.colour, Q.nps, Q.yesno, Q.date]) {
      expect(filter).not.toContain(id);
    }
    expect(filter).toContain("Status='Complete'");
    expect(reads[0].params).toMatchObject({ OrderBy: 'ID', AfterKey: undefined });
    expect(reads[0].params.MaxRows).toBeLessThanOrEqual(5000);
  });

  it('narrows the queries, the answers and the labels to a named version', async () => {
    const db = reportingWorld(fixture());

    const summary = await engine.GetResponseSummary({ formId: FORM_ID, formVersionId: RETIRED_VERSION }, db.provider, READER, { systemUser: SYSTEM });

    expect(summary.LabelVersionID).toBe(RETIRED_VERSION);
    expect(db.queryCalls.every((c) => (c.params.Parameters as Record<string, unknown>).FormVersionID === RETIRED_VERSION)).toBe(true);
    // Every fixture response is pinned to the Published version, so the retired one has none.
    expect(summary.Summary.TotalResponses).toBe(0);
  });

  it('reports a never-published form: real headline, no labels, no charts, no funnel', async () => {
    const db = reportingWorld(fixture({ versions: [] }));

    const summary = await engine.GetResponseSummary({ formId: FORM_ID }, db.provider, READER, { systemUser: SYSTEM });

    expect(summary).toMatchObject({ LabelVersionID: null, Questions: [], OpenText: [], Funnel: [], Profile: { IsEmpty: true } });
    expect(summary.Summary.TotalResponses).toBe(5);
  });

  it.each([
    [{ formId: 'not-a-guid' }, 'The form id must be a form ID.'],
    [{ formId: gid(404) }, `Form ${gid(404)} was not found.`],
    [{ formId: FORM_ID, formVersionId: OTHER_VERSION }, `Form version ${OTHER_VERSION} is not a version of form ${FORM_ID}.`],
  ])('refuses %j before running any query', async (request, message) => {
    const db = reportingWorld(fixture());

    const err = await refusal(engine.GetResponseSummary(request, db.provider, READER, { systemUser: SYSTEM }));

    expect(err).toMatchObject({ message, fault: false });
    expect(db.queryCalls).toEqual([]);
  });

  it('turns a failed query into a fixed message, with the provider text kept for the log', async () => {
    const db = reportingWorld(fixture(), { queries: { [REPORT_QUERY.ValueCounts]: { error: "Invalid column name 'Secret' in SELECT ... FROM __mj_BizAppsForms" } } });

    const err = await refusal(engine.GetResponseSummary({ formId: FORM_ID }, db.provider, READER, { systemUser: SYSTEM }));

    expect(err.fault).toBe(true);
    expect(err.message).toBe(`The '${REPORT_QUERY.ValueCounts}' query failed for form ${FORM_ID}.`);
    expect(err.message).not.toContain('Secret');
    expect(err.logDetail).toContain('Secret');
    expect(vi.mocked(LogError).mock.calls.some(([line]) => String(line).includes('Secret'))).toBe(true);
  });

  it('refuses a row the query returns in the wrong shape rather than charting NaN', async () => {
    const db = reportingWorld(fixture(), { queries: { [REPORT_QUERY.CompletionStats]: () => [{ CompleteCount: 'many' }] } });

    const err = await refusal(engine.GetResponseSummary({ formId: FORM_ID }, db.provider, READER, { systemUser: SYSTEM }));

    expect(err).toMatchObject({ fault: true, message: `The '${REPORT_QUERY.CompletionStats}' query returned a row the report cannot read.` });
  });

  it('refuses to build a report on a published snapshot that will not parse', async () => {
    const db = reportingWorld(fixture({ versions: [version(VERSION_ID, FORM_ID, 2, 'Published', '{"pages": "not pages"}')] }));

    const err = await refusal(engine.GetResponseSummary({ formId: FORM_ID }, db.provider, READER, { systemUser: SYSTEM }));

    expect(err).toMatchObject({ fault: true, message: `The published definition of form version ${VERSION_ID} could not be read.` });
  });
});

describe('GetResponseSummary — who may have their summary computed as the system user', () => {
  it.each([[RESPONSE_TABLE], [ANSWER_TABLE]])('refuses a caller whose reads of %s carry a row filter, before any query', async (entity) => {
    const db = reportingWorld(fixture(), { rowFilters: { [entity]: "RespondentPersonID = 'p1'" } });

    const err = await refusal(engine.GetResponseSummary({ formId: FORM_ID }, db.provider, READER, { systemUser: SYSTEM }));

    expect(err).toMatchObject({ fault: false, message: ROW_RESTRICTED_SUMMARY_MESSAGE });
    expect(err.logDetail).toContain(entity);
    expect(err.message).not.toContain('p1');
    expect(db.queryCalls).toEqual([]);
    expect(db.viewCalls.filter((c) => c.user === SYSTEM)).toEqual([]);
  });

  it('fails closed when a row filter cannot be read, or the response entities are not in the metadata', async () => {
    const db = reportingWorld(fixture());
    const throwing = Object.assign(Object.create(db.provider) as typeof db.provider, {
      EntityByName: (name: string) =>
        name === ANSWER_TABLE
          ? { ...db.provider.EntityByName(name), GetUserPermisions: db.provider.EntityByName(name)?.GetUserPermisions, GetEffectiveRowFilterWhereClause: () => { throw new Error('filter metadata unloaded'); } }
          : db.provider.EntityByName(name),
    });
    const missing = Object.assign(Object.create(db.provider) as typeof db.provider, {
      EntityByName: (name: string) => (name === RESPONSE_TABLE ? undefined : db.provider.EntityByName(name)),
    });

    expect(await refusal(engine.GetResponseSummary({ formId: FORM_ID }, throwing, READER, { systemUser: SYSTEM }))).toMatchObject({
      fault: false,
      message: ROW_RESTRICTED_SUMMARY_MESSAGE,
      logDetail: expect.stringContaining('filter metadata unloaded'),
    });
    // A missing entity is refused by the reading rule, which runs first.
    expect(await refusal(engine.GetResponseSummary({ formId: FORM_ID }, missing, READER, { systemUser: SYSTEM }))).toMatchObject({
      fault: false,
      message: SUMMARY_NOT_AVAILABLE_MESSAGE,
    });
    expect(db.queryCalls).toEqual([]);
  });

  it('applies the reading rule itself, so an in-process caller cannot skip the operation’s Authorize', async () => {
    const db = reportingWorld(fixture());
    const respondent = { ...READER, MagicLinkScope: { ResourceID: gid(77) } } as unknown as typeof READER;

    const err = await refusal(engine.GetResponseSummary({ formId: FORM_ID }, db.provider, respondent, { systemUser: SYSTEM }));

    expect(err).toMatchObject({ fault: false, message: SUMMARY_NOT_AVAILABLE_MESSAGE });
    expect(err.logDetail).toMatch(/magic-link/);
    expect(db.queryCalls).toEqual([]);
  });
});

describe('ListResponses', () => {
  const base = { formId: FORM_ID, startRow: 0, maxRows: 3, includeAnswers: false };

  it('returns one page, newest first, with the total across pages from a count_only read, as the caller', async () => {
    const db = reportingWorld(fixture());

    const page = await engine.ListResponses({ ...base, status: 'Complete' }, db.provider, READER);

    expect(page.TotalRowCount).toBe(5);
    expect(page.Rows.map((r) => r.ResponseID)).toEqual([gid(1005), gid(1004), gid(1003)]);
    expect(page.LabelVersionID).toBe(VERSION_ID);
    expect(page.DefinitionJSON).toBeUndefined();
    expect(page.Rows[0].Answers).toBeUndefined();
    expect(db.viewCalls.filter((c) => c.params.EntityName === RESPONSE_TABLE).map((c) => c.params.ResultType)).toEqual(['count_only', 'simple']);
    expect(new Set(db.viewCalls.map((c) => c.user))).toEqual(new Set([READER]));
    expect(db.queryCalls).toEqual([]);
  });

  it('pages on with StartRow, in an order that ends on ID so ties never repeat or skip a row', async () => {
    const db = reportingWorld(fixture());

    const second = await engine.ListResponses({ ...base, status: 'Complete', startRow: 3 }, db.provider, READER);

    expect(second.Rows.map((r) => r.ResponseID)).toEqual([gid(1002), gid(1001)]);
    const read = db.viewCalls.find((c) => c.params.EntityName === RESPONSE_TABLE && c.params.ResultType === 'simple');
    expect(read?.params).toMatchObject({ OrderBy: 'SubmittedAt DESC, ID', StartRow: 3, MaxRows: 3 });
  });

  it('ends every order on ID, the ascending one the export pages by included — so tied timestamps never repeat or skip a row', async () => {
    const db = reportingWorld(fixture());

    for (const orderBy of ['SubmittedAt ASC', 'SubmittedAt DESC', 'StartedAt ASC', 'StartedAt DESC'] as const) {
      await engine.ListResponses({ ...base, orderBy }, db.provider, READER);
    }

    const orders = db.viewCalls.filter((c) => c.params.EntityName === RESPONSE_TABLE && c.params.ResultType === 'simple').map((c) => c.params.OrderBy);
    expect(orders).toEqual(['SubmittedAt ASC, ID', 'SubmittedAt DESC, ID', 'StartedAt ASC, ID', 'StartedAt DESC, ID']);
  });

  it('lowers a page size above the cap to the cap', async () => {
    const db = reportingWorld(fixture());

    await engine.ListResponses({ ...base, maxRows: 10_000 }, db.provider, READER);

    const read = db.viewCalls.find((c) => c.params.EntityName === RESPONSE_TABLE && c.params.ResultType === 'simple');
    expect(read?.params.MaxRows).toBe(MAX_RESPONSE_PAGE_SIZE);
  });

  it('derives who responded and how much they answered, from the page’s own answers', async () => {
    const db = reportingWorld(fixture());

    const page = await engine.ListResponses({ ...base, maxRows: 10, orderBy: 'StartedAt ASC' }, db.provider, READER);
    const byId = new Map(page.Rows.map((r) => [r.ResponseID, r]));

    expect(page.TotalRowCount).toBe(8);
    expect(byId.get(gid(1001))).toMatchObject({ Respondent: 'Ada Lovelace', Status: 'Complete', AnsweredCount: 16, SubmittedAt: '2026-09-01T10:02:00.000Z' });
    expect(byId.get(gid(1003))).toMatchObject({ Respondent: 'Ada@Example.org' });
    expect(byId.get(gid(1004))).toMatchObject({ Respondent: 'Anonymous' });
    expect(byId.get(gid(1006))).toMatchObject({ Status: 'Partial', SubmittedAt: null });
  });

  it('attaches stored answers and the Published definition for the export', async () => {
    const db = reportingWorld(fixture());

    const page = await engine.ListResponses({ ...base, status: 'Complete', startRow: 4, includeAnswers: true }, db.provider, READER);

    expect(page.Rows.map((r) => r.ResponseID)).toEqual([gid(1001)]);
    expect(page.Rows[0].Answers).toHaveLength(16);
    expect(page.Rows[0].Answers?.find((a) => a.QuestionID === Q.date)).toMatchObject({ DateValue: '2026-09-01T00:00:00.000Z', TextValue: null });
    expect(JSON.parse(page.DefinitionJSON ?? '{}')).toMatchObject({ formVersionId: VERSION_ID });
  });

  it('labels rows and the export from the requested version when one is named', async () => {
    const db = reportingWorld(fixture());

    const page = await engine.ListResponses({ ...base, formVersionId: RETIRED_VERSION, includeAnswers: true }, db.provider, READER);

    expect(page.LabelVersionID).toBe(RETIRED_VERSION);
    expect(JSON.parse(page.DefinitionJSON ?? '{}')).toMatchObject({ formVersionId: RETIRED_VERSION });
  });

  it('refuses a named version of another form', async () => {
    const db = reportingWorld(fixture());

    expect(await refusal(engine.ListResponses({ ...base, formVersionId: OTHER_VERSION }, db.provider, READER))).toMatchObject({
      message: `Form version ${OTHER_VERSION} is not a version of form ${FORM_ID}.`,
    });
  });

  it('narrows to a version and a status with the filter, never with caller text', async () => {
    const db = reportingWorld(fixture());

    await engine.ListResponses({ ...base, formVersionId: VERSION_ID, status: 'Disqualified' }, db.provider, READER);

    const read = db.viewCalls.find((c) => c.params.EntityName === RESPONSE_TABLE && c.params.ResultType === 'simple');
    expect(read?.params.ExtraFilter).toBe(`FormID='${FORM_ID}' AND FormVersionID='${VERSION_ID}' AND Status='Disqualified'`);
  });

  it.each([
    [{ startRow: -1 }, 'The first row must be a whole number of at least 0.'],
    [{ maxRows: 0 }, 'The page size must be a whole number of at least 1.'],
    [{ maxRows: 2.5 }, 'The page size must be a whole number of at least 1.'],
    [{ status: 'Deleted' }, 'The status must be one of Complete, Disqualified, Partial.'],
    [{ orderBy: 'ID; DROP TABLE x' }, 'The order must be one of'],
    [{ formId: "x' OR 1=1 --" }, 'The form id must be a form ID.'],
  ])('refuses %j before reading anything', async (override, message) => {
    const db = reportingWorld(fixture());

    const err = await refusal(engine.ListResponses({ ...base, ...override } as never, db.provider, READER));

    expect(err.message).toContain(message);
    expect(db.viewCalls).toEqual([]);
  });
});

describe('GetResponseDetail', () => {
  const R1 = gid(1001);
  const TARGET_ENTITY = 'MJ: Contacts';
  const detailFixture = (): ReportingFixture =>
    fixture({
      runs: [
        {
          ID: gid(8001), FormResponseID: R1, FormAutomationID: gid(8100), FormAutomation: 'Create contact', Status: 'Succeeded', AttemptCount: 2,
          FormAutomationEventID: gid(8200), StartedAt: new Date('2026-09-01T10:02:01Z'), CompletedAt: new Date('2026-09-01T10:02:02Z'),
          ErrorMessage: null, OutputSummary: '{"ok":true}', ActionExecutionLogID: null, AIAgentRunID: null, __mj_CreatedAt: 1,
        },
      ],
      ledger: [
        { ID: gid(8301), FormResponseID: R1, BindingID: gid(8400), Binding: 'Contact', TargetEntityID: fakeEntityId(TARGET_ENTITY), TargetRecordID: gid(8500), Outcome: 'Created', WrittenFields: '["Email"]', __mj_CreatedAt: 1 },
        { ID: gid(8302), FormResponseID: R1, BindingID: gid(8400), Binding: 'Contact', TargetEntityID: gid(8999), TargetRecordID: null, Outcome: 'Skipped', WrittenFields: null, __mj_CreatedAt: 2 },
      ],
      uploads: [{ ID: gid(8601), FileID: gid(9001), FileName: 'cv.pdf', ContentType: 'application/pdf', SizeBytes: 1024, Status: 'Active' }],
    });

  it('returns the response, its answers, uploads, runs with their outbox event, and resolved binding targets', async () => {
    const db = reportingWorld(detailFixture());

    const detail = await engine.GetResponseDetail({ responseId: R1 }, db.provider, READER);

    expect(detail.Response).toEqual({
      ID: R1, FormID: FORM_ID, FormVersionID: VERSION_ID, Status: 'Complete', StartedAt: '2026-09-01T10:00:00.000Z',
      SubmittedAt: '2026-09-01T10:02:00.000Z', RespondentPersonID: null, RespondentPerson: null,
    });
    expect(detail.Answers).toHaveLength(16);
    expect(detail.Uploads).toEqual([{ ID: gid(8601), FileID: gid(9001), FileName: 'cv.pdf', ContentType: 'application/pdf', SizeBytes: 1024, Status: 'Active' }]);
    expect(detail.AutomationRuns).toEqual([
      {
        ID: gid(8001), FormAutomationID: gid(8100), FormAutomation: 'Create contact', Status: 'Succeeded', AttemptCount: 2, FormAutomationEventID: gid(8200),
        StartedAt: '2026-09-01T10:02:01.000Z', CompletedAt: '2026-09-01T10:02:02.000Z', ErrorMessage: null, OutputSummary: '{"ok":true}',
        ActionExecutionLogID: null, AIAgentRunID: null,
      },
    ]);
    expect(detail.BindingRecords.map((b) => [b.Outcome, b.TargetEntityName])).toEqual([
      ['Created', TARGET_ENTITY],
      ['Skipped', null],
    ]);
    expect(detail).toMatchObject({ LabelFormVersionID: VERSION_ID, UnavailableSections: [] });
    expect(JSON.parse(detail.DefinitionJSON ?? '{}')).toMatchObject({ formVersionId: VERSION_ID });
    expect(new Set(db.viewCalls.map((c) => c.user))).toEqual(new Set([READER]));
    expect(db.viewCalls.find((c) => c.params.EntityName === RUNS)?.params.Fields).toContain('FormAutomationEventID');
  });

  it('reports a satellite section it may not read as unavailable, logged, and still returns the response', async () => {
    const db = reportingWorld(detailFixture(), { failRunViewFor: RUNS });

    const detail = await engine.GetResponseDetail({ responseId: R1 }, db.provider, READER);

    expect(detail.UnavailableSections).toEqual(['automation runs']);
    expect(detail.AutomationRuns).toEqual([]);
    expect(detail.Answers).toHaveLength(16);
    expect(vi.mocked(LogError).mock.calls.some(([line]) => String(line).includes(`automation runs for response ${R1}`))).toBe(true);
  });

  it('skips the uploads read when no answer holds a file', async () => {
    const db = reportingWorld(detailFixture());

    await engine.GetResponseDetail({ responseId: gid(1002) }, db.provider, READER);

    expect(db.viewCalls.some((c) => c.params.EntityName === UPLOADS)).toBe(false);
  });

  it('labels from a named version of the same form', async () => {
    const db = reportingWorld(detailFixture());

    const detail = await engine.GetResponseDetail({ responseId: R1, labelFormVersionId: RETIRED_VERSION }, db.provider, READER);

    expect(detail.LabelFormVersionID).toBe(RETIRED_VERSION);
  });

  it.each([
    [{ responseId: gid(404) }, `Response ${gid(404)} was not found.`],
    [{ responseId: R1, labelFormVersionId: OTHER_VERSION }, `Form version ${OTHER_VERSION} is not a version of the form response ${R1} was submitted to.`],
    [{ responseId: 'r1' }, 'The response id must be a response ID.'],
  ])('refuses %j', async (request, message) => {
    const db = reportingWorld(detailFixture());

    expect(await refusal(engine.GetResponseDetail(request, db.provider, READER))).toMatchObject({ message, fault: false });
  });

  it('reports the pinned label version as unavailable when it cannot be read, and still returns the runs and records', async () => {
    const db = reportingWorld(detailFixture(), { failRunViewFor: VERSIONS });

    const detail = await engine.GetResponseDetail({ responseId: R1 }, db.provider, READER);

    expect(detail).toMatchObject({ LabelFormVersionID: VERSION_ID, DefinitionJSON: null, UnavailableSections: ['question labels'] });
    expect(detail.AutomationRuns).toHaveLength(1);
    expect(detail.BindingRecords).toHaveLength(2);
    expect(vi.mocked(LogError).mock.calls.some(([line]) => String(line).includes(`question labels for response ${R1}`))).toBe(true);
  });

  it('reports the pinned label version as unavailable when its row is gone', async () => {
    const world = detailFixture();
    const db = reportingWorld({ ...world, versions: (world.versions ?? []).filter((v) => v.ID !== VERSION_ID) });

    const detail = await engine.GetResponseDetail({ responseId: R1 }, db.provider, READER);

    expect(detail).toMatchObject({ DefinitionJSON: null, UnavailableSections: ['question labels'] });
  });

  it('still refuses a NAMED label version it cannot read: that is the caller asking for the wrong thing', async () => {
    const db = reportingWorld(detailFixture(), { failRunViewFor: VERSIONS });

    expect(await refusal(engine.GetResponseDetail({ responseId: R1, labelFormVersionId: RETIRED_VERSION }, db.provider, READER))).toMatchObject({
      message: `Form version ${RETIRED_VERSION} could not be read.`,
    });
  });

  it('fails with a fixed message when the answers cannot be read', async () => {
    const db = reportingWorld(detailFixture(), { failRunViewFor: ANSWER_TABLE });

    const err = await refusal(engine.GetResponseDetail({ responseId: R1 }, db.provider, READER));

    expect(err).toMatchObject({ fault: true, message: `The answers of response ${R1} could not be read.` });
  });
});

describe('the label definition', () => {
  it('orders questions by page, then by question display order', async () => {
    const shuffled = makeDefinition({
      formId: FORM_ID,
      formVersionId: VERSION_ID,
      pages: [
        { id: 'p2', displayOrder: 2, questions: [{ id: gid(22), type: 'YesNo', prompt: 'b', isRequired: false, displayOrder: 1, options: [] }] },
        {
          id: 'p1',
          displayOrder: 1,
          questions: [
            { id: gid(12), type: 'YesNo', prompt: 'a2', isRequired: false, displayOrder: 2, options: [] },
            { id: gid(11), type: 'YesNo', prompt: 'a1', isRequired: false, displayOrder: 1, options: [] },
          ],
        },
      ],
    });
    const db = reportingWorld(fixture({ versions: [version(VERSION_ID, FORM_ID, 2, 'Published', JSON.stringify(shuffled))] }));

    const summary = await engine.GetResponseSummary({ formId: FORM_ID }, db.provider, READER, { systemUser: SYSTEM });

    expect(summary.Questions.map((c) => c.Prompt)).toEqual(['a1', 'a2', 'b']);
  });
});

