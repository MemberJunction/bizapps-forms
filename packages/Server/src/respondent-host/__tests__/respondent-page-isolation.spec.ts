/**
 * Route-level proof that `GET /f/:slug` — the respondent PAGE, not the `/resume` routes — runs its
 * two reads (the slug lookup, the description read) on ONE lazily-leased isolated provider, never
 * on the process-global provider (bizapps-forms#265 smoke finding).
 *
 * `withLazyIsolatedProvider` was already fixed for `/resume`, `/remember` and `/forget`
 * (`resume-routes-isolation.spec.ts`), but the PAGE route that starts the whole flow still ran
 * `redeemSlugToToken` and `loadFormIdentity` on `this.systemProvider()` — `new RunView()`, the
 * global provider — so a held `Common.LogActivity` transaction on that provider (#260) still
 * captured this route's reads too.
 *
 * `redeemSlugToToken` and `loadFormIdentity` run for REAL here (only the network redeem and the
 * `RunView` class are faked), unlike `resume-routes-isolation.spec.ts`, which fully replaces
 * `redeemSlugToToken` — this suite needs to see which PROVIDER OBJECT the two reads actually ran
 * on, not just what the middleware intended to pass them. Harness otherwise copied from
 * `RespondentHostMiddleware.spec.ts` (real express app, real HTTP) and from
 * `resume-routes-isolation.spec.ts` (a real, controllable fake of the isolated-provider module).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, RunViewParams, RunViewResult } from '@memberjunction/core';
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';

vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {
    GetPreAuthMiddleware(): unknown[] {
      return [];
    }
  },
  configInfo: { magicLink: { enabled: true, grantableRoleNames: ['Form Respondent'] } },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { GetSystemUser: () => ({ ID: 'system-user-id' }) } },
}));

/** Every `LogError` message, so a test can assert what the operator is told. */
const loggedErrors = vi.hoisted((): string[] => []);

/** Rows the faked `RunView` answers with, keyed by entity name; set per test. */
const rowsByEntity: Record<string, unknown[]> = {};

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class RunView {
    /**
     * The raw constructor arg this instance was built with — how a test tells "wraps the leased
     * isolated provider" apart from "wraps the global provider" (`new RunView()`, called with
     * nothing, leaves this `undefined`).
     */
    public readonly leasedProvider: unknown;
    constructor(provider?: unknown) {
      this.leasedProvider = provider;
    }
    async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
      const rows = (rowsByEntity[params.EntityName ?? ''] ?? []) as T[];
      return {
        Success: true,
        Results: rows,
        RowCount: rows.length,
        TotalRowCount: rows.length,
        ExecutionTime: 0,
        ErrorMessage: '',
      } as RunViewResult<T>;
    }
  }
  return { ...actual, RunView, LogStatus: () => undefined, LogError: (message: string) => loggedErrors.push(message) };
});

/** Every purpose string `withLazyIsolatedProvider` was called with, in order. */
const leasePurposes = vi.hoisted((): string[] => []);
/** What `acquire()` does on the NEXT lease — configured per test, reset in `beforeEach`. */
let acquireBehavior: () => Promise<DatabaseProviderBase> = async () => ({}) as DatabaseProviderBase;

vi.mock('../../automation/isolated-provider', () => ({
  withLazyIsolatedProvider: vi.fn(
    async <T>(purpose: string, work: (acquire: () => Promise<DatabaseProviderBase>) => Promise<T>): Promise<T> => {
      leasePurposes.push(purpose);
      return work(() => acquireBehavior());
    },
  ),
}));

/** A provider object with an identity of its own, so `toBe` can prove which instance was leased. */
const LEASED_INSTANCE = { marker: 'the-leased-instance' } as unknown as DatabaseProviderBase;

/** A `RunView`-shaped object that also exposes what it was constructed with, for `.leasedProvider`. */
interface LeasedRunView {
  leasedProvider?: unknown;
}

/** The provider `redeemSlugToToken` actually read the distribution through, on the last request. */
let redeemProviderSeen: LeasedRunView | undefined;
vi.mock('../redeem.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../redeem.service')>();
  return {
    ...actual,
    redeemSlugToToken: (deps: Parameters<typeof actual.redeemSlugToToken>[0], slug: string) => {
      redeemProviderSeen = deps.provider as LeasedRunView;
      return actual.redeemSlugToToken(deps, slug);
    },
  };
});

/** The provider `loadFormIdentity` actually read the description through, on the last request. */
let identityProviderSeen: LeasedRunView | undefined;
vi.mock('../form-identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../form-identity')>();
  return {
    ...actual,
    loadFormIdentity: (
      provider: Parameters<typeof actual.loadFormIdentity>[0],
      contextUser: Parameters<typeof actual.loadFormIdentity>[1],
      source: Parameters<typeof actual.loadFormIdentity>[2],
    ) => {
      identityProviderSeen = provider as LeasedRunView;
      return actual.loadFormIdentity(provider, contextUser, source);
    },
  };
});

import express, { type Express } from 'express';
import compression from 'compression';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { RespondentHostMiddleware } from '../RespondentHostMiddleware';
import { resetRespondentHostConfigForTests } from '../config';
import { redeemInFlightLimiter, resetRedeemInFlightForTests } from '../redeem-rate-limit';
import { FORM_DISTRIBUTION_ENTITY, FORM_ENTITY, FORM_VERSION_ENTITY } from '../../public-submit/entity-names';

/**
 * The REAL global `fetch`, captured before `beforeEach` stubs it. `redeemSlugToToken` runs for
 * real in this suite (see file header), so `beforeEach` stubs `globalThis.fetch` to answer its
 * outbound redeem POST — but the harness's OWN HTTP client (`withServer`'s `get`) also calls
 * `fetch` to reach the local express server, and would otherwise get the redeem stub's canned 200
 * back without ever touching the server under test. This reference is how the two stay apart.
 */
