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
 * provider, exactly as other server-side-only MJ code does. Reads are the slug lookup plus one
 * primary-key read of the form's description for the page's `<head>` (see {@link loadFormIdentity}).
 */
import type { Application, Request, RequestHandler, Response } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware, configInfo } from '@memberjunction/server';
import { LogStatus, LogError, RunView, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { getMagicLinkProvisioningConfig } from '@mj-biz-apps/forms-core-entities-server';

import { getRespondentHostConfig } from './config.js';
import { getPublicSubmitConfig } from '../public-submit/config.js';
import { renderRespondentHostPage } from './host-page.js';
import { redeemSlugToToken, type RedeemRunViewProvider } from './redeem.service.js';
import { loadFormIdentity } from './form-identity.js';
import { assessRespondentReadiness } from './host-readiness.js';
import { readCaptchaDemand, type CaptchaDemandProvider } from './captcha-demand.js';
import { redeemFailureToView, respondentErrorResponse, type RedeemErrorView } from './error-view.js';
import { runForget, runRemember, runResume, type ResumeRouteOutcome } from './device-resume.service.js';
import { makeDeviceResumeDeps } from './resume-deps.js';
import { readResumeCookie } from './resume-cookie.js';
import { matchResumeRoute } from './resume-routes.js';
import { readCappedBody, sendJsonError, userPayloadOf } from '../http/request-body.js';
import { checkRedeemRateLimit, redeemInFlightLimiter } from './redeem-rate-limit.js';
import { currentRequestIdentity } from '../http/request-identity.js';
import { requestIdentityHandler } from '../http/RequestIdentityMiddleware.js';

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

/**
 * Every browser asks the ORIGIN for this on every page, and a link unfurler may too. MJAPI serves no
 * icon, so unmatched the request fell through to the authenticated routes and answered 401 — the one
 * console error on a healthy respondent load, and auth-failure noise proportional to form traffic
 * (bizapps-forms#120). Answering here keeps a public page from ever emitting an auth failure.
 */
export const FAVICON_ROUTE = '/favicon.ico';

@RegisterClass(BaseServerMiddleware, 'mj:formsRespondentHost')
export class RespondentHostMiddleware extends BaseServerMiddleware {
  public get Label(): string {
    return 'mj:formsRespondentHost';
  }

  public override get Enabled(): boolean {
    return getRespondentHostConfig().enabled;
  }

  public override async ConfigureExpressApp(app: Application): Promise<void> {
    const cfg = getRespondentHostConfig();

    // `requestIdentityHandler()` is mounted ON THE ROUTE, not relied on globally. MJServer calls
    // this method at `index.ts:809` — inside the loop that merely COLLECTS pre-auth handlers — and
    // does not `app.use` them until `index.ts:1143`. Express dispatches in registration order, so
    // the globally mounted copy is added after this route and never runs for it: without this
    // argument `currentRequestIdentity()` below is always undefined and the per-IP meter admits
    // every caller at any `FORMS_REDEEM_IP_MAX`. See `requestIdentityHandler`'s own note.
    app.get(RESPONDENT_HOST_ROUTE, requestIdentityHandler(), (req: Request, res: Response) => {
      // Slug arrives on the path (`/f/:slug`). The page also accepts `?slug=` as a fallback,
      // so the baked-in value is just a default.
      const slug = typeof req.params.slug === 'string' ? req.params.slug : '';
      // PRESENCE of the pointer only. This route stays side-effect-free — a mail scanner or a
      // browser prefetch must not be able to spend a single-use invite — so nothing is redeemed
      // here and the token is never read.
      const hasDraft = readResumeCookie(req.headers.cookie) !== undefined;
      // Never let an unexpected error crash the route — always render a page.
      void this.handleMetered(slug, hasDraft, res).catch((e: unknown) => {
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

    // An explicit "nothing to show" rather than an icon: there is no Forms icon asset to serve, and
    // 204 is the answer every browser and fetcher treats as "no icon" without logging an error.
    // Origin-wide by nature of the path; registered with the host page so disabling the page
    // (FORMS_RESPONDENT_HOST_ENABLED=false) takes this with it.
    app.get(FAVICON_ROUTE, (_req: Request, res: Response) => {
      res.status(204).end();
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

    // Surfaced at boot, not at first publish or first submit. The magic-link minter's gate is
    // deliberately graceful, core's provisioning fallback is silent to everyone but the log, and
    // the captcha gate fails closed at submit — so a misconfigured host stays quiet until a
    // respondent pays for it, by which time nobody connects it to an install-time setting.
    await this.reportReadiness();
  }

  /**
   * Run every readiness check and log each failing reason under one grep-able prefix.
   *
   * The checks are pure; this gathers their inputs from the host. Pass the role the MINTER grants,
   * not a constant: both read FORMS_MAGICLINK_ROLE, so a host that renames the role gets a verdict
   * about the role it will actually mint — and pass it as a thunk, because resolving the minter's
   * config can throw, and boot is the one place that must not propagate one: it would take down all
   * of MJAPI, which also serves Caliber and ATS, over a Forms env-var typo. `userExists` is core's
   * own `UserByName` — the lookup core's provisioning performs — so the verdict cannot disagree
   * with it. The captcha-demand read is the one database read on this path; it answers with a
   * result, and a failed read is logged here and leaves the Turnstile verdict to config alone
   * rather than guessing at data.
   */
  private async reportReadiness(): Promise<void> {
    const demand = await readCaptchaDemand(this.systemProvider(), this.systemUser());
    if (demand.ok === false) {
      LogError(`[Forms] Could not read captcha demand at boot; Turnstile readiness judged on config only: ${demand.error}`);
    }
    const reasons = assessRespondentReadiness({
      magicLink: configInfo.magicLink,
      resolveRoleName: () => getMagicLinkProvisioningConfig().roleName,
      userHandling: configInfo.userHandling,
      userExists: (name) => UserCache.Instance.UserByName(name) !== undefined,
      systemUserName: this.systemUser()?.Name,
      turnstile: {
        secretConfigured: getPublicSubmitConfig().turnstileSecret !== undefined,
        siteKeyConfigured: getRespondentHostConfig().turnstileSiteKey !== undefined,
      },
      captchaDemand: demand.ok ? demand.demand : undefined,
    });
    for (const reason of reasons) {
      LogError(`[Forms] Anonymous respondent path is NOT ready: ${reason}`);
    }
  }

  /**
   * Two gates BEFORE the redeem work, mirroring `UploadMiddleware`: a process-wide in-flight cap
   * (how much may run at once) and a per-caller window keyed on the resolved peer IP (how often
   * one caller may act). Every hit past them costs a DB slug lookup plus an outbound POST to
   * core's magic-link redeem, which mints a session JWT — real work that was previously entirely
   * unmetered on an anonymous route.
   *
   * The in-flight cap goes FIRST so a request shed for load is never charged to anyone's window,
   * and the slot wraps the whole request in a `finally` so it releases on every exit path.
   */
  private async handleMetered(slug: string, hasDraft: boolean, res: Response): Promise<void> {
    if (!redeemInFlightLimiter().TryEnter()) {
      // 503 (load), not 429 (over budget): this clears the instant in-flight work drains.
      LogStatus('[Forms] Respondent host refused: too many redeems in flight. Clears as work drains.');
      this.sendError(res, { status: 503, message: 'This form is receiving a lot of traffic right now. Please try again in a moment.' });
      return;
    }
    try {
      const limit = checkRedeemRateLimit(currentRequestIdentity()?.ipHash);
      if (!limit.allowed) {
        // This door's own per-IP meter and core's redeem meter are different budgets, but they are
        // the SAME fact to the respondent — "this network, too many times" — so they get the same
        // sentence from the same place rather than a second spelling written here (#139).
        this.sendError(
          res,
          redeemFailureToView('rate-limited', {
            retryAfterSeconds: Math.max(1, Math.ceil((limit.retryAfterMs ?? 0) / 1000)),
          }),
        );
        return;
      }
      await this.handleRequest(slug, hasDraft, res);
    } finally {
      redeemInFlightLimiter().Exit();
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

    // Names BOTH things an identified page needs, because `RedeemOutcome` is a flat optional-field
    // shape rather than a discriminated union: `ok` is a plain boolean, so it narrows nothing, and
    // the row would otherwise arrive here as possibly-undefined. `redeemSlugToToken` sets the two
    // together or neither, so the second clause is unreachable through that door today — it is the
    // guard that keeps `loadFormIdentity` taking a row it can rely on, and without it a success
    // carrying no row is a TypeError on `source.FormID`: a 500 with a stack, on the anonymous path.
    if (!outcome.ok || !outcome.distribution) {
      // The whole outcome, not a field picked out of it: `RedeemOutcome` satisfies
      // `RedeemFailureDetails` structurally, so which facts a refusal may name is the view's
      // decision rather than a second one made here and kept in step by hand.
      this.sendError(res, redeemFailureToView(outcome.reason ?? 'redeem-failed', outcome));
      return;
    }

    // The page's identity — what the tab and an unfurl card show — comes from the row the door just
    // resolved (never re-read) plus one primary-key read for the description. Best-effort by design:
    // `loadFormIdentity` logs and degrades rather than costing the respondent the form.
    const identity = await loadFormIdentity(this.systemProvider(), this.systemUser(), outcome.distribution);
    const html = renderRespondentHostPage({
      graphqlUrl: cfg.graphqlUrl,
      widgetBundleUrl: cfg.widgetBundleUrl,
      pageTitle: identity.name,
      pageDescription: identity.description,
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
   * A provider for the pre-auth reads (the slug lookup, and the boot-time captcha-demand probe).
   * The `RunView` class routes to the global data provider and implements `IRunViewProvider`, so
   * it is the cast-free way to read outside a request — the same `new RunView()` pattern the
   * magic-link minter and definition-loader use.
   */
  private systemProvider(): RedeemRunViewProvider & CaptchaDemandProvider {
    return new RunView();
  }
}
