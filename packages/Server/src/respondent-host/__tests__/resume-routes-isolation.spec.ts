/**
 * Route-level proof that the device-resume routes lease ONE isolated provider per request (#265),
 * lazily, and that an isolation failure never turns into a false "your pointer is dead".
 *
 * A separate file rather than a new `describe` in `RespondentHostMiddleware.spec.ts` on purpose:
 * that file's fake `@memberjunction/core` `RunView` and its existing 20 tests are unrelated to
 * provider ISOLATION, and mocking `../../automation/isolated-provider` for real here — rather than
 * leaving `Metadata.Provider` to whatever the process happens to hold — keeps this suite in full
 * control of both branches (acquire never called; acquire rejects) without touching that file at
 * all. Harness copied from there: a real express app, real HTTP requests, only the I/O boundaries
 * faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase } from '@memberjunction/core';

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

/** Every purpose string `withLazyIsolatedProvider` was called with, in order. */
const leasePurposes = vi.hoisted((): string[] => []);
/** The `acquire` spy handed to the most recent `withLazyIsolatedProvider` caller. */
let lastAcquire: ReturnType<typeof vi.fn> | undefined;
/** What `acquire()` does on the NEXT lease — configured per test, reset in `beforeEach`. */
let acquireBehavior: () => Promise<DatabaseProviderBase> = async () => ({} as DatabaseProviderBase);

vi.mock('../../automation/isolated-provider', () => ({
  withLazyIsolatedProvider: vi.fn(
    async <T>(purpose: string, work: (acquire: () => Promise<DatabaseProviderBase>) => Promise<T>): Promise<T> => {
      leasePurposes.push(purpose);
      lastAcquire = vi.fn(() => acquireBehavior());
      return work(lastAcquire);
    },
  ),
}));

vi.mock('../redeem.service', () => ({
  redeemSlugToToken: async () => ({ ok: true, token: 'session-jwt', distribution: undefined }),
  // Unused by any test here, but `resume-deps.ts` imports it by name.
  redeemRawToken: async () => undefined,
}));

import express, { type Express } from 'express';
import compression from 'compression';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { RespondentHostMiddleware } from '../RespondentHostMiddleware';
import { resetRespondentHostConfigForTests } from '../config';
import type { ResumeDepsContext } from '../resume-deps';

/** The ctx the route built for the resume dependency set — the seam for `acquireProvider`. */
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

const MJ_COMPRESSION_THRESHOLD_BYTES = 1024;
const MJ_COMPRESSION_LEVEL = 6;

/** Mount in MJServer's own order — see the sibling file for why this order matters. */
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
  assertions: (post: (route: string, init?: RequestInit) => Promise<Response>) => Promise<void>,
): Promise<void> {
  const app = express();
  await mountLikeMJServer(app, new RespondentHostMiddleware());
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolveListening) => server.once('listening', () => resolveListening()));
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;
    await assertions((route, init) => fetch(`${origin}${route}`, { method: 'POST', ...init }));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

beforeEach(() => {
  leasePurposes.length = 0;
  lastAcquire = undefined;
  resumeDepsCtx = undefined;
  acquireBehavior = async () => ({}) as DatabaseProviderBase;
});

afterEach(() => {
  resetRespondentHostConfigForTests();
});

describe("POST /f/:slug/resume — leases one isolated provider per request, lazily (#265)", () => {
  it('with no cookie: refuses at 410 without ever creating an isolated instance', async () => {
    await withServer(async (post) => {
      const res = await post('/f/customer-survey/resume');

      expect(res.status).toBe(410);
      expect(await res.json()).toEqual({ reason: 'no-pointer' });
      // ONE lease was opened for the request (the route always wraps the route body in one)...
      expect(leasePurposes).toHaveLength(1);
      expect(leasePurposes[0]).toMatch(/resume/i);
      expect(leasePurposes[0]).toContain('customer-survey');
      // ...but `runResume` returns before touching the database, so `acquire` is never called and
      // no isolated instance is ever created. A provider outage on this path must not turn a cheap
      // "you have no pointer" into a 500.
      expect(lastAcquire).toBeDefined();
      expect(lastAcquire).not.toHaveBeenCalled();
    });
  });

  it('when the lease cannot be created: 500, and the browser\'s cookie is left untouched', async () => {
    // A cookie IS present, so `runResume` gets past the `no-pointer` exit and reaches
    // `loadDistribution`, which awaits `acquire()` — this is the request that actually needs the
    // database, and it is the one where the outage must surface.
    acquireBehavior = async () => {
      throw new Error('isolated provider outage');
    };

    await withServer(async (post) => {
      const res = await post('/f/customer-survey/resume', { headers: { Cookie: 'mjf_resume=mj_ml_cookie' } });

      // No new catch inside `runResume`/`handleResumeRoute` for this: the rejection propagates to
      // the route's EXISTING `.catch` in `ConfigureExpressApp`, which answers 500 and — critically —
      // never calls `sendResumeOutcome`, so no `Set-Cookie` is ever appended. Clearing the pointer
      // here would treat a provider outage as proof the pointer is dead, which it is not (#265).
      expect(res.status).toBe(500);
      expect(res.headers.get('set-cookie')).toBeNull();
    });
  });

  it('threads its acquire function into the deps context the route builds', async () => {
    await withServer(async (post) => {
      await post('/f/customer-survey/resume');

      expect(resumeDepsCtx?.acquireProvider).toBe(lastAcquire);
    });
  });
});
