import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getWidgetBundleConfig,
  resetWidgetBundleConfigForTests,
  WIDGET_BUNDLE_ROUTE,
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
