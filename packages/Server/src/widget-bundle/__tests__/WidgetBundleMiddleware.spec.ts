/**
 * Route-level tests for the widget-bundle middleware — a real express app, a real `res.sendFile`,
 * and real HTTP requests. The unit-level config tests in `config.spec.ts` cannot reach this bug
 * class at all: path RESOLUTION was always correct, it is path SERVING that failed.
 *
 * `@memberjunction/server` is mocked because importing it for real runs `loadConfig()` at module
 * load and throws `Configuration validation failed` without a live MJ config — the same reason
 * `MagicLinkInviteMinter.spec.ts` mocks it. Nothing else here is faked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// The base is mocked with the same DEFAULTS the real class has for the hooks `serve()` calls —
// an empty pre-auth contribution — so the harness below can drive the middleware through MJ's
// pipeline shape without dragging MJ's config loader in.
vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {
    GetPreAuthMiddleware(): RequestHandler[] {
      return [];
    }
  },
}));

import express, { type Express, type RequestHandler } from 'express';
import compression from 'compression';
import type { AddressInfo } from 'node:net';
import { request, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';

import { WidgetBundleMiddleware } from '../WidgetBundleMiddleware';
import { resetWidgetBundleConfigForTests, WIDGET_BUNDLE_ROUTE, WIDGET_SOURCEMAP_ROUTE } from '../config';

/**
 * Stand-in for the real bundle. Repeated past MJ's 1 KB compression threshold on purpose: the
 * real bundle is 1.2 MB, and a fixture small enough to fall under the threshold would make the
 * compression test pass-by-absence — no `Content-Encoding` because nothing was worth encoding.
 */
const BUNDLE_BYTES = 'customElements.define("mj-form", class extends HTMLElement {});\n'.repeat(40);
const SOURCEMAP_BYTES = '{"version":3,"sources":["mj-form.ts"]}';

/**
 * The compression MJServer mounts (`MJServer/src/index.ts`, "Fix #8"): a 1 KB threshold and
 * level 6. Copied rather than imported because MJServer does not export it; what matters is
 * the position it is mounted in, which `mountLikeMJServer` reproduces.
 */
const MJ_COMPRESSION_THRESHOLD_BYTES = 1024;
const MJ_COMPRESSION_LEVEL = 6;

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  delete process.env.FORMS_WIDGET_BUNDLE_PATH;
  delete process.env.FORMS_WIDGET_SOURCEMAP_ENABLED;
  process.env.NODE_ENV = originalNodeEnv;
  resetWidgetBundleConfigForTests();
});

/**
 * Write a bundle + sourcemap under `installSubpath` of a fresh temp dir and point the config at it.
 *
 * `installSubpath` is the whole point of the helper: it is how a test chooses a dotted install
 * layout (`.worktrees/app`) versus an ordinary one, which is the single variable this file exists
 * to isolate.
 */
function stageBundle(installSubpath: string, options: { withSourcemap: boolean } = { withSourcemap: true }): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'mjf-widget-route-')), installSubpath);
  mkdirSync(dir, { recursive: true });
  const bundle = join(dir, 'mj-form.js');
  writeFileSync(bundle, BUNDLE_BYTES);
  if (options.withSourcemap) {
    writeFileSync(`${bundle}.map`, SOURCEMAP_BYTES);
  }
  process.env.FORMS_WIDGET_BUNDLE_PATH = bundle;
  resetWidgetBundleConfigForTests();
  return bundle;
}

/**
 * Mount the middleware in the ORDER MJServer's `serve()` does, because the order is the bug.
 *
 * `serve()` calls `ConfigureExpressApp` while it is still collecting middleware contributions,
 * then mounts `compression()`, then the pre-auth handlers, and only then its own routes — the
 * ones that answer 401 to anything unauthenticated. A route registered through
 * `ConfigureExpressApp` therefore sits AHEAD of compression in Express's stack and finishes its
 * response before compression ever wraps it; one contributed through `GetPreAuthMiddleware`
 * sits behind it. The trailing 401 stands in for MJAPI's authenticated routes so that "the
 * sourcemap route fell through" shows up as the 401 it really produces, not as a bare 404 from
 * an empty app.
 */
