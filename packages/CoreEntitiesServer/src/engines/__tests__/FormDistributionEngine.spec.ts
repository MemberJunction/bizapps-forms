/**
 * `FormDistributionEngine` against the emulated database (`forms-world.ts`), with the REAL
 * `FormDistributionEntityServer` over every Form Distribution row and a fake minter registered — so
 * the credential each verb ends with is the one the production provisioning hook produces, and the
 * engine is held to only setting fields and saving (#303 Task 6).
 *
 * Ported from the builder's `distribution.service.ts`: slug derivation and its capped retry, the
 * defaults a new link is created with, "open" as both halves, reissue as a cleared token, close.
 * And from the deleted `DistributionClaimsResolver`: the claims read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import {
  AUTHOR,
  DISTRIBUTIONS,
  FORMS,
  distributionRow,
  draftTables,
  formRow,
  formsWorld,
  rowsOf,
  type ServerSubclasses,
} from '../../testing/forms-world.js';
import type { FakeProviderConfig, FakeRow } from '../../testing/index.js';
import type {
  AnonymousCredentialRef,
  IAnonymousMagicLinkMinter,
  InviteWriteResult,
  MintAnonymousInviteParams,
  MintAnonymousInviteResult,
} from '../../magic-link/minter.js';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

const logged = vi.hoisted(() => ({ errors: [] as string[], statuses: [] as string[] }));
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: (m: string) => logged.errors.push(m), LogStatus: (m: string) => logged.statuses.push(m) };
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

const { FormDistributionEngine, FormDistributionError, MAX_SLUG_ATTEMPTS } = await import('../FormDistributionEngine.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');
const { FormDistributionEntityServer } = await import('../../magic-link/FormDistributionEntityServer.js');
const { MagicLinkMinterRegistry } = await import('../../magic-link/minter.js');
const { DISTRIBUTION_CLAIM_PROVIDERS_KEY } = await import('../../distribution-claims/claim-contract.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer, FormDistributionEntityServer } as unknown as ServerSubclasses;
const PUBLIC_URL = 'https://forms.example.org';
const engine = FormDistributionEngine.Instance;

/** A minter that issues `tok-N` for invite `inv-N` and records what it was asked. */
class FakeMinter implements IAnonymousMagicLinkMinter {
  public minted: MintAnonymousInviteParams[] = [];
  public revoked: AnonymousCredentialRef[] = [];

  async MintAnonymousInvite(params: MintAnonymousInviteParams): Promise<MintAnonymousInviteResult> {
    this.minted.push(params);
    const n = this.minted.length;
    return { success: true, inviteId: `inv-${n}`, rawToken: `tok-${n}` };
  }

  async RevokeAnonymousInvite(credential: AnonymousCredentialRef): Promise<InviteWriteResult> {
    this.revoked.push(credential);
    return { success: true, changed: true };
  }

  async SetAnonymousInviteExpiry(): Promise<InviteWriteResult> {
    return { success: true, changed: false };
  }
}

let minter: FakeMinter;
let savedPublicUrl: string | undefined;

beforeEach(() => {
  logged.errors.length = 0;
  logged.statuses.length = 0;
  minter = new FakeMinter();
  MagicLinkMinterRegistry.Instance.Register(minter);
  savedPublicUrl = process.env.MJAPI_PUBLIC_URL;
  process.env.MJAPI_PUBLIC_URL = PUBLIC_URL;
});

afterEach(() => {
  MagicLinkMinterRegistry.Instance.ClearForTests();
  if (savedPublicUrl === undefined) {
    delete process.env.MJAPI_PUBLIC_URL;
  } else {
    process.env.MJAPI_PUBLIC_URL = savedPublicUrl;
  }
  delete GetGlobalObjectStore()?.[DISTRIBUTION_CLAIM_PROVIDERS_KEY];
});

