import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
  LINK_PRECEDENCE_CASES,
  type LinkPrecedenceFacts,
  type RelativeInstant,
} from '@mj-biz-apps/forms-entities';
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';
import { publishedVersionFilter } from '../../public-submit/definition-loader.service';

/**
 * `LogError` is captured with `vi.mock` + `vi.hoisted`, NOT `vi.spyOn(core, 'LogError')`. A spy on
 * a module export passes here and fails in CI, and the difference is invisible from this file: in
 * this dev workspace `@memberjunction/core` resolves to MJ's linked source, which Vitest transforms
 * into a redefinable namespace; on a clean install it resolves to the published tarball,
 * externalised as real ESM, whose namespace object is frozen — `Cannot redefine property:
 * LogError`. See `default-salt-warning.spec.ts` for the same reasoning at length.
 */
const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: logError,
}));

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

const FORM_DISTRIBUTION_ENTITY = 'MJ_BizApps_Forms: Form Distributions';
const FORM_VERSION_ENTITY = 'MJ_BizApps_Forms: Form Versions';

/**
 * A RunView provider fake that answers per entity: the distribution row(s) for the slug read and
 * the published-version row(s) for the door's existence read. The default is one published
 * version, so a test that says nothing about publishing exercises an ordinary open link.
 */
function fakeProvider(opts: {
  success?: boolean;
  rows?: mjBizAppsFormsFormDistributionEntityType[];
  /** Rows the version read returns; `[]` means the form has no published version. */
  versions?: Array<{ ID: string }>;
  /** Make the version read fail (`Success: false`) while the distribution read succeeds. */
  versionReadFails?: boolean;
}): { provider: RedeemRunViewProvider; calls: RunViewParams[] } {
  const calls: RunViewParams[] = [];
  const provider: RedeemRunViewProvider = {
    async RunView<T = mjBizAppsFormsFormDistributionEntityType>(
      params: RunViewParams,
    ): Promise<RunViewResult<T>> {
      calls.push(params);
      const isVersionRead = params.EntityName === FORM_VERSION_ENTITY;
      const success = isVersionRead ? !(opts.versionReadFails ?? false) : (opts.success ?? true);
      const rows: unknown[] = isVersionRead ? (opts.versions ?? [{ ID: 'version-1' }]) : (opts.rows ?? []);
      return {
        Success: success,
        Results: rows as T[],
        RowCount: rows.length,
        TotalRowCount: rows.length,
        ExecutionTime: 0,
        ErrorMessage: success ? '' : 'forced failure',
      } as RunViewResult<T>;
    },
  };
  return { provider, calls };
}

