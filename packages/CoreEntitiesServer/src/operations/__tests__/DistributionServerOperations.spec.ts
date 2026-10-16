/**
 * The five share-link operations through `ExecuteServer` — `Authorize`, then `InternalExecute`,
 * wrapped into a `RemoteOpResult` — over the emulated database with the real entity server
 * subclasses, `FormDistributionEntityServer` included, and a fake minter (#303 Task 6).
 *
 * DW17 for each: Authorize refusals (anonymous, magic-link scoped, no Update on Forms, no Update on
 * Form Distributions — the bar the deleted `DistributionClaimsResolver` held — and, to issue, no
 * Create), input refusals, and a happy path. The verbs' behaviour is pinned in
 * `FormDistributionEngine.spec.ts`; these pin the wire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import {
  AUTHOR,
  DISTRIBUTIONS,
  FORMS,
  distributionRow,
  draftTables,
  formsWorld,
  rowsOf,
  type ServerSubclasses,
} from '../../testing/forms-world.js';
import type { FakeRow } from '../../testing/index.js';
import type { IAnonymousMagicLinkMinter, InviteWriteResult, MintAnonymousInviteResult } from '../../magic-link/minter.js';

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
    mjBizAppsFormsFormDistributionEntity: WriteThroughEntityBase,
  };
});

const { IssueDistributionLinkServerOperation, LoadIssueDistributionLinkOperation } = await import(
  '../IssueDistributionLinkServerOperation.js'
);
const { ReissueDistributionLinkServerOperation, LoadReissueDistributionLinkOperation } = await import(
  '../ReissueDistributionLinkServerOperation.js'
);
const { OpenDistributionServerOperation, LoadOpenDistributionOperation } = await import('../OpenDistributionServerOperation.js');
const { CloseDistributionServerOperation, LoadCloseDistributionOperation } = await import('../CloseDistributionServerOperation.js');
const { GetDistributionClaimsServerOperation, LoadGetDistributionClaimsOperation } = await import(
  '../GetDistributionClaimsServerOperation.js'
);
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');
const { FormDistributionEntityServer } = await import('../../magic-link/FormDistributionEntityServer.js');
const { MagicLinkMinterRegistry } = await import('../../magic-link/minter.js');
const { DISTRIBUTION_CLAIM_PROVIDERS_KEY } = await import('../../distribution-claims/claim-contract.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer, FormDistributionEntityServer } as unknown as ServerSubclasses;
const FORM = '11111111-1111-4111-8111-111111111111';
const PUBLIC_URL = 'https://forms.example.org';

/** Anything with `ExecuteServer` — the five operations share its signature. */
interface ServerOperation {
  OperationKey: string;
  ExecuteServer(
    input: unknown,
    context: { provider: IMetadataProvider; user: UserInfo; emitProgress: () => void },
  ): Promise<{ ResultCode?: string; ErrorMessage?: string; Output?: unknown }>;
}

const minter: IAnonymousMagicLinkMinter = {
  MintAnonymousInvite: async (): Promise<MintAnonymousInviteResult> => ({ success: true, inviteId: 'inv-new', rawToken: 'tok-new' }),
  RevokeAnonymousInvite: async (): Promise<InviteWriteResult> => ({ success: true, changed: true }),
  SetAnonymousInviteExpiry: async (): Promise<InviteWriteResult> => ({ success: true, changed: false }),
};

interface Grants {
  forms?: boolean;
  createLinks?: boolean;
  updateLinks?: boolean;
}

function world(links: FakeRow[] = [], grants: Grants = {}) {
  const { forms = true, createLinks = true, updateLinks = true } = grants;
  const tables = { ...draftTables(), [FORMS]: [{ ...draftTables()[FORMS][0], ID: FORM }], [DISTRIBUTIONS]: links };
  const db = formsWorld(SUBCLASSES, tables, {
    updatePermissions: { [FORMS]: forms, [DISTRIBUTIONS]: updateLinks },
    createPermissions: { [DISTRIBUTIONS]: createLinks },
  });
  // `Authorize` receives no provider, so it reads permissions from the process metadata.
  Metadata.Provider = db.provider;
  return db;
}

function run(operation: ServerOperation, db: ReturnType<typeof world>, input: unknown, user: UserInfo = AUTHOR) {
  return operation.ExecuteServer(input, { provider: db.provider, user, emitProgress: () => undefined });
}