/** The world: one Draft form named "Intake", and whatever links a test adds. */
function world(links: FakeRow[] = [], config: Partial<FakeProviderConfig> = {}, form: Partial<FakeRow> = {}) {
  return formsWorld(SUBCLASSES, { ...draftTables(), [FORMS]: [formRow(form)], [DISTRIBUTIONS]: links }, config);
}

/** `failSaveWhen` for a world whose table enforces `UQ_FormDistribution_Slug`, as the database does. */
function enforcingUniqueSlugs(db: () => ReturnType<typeof world> | undefined) {
  return (entityName: string, values: Record<string, unknown>): boolean | string => {
    if (entityName !== DISTRIBUTIONS) {
      return false;
    }
    const clash = rowsOf(db()!, DISTRIBUTIONS).some((row) => row.ID !== values.ID && row.Slug === values.Slug);
    return clash
      ? `Cannot insert duplicate key row in object '__mj_BizAppsForms.FormDistribution' with unique index 'UQ_FormDistribution_Slug'. The duplicate key value is (${String(values.Slug)}).`
      : false;
  };
}

/**
 * Make one row invisible to the caller, as row-level security or a missing Read grant does: the view
 * succeeds and the row is simply not in it.
 */
function hideFromCaller(db: ReturnType<typeof world>, entityName: string, id: string): void {
  const read = db.provider.RunView.bind(db.provider);
  (db.provider as unknown as { RunView: typeof read }).RunView = (async (params, user) => {
    const result = await read(params, user);
    if (params.EntityName !== entityName) {
      return result;
    }
    const visible = (result.Results ?? []).filter((row) => (row as { ID?: string }).ID !== id);
    return { ...result, Results: visible, TotalRowCount: visible.length } as typeof result;
  }) as typeof read;
}

const linkRow = (db: ReturnType<typeof world>, id: string) => rowsOf(db, DISTRIBUTIONS).find((row) => row.ID === id);
const onlyLink = (db: ReturnType<typeof world>) => {
  const rows = rowsOf(db, DISTRIBUTIONS);
  expect(rows).toHaveLength(1);
  return rows[0];
};

