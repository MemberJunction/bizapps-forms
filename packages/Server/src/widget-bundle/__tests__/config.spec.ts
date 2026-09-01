import { afterEach, describe, expect, it, vi } from 'vitest';

// Only `LogError` is replaced — the gate's "never swallow a bad value" contract is asserted through
// it — and everything else in core is the real thing.
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: vi.fn(),
}));

import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { LogError } from '@memberjunction/core';
import {
  getWidgetBundleConfig,
  resetWidgetBundleConfigForTests,
  WIDGET_BUNDLE_ROUTE,
  WIDGET_SOURCEMAP_ROUTE,
} from '../config';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  delete process.env.FORMS_WIDGET_BUNDLE_ENABLED;
  delete process.env.FORMS_WIDGET_BUNDLE_PATH;
  delete process.env.FORMS_WIDGET_SOURCEMAP_ENABLED;
  process.env.NODE_ENV = originalNodeEnv;
  vi.mocked(LogError).mockClear();
  resetWidgetBundleConfigForTests();
});

/** Stage a bundle WITH a sourcemap beside it and point the config at it; returns the map's path. */
function stageBundleWithMap(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mjf-widget-map-gate-'));
  const bundle = join(dir, 'mj-form.js');
  writeFileSync(bundle, '// bundle');
  writeFileSync(`${bundle}.map`, '{"version":3}');
  process.env.FORMS_WIDGET_BUNDLE_PATH = bundle;
  resetWidgetBundleConfigForTests();
  return `${bundle}.map`;
}

describe('getWidgetBundleConfig', () => {
  it('serves the bundle at the route the host page references', () => {
    expect(WIDGET_BUNDLE_ROUTE).toBe('/forms/widget/mj-form.js');
  });

  it('is enabled by default and only disabled by an explicit "false"', () => {
    expect(getWidgetBundleConfig().enabled).toBe(true);
    resetWidgetBundleConfigForTests();
    process.env.FORMS_WIDGET_BUNDLE_ENABLED = 'false';
    expect(getWidgetBundleConfig().enabled).toBe(false);
  });

  it('resolves an existing FORMS_WIDGET_BUNDLE_PATH override', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mjf-widget-'));
    const file = join(dir, 'mj-form.js');
    writeFileSync(file, 'customElements.define("mj-form", class extends HTMLElement {});');
    process.env.FORMS_WIDGET_BUNDLE_PATH = file;
    expect(getWidgetBundleConfig().bundlePath).toBe(file);
  });

  it('ignores an override path that does not exist, rather than serving it', () => {
    const missing = join(tmpdir(), 'definitely-missing-mj-form.js');
    process.env.FORMS_WIDGET_BUNDLE_PATH = missing;
    // The previous assertion here was `resolved === undefined || typeof resolved === 'string'`,
    // which is every possible value of `string | undefined` — it could not fail. What actually
    // matters is narrower: whatever we resolve, it is never the missing path itself.
    expect(getWidgetBundleConfig().bundlePath).not.toBe(missing);
  });

  // `sendFile` throws a TypeError SYNCHRONOUSLY for a non-absolute path, before the error callback
  // it was given exists. In the route that meant the callback never ran, nothing was logged under
  // `[Forms]`, and express's default HTML error page went to the respondent — carrying a stack
  // trace under a non-production NODE_ENV. The config layer is the right place to stop it: the
  // docstring already calls this an "explicit absolute override", so honouring that is a guard,
  // not a new rule. `package.json` is deliberate — it EXISTS relative to the package cwd, so
  // `existsSync` alone waves it through.
  it('rejects a relative override path instead of passing it to sendFile', () => {
    process.env.FORMS_WIDGET_BUNDLE_PATH = 'package.json';
    expect(getWidgetBundleConfig().bundlePath).not.toBe('package.json');
  });

  it('never resolves a bundlePath that is not absolute', () => {
    process.env.FORMS_WIDGET_BUNDLE_PATH = 'package.json';
    const resolved = getWidgetBundleConfig().bundlePath;
    expect(resolved === undefined || isAbsolute(resolved)).toBe(true);
  });

  // A deploy script composing `$APP_ROOT/../shared/...` produces a real, existing path that
  // `send` rejects with 403 unless it is normalised first — surfacing as a 500 on a file that is
  // plainly there. Built by concatenation because `join`/`resolve` would collapse the `..`.
  it('normalises a ".." segment out of the override path', () => {
    const root = mkdtempSync(join(tmpdir(), 'mjf-widget-dotdot-cfg-'));
    mkdirSync(join(root, 'shared'), { recursive: true });
    mkdirSync(join(root, 'app'), { recursive: true });
    const real = join(root, 'shared', 'mj-form.js');
    writeFileSync(real, '// bundle');
    process.env.FORMS_WIDGET_BUNDLE_PATH = `${root}/app/../shared/mj-form.js`;
    expect(getWidgetBundleConfig().bundlePath).toBe(real);
  });

  it('memoizes config until reset', () => {
    const first = getWidgetBundleConfig();
    const second = getWidgetBundleConfig();
    expect(first).toBe(second);
    resetWidgetBundleConfigForTests();
    expect(getWidgetBundleConfig()).not.toBe(first);
  });
});

