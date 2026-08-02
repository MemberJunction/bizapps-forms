import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getWidgetBundleConfig,
  resetWidgetBundleConfigForTests,
  WIDGET_BUNDLE_ROUTE,
  WIDGET_SOURCEMAP_ROUTE,
} from '../config';

afterEach(() => {
  delete process.env.FORMS_WIDGET_BUNDLE_ENABLED;
  delete process.env.FORMS_WIDGET_BUNDLE_PATH;
  resetWidgetBundleConfigForTests();
});

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