describe('Issue', () => {
  it('creates the link open to responses, under PublicLink, captcha off, with a slug from its name, and returns its URL', async () => {
    const db = world();

    const link = await engine.Issue({ formId: 'form-1' }, db.provider, AUTHOR);

    const row = onlyLink(db);
    expect(row).toMatchObject({
      FormID: 'form-1',
      Name: 'Intake — Public link',
      Slug: 'intake-public-link',
      ChannelType: 'PublicLink',
      Status: 'Active',
      IsActive: true,
      CaptchaRequired: false,
      ResponseCount: 0,
      MaxResponses: null,
      OpenAt: null,
      CloseAt: null,
      // Minted by the provisioning hook on the create's save, not by the engine.
      MagicLinkInviteID: 'inv-1',
      PublicLinkToken: 'tok-1',
    });
    expect(minter.minted).toHaveLength(1);
    expect(minter.minted[0].resourceId).toBe(row.ID);
    expect(link).toEqual({
      distributionId: row.ID,
      slug: 'intake-public-link',
      status: 'Active',
      respondentUrl: `${PUBLIC_URL}/f/intake-public-link`,
    });
  });

  it('opens no transaction of its own: a failed insert must leave the connection usable for the retry', async () => {
    const db = world();

    await engine.Issue({ formId: 'form-1' }, db.provider, AUTHOR);

    expect(db.transactions).toEqual([]);
  });

  it('carries every setting the caller gave', async () => {
    const db = world();
    const openAt = new Date('2026-11-01T09:00:00Z');
    const closeAt = new Date('2026-12-01T09:00:00Z');

    const link = await engine.Issue(
      {
        formId: 'form-1',
        channelType: 'QR',
        name: '  Lobby poster ',
        slug: 'lobby',
        maxResponses: 50,
        openAt,
        closeAt,
        captchaRequired: true,
      },
      db.provider,
      AUTHOR,
    );

    expect(onlyLink(db)).toMatchObject({
      Name: 'Lobby poster',
      Slug: 'lobby',
      ChannelType: 'QR',
      MaxResponses: 50,
      OpenAt: openAt,
      CloseAt: closeAt,
      CaptchaRequired: true,
    });
    expect(link.respondentUrl).toBe(`${PUBLIC_URL}/f/lobby`);
  });

  it('derives the slug from a given name when no slug is given', async () => {
    const db = world();

    await engine.Issue({ formId: 'form-1', name: 'Spring Member Survey!' }, db.provider, AUTHOR);

    expect(onlyLink(db).Slug).toBe('spring-member-survey');
  });

  it('appends a random suffix when the preferred slug is already taken', async () => {
    const db = world([distributionRow({ ID: 'other', FormID: 'form-2', Slug: 'lobby' })]);

    const link = await engine.Issue({ formId: 'form-1', slug: 'lobby' }, db.provider, AUTHOR);

    expect(link.slug).toMatch(/^lobby-[a-z0-9]{5}$/);
  });

  it('retries with a fresh suffix when the insert loses a race for the slug the probe saw free', async () => {
    let db: ReturnType<typeof world> | undefined;
    let raced = false;
    db = world([], {
      failSaveWhen: (entityName, values) => {
        // Another link takes the slug between the probe and the insert — once.
        if (entityName === DISTRIBUTIONS && values.Slug === 'lobby' && !raced) {
          raced = true;
          return "Cannot insert duplicate key row in object '__mj_BizAppsForms.FormDistribution' with unique index 'UQ_FormDistribution_Slug'.";
        }
        return enforcingUniqueSlugs(() => db)(entityName, values);
      },
    });

    const link = await engine.Issue({ formId: 'form-1', slug: 'lobby' }, db.provider, AUTHOR);

    expect(link.slug).toMatch(/^lobby-[a-z0-9]{5}$/);
    expect(onlyLink(db).Slug).toBe(link.slug);
  });

  it(`gives up after ${MAX_SLUG_ATTEMPTS} attempts, says so, and creates nothing`, async () => {
    let attempts = 0;
    const db = world([], {
      failSaveWhen: (entityName) => {
        if (entityName !== DISTRIBUTIONS) {
          return false;
        }
        attempts += 1;
        return "duplicate key value violates unique constraint \"UQ_FormDistribution_Slug\"";
      },
    });

    const error = await engine.Issue({ formId: 'form-1', slug: 'lobby' }, db.provider, AUTHOR).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FormDistributionError);
    expect((error as Error).message).toContain(`after ${MAX_SLUG_ATTEMPTS} attempts`);
    expect((error as InstanceType<typeof FormDistributionError>).fault).toBe(true);
    expect(attempts).toBe(MAX_SLUG_ATTEMPTS);
    expect(rowsOf(db, DISTRIBUTIONS)).toEqual([]);
    expect(minter.minted).toEqual([]);
    expect(logged.errors.join('\n')).toMatch(/form-1.*author-1/);
  });

  it('does not retry a failure that is not a slug collision — retrying cannot change it', async () => {
    let attempts = 0;
    const db = world([], {
      failSaveWhen: (entityName) => {
        if (entityName !== DISTRIBUTIONS) {
          return false;
        }
        attempts += 1;
        return 'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_FormDistribution_Form".';
      },
    });

    const error = await engine.Issue({ formId: 'form-1' }, db.provider, AUTHOR).catch((e: unknown) => e);

    expect(attempts).toBe(1);
    // The database's words go to the log, never to the caller.
    expect((error as Error).message).toMatch(/Could not create a share link for form form-1/);
    expect((error as Error).message).not.toMatch(/FK_FormDistribution_Form|INSERT/);
    expect(logged.errors.join('\n')).toMatch(/FK_FormDistribution_Form/);
  });

  it('refuses when the slug probe cannot be read, rather than guessing the slug is free', async () => {
    const db = world([], { failRunViewFor: DISTRIBUTIONS });

    const error = await engine.Issue({ formId: 'form-1' }, db.provider, AUTHOR).catch((e: unknown) => e);

    expect((error as Error).message).toMatch(/could not check whether the slug "intake-public-link" is free/i);
    expect((error as Error).message).not.toMatch(/forced runview failure/);
    expect(logged.errors.join('\n')).toMatch(/forced runview failure/);
    expect((error as InstanceType<typeof FormDistributionError>).fault).toBe(true);
    expect(rowsOf(db, DISTRIBUTIONS)).toEqual([]);
  });

  it.each([
    ['a form that does not exist', 'form-404', {}, /does not exist/],
    ['an archived form', 'form-1', { Status: 'Closed' }, /archived/],
    ['a template', 'form-1', { IsTemplate: true }, /template/],
  ])('refuses %s, writing nothing', async (_label, formId, form, message) => {
    const db = world([], {}, form);

    const error = await engine.Issue({ formId }, db.provider, AUTHOR).catch((e: unknown) => e);

    expect((error as Error).message).toMatch(message);
    expect((error as InstanceType<typeof FormDistributionError>).fault).toBe(false);
    expect(rowsOf(db, DISTRIBUTIONS)).toEqual([]);
    expect(logged.statuses.join('\n')).toMatch(message);
  });

  it.each([
    ['an archived form', { Status: 'Closed' }],
    ['a template', { IsTemplate: true }],
    ['a live form', {}],
  ])('answers %s the caller cannot read exactly as a form that does not exist', async (_label, form) => {
    const absent = world([], {}, { ID: 'form-other' });
    const hidden = world([], {}, form);
    hideFromCaller(hidden, FORMS, 'form-1');

    const notThere = await engine.Issue({ formId: 'form-1' }, absent.provider, AUTHOR).catch((e: unknown) => e);
    const notVisible = await engine.Issue({ formId: 'form-1' }, hidden.provider, AUTHOR).catch((e: unknown) => e);

    expect((notVisible as Error).message).toBe((notThere as Error).message);
    expect(rowsOf(hidden, DISTRIBUTIONS)).toEqual([]);
  });

  it('refuses a preferred slug that is not slug-shaped, before reading anything', async () => {
    const db = world([], { failRunViewFor: FORMS });

    await expect(engine.Issue({ formId: 'form-1', slug: 'Lobby Poster' }, db.provider, AUTHOR)).rejects.toThrow(
      /not a usable slug/,
    );
  });

  it('refuses a window that closes before it opens', async () => {
    const db = world();

    await expect(
      engine.Issue(
        { formId: 'form-1', openAt: new Date('2026-12-01T00:00:00Z'), closeAt: new Date('2026-11-01T00:00:00Z') },
        db.provider,
        AUTHOR,
      ),
    ).rejects.toThrow(/closes before it opens/);
    expect(rowsOf(db, DISTRIBUTIONS)).toEqual([]);
  });

  it('returns no URL for a channel the host does not provision a credential for (Email)', async () => {
    const db = world();

    const link = await engine.Issue({ formId: 'form-1', channelType: 'Email' }, db.provider, AUTHOR);

    expect(onlyLink(db)).toMatchObject({ ChannelType: 'Email', Status: 'Active' });
    expect(onlyLink(db).PublicLinkToken ?? null).toBeNull();
    expect(minter.minted).toEqual([]);
    expect(link.respondentUrl).toBeNull();
  });

  it('returns no URL when no minter is registered — the link is saved, and holds no credential', async () => {
    MagicLinkMinterRegistry.Instance.ClearForTests();
    const db = world();

    const link = await engine.Issue({ formId: 'form-1' }, db.provider, AUTHOR);

    expect(onlyLink(db).Status).toBe('Active');
    expect(link.respondentUrl).toBeNull();
  });

  it("returns no URL, and says why, when the host's public address is not configured", async () => {
    delete process.env.MJAPI_PUBLIC_URL;
    const db = world();

    const link = await engine.Issue({ formId: 'form-1' }, db.provider, AUTHOR);

    expect(onlyLink(db).PublicLinkToken).toBe('tok-1');
    expect(link.respondentUrl).toBeNull();
    expect(logged.statuses.join('\n')).toMatch(/MJAPI_PUBLIC_URL/);
  });

  it('issues on a provider without entity transactions — Issue opens none, so it needs none', async () => {
    const db = world([], { noTransactions: true });

    const link = await engine.Issue({ formId: 'form-1' }, db.provider, AUTHOR);

    expect(link.status).toBe('Active');
  });

  it("refuses to run inside a caller's transaction, writing nothing — a slug collision there would doom it", async () => {
    const db = world();
    const scope = await db.provider.BeginEntityTransaction();
    try {
      const error = await engine.Issue({ formId: 'form-1' }, db.provider, AUTHOR).catch((e: unknown) => e);

      expect((error as Error).message).toMatch(/inside a transaction/);
      expect((error as InstanceType<typeof FormDistributionError>).fault).toBe(false);
      expect(rowsOf(db, DISTRIBUTIONS)).toEqual([]);
      expect(minter.minted).toEqual([]);
    } finally {
      await scope.Rollback();
    }
  });

  it(`keeps a de-duplicated slug within the slug grammar, even for a ${'60'}-character preferred slug`, async () => {
    const long = 'a'.repeat(60);
    const db = world([distributionRow({ ID: 'other', FormID: 'form-2', Slug: long })]);

    const link = await engine.Issue({ formId: 'form-1', slug: long }, db.provider, AUTHOR);

    expect(link.slug).not.toBe(long);
    expect(link.slug!.length).toBeLessThanOrEqual(60);
    expect(link.slug).toMatch(/^a+-[a-z0-9]{5}$/);
  });

  it.each([
    ['a name longer than the column holds', { name: 'n'.repeat(256) }, /name is longer than 255 characters/],
    ['an OpenAt that is not a date', { openAt: new Date('not a date') }, /OpenAt is not a valid date/],
    ['a CloseAt that is not a date', { closeAt: new Date('nope') }, /CloseAt is not a valid date/],
  ])('refuses %s as a refusal, not a fault, before reading anything', async (_label, extra, message) => {
    const db = world([], { failRunViewFor: FORMS });

    const error = await engine.Issue({ formId: 'form-1', ...extra }, db.provider, AUTHOR).catch((e: unknown) => e);

    expect((error as Error).message).toMatch(message);
    expect((error as InstanceType<typeof FormDistributionError>).fault).toBe(false);
  });

  it('refuses to write through the plain generated class — the provisioning hook would never run', async () => {
    const db = formsWorld({ FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses, {
      ...draftTables(),
      [DISTRIBUTIONS]: [],
    });

    await expect(engine.Issue({ formId: 'form-1' }, db.provider, AUTHOR)).rejects.toThrow(/failed on the server/);
    expect(logged.errors.join('\n')).toMatch(/Expected FormDistributionEntityServer/);
    expect(rowsOf(db, DISTRIBUTIONS)).toEqual([]);
  });
});

