/**
 * Route-level tests for the respondent host middleware — a real express app and real HTTP requests,
 * with only the I/O boundaries faked: the magic-link redeem (network + DB) and the `RunView` the
 * identity read goes through. This is the seam for bizapps-forms#120, which was a WIRING gap: the
 * page could carry a title all along, and the route simply never handed it one. A unit test of the
 * renderer cannot see that; only a request through the route can.
 *
 * `@memberjunction/server` is mocked because importing it for real runs `loadConfig()` at module
 * load and throws without a live MJ config — same as `WidgetBundleMiddleware.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
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

/** Every `LogError` message, so a test can assert what the operator is told at boot. */
const loggedErrors = vi.hoisted((): string[] => []);

/** Rows the faked `RunView` answers with, keyed by entity name; set per test. */
const rowsByEntity: Record<string, unknown[]> = {};

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class RunView {
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

/** The outcome the faked redeem returns; set per test. */
let redeemOutcome: { ok: boolean; token?: string; distribution?: mjBizAppsFormsFormDistributionEntityType };

/** The deps the route handed the redeem on the last request — the seam for what it forwards. */
let redeemDeps: { clientIp?: string } | undefined;

vi.mock('../redeem.service', () => ({
  redeemSlugToToken: async (deps: { clientIp?: string }) => {
    redeemDeps = deps;
    return redeemOutcome;
  },
  // Unused by any test here (nothing drives the resume route past its `no-pointer` exit), but
  // `resume-deps.ts` imports it by name — an entirely absent export would fail that import.
  redeemRawToken: async () => undefined,
}));

import express, { type Express } from 'express';
import compression from 'compression';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { RespondentHostMiddleware } from '../RespondentHostMiddleware';
import { resetRespondentHostConfigForTests } from '../config';
import type { ResumeDepsContext } from '../resume-deps';

/** The ctx the route built for the resume dependency set — the seam for whether identity reached it. */
let resumeDepsCtx: ResumeDepsContext | undefined;

vi.mock('../resume-deps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../resume-deps')>();
  return {
    ...actual,
    makeDeviceResumeDeps: (ctx: Parameters<typeof actual.makeDeviceResumeDeps>[0]) => {
      resumeDepsCtx = ctx;
      return actual.makeDeviceResumeDeps(ctx);
    },
  };
});

const DISTRIBUTION = {
  ID: 'dist-1',
  FormID: 'form-1',
  Name: 'Share link',
  Slug: 'customer-survey',
  Form: 'Customer Satisfaction Survey',
  PublicLinkToken: 'raw',
} as unknown as mjBizAppsFormsFormDistributionEntityType;

beforeEach(() => {
  redeemOutcome = { ok: true, token: 'session-jwt', distribution: DISTRIBUTION };
  redeemDeps = undefined;
  resumeDepsCtx = undefined;
  loggedErrors.length = 0;
  rowsByEntity['MJ_BizApps_Forms: Forms'] = [{ Description: 'Tell us how we did. Takes two minutes.' }];
});

afterEach(() => {
  resetRespondentHostConfigForTests();
});

/**
 * The compression MJServer mounts (`MJServer/src/index.ts`, "Fix #8"): a 1 KB threshold, level 6.
 * Copied rather than imported because MJServer does not export it; what matters to these tests is
 * the POSITION it is mounted in, which `mountLikeMJServer` reproduces.
 */
const MJ_COMPRESSION_THRESHOLD_BYTES = 1024;
const MJ_COMPRESSION_LEVEL = 6;

/**
 * Mount the middleware in the ORDER MJServer's `serve()` does, because the order is the thing this
 * package keeps getting wrong. `serve()` calls `ConfigureExpressApp` while it is still collecting
 * middleware contributions (`index.ts:824`), then mounts `compression()` (`index.ts:1129`), then
 * the pre-auth handlers, and only then its own routes — the ones that answer 401 to anything
 * unauthenticated. The trailing 401 stands in for those, so "the route fell through" shows up here
 * as the 401 it really produces rather than as a bare 404 from an empty app.
 */
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
  assertions: (get: (route: string, init?: RequestInit) => Promise<Response>, origin: string) => Promise<void>,
): Promise<void> {
  const app = express();
  await mountLikeMJServer(app, new RespondentHostMiddleware());
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolveListening) => server.once('listening', () => resolveListening()));
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;
    await assertions((route, init) => fetch(`${origin}${route}`, init), origin);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

