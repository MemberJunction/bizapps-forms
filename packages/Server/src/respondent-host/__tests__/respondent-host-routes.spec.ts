/**
 * What the respondent host page and the favicon answer, and how they are transferred (#181).
 *
 * Separate from `RespondentHostMiddleware.spec.ts`, which is about what the page SAYS (title,
 * og: tags, token). This file is about the route: which URLs it claims, and whether the bytes are
 * compressed — the two things the move out of `ConfigureExpressApp` could break.
 *
 * The whole pipeline is mounted in `serve()`'s order, because the position of the route relative to
 * `compression()` IS the bug: `ConfigureExpressApp` runs at MJServer `index.ts:824`, compression is
 * mounted at `index.ts:1129`, and Express dispatches layers in registration order.
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

/** The slug the faked redeem was asked for, so the parity cases can assert what the route read. */
let redeemedSlug: string | undefined;
let redeemOutcome: { ok: boolean; token?: string; distribution?: mjBizAppsFormsFormDistributionEntityType };

vi.mock('../redeem.service', () => ({
  redeemSlugToToken: async (_deps: unknown, slug: string) => {
    redeemedSlug = slug;
    return redeemOutcome;
  },
}));

import express, { type Express } from 'express';
import compression from 'compression';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { RespondentHostMiddleware } from '../RespondentHostMiddleware';
import { resetRespondentHostConfigForTests } from '../config';

/**
 * The compression MJServer mounts (`MJServer/src/index.ts`, "Fix #8"): a 1 KB threshold, level 6.
 * Copied rather than imported because MJServer does not export it; what matters is the POSITION,
 * which `mountLikeMJServer` reproduces.
 */
const MJ_COMPRESSION_THRESHOLD_BYTES = 1024;
const MJ_COMPRESSION_LEVEL = 6;

const DISTRIBUTION = {
  ID: 'dist-1',
  FormID: 'form-1',
  Name: 'Share link',
  Slug: 'customer-survey',
  Form: 'Customer Satisfaction Survey',
  PublicLinkToken: 'raw',
} as unknown as mjBizAppsFormsFormDistributionEntityType;

beforeEach(() => {
  redeemedSlug = undefined;
  redeemOutcome = { ok: true, token: 'session-jwt', distribution: DISTRIBUTION };
  rowsByEntity['MJ_BizApps_Forms: Forms'] = [{ Description: 'Tell us how we did. Takes two minutes.' }];
});

afterEach(() => {
  resetRespondentHostConfigForTests();
});

/** ConfigureExpressApp → compression() → pre-auth → the 401 that stands in for MJAPI's routes. */
async function mountLikeMJServer(app: Express, middleware: RespondentHostMiddleware): Promise<void> {
  await middleware.ConfigureExpressApp?.(app);
  app.use(compression({ threshold: MJ_COMPRESSION_THRESHOLD_BYTES, level: MJ_COMPRESSION_LEVEL }));
  for (const handler of middleware.GetPreAuthMiddleware()) {
    app.use(handler);
  }
  app.use((_req, res) => {
    res.status(401).type('text/plain').send('Unauthorized');
  });
}

type Fetch = (route: string, init?: RequestInit) => Promise<Response>;

async function withServer(assertions: (get: Fetch) => Promise<void>): Promise<void> {
  const app = express();
  await mountLikeMJServer(app, new RespondentHostMiddleware());
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolveListening) => server.once('listening', () => resolveListening()));
    const { port } = server.address() as AddressInfo;
    await assertions((route, init) => fetch(`http://127.0.0.1:${port}${route}`, init));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

describe('respondent host page transfer (#181)', () => {
  // The bug: ~9 KB of text/html served with no Content-Encoding to a client that offered gzip,
  // on the first byte of every shared form link. The decoded body is asserted too, so a route that
  // set the header without encoding could not pass.
  it('serves the page gzip-encoded when the client offers gzip', async () => {
    await withServer(async (get) => {
      const res = await get('/f/customer-survey', { headers: { 'Accept-Encoding': 'gzip' } });
      const html = await res.text();

      expect(res.status).toBe(200);
      // Guards against passing by absence: a fixture under MJ's threshold would be skipped by
      // compression and this whole file would prove nothing.
      expect(Buffer.byteLength(html)).toBeGreaterThan(MJ_COMPRESSION_THRESHOLD_BYTES);
      expect(res.headers.get('content-encoding')).toBe('gzip');
      expect(res.headers.get('vary')).toContain('Accept-Encoding');
      expect(html).toContain('<title>Customer Satisfaction Survey</title>');
    });
  });

  it('still answers a client that offers no encoding, uncompressed', async () => {
    await withServer(async (get) => {
      const res = await get('/f/customer-survey', { headers: { 'Accept-Encoding': 'identity' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-encoding')).toBeNull();
      expect(await res.text()).toContain('<title>Customer Satisfaction Survey</title>');
    });
  });

  it('keeps the page out of shared caches', async () => {
    // The page carries a per-respondent session JWT. Compression sits in front of it now; that must
    // not have disturbed the header that keeps it from being cached for somebody else.
    await withServer(async (get) => {
      const res = await get('/f/customer-survey', { headers: { 'Accept-Encoding': 'gzip' } });
      await res.text();
      expect(res.headers.get('cache-control')).toBe('no-store');
    });
  });
});

describe('the URLs /f/:slug still claims', () => {
  it.each([
    ['/f/customer-survey', 'customer-survey'],
    // Express's router was case-insensitive and strict routing was off. A mis-cased or
    // trailing-slashed share link answered before the move and must answer after it.
    ['/f/customer-survey/', 'customer-survey'],
    ['/F/customer-survey', 'customer-survey'],
    // The slug keeps its own case — it is a database lookup key, not part of the route literal.
    ['/f/Customer-Survey', 'Customer-Survey'],
    ['/f/a%20b', 'a b'],
  ])('answers %s with the slug %j', async (path, slug) => {
    await withServer(async (get) => {
      const res = await get(path);
      await res.text();
      expect(res.status).toBe(200);
      expect(redeemedSlug).toBe(slug);
    });
  });

  it.each([['/f/abc//'], ['/f/'], ['/f'], ['/f/a/b']])('leaves %s to the routes behind it', async (path) => {
    await withServer(async (get) => {
      const res = await get(path);
      await res.text();
      expect(res.status).toBe(401);
    });
  });

  it('answers HEAD, as app.get did', async () => {
    await withServer(async (get) => {
      const res = await get('/f/customer-survey', { method: 'HEAD' });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });
  });

  it.each(['POST', 'PUT', 'DELETE'])('leaves %s to the routes behind it', async (method) => {
    await withServer(async (get) => {
      const res = await get('/f/customer-survey', { method });
      await res.text();
      expect(res.status).toBe(401);
    });
  });
});

describe('GET /favicon.ico', () => {
  it.each(['/favicon.ico', '/FAVICON.ICO', '/favicon.ico/'])('answers 204 with no body for %s', async (path) => {
    await withServer(async (get) => {
      const res = await get(path);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });
  });

  it('leaves /favicon.ico// to the routes behind it', async () => {
    await withServer(async (get) => {
      const res = await get('/favicon.ico//');
      await res.text();
      expect(res.status).toBe(401);
    });
  });
});