describe('Open', () => {
  it('opens a closed link — both halves — and the hook issues it a fresh credential, in one transaction', async () => {
    const db = world([distributionRow({ ID: 'd1', Slug: 'lobby', Status: 'Closed', IsActive: false })]);

    const link = await engine.Open('d1', db.provider, AUTHOR);

    expect(linkRow(db, 'd1')).toMatchObject({ Status: 'Active', IsActive: true, MagicLinkInviteID: 'inv-1', PublicLinkToken: 'tok-1' });
    expect(link).toEqual({ distributionId: 'd1', slug: 'lobby', status: 'Active', respondentUrl: `${PUBLIC_URL}/f/lobby` });
    expect(db.transactions[0]).toBe('begin');
    expect(db.transactions.at(-1)).toBe('commit');
  });

  it("repairs a row that reads Active but is not IsActive — the half 'open' used to forget", async () => {
    const db = world([distributionRow({ ID: 'd1', Status: 'Active', IsActive: false })]);

    await engine.Open('d1', db.provider, AUTHOR);

    expect(linkRow(db, 'd1')).toMatchObject({ Status: 'Active', IsActive: true, PublicLinkToken: 'tok-1' });
  });

  it('forces the save (IgnoreDirtyState), so an already-open row is still written and re-provisioned', async () => {
    const db = world([distributionRow({ ID: 'd1' })]);
    const save = vi.spyOn(FormDistributionEntityServer.prototype, 'Save');

    try {
      await engine.Open('d1', db.provider, AUTHOR);
      expect(save.mock.calls[0]?.[0]?.IgnoreDirtyState).toBe(true);
    } finally {
      save.mockRestore();
    }
  });

  it.each([
    ['an archived form', { Status: 'Closed' }, /archived/],
    ['a template', { IsTemplate: true }, /template/],
  ])("refuses to open a link on %s, leaving it as it was", async (_label, form, message) => {
    const db = world([distributionRow({ ID: 'd1', Status: 'Closed', IsActive: false })], {}, form);

    await expect(engine.Open('d1', db.provider, AUTHOR)).rejects.toThrow(message);
    expect(linkRow(db, 'd1')).toMatchObject({ Status: 'Closed', IsActive: false });
    expect(db.transactions).toEqual(['begin', 'rollback']);
  });
});

