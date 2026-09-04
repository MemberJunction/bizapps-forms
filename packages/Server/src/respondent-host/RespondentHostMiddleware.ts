/**
 * Serves the public respondent host page (TASK 2) as an unauthenticated route on MJAPI.
 *
 * Registered via `@RegisterClass(BaseServerMiddleware, 'mj:formsRespondentHost')` so MJ
 * server bootstrap discovers it through ClassFactory — no core fork, no Explorer shell.
 *
 * SEAM NOTE: `BaseServerMiddleware`'s own docs steer route-adding toward `BaseServerExtension`
 * / `ServerExtensionsCore` (PR #2037). That seam was absent when this was written against MJ
 * 5.43.0, so `ConfigureExpressApp(app)` was the only hook available. It is NO LONGER absent:
 * 5.51.0 re-exports `ServerExtensionLoader` and `BaseServerExtension` from
 * `@memberjunction/server-extensions-core`, and `serve()` instantiates the loader. Migrating
 * these two routes is now possible and is deliberately NOT part of this change —
 * `ConfigureExpressApp` remains a supported hook in 5.51.0 and both routes work through it, so
 * the move is a behaviour-preserving refactor that belongs in its own commit.
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
import type { Application, Request, RequestHandler, Response } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware, configInfo } from '@memberjunction/server';
import { LogStatus, LogError, RunView, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { getMagicLinkProvisioningConfig } from '@mj-biz-apps/forms-core-entities-server';

import { getRespondentHostConfig } from './config.js';
import { renderRespondentHostPage } from './host-page.js';
import { redeemSlugToToken, type RedeemRunViewProvider } from './redeem.service.js';
import { checkRespondentReadiness } from './host-readiness.js';
import { redeemFailureToView, respondentErrorResponse, type RedeemErrorView } from './error-view.js';
import { runForget, runRemember, runResume, type ResumeRouteOutcome } from './device-resume.service.js';
import { makeDeviceResumeDeps } from './resume-deps.js';
import { readResumeCookie } from './resume-cookie.js';
import { matchResumeRoute } from './resume-routes.js';
import { readCappedBody, sendJsonError, userPayloadOf } from '../http/request-body.js';
import { currentRequestIdentity } from '../http/request-identity.js';

/** Route the respondent host page is served from (matches the Forms `publicUrl()` shape). */
export const RESPONDENT_HOST_ROUTE = '/f/:slug';

/**
 * The pre-auth resume route.
 *
 * `/resume` is the one route here that has NO session yet — the cookie is the credential, and the
 * redeem is what mints a session — so it registers beside the page route, before MJ's auth
 * middleware. Its two siblings do the opposite: `/remember` and `/forget` carry the distribution
 * JWT the widget is already running under, and identity is their whole gate, so they register
 * POST-auth where `req.userPayload` is verified. That is the same split `UploadMiddleware` makes,
 * for the same reason.
 */
export const RESPONDENT_RESUME_ROUTE = '/f/:slug/resume';

