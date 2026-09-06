/**
 * The `/f/:slug` meter — the per-caller half, and the ordering property it silently depends on.
 *
 * The ordering test is the important one. `RequestIdentityMiddleware.spec.ts` already proves the
 * ALS seam works, but it mounts the pre-auth handler and THEN adds the route, which is the
 * opposite of what MJ does: `ConfigureExpressApp` runs inside MJServer's middleware-collection
 * loop (`index.ts:809`), while the pre-auth handlers it gathers are not `app.use`-d until
 * `index.ts:1143`. Express dispatches layers in registration order, so a route contributed
 * through `ConfigureExpressApp` is registered BEFORE the identity middleware and never sees it.
 *
 * That is not a hypothetical: it is why the meter admitted every request at
 * `FORMS_REDEEM_IP_MAX=3`. `currentRequestIdentity()` returned undefined, `abuseIdentity`
 * returned undefined, and `checkRedeemRateLimit` took its deliberate "cannot identify the
 * caller, admit everything" branch on every call — a gate that reported itself installed and
 * was not. These tests pin the real order so the seam cannot regress back into it.
 *
 * `@memberjunction/server` is mocked because importing it for real runs `loadConfig()` at module
 * load and throws without a live MJ config (same reason `RequestIdentityMiddleware.spec.ts` and
 * `WidgetBundleMiddleware.spec.ts` do it).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {},
  configInfo: { magicLink: {}, userHandling: {} },
}));

// The middleware's boot-time readiness probe reads the database and core config. None of that is
// what these tests are about, and leaving it real would make the wiring test need a live host.
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  RunView: class {},
}));
vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { GetSystemUser: () => undefined, UserByName: () => undefined } },
}));
vi.mock('@mj-biz-apps/forms-core-entities-server', () => ({
  getMagicLinkProvisioningConfig: () => ({ roleName: 'Form Respondent' }),
}));
vi.mock('../captcha-demand', () => ({ readCaptchaDemand: async () => ({ ok: true, demand: undefined }) }));
vi.mock('../host-readiness', () => ({ assessRespondentReadiness: () => [] }));

import express, { type Application } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { RequestIdentityMiddleware, requestIdentityHandler } from '../../http/RequestIdentityMiddleware';
import { currentRequestIdentity } from '../../http/request-identity';
import {
  checkRedeemRateLimit,
  redeemInFlightLimiter,
  redeemRateLimitMax,
  resetRedeemInFlightForTests,
} from '../redeem-rate-limit';
import { FormsRateLimiter } from '../../public-submit/rate-limit.service';

afterEach(() => {
  delete process.env.FORMS_REDEEM_IP_MAX;
  delete process.env.FORMS_REDEEM_MAX_IN_FLIGHT;
  delete process.env.FORMS_TRUSTED_PROXY_HOPS;
  resetRedeemInFlightForTests();
});

/**
 * Build an app the way MJServer does: routes contributed by `ConfigureExpressApp` FIRST, the
 * pre-auth identity handlers `app.use`-d only afterwards.
 */