describe('Close', () => {
  it('closes the link and the hook revokes its credential in the same transaction; no URL', async () => {
    const db = world([distributionRow({ ID: 'd1', Slug: 'lobby', MagicLinkInviteID: 'inv-0', PublicLinkToken: 'tok-0' })]);

    const link = await engine.Close('d1', db.provider, AUTHOR);

    expect(linkRow(db, 'd1')).toMatchObject({ Status: 'Closed', MagicLinkInviteID: null, PublicLinkToken: null });
    expect(minter.revoked).toEqual([{ inviteId: 'inv-0', resourceId: 'd1' }]);
    expect(link).toEqual({ distributionId: 'd1', slug: 'lobby', status: 'Closed', respondentUrl: null });
    expect(db.transactions[0]).toBe('begin');
    expect(db.transactions.at(-1)).toBe('commit');
  });

  it('rolls back and reports a refused save — the reason to the log with the link and the user, not to the caller', async () => {
    const db = world([distributionRow({ ID: 'd1' })], { failSaveWhen: (name) => (name === DISTRIBUTIONS ? 'disk full' : false) });

    const error = await engine.Close('d1', db.provider, AUTHOR).catch((e: unknown) => e);

    expect((error as Error).message).toMatch(/Could not close share link d1/);
    expect((error as Error).message).not.toMatch(/disk full/);
    expect(linkRow(db, 'd1')?.Status).toBe('Active');
    expect(logged.errors.join('\n')).toMatch(/d1.*author-1.*disk full/);
  });
});

