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

// `ConfigureExpressApp` is the only base-class surface WidgetBundleMiddleware touches, and it
// overrides it outright — so an empty base is a faithful stand-in.
vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {},
}));

import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { WidgetBundleMiddleware } from '../WidgetBundleMiddleware';
import { resetWidgetBundleConfigForTests, WIDGET_BUNDLE_ROUTE, WIDGET_SOURCEMAP_ROUTE } from '../config';

/** Stand-in for the real bundle — the bytes only need to be recognisable and non-empty. */
const BUNDLE_BYTES = 'customElements.define("mj-form", class extends HTMLElement {});';
const SOURCEMAP_BYTES = '{"version":3,"sources":["mj-form.ts"]}';

afterEach(() => {
  delete process.env.FORMS_WIDGET_BUNDLE_PATH;
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
 * Boot the middleware's routes on a real express server, run `assertions` against it, and always
 * close the listener — the try/finally is what keeps one failing expectation from leaking a port
 * into every later test in the file.
 */
async function withServer(assertions: (get: (route: string) => Promise<Response>) => Promise<void>): Promise<void> {
  const app = express();
  new WidgetBundleMiddleware().ConfigureExpressApp(app);

  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolveListening) => server.once('listening', () => resolveListening()));
    const { port } = server.address() as AddressInfo;
    await assertions((route) => fetch(`http://127.0.0.1:${port}${route}`));
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
  // for the wrong reason.
  it('serves the bundle from an ordinary install path', async () => {
    stageBundle(join('opt', 'app', 'dist', 'widget'));
    await withServer(async (get) => {
      const res = await get(WIDGET_BUNDLE_ROUTE);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(BUNDLE_BYTES);
    });
  });

  it('sets no-cache on the bundle so a rebuild is never masked by a stale copy', async () => {
    stageBundle(join('.worktrees', 'app'));
    await withServer(async (get) => {
      expect((await get(WIDGET_BUNDLE_ROUTE)).headers.get('cache-control')).toBe('no-cache');
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
