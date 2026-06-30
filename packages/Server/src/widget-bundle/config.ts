/**
 * Configuration + on-disk path resolution for the `<mj-form>` widget bundle (DG-5).
 *
 * The respondent host page loads the element via `<script src="/forms/widget/mj-form.js">`.
 * {@link WidgetBundleMiddleware} serves that route from the file produced by
 * `@mj-biz-apps/forms-ng`'s `build:widget` step (`dist/widget/mj-form.js`).
 *
 * Path resolution is layered so it works in a monorepo (hoisted) AND an installed Open App:
 *  1. `FORMS_WIDGET_BUNDLE_PATH` — explicit absolute override (CDN-staged copy, custom build).
 *  2. `require.resolve('@mj-biz-apps/forms-ng/dist/widget/mj-form.js')` — the installed package.
 *  3. Monorepo-relative fallback (`packages/Angular/dist/widget/mj-form.js`) for local dev where
 *     the package may not be resolvable by name from this one.
 *
 * Read once and memoized. Nothing here throws: a missing bundle resolves to `undefined` so the
 * middleware can 404 (with a clear log) instead of crashing boot.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** Route the widget bundle is served from (matches `host-page.ts`'s default bundle URL). */
export const WIDGET_BUNDLE_ROUTE = '/forms/widget/mj-form.js';

/** The bundle file `@mj-biz-apps/forms-ng`'s `build:widget` emits, relative to that package. */
const PACKAGE_BUNDLE_SUBPATH = '@mj-biz-apps/forms-ng/dist/widget/mj-form.js';

/** Frozen configuration for the widget-bundle route. */
export interface WidgetBundleConfig {
  enabled: boolean;
  /** Absolute path to the built bundle, or `undefined` if it could not be located. */
  bundlePath: string | undefined;
}

let cached: WidgetBundleConfig | undefined;

/** Read (and memoize) the widget-bundle configuration from the environment + filesystem. */
export function getWidgetBundleConfig(): WidgetBundleConfig {
  if (cached) {
    return cached;
  }
  cached = Object.freeze({
    enabled: process.env.FORMS_WIDGET_BUNDLE_ENABLED?.trim() !== 'false',
    bundlePath: resolveBundlePath(),
  });
  return cached;
}

/** Resolve the bundle's on-disk path via the layered strategy; `undefined` if none exist. */
function resolveBundlePath(): string | undefined {
  return resolveFromEnv() ?? resolveFromPackage() ?? resolveFromMonorepo();
}

/** (1) Explicit absolute override. */
function resolveFromEnv(): string | undefined {
  const explicit = process.env.FORMS_WIDGET_BUNDLE_PATH?.trim();
  return explicit && existsSync(explicit) ? explicit : undefined;
}

/** (2) The installed `@mj-biz-apps/forms-ng` package's emitted bundle. */
function resolveFromPackage(): string | undefined {
  try {
    const resolved = require.resolve(PACKAGE_BUNDLE_SUBPATH);
    return existsSync(resolved) ? resolved : undefined;
  } catch {
    return undefined;
  }
}

/** (3) Monorepo-relative fallback: `packages/Angular/dist/widget/mj-form.js`. */
function resolveFromMonorepo(): string | undefined {
  // From packages/Server/dist/widget-bundle → repo root is four levels up.
  const candidate = resolve(here, '../../../Angular/dist/widget/mj-form.js');
  return existsSync(candidate) ? candidate : undefined;
}

/** Test-only: clear the memoized config so env/filesystem changes take effect. */
export function resetWidgetBundleConfigForTests(): void {
  cached = undefined;
}