describe('Reissue', () => {
  it('replaces the credential and keeps the slug, so every shared URL keeps working', async () => {
    const db = world([distributionRow({ ID: 'd1', Slug: 'lobby', MagicLinkInviteID: 'inv-0', PublicLinkToken: 'tok-0' })]);

    const link = await engine.Reissue('d1', db.provider, AUTHOR);

    expect(minter.revoked).toEqual([{ inviteId: 'inv-0', resourceId: 'd1' }]);
    expect(linkRow(db, 'd1')).toMatchObject({ Slug: 'lobby', MagicLinkInviteID: 'inv-1', PublicLinkToken: 'tok-1' });
    expect(link.respondentUrl).toBe(`${PUBLIC_URL}/f/lobby`);
  });

  it.each([
    ['closed', { Status: 'Closed' }],
    ['paused (IsActive off)', { IsActive: false }],
  ])('refuses a link that is %s — it holds no credential to reissue; opening issues one', async (_label, state) => {
    const db = world([distributionRow({ ID: 'd1', ...state })]);

    await expect(engine.Reissue('d1', db.provider, AUTHOR)).rejects.toThrow(/not open to responses/);
    expect(minter.minted).toEqual([]);
  });
});

describe.each([
  ['Open', (id: string, db: ReturnType<typeof world>, user: UserInfo) => engine.Open(id, db.provider, user)],
  ['Close', (id: string, db: ReturnType<typeof world>, user: UserInfo) => engine.Close(id, db.provider, user)],
  ['Reissue', (id: string, db: ReturnType<typeof world>, user: UserInfo) => engine.Reissue(id, db.provider, user)],
])('%s — the guards every link verb shares', (_verb, run) => {
  it('refuses a link that does not exist', async () => {
    const db = world();

    const error = await run('nope', db, AUTHOR).catch((e: unknown) => e);

    expect((error as Error).message).toMatch(/Share link nope does not exist/);
    expect((error as InstanceType<typeof FormDistributionError>).fault).toBe(false);
  });

  it('refuses when the link cannot be read, keeping the provider\'s words out of the answer', async () => {
    const db = world([distributionRow({ ID: 'd1' })], { failRunViewFor: DISTRIBUTIONS });

    const error = await run('d1', db, AUTHOR).catch((e: unknown) => e);

    expect((error as Error).message).toMatch(/Could not read share link d1/);
    expect((error as Error).message).not.toMatch(/forced runview failure/);
    expect(logged.errors.join('\n')).toMatch(/forced runview failure/);
    expect((error as InstanceType<typeof FormDistributionError>).fault).toBe(true);
  });

  it('answers a link the caller cannot read exactly as one that does not exist — no existence or state oracle', async () => {
    const absent = world();
    const hidden = world([distributionRow({ ID: 'd1', Status: 'Closed', IsActive: false })]);
    hideFromCaller(hidden, DISTRIBUTIONS, 'd1');

    const notThere = await run('d1', absent, AUTHOR).catch((e: unknown) => e);
    const notVisible = await run('d1', hidden, AUTHOR).catch((e: unknown) => e);

    expect((notVisible as Error).message).toBe((notThere as Error).message);
    expect(linkRow(hidden, 'd1')).toMatchObject({ Status: 'Closed', IsActive: false });
  });

  it('refuses a blank id and a missing user before touching the database', async () => {
    const db = world([], { failRunViewFor: DISTRIBUTIONS });

    await expect(run('  ', db, AUTHOR)).rejects.toThrow(/share link id is required/);
    await expect(run('d1', db, undefined as unknown as UserInfo)).rejects.toThrow(/needs the acting user/);
  });
});