/** A `fetch` stub returning the given JSON body + ok/status. */
function fakeFetch(body: unknown, init: { ok?: boolean; status?: number } = {}): typeof fetch {
  return vi.fn(async () => {
    return {
      ok: init.ok ?? true,
      status: init.status ?? (init.ok === false ? 500 : 200),
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

/** Every line `LogError` was handed, joined — for asserting what a log does and does not contain. */
function loggedLines(): string {
  return logError.mock.calls.map((c) => String(c[0])).join('\n');
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
  beforeEach(() => {
    logError.mockClear();
  });

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

  // A link that was Active once keeps its minted token forever — `provisioning-decision.ts`
  // mints only for `Status === 'Active'` but never un-mints — so "Draft has no token" is not the
  // gate it looks like. Draft is the COLUMN DEFAULT, the builder badges it "Paused / Turned off.
  // Anyone opening it is told the form is not taking responses", and the door served it in full.
  it('returns distribution-closed for a Draft distribution, minting no token', async () => {
    const provider = fakeProvider({ rows: [fakeDistribution({ Status: 'Draft' })] }).provider;
    const fetchImpl = fakeFetch({ success: true, token: 'redeemed-jwt' });
    const out = await redeemSlugToToken(deps({ provider, fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('distribution-closed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns distribution-closed when IsActive is false', async () => {
    const provider = fakeProvider({ rows: [fakeDistribution({ IsActive: false })] }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('distribution-closed');
  });

  // A form that opens next Monday has not started; "no longer accepting responses" states the
  // opposite and sends the holder away for good (bizapps-forms#118). The door reports the
  // opening time so the page can say when to come back and send `Retry-After`.
  it('returns distribution-not-yet-open, carrying OpenAt, when the link has not opened yet', async () => {
    const future = new Date(Date.now() + 60_000);
    const provider = fakeProvider({ rows: [fakeDistribution({ OpenAt: future })] }).provider;
    const fetchImpl = fakeFetch({ success: true, token: 'redeemed-jwt' });
    const out = await redeemSlugToToken(deps({ provider, fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('distribution-not-yet-open');
    expect(out.opensAt?.getTime()).toBe(future.getTime());
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('carries no opensAt on any other refusal', async () => {
    const provider = fakeProvider({ rows: [fakeDistribution({ Status: 'Closed' })] }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.reason).toBe('distribution-closed');
    expect(out.opensAt).toBeUndefined();
  });

  // A distribution whose form has no published version used to mint a full anonymous session,
  // hand the widget a `null` definition, and offer a "Try again" that could never succeed. It is
  // exactly the work the door exists to refuse before inviting it (bizapps-forms#118).
  it('returns form-unpublished when the form has no Published version, minting no token', async () => {
    const provider = fakeProvider({ rows: [fakeDistribution()], versions: [] }).provider;
    const fetchImpl = fakeFetch({ success: true, token: 'redeemed-jwt' });
    const out = await redeemSlugToToken(deps({ provider, fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('form-unpublished');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // The door needs a yes/no, not the snapshot: the read asks for the ID only and stops at one row.
  it('checks for a published version with a narrow existence read', async () => {
    const { provider, calls } = fakeProvider({ rows: [fakeDistribution()] });
    await redeemSlugToToken(deps({ provider }), 'customer-survey');
    const versionRead = calls.find((c) => c.EntityName === FORM_VERSION_ENTITY);
    expect(versionRead).toBeDefined();
    expect(versionRead?.ExtraFilter).toBe(publishedVersionFilter('form-1'));
    expect(versionRead?.Fields).toEqual(['ID']);
    expect(versionRead?.MaxRows).toBe(1);
    expect(versionRead?.ResultType).toBe('simple');
  });

  // The window and the cap are decided from the row already in hand; the version read costs a
  // round trip and is paid only by a link that is open and not full.
  it('does not read versions for a link its window or cap already refuses', async () => {
    for (const overrides of [
      { Status: 'Closed' as const },
      { OpenAt: new Date(Date.now() + 60_000) },
      { MaxResponses: 1, ResponseCount: 1 },
    ]) {
      const { provider, calls } = fakeProvider({ rows: [fakeDistribution(overrides)], versions: [] });
      const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
      expect(out.ok).toBe(false);
      expect(calls.map((c) => c.EntityName)).toEqual([FORM_DISTRIBUTION_ENTITY]);
    }
  });

  // Both true at once: the holder is told when it opens, which is the distribution's stated
  // intent and something they can act on; if it is still unpublished then, they are told that.
  it('reports not-yet-open, not unpublished, when both apply', async () => {
    const future = new Date(Date.now() + 60_000);
    const provider = fakeProvider({ rows: [fakeDistribution({ OpenAt: future })], versions: [] }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.reason).toBe('distribution-not-yet-open');
  });

  // A database error is not "the author has not published"; it must not be reported as one.
  it('fails closed as redeem-failed, minting no token, when the version read fails', async () => {
    const provider = fakeProvider({ rows: [fakeDistribution()], versionReadFails: true }).provider;
    const fetchImpl = fakeFetch({ success: true, token: 'redeemed-jwt' });
    const out = await redeemSlugToToken(deps({ provider, fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('redeem-failed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // The expiry half of that window was checked but never exercised — the test above only ever
  // took the OpenAt branch, so a broken CloseAt comparison would have gone unnoticed at the door.
  it('returns distribution-closed once the closing date has passed', async () => {
    const past = new Date(Date.now() - 60_000);
    const provider = fakeProvider({ rows: [fakeDistribution({ CloseAt: past })] }).provider;
    const fetchImpl = fakeFetch({ success: true, token: 'redeemed-jwt' });
    const out = await redeemSlugToToken(deps({ provider, fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('distribution-closed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns distribution-full when the response limit has been reached, minting no token', async () => {
    const provider = fakeProvider({
      rows: [fakeDistribution({ MaxResponses: 6, ResponseCount: 6 })],
    }).provider;
    const fetchImpl = fakeFetch({ success: true, token: 'redeemed-jwt' });
    const out = await redeemSlugToToken(deps({ provider, fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('distribution-full');
    // The whole point of refusing at the door: no anonymous session is minted for a link
    // that cannot accept what it would invite the respondent to write.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // Documents the boundary rather than having driven it: paired with the test above, an
  // off-by-one in the cap breaks exactly one of the two, so the last slot stays claimable.
  it('still opens the form on the last remaining slot', async () => {
    const provider = fakeProvider({
      rows: [fakeDistribution({ MaxResponses: 6, ResponseCount: 5 })],
    }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.ok).toBe(true);
    expect(out.token).toBe('redeemed-jwt');
  });

  it('returns no-token when the distribution has no PublicLinkToken', async () => {
    const provider = fakeProvider({ rows: [fakeDistribution({ PublicLinkToken: null })] }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('no-token');
  });

  // Adversarial review of #131. The builder puts a missing credential AHEAD of every calendar or
  // cap reason, and says why: "Telling someone their never-issued link is merely 'Scheduled' sends
  // them to edit a date when the actual problem is that the host never minted a token"
  // (`share-state.spec.ts`). The door had it last, so a tokenless scheduled link answered 503
  // "It opens on <date>" with a `Retry-After` naming that instant — a machine-readable promise the
  // same URL breaks the moment the date arrives, when it answers 409 instead.
  it('reports no-token, not not-yet-open, for a scheduled link that was never issued one', async () => {
    const provider = fakeProvider({
      rows: [fakeDistribution({ PublicLinkToken: null, OpenAt: new Date(Date.now() + 7 * 24 * 3600_000) })],
    }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.reason).toBe('no-token');
    expect(out.opensAt).toBeUndefined();
  });

  // A link the author switched off is 'paused' to them whatever else is true of it, so the door
  // keeps reporting closed first — the one place its order is meant to outrank a missing token.
  it('still reports closed, not no-token, for a switched-off link that was never issued one', async () => {
    const provider = fakeProvider({
      rows: [fakeDistribution({ PublicLinkToken: null, Status: 'Closed' })],
    }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.reason).toBe('distribution-closed');
  });

  // The version read costs a round trip; a link with no credential cannot be served whatever it
  // says, so it must not pay for one.
  it('does not read versions for a link that has no credential', async () => {
    const { provider, calls } = fakeProvider({ rows: [fakeDistribution({ PublicLinkToken: null })] });
    await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(calls.map((c) => c.EntityName)).toEqual([FORM_DISTRIBUTION_ENTITY]);
  });

  it('redeems the token and returns the session JWT on success', async () => {
    const fetchImpl = fakeFetch({ success: true, token: 'redeemed-jwt' });
    const out = await redeemSlugToToken(deps({ fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(true);
    expect(out.token).toBe('redeemed-jwt');
  });

  // The host page needs the form's identity (name, description) and the door has ALREADY read the
  // row that names the form. Handing it up is what keeps the route at one distribution read per
  // open instead of a second, identical one (bizapps-forms#120; the read cost is finding #6).
  it('hands the loaded distribution row up with the token, so the caller never re-reads it', async () => {
    const row = fakeDistribution({ Form: 'Customer Satisfaction Survey' });
    const provider = fakeProvider({ rows: [row] }).provider;
    const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');
    expect(out.ok).toBe(true);
    expect(out.distribution).toBe(row);
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

  it('returns redeem-refused when core reports success=false', async () => {
    const fetchImpl = fakeFetch({ success: false, errorCode: 'expired' });
    const out = await redeemSlugToToken(deps({ fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('redeem-refused');
  });

  it('returns redeem-refused when core succeeds but returns no token', async () => {
    const fetchImpl = fakeFetch({ success: true });
    const out = await redeemSlugToToken(deps({ fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('redeem-refused');
  });

  it('returns redeem-unreachable when fetch throws (network down — fail-safe)', async () => {
    const out = await redeemSlugToToken(deps({ fetchImpl: throwingFetch() }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('redeem-unreachable');
  });

  it('returns redeem-unreachable when the response body is not the expected shape', async () => {
    const fetchImpl = fakeFetch('not-an-object');
    const out = await redeemSlugToToken(deps({ fetchImpl }), 'customer-survey');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('redeem-unreachable');
  });

  // bizapps-forms#140. `/f/:slug` is the anonymous public entry point: a production failure has no
  // reproduction steps and no user to interview, so the log line IS the diagnosis. These assert
  // that one is emitted and what it carries — never that the source contains a `LogError` call.
  describe('says why the redeem failed', () => {
    /** A `fetch` stub that rejects the way a connect failure actually arrives. */
    function refusingFetch(): typeof fetch {
      return vi.fn(async () => {
        throw new Error('fetch failed: ECONNREFUSED 127.0.0.1:4121');
      }) as unknown as typeof fetch;
    }

    /** A `fetch` stub whose body is not JSON — a proxy's HTML error page, say. */
    function unparseableFetch(): typeof fetch {
      return vi.fn(async () => {
        return {
          ok: false,
          status: 502,
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON at position 0');
          },
        } as Response;
      }) as unknown as typeof fetch;
    }

    it('logs the slug, the endpoint and the error when the transport fails', async () => {
      const out = await redeemSlugToToken(deps({ fetchImpl: refusingFetch() }), 'customer-survey');
      expect(out.reason).toBe('redeem-unreachable');
      const logged = loggedLines();
      expect(logged).toContain('customer-survey');
      expect(logged).toContain('http://localhost:4121/magic-link/redeem');
      expect(logged).toContain('ECONNREFUSED');
    });

    it('logs the slug, the endpoint and the parse error when the body is not JSON', async () => {
      const out = await redeemSlugToToken(deps({ fetchImpl: unparseableFetch() }), 'customer-survey');
      expect(out.reason).toBe('redeem-unreachable');
      const logged = loggedLines();
      expect(logged).toContain('customer-survey');
      expect(logged).toContain('http://localhost:4121/magic-link/redeem');
      expect(logged).toContain('Unexpected token <');
    });

    it('logs the slug and the endpoint when the body is JSON of some other shape', async () => {
      const out = await redeemSlugToToken(
        deps({ fetchImpl: fakeFetch({ notARedeemResult: true }) }),
        'customer-survey',
      );
      expect(out.reason).toBe('redeem-unreachable');
      const logged = loggedLines();
      expect(logged).toContain('customer-survey');
      expect(logged).toContain('http://localhost:4121/magic-link/redeem');
    });

    // The line whose absence cost a two-repository source read to learn that the answer had been
    // "Too many redemption attempts. Try again later." all along. Core sends the sentence; the door
    // threw it away unread.
    it("logs core's own errorCode and message when the endpoint refuses", async () => {
      const out = await redeemSlugToToken(
        deps({
          fetchImpl: fakeFetch(
            { success: false, errorCode: 'rate_limited', error: 'Too many redemption attempts. Try again later.' },
            { status: 429 },
          ),
        }),
        'customer-survey',
      );
      expect(out.reason).toBe('redeem-refused');
      const logged = loggedLines();
      expect(logged).toContain('customer-survey');
      expect(logged).toContain('rate_limited');
      expect(logged).toContain('Too many redemption attempts. Try again later.');
    });

    it('logs the refusal when core reports success with no token', async () => {
      const out = await redeemSlugToToken(deps({ fetchImpl: fakeFetch({ success: true }) }), 'customer-survey');
      expect(out.reason).toBe('redeem-refused');
      expect(loggedLines()).toContain('customer-survey');
    });

    it('distinguishes an unreachable endpoint from a refusal', async () => {
      const unreachable = await redeemSlugToToken(deps({ fetchImpl: refusingFetch() }), 'customer-survey');
      const refused = await redeemSlugToToken(
        deps({ fetchImpl: fakeFetch({ success: false, errorCode: 'revoked', error: 'Revoked.' }) }),
        'customer-survey',
      );
      expect(unreachable.reason).not.toBe(refused.reason);
    });

    // Both are credentials. A log line is durable, is shipped to aggregators, and outlives the
    // session — the one place a magic-link token must never be written.
    it('never writes the raw PublicLinkToken or the minted JWT to the log', async () => {
      const shapes: Array<typeof fetch> = [
        refusingFetch(),
        unparseableFetch(),
        fakeFetch({ notARedeemResult: true }),
        fakeFetch({ success: false, errorCode: 'revoked', error: 'This link has been revoked.' }),
        fakeFetch({ success: true }),
        fakeFetch({ success: true, token: 'minted-session-jwt' }),
      ];
      for (const fetchImpl of shapes) {
        await redeemSlugToToken(deps({ fetchImpl }), 'customer-survey');
      }
      const logged = loggedLines();
      expect(logged).not.toContain('raw-public-token');
      expect(logged).not.toContain('minted-session-jwt');
    });
  });
});

/**
 * The door's half of the shared refusal-precedence table (`contracts/link-precedence.ts`).
 *
 * The builder's half is asserted by `share-state.precedence.spec.ts` against the SAME cases, so a
 * change to either surface's ordering fails one of the two suites and names the case. This exists
 * because a review of #118 claimed the two agreed after checking one pair of states — see the
 * table's own header.
 */
describe('the door follows the shared refusal precedence', () => {
  const NOW = new Date('2026-06-15T12:00:00Z');
  const PAST = new Date('2026-01-01T00:00:00Z');
  const FUTURE = new Date('2027-01-01T00:00:00Z');
  const instant = (r: RelativeInstant): Date | null => (r === 'past' ? PAST : r === 'future' ? FUTURE : null);

  const distributionFor = (facts: LinkPrecedenceFacts): mjBizAppsFormsFormDistributionEntityType =>
    fakeDistribution({
      Status: facts.Status,
      IsActive: facts.IsActive,
      PublicLinkToken: facts.PublicLinkToken,
      OpenAt: instant(facts.OpenAt),
      CloseAt: instant(facts.CloseAt),
      MaxResponses: facts.MaxResponses,
      ResponseCount: facts.ResponseCount,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const testCase of LINK_PRECEDENCE_CASES) {
    it(testCase.name, async () => {
      const provider = fakeProvider({ rows: [distributionFor(testCase.facts)] }).provider;
      const out = await redeemSlugToToken(deps({ provider }), 'customer-survey');

      if (testCase.respondentReason === null) {
        // The row raises no objection; the door goes on to the published-version check and, with a
        // published form and a working stub redeem, admits the link.
        expect(out.ok).toBe(true);
        return;
      }
      expect(out.ok).toBe(false);
      expect(out.reason).toBe(testCase.respondentReason);
    });
  }
});
