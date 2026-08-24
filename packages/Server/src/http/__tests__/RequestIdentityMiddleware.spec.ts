/**
 * Route-level tests: a real Express app, a real socket, a real request. The unit tests in
 * `request-identity.spec.ts` cover the resolution rules; what only a real request can show is
 * that the identity established in pre-auth middleware is still in scope by the time a
 * downstream handler asks for it — the property the whole seam depends on and the one that would
 * fail silently, charging every caller to whichever bucket happened to be ambient.
 *
 * `@memberjunction/server` is mocked because importing it for real runs `loadConfig()` at module
 * load and throws without a live MJ config (same reason `WidgetBundleMiddleware.spec.ts` does it).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {},
}));

import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { RequestIdentityMiddleware, trustedProxyHops } from '../RequestIdentityMiddleware';
import { currentRequestIdentity } from '../request-identity';

afterEach(() => {
  delete process.env.FORMS_TRUSTED_PROXY_HOPS;
});

/** Serve the identity the middleware established, so a test can read it over HTTP. */
async function withIdentityRoute(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  const middleware = new RequestIdentityMiddleware();
  middleware.ConfigureExpressApp(app);
  for (const handler of middleware.GetPreAuthMiddleware()) {
    app.use(handler);
  }
  app.get('/whoami', (_req, res) => {
    res.json({ ipHash: currentRequestIdentity()?.ipHash ?? null });
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('RequestIdentityMiddleware', () => {
  it('gives a downstream route an identity the caller could not have chosen', async () => {
    await withIdentityRoute(async (baseUrl) => {
      const plain = await (await fetch(`${baseUrl}/whoami`)).json();
      const spoofed = await (
        await fetch(`${baseUrl}/whoami`, { headers: { 'x-forwarded-for': '9.9.9.9' } })
      ).json();

      expect(plain.ipHash).toMatch(/^[0-9a-f]{64}$/);
      // No proxy is trusted by default, so the header changed nothing: same caller, same bucket.
      expect(spoofed.ipHash).toBe(plain.ipHash);
    });
  });

  it('reads the hop a trusted proxy wrote, and ignores what the caller prepended to it', async () => {
    process.env.FORMS_TRUSTED_PROXY_HOPS = '1';
    await withIdentityRoute(async (baseUrl) => {
      const whoami = async (forwardedFor: string): Promise<string | null> =>
        (await (await fetch(`${baseUrl}/whoami`, { headers: { 'x-forwarded-for': forwardedFor } })).json()).ipHash;

      // Our proxy appended `203.0.113.7`; `9.9.9.9` is whatever the caller typed to its left.
      const forged = await whoami('9.9.9.9, 203.0.113.7');
      const bare = await whoami('203.0.113.7');
      const other = await whoami('198.51.100.4');

      expect(forged).toBe(bare);
      expect(other).not.toBe(bare);
    });
  });

  it('refuses to start on a malformed hop count rather than quietly trusting nothing', () => {
    // Coercing junk to 0 is the most dangerous possible reading of this setting: somebody only
    // sets it because a proxy IS in front, and 0 keys every respondent on that proxy's address —
    // one bucket for the whole deployment, which is the failure the ceilings exist to prevent.
    // A boot-time throw is loud, immediate, and cannot reach production unnoticed.
    for (const bad of ['one', '1.5', '-1']) {
      process.env.FORMS_TRUSTED_PROXY_HOPS = bad;
      expect(() => trustedProxyHops()).toThrow(/FORMS_TRUSTED_PROXY_HOPS/);
    }
  });

  it('treats an unset or blank hop count as a directly-addressed API', () => {
    // Blank counts as unset rather than malformed: `FORMS_TRUSTED_PROXY_HOPS=` is what a .env
    // looks like with the value commented out, and refusing to boot on that would be a bug.
    delete process.env.FORMS_TRUSTED_PROXY_HOPS;
    expect(trustedProxyHops()).toBe(0);
    process.env.FORMS_TRUSTED_PROXY_HOPS = '   ';
    expect(trustedProxyHops()).toBe(0);
  });
});