describe('GetClaims', () => {
  const FORM = '11111111-1111-4111-8111-111111111111';

  function registerClaimant(answer: (slugs: readonly string[], user: UserInfo) => unknown) {
    const asked: { slugs: readonly string[]; user: UserInfo }[] = [];
    const store = GetGlobalObjectStore()!;
    store[DISTRIBUTION_CLAIM_PROVIDERS_KEY] = [
      {
        AppName: 'Caliber',
        FindClaims: async (slugs: readonly string[], user: UserInfo) => {
          asked.push({ slugs, user });
          return answer(slugs, user);
        },
      },
      { AppName: 'Broken' },
    ];
    return asked;
  }

  it("asks every registered app about this form's own slugs, as the caller, and reports what they own", async () => {
    const db = world([
      distributionRow({ ID: 'd1', FormID: FORM, Slug: 'intake' }),
      distributionRow({ ID: 'd2', FormID: FORM, Slug: null }),
      distributionRow({ ID: 'd3', FormID: 'form-2', Slug: 'elsewhere' }),
    ]);
    const asked = registerClaimant((slugs) =>
      slugs.map((slug) => ({ slug, ownerLabel: 'Screen step', respondentUrl: 'https://caliber.example/i/1' })),
    );

    const lookup = await engine.GetClaims(FORM, db.provider, AUTHOR);

    expect(asked).toEqual([{ slugs: ['intake'], user: AUTHOR }]);
    expect(lookup.claims).toEqual([
      { appName: 'Caliber', slug: 'intake', ownerLabel: 'Screen step', respondentUrl: 'https://caliber.example/i/1' },
    ]);
    // A malformed registration is a reported failure, never a silent skip.
    expect(lookup.failures).toEqual([{ appName: 'Broken', message: expect.stringContaining('FindClaims') }]);
  });

  it('asks nobody when the form has no slugs', async () => {
    const db = world();
    const asked = registerClaimant(() => []);

    const lookup = await engine.GetClaims(FORM, db.provider, AUTHOR);

    expect(asked).toEqual([]);
    expect(lookup.claims).toEqual([]);
  });

  it('refuses a form id that is not a GUID before reading anything — it goes into a SQL filter', async () => {
    const db = world([], { failRunViewFor: DISTRIBUTIONS });

    await expect(engine.GetClaims("x' OR 1=1 --", db.provider, AUTHOR)).rejects.toThrow(/must be a form ID/);
  });

  it('throws when the slugs cannot be read, rather than answering "no claims" — detail to the log only', async () => {
    const db = world([], { failRunViewFor: DISTRIBUTIONS });

    const error = await engine.GetClaims(FORM, db.provider, AUTHOR).catch((e: unknown) => e);

    expect((error as Error).message).toBe(`Could not read share links for form ${FORM}.`);
    expect(logged.errors.join('\n')).toMatch(/forced runview failure/);
  });
});