describe('GET /f/:slug — the link carries the form\'s identity', () => {
  it('titles the page with the form name and emits it as og:title', async () => {
    await withServer(async (get) => {
      const res = await get('/f/customer-survey');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('<title>Customer Satisfaction Survey</title>');
      expect(html).toContain('<meta property="og:title" content="Customer Satisfaction Survey" />');
    });
  });

  it('emits the form description as og:description', async () => {
    await withServer(async (get) => {
      const html = await (await get('/f/customer-survey')).text();
      expect(html).toContain('<meta property="og:description" content="Tell us how we did. Takes two minutes." />');
    });
  });

  it('still serves the page, named, when the form has no description', async () => {
    rowsByEntity['MJ_BizApps_Forms: Forms'] = [{ Description: null }];
    await withServer(async (get) => {
      const res = await get('/f/customer-survey');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('<title>Customer Satisfaction Survey</title>');
      expect(html).not.toContain('og:description');
    });
  });

  // The door reports success and the row together or not at all, so this state is one
  // `redeemSlugToToken` cannot produce today. It is pinned because the GUARD that makes it
  // unreachable is what lets `loadFormIdentity` take a non-optional row — delete the guard and
  // this is a TypeError on `source.FormID`, i.e. a 500 with a stack, on the anonymous path.
  it('renders the ordinary error page when the door reports success without the row it resolved', async () => {
    redeemOutcome = { ok: true, token: 'session-jwt' };
    await withServer(async (get) => {
      const res = await get('/f/customer-survey');
      expect(res.status).toBe(502);
      expect(await res.text()).toContain('We could not open this form right now');
    });
  });

  it('keeps the session token and noindex on the identified page', async () => {
    await withServer(async (get) => {
      const html = await (await get('/f/customer-survey')).text();
      expect(html).toContain('data-token="session-jwt"');
      expect(html).toContain('name="robots" content="noindex"');
    });
  });
});

describe('GET /f/:slug — the page sends GraphQL to the server that served it (#238)', () => {
  const SAVED_PUBLIC_URL = process.env.MJAPI_PUBLIC_URL;
  const SAVED_GRAPHQL_URL = process.env.FORMS_GRAPHQL_URL;

  beforeEach(() => {
    delete process.env.MJAPI_PUBLIC_URL;
    delete process.env.FORMS_GRAPHQL_URL;
    resetRespondentHostConfigForTests();
  });

  afterEach(() => {
    if (SAVED_PUBLIC_URL === undefined) delete process.env.MJAPI_PUBLIC_URL;
    else process.env.MJAPI_PUBLIC_URL = SAVED_PUBLIC_URL;
    if (SAVED_GRAPHQL_URL === undefined) delete process.env.FORMS_GRAPHQL_URL;
    else process.env.FORMS_GRAPHQL_URL = SAVED_GRAPHQL_URL;
  });

  // The defect: with no public URL configured the page named `http://localhost:4121`, so on any
  // host not listening there every respondent's submit went to a server that was not there.
  it('addresses the origin the page request arrived on when no public URL is configured', async () => {
    await withServer(async (get, origin) => {
      const html = await (await get('/f/customer-survey')).text();
      expect(html).toContain(`data-graphql-url="${origin}"`);
      expect(html).not.toContain('localhost:4121');
    });
  });

  it('still addresses the configured public URL when there is one', async () => {
    process.env.MJAPI_PUBLIC_URL = 'https://forms.example.com';
    resetRespondentHostConfigForTests();
    await withServer(async (get) => {
      const html = await (await get('/f/customer-survey')).text();
      expect(html).toContain('data-graphql-url="https://forms.example.com"');
    });
  });

  it('tells the operator at boot that the public URL is unset', async () => {
    await withServer(async () => {
      expect(loggedErrors.some((m) => m.includes('MJAPI_PUBLIC_URL is not set'))).toBe(true);
    });
  });

  it('says nothing about it when the public URL is set', async () => {
    process.env.MJAPI_PUBLIC_URL = 'https://forms.example.com';
    resetRespondentHostConfigForTests();
    await withServer(async () => {
      expect(loggedErrors.some((m) => m.includes('MJAPI_PUBLIC_URL is not set'))).toBe(false);
    });
  });
});

