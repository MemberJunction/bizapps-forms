/**
 * Serves the public respondent host page (TASK 2) as an unauthenticated route on MJAPI.
 *
 * Registered via `@RegisterClass(BaseServerMiddleware, 'mj:formsRespondentHost')` so MJ
 * server bootstrap discovers it through ClassFactory — no core fork, no Explorer shell.
 *
 * SEAM NOTE: `BaseServerMiddleware`'s own docs steer route-adding toward `BaseServerExtension`
 * / `ServerExtensionsCore` (PR #2037). That seam is NOT present in the pinned MJ 5.43.0
 * (`@memberjunction/server@5.43.0` ships only `BaseServerMiddleware`), so the documented
 * escape hatch `ConfigureExpressApp(app)` is the available hook. When MJ is bumped to a
 * version shipping `BaseServerExtension`, move this route there.
 *
 * It adds a GET route (`/f/:slug`) through {@link ConfigureExpressApp}; the route runs
 * BEFORE auth (it is just static HTML), so an anonymous respondent reaches it without a
 * login. The path matches the Forms `publicUrl()` / embed-snippet convention
 * (`${base}/f/${slug}`). The page reads the distribution `slug` (from the path, and as a
 * `?slug=` fallback for direct testing) plus the anonymous bearer `token` (from the URL
 * `#fragment` after a magic-link redeem, or `?token=`), then mounts `<mj-form>`.
 *
 * Enable/disable + URLs are env-driven (see {@link getRespondentHostConfig}); the page is
 * on unless explicitly turned off, so a Forms install gets it for free.
 *
 * ── How the magic-link redeem reaches this page (the "link → login" fix) ────────────────
 * A distribution's shared URL is `${publicUrl}/f/<slug>`. The respondent must reach `<mj-form>`
 * holding the *redeemed* anonymous SESSION JWT — never the raw token — because the S1 resolvers
 * (`PublicFormResolver`) call `GetUserFromPayload` and throw with no session.
 *
 * Rather than wait for the core change that would re-point `MagicLinkRouter.sendRedeemResult` at
 * `/f/:slug`, this route does the redeem ITSELF, server-side (see {@link redeemSlugToToken}):
 *   1. Resolve `:slug` → the `FormDistribution` row and read its raw `PublicLinkToken`.
 *   2. POST that token to core's `/magic-link/redeem?format=json` so it returns the session JWT
 *      as JSON (instead of a 302 to Explorer with the token in the `#fragment`).
 *   3. Bake the JWT into the host page via an escaped `data-token` attribute; `<mj-form>` then
 *      submits under the anonymous scope. The raw token never reaches the respondent's browser.
 * The `#fragment` / `?token=` client-side path still works for manual testing (the
 * server-injected token takes precedence). The respondent always lands HERE, never on Explorer.
 *
 * PRE-AUTH CONTEXT USER: this route runs before auth and is the first Forms code that must read
 * the DB without a request JWT (the redeem is what mints that JWT). There is no request user to
 * borrow, so it uses the MJ-canonical server-side system user — `UserCache.Instance.GetSystemUser()`
 * (the same `UserInfo` the data provider uses for non-request server work) — with a `new Metadata()`
 * provider, exactly as other server-side-only MJ code does. Reads are a single slug lookup.
 */
import type { Application, Request, Response } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from '@memberjunction/server';
import { LogStatus, LogError, RunView, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

import { getRespondentHostConfig } from './config.js';
import { renderRespondentHostPage, renderRespondentHostErrorPage } from './host-page.js';
import { redeemSlugToToken, type RedeemRunViewProvider } from './redeem.service.js';
import { redeemFailureToView, type RedeemErrorView } from './error-view.js';

/** Route the respondent host page is served from (matches the Forms `publicUrl()` shape). */
export const RESPONDENT_HOST_ROUTE = '/f/:slug';

@RegisterClass(BaseServerMiddleware, 'mj:formsRespondentHost')
export class RespondentHostMiddleware extends BaseServerMiddleware {
  public get Label(): string {
    return 'mj:formsRespondentHost';
  }

  public override get Enabled(): boolean {
    return getRespondentHostConfig().enabled;
  }

  public override ConfigureExpressApp(app: Application): void {
    const cfg = getRespondentHostConfig();

    app.get(RESPONDENT_HOST_ROUTE, (req: Request, res: Response) => {
      // Slug arrives on the path (`/f/:slug`). The page also accepts `?slug=` as a fallback,
      // so the baked-in value is just a default.
      const slug = typeof req.params.slug === 'string' ? req.params.slug : '';
      // Never let an unexpected error crash the route — always render a page.
      void this.handleRequest(slug, res).catch((e: unknown) => {
        LogError(`[Forms] Respondent host route error: ${e instanceof Error ? e.message : String(e)}`);
        this.sendError(res, { status: 500, message: 'We could not open this form right now. Please try again later.' });
      });
    });

    LogStatus(
      `[Forms] Respondent host page served at ${RESPONDENT_HOST_ROUTE} ` +
        `(graphql: ${cfg.graphqlUrl}, widget: ${cfg.widgetBundleUrl}, redeem: ${cfg.magicLinkRedeemUrl})`,
    );
  }

  /** Resolve the slug, do the server-side redeem, and render the host page or a friendly error. */
  private async handleRequest(slug: string, res: Response): Promise<void> {
    const cfg = getRespondentHostConfig();
    const outcome = await redeemSlugToToken(
      {
        provider: this.systemProvider(),
        contextUser: this.systemUser(),
        redeemUrl: cfg.magicLinkRedeemUrl,
        fetchImpl: fetch,
      },
      slug,
    );

    if (!outcome.ok) {
      this.sendError(res, redeemFailureToView(outcome.reason ?? 'redeem-failed'));
      return;
    }

    const html = renderRespondentHostPage({
      graphqlUrl: cfg.graphqlUrl,
      widgetBundleUrl: cfg.widgetBundleUrl,
      defaultSlug: slug,
      token: outcome.token,
      turnstileSiteKey: cfg.turnstileSiteKey,
    });
    res
      .status(200)
      .type('html')
      // The page carries a per-respondent session JWT now — must NOT be shared-cached.
      .set('Cache-Control', 'no-store')
      .send(html);
  }

  /** Render a friendly, shell-free error page with the matching HTTP status. */
  private sendError(res: Response, view: RedeemErrorView): void {
    if (res.headersSent) {
      return;
    }
    res
      .status(view.status)
      .type('html')
      .set('Cache-Control', 'no-store')
      .send(renderRespondentHostErrorPage({ message: view.message }));
  }

  /** The MJ-canonical server-side system user for pre-auth DB reads (see header). */
  private systemUser(): UserInfo {
    return UserCache.Instance.GetSystemUser();
  }

  /**
   * A provider for the slug read. The `RunView` class routes to the global data provider and
   * implements `IRunViewProvider`, so it is the cast-free way to read outside a request — the
   * same `new RunView()` pattern the magic-link minter and definition-loader use.
   */
  private systemProvider(): RedeemRunViewProvider {
    return new RunView();
  }
}
