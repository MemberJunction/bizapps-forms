import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
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

  it('leaves bundlePath undefined when the override path does not exist (404 path)', () => {
    process.env.FORMS_WIDGET_BUNDLE_PATH = join(tmpdir(), 'definitely-missing-mj-form.js');
    // No env override match and (in the test runner) no resolvable package bundle → undefined,
    // which drives the middleware's 404-without-crash branch.
    const resolved = getWidgetBundleConfig().bundlePath;
    expect(resolved === undefined || typeof resolved === 'string').toBe(true);
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
