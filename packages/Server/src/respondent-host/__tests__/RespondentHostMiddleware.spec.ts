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
  return { ...actual, RunView, LogStatus: () => undefined, LogError: () => undefined };
});

/** The outcome the faked redeem returns; set per test. */
let redeemOutcome: { ok: boolean; token?: string; distribution?: mjBizAppsFormsFormDistributionEntityType };

vi.mock('../redeem.service', () => ({
  redeemSlugToToken: async () => redeemOutcome,
}));

import express, { type Express } from 'express';
import compression from 'compression';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { RespondentHostMiddleware } from '../RespondentHostMiddleware';
import { resetRespondentHostConfigForTests } from '../config';

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
async function withServer(assertions: (get: (route: string) => Promise<Response>) => Promise<void>): Promise<void> {
  const app = express();
  await mountLikeMJServer(app, new RespondentHostMiddleware());
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolveListening) => server.once('listening', () => resolveListening()));
    const { port } = server.address() as AddressInfo;
    await assertions((route) => fetch(`http://127.0.0.1:${port}${route}`));
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