/**
 * A provider that THROWS (a dropped connection, a driver error) rather than reporting failure: its
 * message can carry SQL and other records' values, and an operation returns a thrown message as its
 * `ErrorMessage`. Every verb turns it into a generic answer and sends the detail to the log.
 */
describe('an unexpected exception never reaches the caller in its own words', () => {
  const SECRET = "Invalid column 'PublicLinkToken' in SELECT ... WHERE ID='other-form'";

  function throwingWorld(links: FakeRow[] = [distributionRow({ ID: 'd1' })]) {
    const db = world(links);
    (db.provider as unknown as { RunView: () => Promise<never> }).RunView = async () => {
      throw new Error(SECRET);
    };
    return db;
  }

  it.each([
    ['Issue', (db: ReturnType<typeof world>) => engine.Issue({ formId: 'form-1' }, db.provider, AUTHOR)],
    ['Open', (db: ReturnType<typeof world>) => engine.Open('d1', db.provider, AUTHOR)],
    ['Close', (db: ReturnType<typeof world>) => engine.Close('d1', db.provider, AUTHOR)],
    ['Reissue', (db: ReturnType<typeof world>) => engine.Reissue('d1', db.provider, AUTHOR)],
    ['GetClaims', (db: ReturnType<typeof world>) => engine.GetClaims('11111111-1111-4111-8111-111111111111', db.provider, AUTHOR)],
  ])('%s', async (_verb, run) => {
    const error = await run(throwingWorld()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FormDistributionError);
    expect((error as Error).message).not.toContain('PublicLinkToken');
    expect((error as Error).message).toMatch(/failed on the server/);
    expect(logged.errors.join('\n')).toContain(SECRET);
  });
});