function mountLikeMJServer(app: Express, middleware: WidgetBundleMiddleware): void {
  middleware.ConfigureExpressApp?.(app);
  app.use(compression({ threshold: MJ_COMPRESSION_THRESHOLD_BYTES, level: MJ_COMPRESSION_LEVEL }));
  for (const handler of middleware.GetPreAuthMiddleware()) {
    app.use(handler);
  }
  app.use((_req, res) => {
    res.status(401).type('text/plain').send('Unauthorized');
  });
}

type Fetch = (route: string, init?: RequestInit) => Promise<Response>;

/** What a raw conditional GET came back with — status plus the headers a cache would read. */
interface ConditionalResult {
  status: number | undefined;
  cacheControl: string | undefined;
}

/**
 * A conditional GET over `node:http`, NOT `fetch`.
 *
 * `fetch` (undici) is the wrong client for this one assertion: given an `If-None-Match` it adds
 * `Cache-Control: no-cache` + `Pragma: no-cache` to the outgoing REQUEST, and `send`'s freshness
 * check honours a request-side `no-cache` by never answering 304. Browsers and curl send no such
 * header on an ordinary revalidation, so a `fetch`-based test would report the route broken
 * (200 with a body) when the route is fine. Reproduced against the live host with curl: 304.
 */