async function withMjOrderedApp(
  addRoute: (app: Application) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  // 1. MJServer index.ts:809 — inside the collection loop.
  addRoute(app);
  // 2. MJServer index.ts:1143 — long after every ConfigureExpressApp route already exists.
  for (const handler of new RequestIdentityMiddleware().GetPreAuthMiddleware()) {
    app.use(handler);
  }
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('the /f/:slug route in MJ\'s real registration order', () => {
  it('sees NO ambient identity from the globally mounted pre-auth middleware', async () => {
    // Documents the constraint the fix exists for. If this ever starts returning a hash, MJ has
    // changed its mounting order and `requestIdentityHandler` on the route may be redundant.
    await withMjOrderedApp(
      (app) => {
        app.get('/f/:slug', (_req, res) => {
          res.json({ ipHash: currentRequestIdentity()?.ipHash ?? null });
        });
      },
      async (baseUrl) => {
        const body = await (await fetch(`${baseUrl}/f/abc`)).json();
        expect(body.ipHash).toBeNull();
      },
    );
  });

  it('DOES get an identity when the route carries the handler itself', async () => {
    await withMjOrderedApp(
      (app) => {
        app.get('/f/:slug', requestIdentityHandler(), (_req, res) => {
          res.json({ ipHash: currentRequestIdentity()?.ipHash ?? null });
        });
      },
      async (baseUrl) => {
        const body = await (await fetch(`${baseUrl}/f/abc`)).json();
        expect(body.ipHash).toMatch(/^[0-9a-f]{64}$/);
      },
    );
  });

  it('keys that identity on the peer, not on a header the caller wrote', async () => {
    await withMjOrderedApp(
      (app) => {
        app.get('/f/:slug', requestIdentityHandler(), (_req, res) => {
          res.json({ ipHash: currentRequestIdentity()?.ipHash ?? null });
        });
      },
      async (baseUrl) => {
        const plain = await (await fetch(`${baseUrl}/f/abc`)).json();
        const spoofed = await (
          await fetch(`${baseUrl}/f/abc`, { headers: { 'x-forwarded-for': '9.9.9.9' } })
        ).json();
        expect(spoofed.ipHash).toBe(plain.ipHash);
      },
    );
  });
});

describe('checkRedeemRateLimit', () => {
  beforeEach(() => {
    // A fresh window per test: the limiter is a process-wide singleton, so a key reused across
    // tests would carry the previous test's hits and make the order of the file matter.
    FormsRateLimiter.Instance.resetForTests();
  });

  it('admits up to the ceiling and refuses the next request from the same caller', () => {
    process.env.FORMS_REDEEM_IP_MAX = '3';
    const caller = 'a'.repeat(64);
    const verdicts = [1, 2, 3, 4].map(() => checkRedeemRateLimit(caller).allowed);
    expect(verdicts).toEqual([true, true, true, false]);
  });

  it('tells a refused caller how long to wait', () => {
    process.env.FORMS_REDEEM_IP_MAX = '1';
    const caller = 'b'.repeat(64);
    checkRedeemRateLimit(caller);
    const refused = checkRedeemRateLimit(caller);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
  });

  it('gives each caller their own budget', () => {
    process.env.FORMS_REDEEM_IP_MAX = '1';
    checkRedeemRateLimit('c'.repeat(64));
    // A different caller must not inherit the first one's spent budget: a shared bucket would let
    // one caller refuse the form for everyone, which is the failure the IP keying exists to avoid.
    expect(checkRedeemRateLimit('d'.repeat(64)).allowed).toBe(true);
  });

  it('admits everything when the caller cannot be identified', () => {
    process.env.FORMS_REDEEM_IP_MAX = '1';
    // Deliberate no-op rather than a shared bucket — see the module note. Two calls, both admitted.
    expect(checkRedeemRateLimit(undefined).allowed).toBe(true);
    expect(checkRedeemRateLimit(undefined).allowed).toBe(true);
  });
});

describe('redeemRateLimitMax', () => {
  it('defaults to 30', () => {
    expect(redeemRateLimitMax()).toBe(30);
  });

  it.each(['', '   ', '0', '-5', 'abc'])('falls back to 30 for %j', (raw) => {
    process.env.FORMS_REDEEM_IP_MAX = raw;
    expect(redeemRateLimitMax()).toBe(30);
  });

  it('honours a valid override', () => {
    process.env.FORMS_REDEEM_IP_MAX = '7';
    expect(redeemRateLimitMax()).toBe(7);
  });
});


describe('RespondentHostMiddleware wiring', () => {
  it('mounts the identity handler ON the route it registers', async () => {
    // The behavioural test above proves `requestIdentityHandler` WORKS in MJ's ordering. This one
    // proves the respondent host route actually USES it — the wiring, which is the half that was
    // missing and the half a guard-mutation run showed nothing else covers. Without this, deleting
    // the argument from `app.get(...)` leaves every other test in this file green.
    const { RespondentHostMiddleware, RESPONDENT_HOST_ROUTE } = await import('../RespondentHostMiddleware');

    const app = express();
    await new RespondentHostMiddleware().ConfigureExpressApp(app);
    // Mounted the way MJServer does it: too late to help the route.
    for (const handler of new RequestIdentityMiddleware().GetPreAuthMiddleware()) {
      app.use(handler);
    }
    // Read the identity the route established, without doing the route's own redeem work.
    app.get('/probe', (_req, res) => res.json({ ipHash: currentRequestIdentity()?.ipHash ?? null }));

    const layers = (app as unknown as { _router?: { stack: Array<{ route?: { path: string; stack: unknown[] } }> } })
      ._router?.stack ?? (app as unknown as { router: { stack: Array<{ route?: { path: string; stack: unknown[] } }> } }).router.stack;
    const hostLayer = layers.find((l) => l.route?.path === RESPONDENT_HOST_ROUTE);

    expect(hostLayer, `no layer registered for ${RESPONDENT_HOST_ROUTE}`).toBeDefined();
    // Two handlers, not one: the identity handler and the route body. One means the identity
    // argument was dropped and `currentRequestIdentity()` inside the route is undefined forever.
    expect(hostLayer!.route!.stack.length).toBe(2);
  });
});


describe('the process-wide in-flight cap', () => {
  it('defaults to 25', () => {
    expect(redeemInFlightLimiter().TryEnter()).toBe(true);
    for (let i = 1; i < 25; i += 1) {
      expect(redeemInFlightLimiter().TryEnter()).toBe(true);
    }
    // 26th is refused: the default really is 25, not "some number".
    expect(redeemInFlightLimiter().TryEnter()).toBe(false);
  });

  it('reads FORMS_REDEEM_MAX_IN_FLIGHT', () => {
    process.env.FORMS_REDEEM_MAX_IN_FLIGHT = '2';
    resetRedeemInFlightForTests();

    expect(redeemInFlightLimiter().TryEnter()).toBe(true);
    expect(redeemInFlightLimiter().TryEnter()).toBe(true);
    expect(redeemInFlightLimiter().TryEnter()).toBe(false);
  });

  it('is ONE limiter for the process, however many times it is asked for', () => {
    // Module-level rather than per-instance on purpose: ClassFactory may instantiate the
    // middleware more than once, and a per-instance cap would multiply the bound it exists to be.
    process.env.FORMS_REDEEM_MAX_IN_FLIGHT = '1';
    resetRedeemInFlightForTests();

    expect(redeemInFlightLimiter().TryEnter()).toBe(true);
    expect(redeemInFlightLimiter().TryEnter()).toBe(false);
  });

  it('releases a slot on the ERROR path, not only the happy one', async () => {
    // The `finally` is the whole safety of the cap: a slot leaked on an error path mints
    // permanent lost capacity, invisible until the day the cap is the thing standing between the
    // service and a flood. Here the redeem itself throws (no database in a unit test), so every
    // request takes the error path — and the route must still be usable afterwards.
    process.env.FORMS_REDEEM_MAX_IN_FLIGHT = '1';
    resetRedeemInFlightForTests();
    const { RespondentHostMiddleware } = await import('../RespondentHostMiddleware');

    const app = express();
    await new RespondentHostMiddleware().ConfigureExpressApp(app);
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const first = await fetch(`${base}/f/anything`);
      const second = await fetch(`${base}/f/anything`);

      // Neither is 503: the first request's slot came back before the second asked for one.
      expect(first.status).not.toBe(503);
      expect(second.status).not.toBe(503);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