const nodeFetch = globalThis.fetch;

const DISTRIBUTION = {
  ID: 'dist-1',
  FormID: 'form-1',
  Slug: 'customer-survey',
  Form: 'Customer Satisfaction Survey',
  PublicLinkToken: 'raw-token',
  IsActive: true,
  Status: 'Active',
  CloseAt: null,
  OpenAt: null,
  MaxResponses: null,
  ResponseCount: 0,
  AllowedOrigins: null,
} as unknown as mjBizAppsFormsFormDistributionEntityType;

const MJ_COMPRESSION_THRESHOLD_BYTES = 1024;
const MJ_COMPRESSION_LEVEL = 6;

/** Mount in MJServer's own order — see `RespondentHostMiddleware.spec.ts` for why this order matters. */
function mountLikeMJServer(app: Express, middleware: RespondentHostMiddleware): Promise<void> {
  return Promise.resolve(middleware.ConfigureExpressApp?.(app)).then(() => {
    app.use(compression({ threshold: MJ_COMPRESSION_THRESHOLD_BYTES, level: MJ_COMPRESSION_LEVEL }));
    for (const handler of middleware.GetPreAuthMiddleware()) {
      app.use(handler);
    }
    app.use((_req, res) => {
      res.status(401).type('text/plain').send('Unauthorized');
    });
  });
}

/** Boot the middleware's routes on a real express server and always close the listener. */
async function withServer(
  assertions: (get: (route: string, init?: RequestInit) => Promise<Response>) => Promise<void>,
): Promise<void> {
  const app = express();
  await mountLikeMJServer(app, new RespondentHostMiddleware());
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolveListening) => server.once('listening', () => resolveListening()));
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;
    await assertions((route, init) => nodeFetch(`${origin}${route}`, init));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

beforeEach(() => {
  leasePurposes.length = 0;
  loggedErrors.length = 0;
  redeemProviderSeen = undefined;
  identityProviderSeen = undefined;
  acquireBehavior = async () => LEASED_INSTANCE;
  rowsByEntity[FORM_DISTRIBUTION_ENTITY] = [DISTRIBUTION];
  rowsByEntity[FORM_VERSION_ENTITY] = [{ ID: 'version-1' }];
  rowsByEntity[FORM_ENTITY] = [{ Description: 'Tell us how we did.' }];
  // `redeemSlugToToken` runs for real in this suite (see file header), so its `postRedeem` step
  // makes a genuine `fetch` call to core's redeem endpoint — stubbed to a bare success so the
  // slug-lookup read under test is the thing that decides pass/fail, not the network step after it.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, token: 'session-jwt' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
});

afterEach(() => {
  resetRespondentHostConfigForTests();
  vi.unstubAllGlobals();
  resetRedeemInFlightForTests();
  delete process.env.FORMS_REDEEM_MAX_IN_FLIGHT;
});

describe("GET /f/:slug — the page's reads run on one leased isolated provider (#265)", () => {
  it('leases one isolated provider for the page, named with the slug', async () => {
    await withServer(async (get) => {
      const res = await get('/f/customer-survey');
      expect(res.status).toBe(200);

      expect(leasePurposes).toHaveLength(1);
      expect(leasePurposes[0]).toMatch(/respondent page/i);
      expect(leasePurposes[0]).toContain('customer-survey');
    });
  });

  it('runs the slug lookup and the identity read on the SAME leased provider, never on `new RunView()`', async () => {
    await withServer(async (get) => {
      const res = await get('/f/customer-survey');
      expect(res.status).toBe(200);

      expect(redeemProviderSeen).toBeDefined();
      expect(identityProviderSeen).toBeDefined();
      // Same instance for both reads...
      expect(identityProviderSeen).toBe(redeemProviderSeen);
      // ...and that instance wraps the LEASE, not a bare `new RunView()` (which would leave
      // `leasedProvider` undefined).
      expect(redeemProviderSeen?.leasedProvider).toBe(LEASED_INSTANCE);
    });
  });

  it('a request refused before any read (too many redeems in flight) never creates an isolated instance', async () => {
    // `handleMetered`'s in-flight cap and per-IP rate limit both refuse BEFORE `handleRequest` — and
    // therefore before `withLazyIsolatedProvider` — ever runs, so a request shed there must cost no
    // isolated instance. The in-flight cap is the deterministic one to force: hold its one slot
    // ourselves before the route ever gets a chance to take it.
    process.env.FORMS_REDEEM_MAX_IN_FLIGHT = '1';
    resetRedeemInFlightForTests();
    expect(redeemInFlightLimiter().TryEnter()).toBe(true);
    try {
      await withServer(async (get) => {
        const res = await get('/f/customer-survey');
        expect(res.status).toBe(503);
        expect(leasePurposes).toHaveLength(0);
      });
    } finally {
      redeemInFlightLimiter().Exit();
    }
  });

  it('when the lease cannot be created: fails the way any other unexpected route error already does, and logs it', async () => {
    acquireBehavior = async () => {
      throw new Error('isolated provider outage');
    };

    await withServer(async (get) => {
      const res = await get('/f/customer-survey');

      // The EXISTING `hostPageHandler` catch — no new error page for this failure mode.
      expect(res.status).toBe(500);
      expect(await res.text()).toContain('We could not open this form right now');
      // Never swallowed: the underlying cause is on the record.
      expect(loggedErrors.some((m) => m.includes('isolated provider outage'))).toBe(true);
    });
  });
});