function conditionalGet(port: number, route: string, etag: string): Promise<ConditionalResult> {
  return new Promise((resolveResult, rejectResult) => {
    const req = request(
      { host: '127.0.0.1', port, path: route, headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': etag } },
      (res) => {
        res.resume();
        res.on('end', () =>
          resolveResult({ status: res.statusCode, cacheControl: res.headers['cache-control'] }),
        );
      },
    );
    req.on('error', rejectResult);
    req.end();
  });
}

/**
 * Boot the middleware's routes on a real express server, run `assertions` against it, and always
 * close the listener — the try/finally is what keeps one failing expectation from leaking a port
 * into every later test in the file.
 */
async function withServer(assertions: (get: Fetch, port: number) => Promise<void>): Promise<void> {
  const app = express();
  mountLikeMJServer(app, new WidgetBundleMiddleware());

  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolveListening) => server.once('listening', () => resolveListening()));
    const { port } = server.address() as AddressInfo;
    await assertions((route, init) => fetch(`http://127.0.0.1:${port}${route}`, init), port);
  } finally {
    // `fetch` leaves a keep-alive socket open, and `close()` waits on idle sockets until
    // `keepAliveTimeout` (5s) expires — which is exactly the default test timeout. Drop the
    // sockets first so teardown is immediate rather than a coin flip against the timeout.
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

describe('widget bundle route', () => {
  // The bug (#24): express's `send` defaults `dotfiles` to 'ignore' and tests EVERY segment of the
  // absolute path, not just the basename. Any install under `.worktrees/`, `.claude/`,
  // `/opt/.releases/`, `~/.local/share/` therefore 404'd inside `send` and surfaced as a 500 here —
  // while boot still logged "Widget bundle served at ...", so the only symptom was a blank form.
  it('serves the bundle from an install path containing a dot segment', async () => {
    stageBundle(join('.worktrees', 'app', 'node_modules', '@mj-biz-apps', 'forms-ng', 'dist', 'widget'));
    await withServer(async (get) => {
      const res = await get(WIDGET_BUNDLE_ROUTE);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(BUNDLE_BYTES);
    });
  });

  // The sourcemap goes through the same `serveStaticAsset` helper, so it shared the defect —
  // devtools got a 500 on exactly the asset that makes a minified production fault readable.
  it('serves the sourcemap from an install path containing a dot segment', async () => {
    stageBundle(join('.releases', 'current'));
    await withServer(async (get) => {
      const res = await get(WIDGET_SOURCEMAP_ROUTE);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(SOURCEMAP_BYTES);
    });
  });

  // The control: without this, a harness that never served anything would pass the tests above
  // for the wrong reason. Its value depends entirely on the path being dot-free, and the staging
  // root comes from `tmpdir()` — so on a host whose TMPDIR itself contains a dot segment this
  // would quietly become a fourth dotted case and stop controlling for anything. Asserted rather
  // than assumed.
  it('serves the bundle from an ordinary install path', async () => {
    const staged = stageBundle(join('opt', 'app', 'dist', 'widget'));
    expect(staged.split(sep).some((segment) => segment.length > 1 && segment.startsWith('.'))).toBe(false);

    await withServer(async (get) => {
      const res = await get(WIDGET_BUNDLE_ROUTE);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(BUNDLE_BYTES);
    });
  });

  // The status assertion is not decoration. `Cache-Control` is set BEFORE `sendFile` and the error
  // branch overrides only status and content type, so the header survives a failed send — an
  // earlier version of this test asserted the header alone, staged a dotted path, and stayed green
  // with the fix reverted and the route answering 500. It looked like a third dotted-path
  // assertion while proving nothing about the route working at all.
  it('serves the bundle with no-cache, so a rebuild is never masked by a stale copy', async () => {
    stageBundle(join('.worktrees', 'app'));
    await withServer(async (get) => {
      const res = await get(WIDGET_BUNDLE_ROUTE);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-cache');
    });
  });

  // `FORMS_WIDGET_BUNDLE_PATH` is set by hand or by a deploy script, and scripts compose paths:
  // `$APP_ROOT/../shared/widget/mj-form.js` is an ordinary thing to write. The file exists and
  // `existsSync` agrees, but `send` rejects any unnormalised `..` with 403, which this route's
  // callback turns into a 500 — the exact #24 symptom (file present, boot logs success, blank
  // form) reached by a different route. Built by string concatenation because `join`/`resolve`
  // would collapse the `..` and quietly destroy the case under test.
  it('serves the bundle when the operator-set path contains a ".." segment', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mjf-widget-dotdot-'));
    mkdirSync(join(root, 'shared', 'widget'), { recursive: true });
    mkdirSync(join(root, 'app'), { recursive: true });
    writeFileSync(join(root, 'shared', 'widget', 'mj-form.js'), BUNDLE_BYTES);
    process.env.FORMS_WIDGET_BUNDLE_PATH = `${root}/app/../shared/widget/mj-form.js`;
    resetWidgetBundleConfigForTests();

    await withServer(async (get) => {
      const res = await get(WIDGET_BUNDLE_ROUTE);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(BUNDLE_BYTES);
    });
  });

  // Guards the `!filePath` branch of `serveStaticAsset` — shared by both assets, so covering it
  // once here covers it for the bundle too. Allowing dotfiles must not turn "never built" into
  // anything other than a clean 404; that 404 is what tells an operator to run the build.
  //
  // Deliberately asserted via the SOURCEMAP rather than the bundle: a missing bundle falls through
  // to `require.resolve('@mj-biz-apps/forms-ng/...')`, which in this monorepo resolves to the real
  // built artifact — so a bundle-based version of this test would assert 404 and get 200 on any
  // machine that had run the build. The sourcemap has no such fallback.
  it('answers 404 for the sourcemap when the build emitted none', async () => {
    stageBundle(join('.worktrees', 'app'), { withSourcemap: false });
    await withServer(async (get) => {
      expect((await get(WIDGET_SOURCEMAP_ROUTE)).status).toBe(404);
    });
  });
});

