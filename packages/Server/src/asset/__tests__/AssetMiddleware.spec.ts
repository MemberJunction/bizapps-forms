/**
 * Route-level tests for the public asset read — the first this route has had.
 *
 * The bytes come from a faked `loadAssetBytes`, which is the whole I/O boundary: what is under test
 * is the ROUTE (which URLs it claims, and where it sits relative to MJ's `compression()`), not the
 * storage read, which `asset.service.spec.ts` already covers.
 *
 * The fixture is `image/svg+xml` on purpose. The four types in `FORMS_ASSET_ALLOWED_TYPES`'
 * default are all incompressible per `mime-db`, so a PNG fixture would pass this file by absence —
 * no `Content-Encoding` because nothing was ever going to be encoded. SVG is the compressible type
 * an operator can allow (`asset/config.ts:52` contemplates exactly that), so it is the one that can
 * tell a working route from a broken one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {
    GetPreAuthMiddleware(): unknown[] {
      return [];
    }
  },
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogStatus: () => undefined,
  LogError: () => undefined,
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { GetSystemUser: () => ({ ID: 'system-user-id' }) } },
}));

vi.mock('@memberjunction/storage', () => ({ FileStorageEngine: { Instance: {} } }));

/** An SVG comfortably over MJ's 1 KB threshold, so the compression assertion cannot pass by absence. */
const SVG_BYTES = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${'<rect width="1" height="1"/>'.repeat(60)}</svg>`,
);

/** The file id the route asked for, so the parity cases can assert what it read off the path. */
let requestedFileId: string | undefined;

vi.mock('../asset.service', () => ({
  loadAssetBytes: async (_ctx: unknown, fileId: string) => {
    requestedFileId = fileId;
    return { ok: true, asset: { contentType: 'image/svg+xml', content: SVG_BYTES } };
  },
}));

import express, { type Express } from 'express';
import compression from 'compression';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { AssetMiddleware } from '../AssetMiddleware';
import { ASSET_ROUTE, resetAssetConfigForTests } from '../config';

const MJ_COMPRESSION_THRESHOLD_BYTES = 1024;
const MJ_COMPRESSION_LEVEL = 6;

afterEach(() => {
  requestedFileId = undefined;
  resetAssetConfigForTests();
});

/** ConfigureExpressApp → compression() → pre-auth → the 401 standing in for MJAPI's routes. */
async function mountLikeMJServer(app: Express, middleware: AssetMiddleware): Promise<void> {
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
  await mountLikeMJServer(app, new AssetMiddleware());
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

describe('public asset transfer (#181)', () => {
  it('serves a compressible asset gzip-encoded when the client offers gzip', async () => {
    expect(SVG_BYTES.byteLength).toBeGreaterThan(MJ_COMPRESSION_THRESHOLD_BYTES);
    await withServer(async (get) => {
      const res = await get(`${ASSET_ROUTE}/an-id`, { headers: { 'Accept-Encoding': 'gzip' } });
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get('content-encoding')).toBe('gzip');
      expect(res.headers.get('vary')).toContain('Accept-Encoding');
      expect(body).toBe(SVG_BYTES.toString('utf8'));
    });
  });

  it('keeps the headers that make a stored file safe to serve on this origin', async () => {
    // Compression sits in front of the route now. The CSP + nosniff pair and the immutable cache
    // policy are what keep a stored document from being treated as an active one; a transfer
    // change must not have disturbed them.
    await withServer(async (get) => {
      const res = await get(`${ASSET_ROUTE}/an-id`);
      await res.text();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    });
  });
});

describe('the URLs the asset read still claims', () => {
  it.each([
    [`${ASSET_ROUTE}/abc`, 'abc'],
    [`${ASSET_ROUTE}/abc/`, 'abc'],
    ['/FORMS/ASSET/abc', 'abc'],
    [`${ASSET_ROUTE}/AbC`, 'AbC'],
  ])('answers %s with the file id %j', async (path, fileId) => {
    await withServer(async (get) => {
      const res = await get(path);
      await res.text();
      expect(res.status).toBe(200);
      expect(requestedFileId).toBe(fileId);
    });
  });

  it.each([ASSET_ROUTE, `${ASSET_ROUTE}/`, `${ASSET_ROUTE}/a/b`, `${ASSET_ROUTE}/abc//`])(
    'leaves %s to the routes behind it',
    async (path) => {
      await withServer(async (get) => {
        const res = await get(path);
        await res.text();
        expect(res.status).toBe(401);
      });
    },
  );

  it('answers HEAD, as app.get did', async () => {
    await withServer(async (get) => {
      const res = await get(`${ASSET_ROUTE}/abc`, { method: 'HEAD' });
      expect(res.status).toBe(200);
    });
  });

  it('leaves POST to the authenticated upload handler behind it', async () => {
    // POST /forms/asset is the WRITE, contributed post-auth. The read must not swallow it.
    await withServer(async (get) => {
      const res = await get(`${ASSET_ROUTE}/abc`, { method: 'POST' });
      await res.text();
      expect(res.status).toBe(401);
    });
  });
});