let original: IMetadataProvider | undefined;
let savedPublicUrl: string | undefined;
beforeEach(() => {
  try {
    original = Metadata.Provider;
  } catch {
    original = undefined;
  }
  MagicLinkMinterRegistry.Instance.Register(minter);
  savedPublicUrl = process.env.MJAPI_PUBLIC_URL;
  process.env.MJAPI_PUBLIC_URL = PUBLIC_URL;
});
afterEach(() => {
  Metadata.Provider = original as IMetadataProvider;
  MagicLinkMinterRegistry.Instance.ClearForTests();
  if (savedPublicUrl === undefined) {
    delete process.env.MJAPI_PUBLIC_URL;
  } else {
    process.env.MJAPI_PUBLIC_URL = savedPublicUrl;
  }
  delete GetGlobalObjectStore()?.[DISTRIBUTION_CLAIM_PROVIDERS_KEY];
});

const LIVE = () => distributionRow({ ID: 'a40a7e57-4c4d-51b7-9e3e-a7b972231f5c', FormID: FORM, Slug: 'lobby', MagicLinkInviteID: 'inv-0', PublicLinkToken: 'tok-0' });

const OPERATIONS = [
  {
    key: 'Forms.IssueDistributionLink',
    scope: 'forms:write',
    make: () => new IssueDistributionLinkServerOperation(),
    load: LoadIssueDistributionLinkOperation,
    input: { FormID: FORM, ChannelType: 'PublicLink' },
  },
  {
    key: 'Forms.ReissueDistributionLink',
    scope: 'forms:write',
    make: () => new ReissueDistributionLinkServerOperation(),
    load: LoadReissueDistributionLinkOperation,
    input: { FormDistributionID: 'a40a7e57-4c4d-51b7-9e3e-a7b972231f5c' },
  },
  {
    key: 'Forms.OpenDistribution',
    scope: 'forms:write',
    make: () => new OpenDistributionServerOperation(),
    load: LoadOpenDistributionOperation,
    input: { FormDistributionID: 'a40a7e57-4c4d-51b7-9e3e-a7b972231f5c' },
  },
  {
    key: 'Forms.CloseDistribution',
    scope: 'forms:write',
    make: () => new CloseDistributionServerOperation(),
    load: LoadCloseDistributionOperation,
    input: { FormDistributionID: 'a40a7e57-4c4d-51b7-9e3e-a7b972231f5c' },
  },
  {
    key: 'Forms.GetDistributionClaims',
    scope: 'forms:read',
    make: () => new GetDistributionClaimsServerOperation(),
    load: LoadGetDistributionClaimsOperation,
    input: { FormID: FORM },
  },
] as const;

describe.each(OPERATIONS)('$key — registration and Authorize', ({ key, scope, make, load, input }) => {
  it('is registered under its operation key, with an anchor the server bootstrap calls', () => {
    expect(make().OperationKey).toBe(key);
    expect(load()).toBeUndefined();
  });

  it(`carries the API-key scope MJ checks before Authorize runs (${scope})`, () => {
    expect(make().RequiredScope).toBe(scope);
  });

  it('refuses an anonymous magic-link session with FORBIDDEN, and writes nothing', async () => {
    const db = world([LIVE()]);
    const anonymous = { ...AUTHOR, IsMagicLinkAnonymous: true } as unknown as UserInfo;

    expect((await run(make(), db, input, anonymous)).ResultCode).toBe('FORBIDDEN');
    expect(db.saved).toEqual([]);
  });

  it("refuses a respondent's magic-link scope — even for this very link — with FORBIDDEN", async () => {
    const db = world([LIVE()]);
    const scoped = { ...AUTHOR, MagicLinkScope: { ResourceID: 'a40a7e57-4c4d-51b7-9e3e-a7b972231f5c', ResourceType: 'Form Distribution' } } as unknown as UserInfo;

    expect((await run(make(), db, input, scoped)).ResultCode).toBe('FORBIDDEN');
    expect(db.saved).toEqual([]);
  });

  it('refuses an author without Update on Forms with FORBIDDEN', async () => {
    const db = world([LIVE()], { forms: false });

    expect((await run(make(), db, input)).ResultCode).toBe('FORBIDDEN');
    expect(db.saved).toEqual([]);
  });

  it('refuses an author without Update on Form Distributions with FORBIDDEN', async () => {
    const db = world([LIVE()], { updateLinks: false });

    expect((await run(make(), db, input)).ResultCode).toBe('FORBIDDEN');
    expect(db.saved).toEqual([]);
  });

  it('refuses a provider that is not a server database provider', async () => {
    const db = world([LIVE()]);
    const client = { EntityByName: db.provider.EntityByName } as unknown as IMetadataProvider;

    const result = await make().ExecuteServer(input as never, { provider: client, user: AUTHOR, emitProgress: () => undefined });

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toContain(`${key} needs a server database provider`);
  });
});

