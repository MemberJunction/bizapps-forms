import { describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';
import {
  redeemSlugToToken,
  type RedeemDeps,
  type RedeemRunViewProvider,
} from '../redeem.service';

/** A minimal anonymous/system context user — only `.ID` is touched by the flow. */
const SYSTEM_USER = { ID: 'system-user-id' } as unknown as UserInfo;

/** Build a fake distribution row with sensible "open" defaults, overridable per test. */
function fakeDistribution(
  overrides: Partial<mjBizAppsFormsFormDistributionEntityType> = {},
): mjBizAppsFormsFormDistributionEntityType {
  const base: Partial<mjBizAppsFormsFormDistributionEntityType> = {
    ID: 'dist-1',
    FormID: 'form-1',
    Name: 'Test Distribution',
    Slug: 'customer-survey',
    ChannelType: 'PublicLink',
    Status: 'Active',
    OpenAt: null,
    CloseAt: null,
    MaxResponses: null,
    ResponseCount: 0,
    MagicLinkInviteID: 'invite-1',
    CaptchaRequired: false,
    IsActive: true,
    PublicLinkToken: 'raw-public-token',
    Form: 'Test Form',
  };
  return { ...base, ...overrides } as mjBizAppsFormsFormDistributionEntityType;
}

/** A RunView provider fake that returns a single distribution row (or a failure / empty set). */
function fakeProvider(opts: {
  success?: boolean;
  rows?: mjBizAppsFormsFormDistributionEntityType[];
}): { provider: RedeemRunViewProvider; lastParams: () => RunViewParams | undefined } {
  let captured: RunViewParams | undefined;
  const provider: RedeemRunViewProvider = {
    async RunView<T = mjBizAppsFormsFormDistributionEntityType>(
      params: RunViewParams,
    ): Promise<RunViewResult<T>> {
      captured = params;
      const success = opts.success ?? true;
      return {
        Success: success,
        Results: (opts.rows ?? []) as unknown as T[],
        RowCount: opts.rows?.length ?? 0,
        TotalRowCount: opts.rows?.length ?? 0,
        ExecutionTime: 0,
        ErrorMessage: success ? '' : 'forced failure',
      } as RunViewResult<T>;
    },
  };
  return { provider, lastParams: () => captured };
}

/** A `fetch` stub returning the given JSON body + ok status. */
function fakeFetch(body: unknown, init: { ok?: boolean } = {}): typeof fetch {
  return vi.fn(async () => {
    return {
      ok: init.ok ?? true,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

/** A `fetch` stub that rejects (network failure). */
function throwingFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
}

function deps(over: Partial<RedeemDeps>): RedeemDeps {
  return {
    provider: fakeProvider({ rows: [fakeDistribution()] }).provider,
    contextUser: SYSTEM_USER,
    redeemUrl: 'http://localhost:4121/magic-link/redeem',
    fetchImpl: fakeFetch({ success: true, token: 'redeemed-jwt' }),
    ...over,
  };
}

describe('redeemSlugToToken', () => {
  it('returns distribution-not-found for an empty slug (no DB read)', async () => {
    const out = await redeemSlugToToken(deps({}), '');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('distribution-not-found');
  });

  it('returns distribution-not-found when no row matches the slug', async () => {
    const out = await redeemSlugToToken(deps({ provider: fakeProvider({ rows: [] }).provider }), 'missing');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('distribution-not-found');
  });

  it('returns distribution-not-found when the RunView fails (fail-safe, no throw)', async () => {
    const out = await redeemSlugToToken(
      deps({ provider: fakeProvider({ success: false }).provider }),
      'customer-survey',
    );
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('distribution-not-found');
  });

  it('returns distribution-closed for a Closed distribution', async () => {
    const provider = fakeProvider({ rows: [fakeDistribution({ Status: 'Closed' })] }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('distribution-closed');
  });

  it('returns distribution-closed when IsActive is false', async () => {
    const provider = fakeProvider({ rows: [fakeDistribution({ IsActive: false })] }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('distribution-closed');
  });

  it('returns distribution-closed when the open/close window excludes now', async () => {
    const future = new Date(Date.now() + 60_000);
    const provider = fakeProvider({ rows: [fakeDistribution({ OpenAt: future })] }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('distribution-closed');
  });

  it('returns no-token when the distribution has no PublicLinkToken', async () => {
    const provider = fakeProvider({ rows: [fakeDistribution({ PublicLinkToken: null })] }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('no-token');
  });

  it('redeems the token and returns the session JWT on success', async () => {
    const fetchImpl = fakeFetch({ success: true, token: 'redeemed-jwt' });
    const out = await redeemSlugToToken(deps({ fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(true);
    expect(out.token).toBe('redeemed-jwt');
  });

  it('POSTs the raw token to the redeem endpoint with format=json and a JSON body', async () => {
    const fetchImpl = fakeFetch({ success: true, token: 'redeemed-jwt' });
    await redeemSlugToToken(deps({ fetchImpl }), 'customer-survey');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe('http://localhost:4121/magic-link/redeem?format=json');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ token: 'raw-public-token' });
  });

  it('returns redeem-failed when core reports success=false', async () => {
    const fetchImpl = fakeFetch({ success: false, errorCode: 'expired' });
    const out = await redeemSlugToToken(deps({ fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('redeem-failed');
  });

  it('returns redeem-failed when core succeeds but returns no token', async () => {
    const fetchImpl = fakeFetch({ success: true });
    const out = await redeemSlugToToken(deps({ fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('redeem-failed');
  });

  it('returns redeem-failed when fetch throws (network down — fail-safe)', async () => {
    const out = await redeemSlugToToken(deps({ fetchImpl: throwingFetch() }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('redeem-failed');
  });

  it('returns redeem-failed when the response body is not the expected shape', async () => {
    const fetchImpl = fakeFetch('not-an-object');
    const out = await redeemSlugToToken(deps({ fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('redeem-failed');
  });
});