describe('widget sourcemap', () => {
  // esbuild is configured with `minify: true, sourcemap: true`, so the shipped bundle ends with
  // `//# sourceMappingURL=mj-form.js.map`. Nothing served that file, so every devtools session on
  // a public form fetched it and got a 401 (the path fell through to MJAPI's authenticated
  // routes). Emitting a reference to a file you refuse to serve is worse than not emitting it:
  // the bundle is minified, so the map is the only thing that makes a production fault readable.
  it('serves the map beside the bundle it is referenced from', () => {
    expect(WIDGET_SOURCEMAP_ROUTE).toBe(`${WIDGET_BUNDLE_ROUTE}.map`);
  });

  it('resolves the map next to the bundle when one was emitted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mjf-widget-map-'));
    const bundle = join(dir, 'mj-form.js');
    writeFileSync(bundle, '// bundle');
    writeFileSync(`${bundle}.map`, '{"version":3}');
    process.env.FORMS_WIDGET_BUNDLE_PATH = bundle;
    resetWidgetBundleConfigForTests();
    expect(getWidgetBundleConfig().sourcemapPath).toBe(`${bundle}.map`);
  });

  // A build without sourcemaps is legitimate; it must degrade to "no map route", never to a crash.
  it('is undefined when the build emitted no map', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mjf-widget-nomap-'));
    const bundle = join(dir, 'mj-form.js');
    writeFileSync(bundle, '// bundle');
    process.env.FORMS_WIDGET_BUNDLE_PATH = bundle;
    resetWidgetBundleConfigForTests();
    expect(getWidgetBundleConfig().sourcemapPath).toBeUndefined();
  });
});

describe('widget sourcemap gate (#121)', () => {
  // The route is public and unauthenticated, so on a production host it publishes the widget's
  // full annotated source (8.5 MB) to anyone who opens devtools on a form. Off by default there.
  // `NODE_ENV` is the switch this host already uses for the same class of decision (Apollo
  // stack traces), so no second notion of "production" is introduced.
  it('withholds the sourcemap under NODE_ENV=production unless explicitly enabled', () => {
    stageBundleWithMap();
    process.env.NODE_ENV = 'production';
    resetWidgetBundleConfigForTests();
    const cfg = getWidgetBundleConfig();
    expect(cfg.sourcemapEnabled).toBe(false);
    expect(cfg.sourcemapPath).toBeUndefined();
  });

  it('serves the sourcemap under NODE_ENV=production when FORMS_WIDGET_SOURCEMAP_ENABLED=true', () => {
    const map = stageBundleWithMap();
    process.env.NODE_ENV = 'production';
    process.env.FORMS_WIDGET_SOURCEMAP_ENABLED = 'true';
    resetWidgetBundleConfigForTests();
    const cfg = getWidgetBundleConfig();
    expect(cfg.sourcemapEnabled).toBe(true);
    expect(cfg.sourcemapPath).toBe(map);
  });

  it('serves the sourcemap by default outside production', () => {
    const map = stageBundleWithMap();
    process.env.NODE_ENV = 'development';
    resetWidgetBundleConfigForTests();
    const cfg = getWidgetBundleConfig();
    expect(cfg.sourcemapEnabled).toBe(true);
    expect(cfg.sourcemapPath).toBe(map);
  });

  it('withholds the sourcemap outside production when FORMS_WIDGET_SOURCEMAP_ENABLED=false', () => {
    stageBundleWithMap();
    process.env.NODE_ENV = 'development';
    process.env.FORMS_WIDGET_SOURCEMAP_ENABLED = 'false';
    resetWidgetBundleConfigForTests();
    const cfg = getWidgetBundleConfig();
    expect(cfg.sourcemapEnabled).toBe(false);
    expect(cfg.sourcemapPath).toBeUndefined();
  });

  // A typo must not be silently read as either answer. The default for the environment applies
  // and the rejection is logged, so an operator who set the variable on purpose can see it was
  // not honoured — the same posture `FORMS_WIDGET_BUNDLE_PATH` takes for a bad path.
  it('logs an unrecognised FORMS_WIDGET_SOURCEMAP_ENABLED value and applies the default', () => {
    stageBundleWithMap();
    process.env.NODE_ENV = 'production';
    process.env.FORMS_WIDGET_SOURCEMAP_ENABLED = 'yes';
    resetWidgetBundleConfigForTests();
    const cfg = getWidgetBundleConfig();
    expect(cfg.sourcemapEnabled).toBe(false);
    expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining('FORMS_WIDGET_SOURCEMAP_ENABLED'));
  });
});