/** A resume request body is two UUIDs at most; anything larger is not one. */
const RESUME_BODY_CAP_BYTES = 2048;

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
      // PRESENCE of the pointer only. This route stays side-effect-free — a mail scanner or a
      // browser prefetch must not be able to spend a single-use invite — so nothing is redeemed
      // here and the token is never read.
      const hasDraft = readResumeCookie(req.headers.cookie) !== undefined;
      // Never let an unexpected error crash the route — always render a page.
      void this.handleRequest(slug, hasDraft, res).catch((e: unknown) => {
        LogError(`[Forms] Respondent host route error: ${e instanceof Error ? e.message : String(e)}`);
        this.sendError(res, { status: 500, message: 'We could not open this form right now. Please try again later.' });
      });
    });

    // Pre-auth, like the page above it: this route's caller has no session — obtaining one is what
    // it is for.
    app.post(RESPONDENT_RESUME_ROUTE, (req: Request, res: Response) => {
      void this.handleResumeRoute(req, res).catch((e: unknown) => {
        LogError(`[Forms] Resume route error: ${e instanceof Error ? e.message : String(e)}`);
        sendJsonError(res, 500, 'Could not reopen your saved answers. Please try again.');
      });
    });

    LogStatus(
      `[Forms] Respondent host page served at ${RESPONDENT_HOST_ROUTE} ` +
        `(graphql: ${cfg.graphqlUrl}, widget: ${cfg.widgetBundleUrl}, redeem: ${cfg.magicLinkRedeemUrl})`,
    );
    LogStatus(
      `[Forms] Same-device resume routes registered at POST ${RESPONDENT_RESUME_ROUTE}, ` +
        `/f/:slug/remember and /f/:slug/forget ` +
        `(device resume ${cfg.deviceResumeEnabled ? 'enabled' : 'DISABLED'} host-wide)`,
    );

    // Surfaced at boot, not at first publish. The magic-link minter's gate is
    // deliberately graceful, so a misconfigured host stays silent until a respondent
    // hits a 409 — by which time nobody connects it to an install-time setting.
    // Pass the role the MINTER grants, not a constant: both read FORMS_MAGICLINK_ROLE, so a host
    // that renames the role gets a readiness verdict about the role it will actually mint.
    const readiness = checkRespondentReadiness(
      configInfo.magicLink,
      () => getMagicLinkProvisioningConfig().roleName,
    );
    if (readiness.ready === false) {
      LogError(`[Forms] Anonymous respondent path is NOT ready: ${readiness.reason}`);
    }
  }

  /** Resolve the slug, do the server-side redeem, and render the host page or a friendly error. */
  private async handleRequest(slug: string, hasDraft: boolean, res: Response): Promise<void> {
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
      this.sendError(res, redeemFailureToView(outcome.reason ?? 'redeem-failed', outcome.opensAt));
      return;
    }

    const html = renderRespondentHostPage({
      graphqlUrl: cfg.graphqlUrl,
      widgetBundleUrl: cfg.widgetBundleUrl,
      defaultSlug: slug,
      token: outcome.token,
      turnstileSiteKey: cfg.turnstileSiteKey,
      hasDraft,
    });
    res
      .status(200)
      .type('html')
      // The page carries a per-respondent session JWT now — must NOT be shared-cached.
      .set('Cache-Control', 'no-store')
      .send(html);
  }

  /**
   * Contribute `/remember` and `/forget` as POST-AUTH middleware, so `req.userPayload` is already
   * verified when they run. A no-op for every request except those two.
   */
  public override GetPostAuthMiddleware(): RequestHandler[] {
    return [
      (req: Request, res: Response, next: (err?: unknown) => void): void => {
        const match = matchResumeRoute(req.method, req.path);
        if (!match || match.action === 'resume') {
          // `/resume` is handled pre-auth; everything else here is somebody else's request.
          next();
          return;
        }
        void this.handleAuthedResumeRoute(match.action, match.slug, req, res).catch((e: unknown) => {
          LogError(`[Forms] Resume route error: ${e instanceof Error ? e.message : String(e)}`);
          sendJsonError(res, 500, 'Could not save this device preference. Please try again.');
        });
      },
    ];
  }

  /** `POST /f/:slug/resume` — the pre-auth route: a pointer in, a session out. */
  private async handleResumeRoute(req: Request, res: Response): Promise<void> {
    const slug = typeof req.params.slug === 'string' ? req.params.slug : '';
    if (!slug) {
      sendJsonError(res, 404, 'Unknown form.');
      return;
    }
    const body = await this.readResumeBody(req, res);
    if (body === undefined) {
      return;
    }
    const outcome = await runResume(this.resumeDeps(slug), {
      slug,
      cookieToken: readResumeCookie(req.headers.cookie),
      // The emailed link's interstitial hands its token over here rather than through a route of
      // its own, so both channels share one redeem — and one rotation.
      bodyToken: typeof body.token === 'string' ? body.token : undefined,
    });
    this.sendResumeOutcome(res, outcome);
  }

  /** `POST /f/:slug/remember` and `/forget` — the post-auth routes, where identity is the gate. */
  private async handleAuthedResumeRoute(
    action: 'remember' | 'forget',
    slug: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const payload = userPayloadOf<{ userRecord?: UserInfo; sessionId?: string }>(req);
    const contextUser = payload?.userRecord;
    if (!contextUser) {
      // Should not happen — unified auth would have refused — but fail closed rather than mint a
      // credential for a caller we cannot identify.
      sendJsonError(res, 401, 'This form session has expired. Please reload the page.');
      return;
    }
    const body = await this.readResumeBody(req, res);
    if (body === undefined) {
      return;
    }
    const deps = this.resumeDeps(slug);
    const cookieToken = readResumeCookie(req.headers.cookie);
    const outcome =
      action === 'forget'
        ? await runForget(deps, { slug, cookieToken })
        : await runRemember(deps, {
            slug,
            responseId: typeof body.responseId === 'string' ? body.responseId : '',
            // The widget's own header, forwarded by the page. It is the ONLY ownership proof a
            // first sitting has, which is why `/remember` refuses without it.
            sessionId: typeof body.sessionId === 'string' ? body.sessionId : (payload?.sessionId ?? ''),
            scopeId: contextUser.MagicLinkScope?.ResourceID ?? '',
            cookieToken,
          });
    this.sendResumeOutcome(res, outcome);
  }

  /** Read a small JSON body, or answer the caller and return `undefined`. */
  private async readResumeBody(req: Request, res: Response): Promise<Record<string, unknown> | undefined> {
    const read = await readCappedBody(req, RESUME_BODY_CAP_BYTES, 'That request was too large.');
    if (!read.ok) {
      sendJsonError(res, read.status ?? 400, read.error ?? 'Malformed request.');
      return undefined;
    }
    if (!read.body || read.body.length === 0) {
      // No body is ordinary: `/resume` and `/forget` carry none.
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(read.body.toString('utf8'));
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      sendJsonError(res, 400, 'Malformed request.');
      return undefined;
    }
  }

  /** Apply one route outcome. Never caches, and never puts a token anywhere but the cookie. */
  private sendResumeOutcome(res: Response, outcome: ResumeRouteOutcome): void {
    if (res.headersSent) {
      return;
    }
    if (outcome.setCookie) {
      res.append('Set-Cookie', outcome.setCookie);
    }
    res.status(outcome.status).set('Cache-Control', 'no-store');
    if (outcome.status === 204) {
      res.end();
      return;
    }
    res.json({ ...(outcome.body ?? {}), ...(outcome.reason ? { reason: outcome.reason } : {}) });
  }

  /** The dependency set one resume request runs on. */
  private resumeDeps(slug: string) {
    return makeDeviceResumeDeps({
      systemUser: this.systemUser(),
      slug,
      // The resolved peer, never a header the caller chose. Absent (no middleware mounted) falls
      // back to the slug, which bounds the route per FORM rather than per caller — coarse, but a
      // bound, and the same trade `rateLimitGatesFor` makes when it has no address.
      callerKey: currentRequestIdentity()?.ipHash ?? `slug:${slug}`,
    });
  }

  /** Render a friendly, shell-free error page with the matching HTTP status. */
  private sendError(res: Response, view: RedeemErrorView): void {
    if (res.headersSent) {
      return;
    }
    // What the response IS — status, headers, page — is decided by `respondentErrorResponse`, which
    // is pure and asserted whole in `middleware-error-view.spec.ts`. This method only applies it.
    const { status, headers, html } = respondentErrorResponse(view);
    res.status(status).type('html').set(headers).send(html);
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
