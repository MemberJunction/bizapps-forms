/**
 * Serves the built `<mj-form>` custom-element bundle as an unauthenticated route on MJAPI (DG-5).
 *
 * Registered via `@RegisterClass(BaseServerMiddleware, 'mj:formsWidgetBundle')` so MJ server
 * bootstrap discovers it through ClassFactory — no core fork, no Explorer shell.
 *
 * The respondent host page references this bundle via `<script src="/forms/widget/mj-form.js">`.
 * Without it, `customElements.whenDefined('mj-form')` never resolves and every public form fails
 * after the page's 10s safety timeout. This route closes that gap.
 *
 * The route runs BEFORE auth (it is just a static JS asset) so an anonymous respondent loads it
 * without a login. If the bundle file cannot be located (e.g. the package was never built), the
 * route returns 404 with a clear log line — it never crashes boot.
 *
 * ── Why the routes are PRE-AUTH MIDDLEWARE and not `ConfigureExpressApp` routes (#121) ─────────
 * Both hooks run before auth; they differ in where the route lands in Express's stack. `serve()`
 * calls `ConfigureExpressApp` while it is still collecting middleware contributions, BEFORE it
 * mounts its own `compression()` — so an `app.get` registered there finishes its response before
 * compression ever wraps it, and the 1.2 MB bundle went out uncompressed to every first-time
 * respondent who had offered gzip and brotli. `GetPreAuthMiddleware` is documented by the base
 * class as running "after compression but before OAuth/REST/GraphQL routes", which is exactly
 * the slot a public static asset wants. Same negotiation, threshold and level as everything else
 * MJAPI serves; nothing compression-specific lives here. The Upload/Download/Asset routes in
 * this package contribute handlers the same way.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
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

  public override GetPreAuthMiddleware(): RequestHandler[] {
    const cfg = getWidgetBundleConfig();

    if (cfg.bundlePath) {
      LogStatus(`[Forms] Widget bundle served at ${WIDGET_BUNDLE_ROUTE} (from ${cfg.bundlePath})`);
    } else {
      LogStatus(
        `[Forms] Widget bundle route ${WIDGET_BUNDLE_ROUTE} registered, but no bundle found yet ` +
          `(will 404 until "npm run build" runs or FORMS_WIDGET_BUNDLE_PATH is set).`,
      );
    }
    if (!cfg.sourcemapEnabled) {
      // Visible on a dev host where the gate was switched off by hand. MJ core drops every
      // `LogStatus` under NODE_ENV=production, so on the host where the gate is on by default
      // the 404 body below is what carries the reason instead.
      LogStatus(
        `[Forms] Widget sourcemap withheld at ${WIDGET_SOURCEMAP_ROUTE} (answers 404). ` +
          `Set FORMS_WIDGET_SOURCEMAP_ENABLED=true to serve it on this host.`,
      );
    }

    // Both routes are registered unconditionally, so the route table does not depend on whether
    // the artifact existed at boot, and a missing file answers 404 rather than falling through to
    // MJAPI's authenticated routes and answering 401 (which is what the sourcemap used to do).
    //
    // Path resolution is MEMOIZED, not per-request: `getWidgetBundleConfig()` freezes its result
    // on first call and this method calls it eagerly above, so the lookup happens once at boot.
    // A bundle built after MJAPI starts therefore needs a server restart, not just a page reload
    // — the `resolvePath` indirection below exists to share one handler between two assets, not
    // to re-probe the filesystem.
    return [
      this.serveStaticAsset({
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
      }),
      // The bundle is minified and carries `//# sourceMappingURL=mj-form.js.map`, so the browser
      // asks for this on every devtools session. Unserved, it fell through to the authenticated
      // routes and answered 401 — a reference the build emits and the server refuses.
      this.serveStaticAsset({
        route: WIDGET_SOURCEMAP_ROUTE,
        contentType: 'application/json',
        resolvePath: () => getWidgetBundleConfig().sourcemapPath,
        label: 'widget sourcemap',
        // Two reasons share the 404; the body tells them apart, because "not found" sends an
        // operator hunting for a build artefact that is right there on a production host.
        missingMessage: cfg.sourcemapEnabled
          ? 'Form widget sourcemap not found.'
          : 'Form widget sourcemap is not served on this host (FORMS_WIDGET_SOURCEMAP_ENABLED).',
      }),
    ];
  }

  /**
   * One unauthenticated static-file route, as a handler that claims exactly its own path.
   *
   * GET and HEAD, like the `app.get` this replaced (Express routes HEAD to GET handlers, and
   * `sendFile` answers HEAD with headers only). Anything else passes through untouched.
   *
   * The bundle and its sourcemap differ only in which config property they read, their content
   * type, and whether a missing file deserves a log — so they share this rather than carrying two
   * copies of the same send-with-fallbacks dance.
   */
  private serveStaticAsset(asset: StaticAsset): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path !== asset.route) {
        next();
        return;
      }
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
        // `send` defaults `dotfiles` to 'ignore' and applies it to EVERY segment of the absolute
        // path (`containsDotFile` walks the whole split path when no `root` is given) — so any
        // install under a dot directory (`.worktrees/`, `.claude/`, `/opt/.releases/`,
        // `~/.local/share/`) 404s inside `send` and surfaces here as a 500, for a file that is
        // plainly there. Boot still logs "Widget bundle served at ...", so the only symptom is a
        // blank form.
        //
        // This is a CHOICE, not the only repair: passing `{ root: dirname(filePath) }` and the
        // basename also fixes it, because `send` only dot-checks the request-relative part once a
        // `root` is set. They differ in posture rather than in safety — `root` would additionally
        // refuse an operator who deliberately points FORMS_WIDGET_BUNDLE_PATH at a dotfile, but
        // would also accept a RELATIVE override and silently resolve it against the server's
        // working directory. We take `'allow'` because it keeps the resolved path the single
        // source of truth, and reject bad overrides in `resolveFromEnv()` instead, where the
        // reason can actually be logged.
        //
        // No traversal risk either way: `filePath` comes from `getWidgetBundleConfig()` — an
        // operator-set env var, `require.resolve`, or a monorepo constant — and never from the
        // request. The route serves exactly two fixed files, so the default is guarding against
        // an input that does not exist here. (`'allow'` does let an operator serve a dotfile they
        // explicitly named, but anyone who can set that variable already owns the process, and a
        // non-dotted path like /etc/hosts was equally serveable before this change.)
        .sendFile(filePath, { dotfiles: 'allow' }, (err) => {
          if (err && !res.headersSent) {
            LogError(`[Forms] Failed to send ${asset.label} ${filePath}: ${String(err)}`);
            res.status(500).type('text/plain').send(`Failed to load form ${asset.label}.`);
          }
        });
    };
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
