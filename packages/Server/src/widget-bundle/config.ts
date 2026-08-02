/**
 * Configuration + on-disk path resolution for the `<mj-form>` widget bundle (DG-5).
 *
 * The respondent host page loads the element via `<script src="/forms/widget/mj-form.js">`.
 * {@link WidgetBundleMiddleware} serves that route from the file produced by
 * `@mj-biz-apps/forms-ng`'s `build` (`dist/widget/mj-form.js`).
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
import { dirname, isAbsolute, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { LogError } from '@memberjunction/core';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** Route the widget bundle is served from (matches `host-page.ts`'s default bundle URL). */
export const WIDGET_BUNDLE_ROUTE = '/forms/widget/mj-form.js';

/**
 * Route the bundle's sourcemap is served from.
 *
 * Not a nicety: esbuild builds the widget with `minify: true, sourcemap: true`, so the shipped
 * bundle ends with `//# sourceMappingURL=mj-form.js.map`. With nothing serving that path it fell
 * through to MJAPI's authenticated routes and answered 401 on every devtools session, and the
 * minified bundle is unreadable without it.
 */
export const WIDGET_SOURCEMAP_ROUTE = `${WIDGET_BUNDLE_ROUTE}.map`;

/** The bundle file `@mj-biz-apps/forms-ng`'s `build` emits, relative to that package. */
const PACKAGE_BUNDLE_SUBPATH = '@mj-biz-apps/forms-ng/dist/widget/mj-form.js';

/** Frozen configuration for the widget-bundle route. */
export interface WidgetBundleConfig {
  enabled: boolean;
  /** Absolute path to the built bundle, or `undefined` if it could not be located. */
  bundlePath: string | undefined;
  /**
   * Absolute path to the bundle's sourcemap, or `undefined` when the build emitted none.
   *
   * Resolved BY CONVENTION as `<bundle>.map` — the bundle is not opened and its
   * `sourceMappingURL` comment is not parsed. That matches what esbuild emits for the config in
   * `build-widget.mjs`, and is why a build that renamed or relocated its map would serve a 404
   * here rather than the wrong file.
   */
  sourcemapPath: string | undefined;
}

let cached: WidgetBundleConfig | undefined;

/** Read (and memoize) the widget-bundle configuration from the environment + filesystem. */
export function getWidgetBundleConfig(): WidgetBundleConfig {
  if (cached) {
    return cached;
  }
  const bundlePath = resolveBundlePath();
  cached = Object.freeze({
    enabled: process.env.FORMS_WIDGET_BUNDLE_ENABLED?.trim() !== 'false',
    bundlePath,
    sourcemapPath: resolveSourcemapPath(bundlePath),
  });
  return cached;
}

/** The map esbuild writes beside the bundle; `undefined` when built without sourcemaps. */
function resolveSourcemapPath(bundlePath: string | undefined): string | undefined {
  if (!bundlePath) {
    return undefined;
  }
  const candidate = `${bundlePath}.map`;
  return existsSync(candidate) ? candidate : undefined;
}

/** Resolve the bundle's on-disk path via the layered strategy; `undefined` if none exist. */
function resolveBundlePath(): string | undefined {
  return resolveFromEnv() ?? resolveFromPackage() ?? resolveFromMonorepo();
}

/**
 * (1) Explicit absolute override.
 *
 * Validated rather than trusted, because this is the one layer whose value a human types. The
 * other two resolvers produce normalised absolute paths by construction (`require.resolve`,
 * `resolve()`); this one used to hand `send` whatever the environment said, gated only on
 * `existsSync`. Two shapes that `existsSync` happily accepts both broke the route on a file that
 * was plainly there:
 *
 *  - RELATIVE (`package.json`) — `res.sendFile` throws a TypeError *synchronously*, before the
 *    error callback it was handed exists. Nothing was logged under `[Forms]` and the respondent
 *    got express's default HTML error page, with a stack trace under a non-production NODE_ENV.
 *  - UNNORMALISED (`$APP_ROOT/../shared/widget/mj-form.js`, which deploy scripts write) — `send`
 *    rejects any surviving `..` with 403, which the route turns into a 500.
 *
 * Both reproduce #24's signature exactly: the file exists, boot logs success, the respondent sees
 * a blank form. A rejected override is LOGGED, never swallowed — an operator who set this
 * variable deliberately must not have to infer from a blank form that it was ignored.
 */
function resolveFromEnv(): string | undefined {
  const explicit = process.env.FORMS_WIDGET_BUNDLE_PATH?.trim();
  if (!explicit) {
    return undefined;
  }
  if (!isAbsolute(explicit)) {
    LogError(
      `[Forms] FORMS_WIDGET_BUNDLE_PATH must be an absolute path; ignoring "${explicit}". ` +
        `Relative paths resolve against the server's working directory, not the app root.`,
    );
    return undefined;
  }
  // Collapses `..`/`.` segments that `send` would otherwise reject with 403. Safe to apply after
  // the absolute check: `resolve()` on an absolute path only normalises it, and never reintroduces
  // the working directory the way it would for a relative one.
  const normalized = resolve(explicit);
  if (!existsSync(normalized)) {
    LogError(`[Forms] FORMS_WIDGET_BUNDLE_PATH does not exist; ignoring "${normalized}".`);
    return undefined;
  }
  return normalized;
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