describe('widget bundle transfer (#121)', () => {
  // The bug: 1.2 MB served with no `Content-Encoding` to a client that offered gzip and brotli.
  // MJServer already mounts `compression()`; this route was simply registered ahead of it. The
  // decoded body is asserted too, so a route that set the header without encoding could not pass.
  it('serves the bundle gzip-encoded when the client offers gzip', async () => {
    stageBundle(join('opt', 'app', 'dist', 'widget'));
    expect(Buffer.byteLength(BUNDLE_BYTES)).toBeGreaterThan(MJ_COMPRESSION_THRESHOLD_BYTES);

    await withServer(async (get) => {
      const res = await get(WIDGET_BUNDLE_ROUTE, { headers: { 'Accept-Encoding': 'gzip' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-encoding')).toBe('gzip');
      expect(res.headers.get('vary')).toContain('Accept-Encoding');
      expect(await res.text()).toBe(BUNDLE_BYTES);
    });
  });

  // Acceptance criterion: repeat visits must revalidate exactly as before. `compression` keeps
  // the weak ETag `send` emits, and a conditional GET is answered 304 by `send` before any body
  // exists to compress — but that is two libraries' behaviour, so it is asserted, not assumed.
  it('still answers a conditional GET with 304 once compression is in front', async () => {
    stageBundle(join('opt', 'app', 'dist', 'widget'));
    await withServer(async (get, port) => {
      const first = await get(WIDGET_BUNDLE_ROUTE, { headers: { 'Accept-Encoding': 'gzip' } });
      await first.text();
      const etag = first.headers.get('etag');
      expect(etag).toBeTruthy();

      const again = await conditionalGet(port, WIDGET_BUNDLE_ROUTE, etag ?? '');
      expect(again.status).toBe(304);
      expect(again.cacheControl).toBe('no-cache');
    });
  });

  // `app.get` matched HEAD as well as GET; the smoke checks in the issue use `curl -I`. A route
  // contributed as a plain handler has to keep that, so it is pinned.
  it('answers HEAD for the bundle without a body', async () => {
    stageBundle(join('opt', 'app', 'dist', 'widget'));
    await withServer(async (get) => {
      const res = await get(WIDGET_BUNDLE_ROUTE, { method: 'HEAD' });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('');
    });
  });

  // A handler that claims its own path must leave every other path alone — MJAPI's own routes
  // are mounted behind it, and a handler that answered 404 for a path it did not own would shadow
  // them. The catch-all in `mountLikeMJServer` is what makes "left alone" observable.
  it('passes requests for other paths through to what is mounted behind it', async () => {
    stageBundle(join('opt', 'app', 'dist', 'widget'));
    await withServer(async (get) => {
      expect((await get('/forms/widget/other.js')).status).toBe(401);
      expect((await get('/')).status).toBe(401);
    });
  });
});

describe('widget sourcemap gate (#121)', () => {
  // These document the config → route contract rather than having driven new route code: the
  // gate lives in `getWidgetBundleConfig()` (see config.spec.ts) and the route's existing
  // "nothing to serve → 404" branch is the whole implementation. They exist because the
  // acceptance criterion is stated at the HTTP level — 404, never 401 — and only a mounted app
  // with something answering 401 behind the route can show the difference.
  it('answers 404 — not 401 — for the sourcemap when it is withheld in production', async () => {
    stageBundle(join('opt', 'app', 'dist', 'widget'));
    process.env.NODE_ENV = 'production';
    resetWidgetBundleConfigForTests();
    await withServer(async (get) => {
      const res = await get(WIDGET_SOURCEMAP_ROUTE);
      expect(res.status).toBe(404);
      // MJ core suppresses `LogStatus` entirely under NODE_ENV=production, so this body is the
      // only place the reason can be read on the host where the gate is on by default. "Not
      // found" would send an operator hunting for a missing build artefact that is right there.
      expect(await res.text()).toMatch(/not served on this host/);
      // The bundle itself is unaffected by the gate.
      expect((await get(WIDGET_BUNDLE_ROUTE)).status).toBe(200);
    });
  });

  it('serves the sourcemap in production when FORMS_WIDGET_SOURCEMAP_ENABLED=true', async () => {
    stageBundle(join('opt', 'app', 'dist', 'widget'));
    process.env.NODE_ENV = 'production';
    process.env.FORMS_WIDGET_SOURCEMAP_ENABLED = 'true';
    resetWidgetBundleConfigForTests();
    await withServer(async (get) => {
      const res = await get(WIDGET_SOURCEMAP_ROUTE);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(SOURCEMAP_BYTES);
    });
  });
});
