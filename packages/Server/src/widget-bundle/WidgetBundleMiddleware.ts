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

    app.get(WIDGET_BUNDLE_ROUTE, (_req: Request, res: Response) => {
      const bundlePath = getWidgetBundleConfig().bundlePath;
      if (!bundlePath) {
        LogError(
          `[Forms] Widget bundle not found for ${WIDGET_BUNDLE_ROUTE}. Run ` +
            `"npm run build" in @mj-biz-apps/forms-ng, or set FORMS_WIDGET_BUNDLE_PATH.`,
        );
        res.status(404).type('text/plain').send('Form widget bundle not found.');
        return;
      }
      res
        .status(200)
        .type('text/javascript')
        // The bundle URL is UNVERSIONED (/forms/widget/mj-form.js), so it must never be blindly
        // cached — a stale copy silently pins respondents (and devs) to an old widget across
        // rebuilds. `no-cache` = the browser may store it but MUST revalidate every load; Express's
        // ETag/Last-Modified then yields a cheap 304 when unchanged and the fresh bundle when it
        // changes. (Switch to a content-hashed URL + immutable if long-term CDN caching is wanted.)
        .set('Cache-Control', 'no-cache')
        .sendFile(bundlePath, (err) => {
          if (err && !res.headersSent) {
            LogError(`[Forms] Failed to send widget bundle ${bundlePath}: ${String(err)}`);
            res.status(500).type('text/plain').send('Failed to load form widget.');
          }
        });
    });

    // The bundle is minified and carries `//# sourceMappingURL=mj-form.js.map`, so the browser
    // asks for this on every devtools session. Unserved, it fell through to the authenticated
    // routes and answered 401 — a reference the build emits and the server refuses. Registered
    // only when a map was actually emitted, so a sourcemap-free build simply has no route.
    app.get(WIDGET_SOURCEMAP_ROUTE, (_req: Request, res: Response) => {
      const sourcemapPath = getWidgetBundleConfig().sourcemapPath;
      if (!sourcemapPath) {
        res.status(404).type('text/plain').send('Form widget sourcemap not found.');
        return;
      }
      res
        .status(200)
        .type('application/json')
        .set('Cache-Control', 'no-cache')
        .sendFile(sourcemapPath, (err) => {
          if (err && !res.headersSent) {
            LogError(`[Forms] Failed to send widget sourcemap ${sourcemapPath}: ${String(err)}`);
            res.status(500).type('text/plain').send('Failed to load form widget sourcemap.');
          }
        });
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
}
