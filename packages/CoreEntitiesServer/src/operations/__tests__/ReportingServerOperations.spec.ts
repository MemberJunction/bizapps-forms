/**
 * The three response-reporting operations through `ExecuteServer` — `Authorize`, then
 * `InternalExecute`, wrapped into a `RemoteOpResult` — over the emulated reporting database (#303
 * Task 9). DW17 for each: Authorize refusals (anonymous, magic-link scoped, no Read on each entity the
 * reading rule names), input refusals, and a happy path. The engine's behaviour is pinned in
 * `reporting/__tests__/FormReportingEngine*.spec.ts`; these pin the wire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RESPONSE_REPORTING_ENTITIES } from '../form-authoring-authorization.js';
import { ANSWERS, FORM_ID, RESPONSES, VERSION_ID, DEFINITION, gid } from '../../reporting/__tests__/parity-fixture.js';
import { READER, SYSTEM, reportingWorld } from '../../reporting/__tests__/reporting-world.js';
import { makeVersion } from '../../testing/index.js';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@memberjunction/generic-database-provider', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/generic-database-provider')>('@memberjunction/generic-database-provider');
  // The summary runs its queries as MJ's system user; the spec's stands in for it.
  return { ...actual, UserCache: { Instance: { GetSystemUser: () => SYSTEM } } };
});

const { GetResponseSummaryServerOperation, LoadGetResponseSummaryOperation } = await import('../GetResponseSummaryServerOperation.js');
const { ListResponsesServerOperation, LoadListResponsesOperation } = await import('../ListResponsesServerOperation.js');
const { GetResponseDetailServerOperation, LoadGetResponseDetailOperation } = await import('../GetResponseDetailServerOperation.js');

interface ServerOperation {
  OperationKey: string;
  RequiredScope?: string;
  ExecuteServer(
    input: unknown,
    context: { provider: IMetadataProvider; user: UserInfo; emitProgress: () => void },
  ): Promise<{ ResultCode?: string; ErrorMessage?: string; Output?: unknown }>;
}

function world(readPermissions: Record<string, boolean> = {}, rowFilters: Record<string, string> = {}) {
  const db = reportingWorld(
    {
      forms: [{ ID: FORM_ID, Name: 'Parity fixture', Status: 'Published' }],
      versions: [{ ...makeVersion(DEFINITION), ID: VERSION_ID, FormID: FORM_ID } as unknown as { ID: string }],
      responses: RESPONSES.map((r) => ({ ...r })),
      answers: ANSWERS.map((a) => ({ ...a })),
    },
    { readPermissions, rowFilters },
  );
  // `Authorize` receives no provider, so it reads permissions from the process metadata.
  Metadata.Provider = db.provider;
  return db;
}

function run(operation: ServerOperation, db: ReturnType<typeof world>, input: unknown, user: UserInfo = READER) {
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

const LIST_INPUT = { FormID: FORM_ID, StartRow: 0, MaxRows: 2, IncludeAnswers: false, Status: 'Complete' };

const OPERATIONS = [
  { key: 'Forms.GetResponseSummary', make: () => new GetResponseSummaryServerOperation(), load: LoadGetResponseSummaryOperation, input: { FormID: FORM_ID } },
  { key: 'Forms.ListResponses', make: () => new ListResponsesServerOperation(), load: LoadListResponsesOperation, input: LIST_INPUT },
  { key: 'Forms.GetResponseDetail', make: () => new GetResponseDetailServerOperation(), load: LoadGetResponseDetailOperation, input: { ResponseID: gid(1001) } },
] as const;

describe.each(OPERATIONS)('$key — registration and Authorize', ({ key, make, load, input }) => {
  it('is registered under its operation key, with an anchor the server bootstrap calls, behind forms:read', () => {
    expect(make().OperationKey).toBe(key);
    expect(make().RequiredScope).toBe('forms:read');
    expect(load()).toBeUndefined();
  });

  it('refuses an anonymous magic-link session with FORBIDDEN, reading nothing', async () => {
    const db = world();
    const anonymous = { ...READER, IsMagicLinkAnonymous: true } as unknown as UserInfo;

    expect((await run(make(), db, input, anonymous)).ResultCode).toBe('FORBIDDEN');
    expect(db.viewCalls).toEqual([]);
    expect(db.queryCalls).toEqual([]);
  });

  it("refuses a respondent's magic-link scope with FORBIDDEN", async () => {
    const db = world();
    const scoped = { ...READER, MagicLinkScope: { ResourceID: gid(77), ResourceType: 'Form Distribution' } } as unknown as UserInfo;

    expect((await run(make(), db, input, scoped)).ResultCode).toBe('FORBIDDEN');
    expect(db.viewCalls).toEqual([]);
  });

  it.each(RESPONSE_REPORTING_ENTITIES.map((entity) => [entity]))('refuses a caller without Read on %s with FORBIDDEN', async (entity) => {
    const db = world({ [entity]: false });

    expect((await run(make(), db, input)).ResultCode).toBe('FORBIDDEN');
    expect(db.queryCalls).toEqual([]);
  });

  it('refuses a provider that is not a server database provider', async () => {
    const db = world();
    const client = { EntityByName: db.provider.EntityByName } as unknown as IMetadataProvider;

    const result = await make().ExecuteServer(input as never, { provider: client, user: READER, emitProgress: () => undefined });

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toContain(`${key} needs a server database provider`);
  });
});

describe('Forms.GetResponseSummary', () => {
  const op = () => new GetResponseSummaryServerOperation();

  it('returns the summary, its queries run as the system user', async () => {
    const db = world();

    const result = await run(op(), db, { FormID: FORM_ID, FormVersionID: null });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Output).toMatchObject({ FormID: FORM_ID, LabelVersionID: VERSION_ID, Summary: { TotalResponses: 5 }, InsightAnswersCapped: false });
    expect(db.queryCalls.map((c) => c.user)).toEqual([SYSTEM, SYSTEM, SYSTEM]);
  });

  it.each([['MJ_BizApps_Forms: Form Responses'], ['MJ_BizApps_Forms: Form Response Answers']])(
    'refuses a caller whose reads of %s are row-filtered as FORBIDDEN, in Authorize, before any read',
    async (entityName) => {
      const db = world({}, { [entityName]: "FormID = 'x'" });

      const result = await run(op(), db, { FormID: FORM_ID });

      // FORBIDDEN, like any other caller the operation will not serve: the dashboard reads "not
      // available to you" from the result code alone.
      expect(result.ResultCode).toBe('FORBIDDEN');
      expect(db.queryCalls).toEqual([]);
      expect(db.viewCalls).toEqual([]);
    },
  );

  it('still lists and details for a row-filtered caller: those read as the caller, so the filter applies', async () => {
    const db = world({}, { 'MJ_BizApps_Forms: Form Responses': "FormID = 'x'" });

    const result = await run(new ListResponsesServerOperation(), db, { FormID: FORM_ID, StartRow: 0, MaxRows: 10, IncludeAnswers: false });

    expect(result.ResultCode).toBe('SUCCESS');
  });

  it.each([
    [{}, 'Forms.GetResponseSummary: FormID is required.'],
    [{ FormID: FORM_ID, FormVersionID: 7 }, 'Forms.GetResponseSummary: FormVersionID must be text when given.'],
    [{ FormID: 'nope' }, 'The form id must be a form ID.'],
  ])('refuses %j', async (input, message) => {
    const result = await run(op(), world(), input);

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toBe(message);
  });
});

describe('Forms.ListResponses', () => {
  const op = () => new ListResponsesServerOperation();

  it('returns one page and the total', async () => {
    const result = await run(op(), world(), LIST_INPUT);

    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Output).toMatchObject({ TotalRowCount: 5, LabelVersionID: VERSION_ID, Rows: [{ ResponseID: gid(1005) }, { ResponseID: gid(1004) }] });
  });

  it.each([
    [{ ...LIST_INPUT, StartRow: '0' }, 'Forms.ListResponses: StartRow must be a whole number of at least 0.'],
    [{ ...LIST_INPUT, MaxRows: 0 }, 'Forms.ListResponses: MaxRows must be a whole number of at least 1.'],
    [{ ...LIST_INPUT, IncludeAnswers: 'yes' }, 'Forms.ListResponses: IncludeAnswers must be true or false.'],
    [{ ...LIST_INPUT, Status: 'Deleted' }, 'Forms.ListResponses: Status must be one of Complete, Disqualified, Partial when given.'],
    [{ ...LIST_INPUT, OrderBy: 'Name' }, 'Forms.ListResponses: OrderBy must be one of'],
  ])('refuses %j', async (input, message) => {
    const result = await run(op(), world(), input);

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toContain(message);
  });
});

describe('Forms.GetResponseDetail', () => {
  const op = () => new GetResponseDetailServerOperation();

  it('returns the response and its answers, labelled by its own version', async () => {
    const result = await run(op(), world(), { ResponseID: gid(1001) });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Output).toMatchObject({ Response: { ID: gid(1001), Status: 'Complete' }, LabelFormVersionID: VERSION_ID, UnavailableSections: [] });
  });

  it.each([
    [{}, 'Forms.GetResponseDetail: ResponseID is required.'],
    [{ ResponseID: gid(404) }, `Response ${gid(404)} was not found.`],
  ])('refuses %j', async (input, message) => {
    const result = await run(op(), world(), input);

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toBe(message);
  });
});