describe('GET /f/:slug — the page declares who may frame it (#203)', () => {
  // The ONLY control in this stack that can see the customer's origin. Everything on the API side
  // sees ours, because the framed document is ours — so if this header is wrong or absent, the
  // feature's headline promise ("only these sites may embed this link") is not enforced anywhere.
  // Asserted through a real HTTP response rather than on a return value, because a header that is
  // computed and never `set()` is exactly the bug worth catching here.
  it('sends no framing header when the link authored no origins, so existing embeds are untouched', async () => {
    redeemOutcome = {
      ok: true,
      token: 'session-jwt',
      distribution: { ...DISTRIBUTION, AllowedOrigins: null } as mjBizAppsFormsFormDistributionEntityType,
    };
    await withServer(async (get) => {
      const res = await get('/f/customer-survey');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-security-policy')).toBeNull();
    });
  });

  it('names self plus the authored origins when the link declares them', async () => {
    redeemOutcome = {
      ok: true,
      token: 'session-jwt',
      distribution: {
        ...DISTRIBUTION,
        AllowedOrigins: '["https://careers.acme.com"]',
      } as mjBizAppsFormsFormDistributionEntityType,
    };
    await withServer(async (get) => {
      const res = await get('/f/customer-survey');
      expect(res.headers.get('content-security-policy')).toBe(
        "frame-ancestors 'self' https://careers.acme.com",
      );
    });
  });

  it('refuses all framing when the authored value is unusable, rather than falling open', async () => {
    redeemOutcome = {
      ok: true,
      token: 'session-jwt',
      distribution: { ...DISTRIBUTION, AllowedOrigins: '["*.acme.com"]' } as mjBizAppsFormsFormDistributionEntityType,
    };
    await withServer(async (get) => {
      const res = await get('/f/customer-survey');
      expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    });
  });

  it('never sends X-Frame-Options, which cannot express a list', async () => {
    // `ALLOW-FROM` is unsupported in every current browser and `SAMEORIGIN` would refuse the very
    // embeds this feature exists to permit — so the absence is a decision, and pinned as one.
    redeemOutcome = {
      ok: true,
      token: 'session-jwt',
      distribution: {
        ...DISTRIBUTION,
        AllowedOrigins: '["https://careers.acme.com"]',
      } as mjBizAppsFormsFormDistributionEntityType,
    };
    await withServer(async (get) => {
      const res = await get('/f/customer-survey');
      expect(res.headers.get('x-frame-options')).toBeNull();
    });
  });
});

describe('GET /favicon.ico — the respondent origin never answers a public page with 401', () => {
  // Every browser asks the origin for /favicon.ico. Unmatched, the request fell through to MJAPI's
  // authenticated routes and answered 401 — the only console error on a healthy respondent load,
  // and auth-failure noise proportional to form traffic.
  it('answers an explicit 204 with no body', async () => {
    await withServer(async (get) => {
      const res = await get('/favicon.ico');
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });
  });
});

describe('GET /f/:slug — the door tells core which respondent is asking', () => {
  afterEach(() => {
    delete process.env.FORMS_TRUSTED_PROXY_HOPS;
  });

  it('forwards the resolved respondent address to the redeem', async () => {
    // Core keys its own redeem cap on this. Without it every respondent in the deployment shares
    // one bucket and the 21st form open per minute is refused for everyone (register row 29).
    process.env.FORMS_TRUSTED_PROXY_HOPS = '1';
    await withServer(async (get) => {
      await get('/f/customer-survey', { headers: { 'x-forwarded-for': '198.51.100.7' } });

      expect(redeemDeps?.clientIp).toBe('198.51.100.7');
    });
  });

  it('forwards the socket peer, never an address the caller typed, when no hop is trusted', async () => {
    // The whole point of keying on a resolved address is that the caller cannot choose it. If the
    // header could reach core unfiltered, a caller would mint themselves a fresh bucket per
    // request — the `x-session-id` rotation bypass, rebuilt one layer down.
    await withServer(async (get) => {
      await get('/f/customer-survey', { headers: { 'x-forwarded-for': '9.9.9.9' } });

      expect(redeemDeps?.clientIp).not.toBe('9.9.9.9');
      expect(redeemDeps?.clientIp).toMatch(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/);
    });
  });
});

describe('POST /f/:slug/resume — the pre-auth resume route also needs the resolved caller', () => {
  afterEach(() => {
    delete process.env.FORMS_TRUSTED_PROXY_HOPS;
  });

  // `resumeDeps()` builds `callerKey`/`callerIp` from `currentRequestIdentity()` BEFORE
  // `runResume` ever inspects the request body, so an empty POST is enough to prove whether the
  // identity handler is mounted on this route — no live distribution or token needed. Without it
  // (#191), `callerKey` silently falls back to `slug:${slug}` — one shared bucket per FORM, not
  // per caller — and `callerIp` is always undefined, so the resume redeem forwards no address to
  // core either. The GET route's own identity test above cannot catch this: it is a different
  // route with its own separate `requestIdentityHandler()` mount.
  it('builds callerKey and callerIp from the resolved peer, not the per-form slug fallback', async () => {
    process.env.FORMS_TRUSTED_PROXY_HOPS = '1';
    await withServer(async (get) => {
      const res = await get('/f/customer-survey/resume', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.7' },
      });
      await res.text();

      expect(resumeDepsCtx?.callerKey).not.toBe('slug:customer-survey');
      expect(resumeDepsCtx?.callerIp).toBe('198.51.100.7');
    });
  });
});
