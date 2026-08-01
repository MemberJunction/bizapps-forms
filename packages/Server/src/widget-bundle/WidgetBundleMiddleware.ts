/**
 * Serves the built `<mj-form>` custom-element bundle as an unauthenticated route on MJAPI (DG-5).
 *
 * Registered via `@RegisterClass(BaseServerMiddleware, 'mj:formsWidgetBundle')` so MJ server
 * bootstrap discovers it through ClassFactory — no core fork, no Explorer shell. Mirrors
 * {@link RespondentHostMiddleware}: it adds a route through {@link ConfigureExpressApp} (the
 * available hook on the pinned MJ release, which ships only `BaseServerMiddleware`).
 *
 * The respondent host page references this bundle via `<script src="/forms/widget/mj-form.js">`.
 * Without it, `customElements.whenDefined('mj-form')` never resolves and every public form fails
 * after the page's 10s safety timeout. This route closes that gap.
 *
 * The route runs BEFORE auth (it is just a static JS asset) so an anonymous respondent loads it
 * without a login. If the bundle file cannot be located (e.g. the package was never built), the
 * route returns 404 with a clear log line — it never crashes boot.
 */
import type { Application, Request, Response } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from '@memberjunction/server';
import { LogStatus, LogError } from '@memberjunction/core';

import { getWidgetBundleConfig, WIDGET_BUNDLE_ROUTE, WIDGET_SOURCEMAP_ROUTE } from './config.js';

@RegisterClass(BaseServerMiddleware, 'mj:formsWidgetBundle')
export class WidgetBundleMiddleware extends BaseServerMiddleware {
  public get Label(): string {
    return 'mj:formsWidgetBundle';
  }

  public override get Enabled(): boolean {
    return getWidgetBundleConfig().enabled;
  }

  public override ConfigureExpressApp(app: Application): void {
    const cfg = getWidgetBundleConfig();

    // Both routes are registered unconditionally, so the route table does not depend on whether
    // the artifact existed at boot, and a missing file answers 404 rather than falling through to
    // MJAPI's authenticated routes and answering 401 (which is what the sourcemap used to do).
    //
    // Path resolution is MEMOIZED, not per-request: `getWidgetBundleConfig()` freezes its result
    // on first call and this method calls it eagerly above, so the lookup happens once at boot.
    // A bundle built after MJAPI starts therefore needs a server restart, not just a page reload
    // — the `resolvePath` indirection below exists to share one handler between two assets, not
    // to re-probe the filesystem.
    this.serveStaticAsset(app, {
      route: WIDGET_BUNDLE_ROUTE,
      contentType: 'text/javascript',
      resolvePath: () => getWidgetBundleConfig().bundlePath,
      label: 'widget bundle',
      missingMessage: 'Form widget bundle not found.',
      // Only the bundle is worth a log line: a missing bundle means every public form is broken,
      // whereas a missing sourcemap means devtools is slightly less useful.
      logWhenMissing:
        `[Forms] Widget bundle not found for ${WIDGET_BUNDLE_ROUTE}. Run ` +
        `"npm run build" in @mj-biz-apps/forms-ng, or set FORMS_WIDGET_BUNDLE_PATH.`,
    });

    // The bundle is minified and carries `//# sourceMappingURL=mj-form.js.map`, so the browser
    // asks for this on every devtools session. Unserved, it fell through to the authenticated
    // routes and answered 401 — a reference the build emits and the server refuses.
    this.serveStaticAsset(app, {
      route: WIDGET_SOURCEMAP_ROUTE,
      contentType: 'application/json',
      resolvePath: () => getWidgetBundleConfig().sourcemapPath,
      label: 'widget sourcemap',
      missingMessage: 'Form widget sourcemap not found.',
    });

    if (cfg.bundlePath) {
      LogStatus(`[Forms] Widget bundle served at ${WIDGET_BUNDLE_ROUTE} (from ${cfg.bundlePath})`);
    } else {
      LogStatus(
        `[Forms] Widget bundle route ${WIDGET_BUNDLE_ROUTE} registered, but no bundle found yet ` +
          `(will 404 until "npm run build" runs or FORMS_WIDGET_BUNDLE_PATH is set).`,
      );
    }
  }

  /**
   * Register one unauthenticated static-file route.
   *
   * The bundle and its sourcemap differ only in which config property they read, their content
   * type, and whether a missing file deserves a log — so they share this rather than carrying two
   * copies of the same send-with-fallbacks dance.
   */
  private serveStaticAsset(app: Application, asset: StaticAsset): void {
    app.get(asset.route, (_req: Request, res: Response) => {
      const filePath = asset.resolvePath();
      if (!filePath) {
        if (asset.logWhenMissing) {
          LogError(asset.logWhenMissing);
        }
        res.status(404).type('text/plain').send(asset.missingMessage);
        return;
      }
      res
        .status(200)
        .type(asset.contentType)
        // These URLs are UNVERSIONED, so they must never be blindly cached — a stale copy silently
        // pins respondents (and devs) to an old widget across rebuilds. `no-cache` = the browser
        // may store it but MUST revalidate every load; Express's ETag/Last-Modified then yields a
        // cheap 304 when unchanged and the fresh file when it changes. (Switch to a content-hashed
        // URL + immutable if long-term CDN caching is ever wanted.)
        .set('Cache-Control', 'no-cache')
        .sendFile(filePath, (err) => {
          if (err && !res.headersSent) {
            LogError(`[Forms] Failed to send ${asset.label} ${filePath}: ${String(err)}`);
            res.status(500).type('text/plain').send(`Failed to load form ${asset.label}.`);
          }
        });
    });
  }
}

/** One unauthenticated static file this middleware serves. */
interface StaticAsset {
  route: string;
  contentType: string;
  /**
   * Reads the asset's path off the config. Called per request, but the config memoizes on first
   * use, so this returns the same boot-time answer every time — it selects WHICH path, it does
   * not re-probe the filesystem.
   */
  resolvePath: () => string | undefined;
  /** Human-readable name used in error copy and logs. */
  label: string;
  missingMessage: string;
  /** Logged when the file is absent — omitted for assets whose absence is not an incident. */
  logWhenMissing?: string;
}
