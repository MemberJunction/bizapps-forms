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
 * ── How the magic-link redeem should reach this page (the "link → login" fix) ──────────
 * A distribution's shared URL is `${publicUrl}/magic-link/redeem?token=<PublicLinkToken>`.
 * Redeeming the raw token mints an anonymous SESSION JWT — and the S1 resolvers
 * (`PublicFormResolver`) require that JWT (they call `GetUserFromPayload` and throw with no
 * session), so the widget must be handed the *redeemed JWT*, never the raw token.
 *
 * On the pinned MJ 5.43.0, core's `MagicLinkRouter.sendRedeemResult` always 302s a browser
 * redemption to `config.magicLink.explorerUrl` with the JWT in the URL `#fragment`
 * (Explorer → login) — wrong for an anonymous respondent. The redeem result it builds
 * exposes only `token` + `applicationName`/`applicationPath`, NOT the scoped `resourceId`
 * (the distribution), even though `MagicLinkService.RedeemInvite` reads `invite.ResourceID`
 * internally (~line 220). So redeem cannot be re-pointed to a specific `/f/:slug` from
 * config alone today. The required change (small, in MJ core `@memberjunction/server`):
 *
 *   1. Add `resourceId` + `resourceTypeName` to `RedeemMagicLinkResult` and populate them in
 *      `RedeemInvite` (the values are already in scope there).
 *   2. In `sendRedeemResult`, when the invite is a `resource-share` for a Forms resource type,
 *      302 to a configurable landing template (e.g. `magicLink.resourceLandingUrls.forms =
 *      "${base}/f/{slug}#token={token}"`) using the resolved distribution slug, instead of the
 *      Explorer deep-link. (The slug resolves from `resourceId` → FormDistribution.Slug.)
 *
 * Until that lands, drive an end-to-end test by opening this page with the JWT directly:
 *   /f/<slug>#token=<redeemed-JWT>     (POST /magic-link/redeem once to obtain the JWT).
 * Either way the respondent lands HERE (anonymous, shell-free), NEVER on Explorer login.
 */
import type { Application, Request, Response } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from '@memberjunction/server';
import { LogStatus } from '@memberjunction/core';

import { getRespondentHostConfig } from './config.js';
import { renderRespondentHostPage } from './host-page.js';

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
      // Slug arrives on the path (`/f/:slug`). The page also accepts `?slug=` itself, so
      // the baked-in value is just a default; the token is read fully client-side.
      const slug = typeof req.params.slug === 'string' ? req.params.slug : '';
      const html = renderRespondentHostPage({
        graphqlUrl: cfg.graphqlUrl,
        widgetBundleUrl: cfg.widgetBundleUrl,
        defaultSlug: slug,
      });
      res
        .status(200)
        .type('html')
        // Public, shell-free page; cacheable but short-lived so bundle/url changes land.
        .set('Cache-Control', 'public, max-age=60')
        .send(html);
    });

    LogStatus(
      `[Forms] Respondent host page served at ${RESPONDENT_HOST_ROUTE} ` +
        `(graphql: ${cfg.graphqlUrl}, widget: ${cfg.widgetBundleUrl})`,
    );
  }
}