describe('Forms.IssueDistributionLink', () => {
  const op = () => new IssueDistributionLinkServerOperation();

  it('issues a live link and returns its id, slug, status and respondent URL', async () => {
    const db = world();

    const result = await run(op(), db, { FormID: FORM, ChannelType: 'QR', Name: 'Lobby poster', MaxResponses: 10, CaptchaRequired: true });

    expect(result.ResultCode).toBe('SUCCESS');
    const [row] = rowsOf(db, DISTRIBUTIONS);
    expect(row).toMatchObject({ ChannelType: 'QR', Name: 'Lobby poster', MaxResponses: 10, CaptchaRequired: true, PublicLinkToken: 'tok-new' });
    expect(result.Output).toEqual({
      FormDistributionID: row.ID,
      Slug: 'lobby-poster',
      Status: 'Active',
      RespondentURL: `${PUBLIC_URL}/f/lobby-poster`,
    });
  });

  it('defaults an absent ChannelType to PublicLink and parses the ISO window', async () => {
    const db = world();

    const result = await run(op(), db, { FormID: FORM, OpenAt: '2026-11-01T09:00:00Z', CloseAt: null });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(rowsOf(db, DISTRIBUTIONS)[0]).toMatchObject({ ChannelType: 'PublicLink', OpenAt: new Date('2026-11-01T09:00:00Z'), CloseAt: null });
  });

  it('refuses an author without Create on Form Distributions with FORBIDDEN', async () => {
    const db = world([], { createLinks: false });

    expect((await run(op(), db, { FormID: FORM })).ResultCode).toBe('FORBIDDEN');
    expect(rowsOf(db, DISTRIBUTIONS)).toEqual([]);
  });

  it.each([
    [{}, 'Forms.IssueDistributionLink: FormID is required.'],
    [{ FormID: FORM, ChannelType: 'Fax' }, 'ChannelType must be one of Email, Embed, PublicLink, QR'],
    [{ FormID: FORM, MaxResponses: 0 }, 'MaxResponses must be a whole number of at least 1'],
    [{ FormID: FORM, OpenAt: 'next week' }, 'OpenAt must be an ISO-8601 date and time'],
    [{ FormID: FORM, CaptchaRequired: 'yes' }, 'CaptchaRequired must be true or false'],
    [{ FormID: FORM, Name: 7 }, 'Name must be text when given'],
    [{ FormID: FORM, Slug: 'Not A Slug' }, 'not a usable slug'],
  ])('refuses %j, writing nothing', async (input, message) => {
    const db = world();

    const result = await run(op(), db, input);

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toContain(message);
    expect(rowsOf(db, DISTRIBUTIONS)).toEqual([]);
  });
});

describe.each([
  ['Forms.OpenDistribution', () => new OpenDistributionServerOperation(), { Status: 'Closed', IsActive: false }, 'Active', `${PUBLIC_URL}/f/lobby`],
  ['Forms.CloseDistribution', () => new CloseDistributionServerOperation(), {}, 'Closed', null],
  ['Forms.ReissueDistributionLink', () => new ReissueDistributionLinkServerOperation(), {}, 'Active', `${PUBLIC_URL}/f/lobby`],
])('%s', (key, make, before, status, url) => {
  it('acts on the link and returns its state after the verb', async () => {
    const db = world([{ ...LIVE(), ...before }]);

    const result = await run(make(), db, { FormDistributionID: '  a40a7e57-4c4d-51b7-9e3e-a7b972231f5c ' });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Output).toEqual({ FormDistributionID: 'a40a7e57-4c4d-51b7-9e3e-a7b972231f5c', Slug: 'lobby', Status: status, RespondentURL: url });
  });

  it('refuses a missing FormDistributionID', async () => {
    const db = world([LIVE()]);

    const result = await run(make(), db, {});

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toBe(`${key}: FormDistributionID is required.`);
  });
});

describe('Forms.GetDistributionClaims', () => {
  const op = () => new GetDistributionClaimsServerOperation();

  it("reports which of the form's slugs other apps own, and which apps could not answer", async () => {
    const db = world([LIVE()]);
    GetGlobalObjectStore()![DISTRIBUTION_CLAIM_PROVIDERS_KEY] = [
      {
        AppName: 'Caliber',
        FindClaims: async (slugs: readonly string[]) => slugs.map((slug) => ({ slug, ownerLabel: 'Screen step', respondentUrl: null })),
      },
      { AppName: 'Broken' },
    ];

    const result = await run(op(), db, { FormID: FORM });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Output).toEqual({
      Claims: [{ AppName: 'Caliber', Slug: 'lobby', OwnerLabel: 'Screen step', RespondentURL: null }],
      Failures: [{ AppName: 'Broken', Message: expect.stringContaining('FindClaims') }],
    });
    expect(db.saved).toEqual([]);
  });

  it.each([
    [{}, 'Forms.GetDistributionClaims: FormID is required.'],
    [{ FormID: "x' OR 1=1 --" }, 'must be a form ID'],
  ])('refuses %j', async (input, message) => {
    const db = world([LIVE()]);

    const result = await run(op(), db, input);

    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toContain(message);
  });
});
