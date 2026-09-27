/**
 * Establishes the server-derived caller identity for every request, so the public routes have
 * something to key abuse controls on that the caller did not supply.
 *
 * Registered via `@RegisterClass(BaseServerMiddleware, 'mj:formsRequestIdentity')` so MJ server
 * bootstrap discovers it through ClassFactory — the same seam the widget-bundle, respondent-host
 * and upload routes use, and no core fork.
 *
 * PRE-AUTH, deliberately. MJ mounts pre-auth middleware before both `createUnifiedAuthMiddleware`
 * and the Apollo handler, so the identity established here is in scope for the whole request —
 * including inside `SubmitFormResponse`, whose `AppContext` carries no request object of its own.
 * Post-auth would work for the GraphQL path too, but pre-auth also covers requests that never get
 * that far, which is where an abusive caller lives.
 *
 * The class is a thin adapter on purpose: the resolution rules and the ALS carrier live in
 * `request-identity.ts`, where they are testable without MJ's server package in the loop.
 */
import type { Application, NextFunction, Request, RequestHandler, Response } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from '@memberjunction/server';
import { LogError, LogStatus } from '@memberjunction/core';

import { hashClientIp, resolveClientIp, runWithRequestIdentity } from './request-identity.js';

/**
 * How many proxies WE operate in front of the API — the number of trailing `X-Forwarded-For`
 * entries that were written by infrastructure we control, and therefore the only ones worth
 * reading. Unset means the API is addressed directly and nothing in that header is evidence of
 * anything.
 *
 * THROWS on a malformed value rather than falling back to zero. Falling back looks like the safe
 * direction and is the opposite: nobody sets this variable unless a proxy is in front, so a typo
 * silently keys every respondent on the proxy's own address — one bucket for the entire
 * deployment, which is the exact denial-of-service the per-caller ceilings exist to prevent. This
 * is read at boot, so the throw fails the process start where somebody is watching, instead of
 * degrading in production where nobody is.
 *
 * Read once at boot rather than per request: it describes the deployment's topology, which does
 * not change while the process runs.
 */
export function trustedProxyHops(): number {
  const raw = process.env.FORMS_TRUSTED_PROXY_HOPS?.trim();
  if (raw === undefined || raw === '') {
    return 0;
  }
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(
      `FORMS_TRUSTED_PROXY_HOPS must be a non-negative whole number of proxy hops; got '${raw}'. ` +
        'Use 0 (or leave it unset) when MJAPI is addressed directly, 1 behind a single load ' +
        'balancer, 2 behind a CDN in front of one.',
    );
  }
  return hops;
}

let warnedForwardedWithoutHops = false;

/**
 * Say ONCE, loudly, when a request carries `X-Forwarded-For` while this deployment trusts no
 * proxy hops (`FORMS_TRUSTED_PROXY_HOPS=0`, the default).
 *
 * Worded conditionally on purpose — "if a load balancer fronts this API" — because the header
 * alone is not proof of one: an ordinary client can send it with nothing in front to have written
 * it. At zero hops `resolveClientIp` already ignores the header and keys on the socket peer, so
 * this warning changes no behaviour; it exists because the failure mode it describes is otherwise
 * invisible. If there really is a balancer, every respondent behind it resolves to the balancer's
 * own peer address, so every per-IP ceiling (`FORMS_RATELIMIT_IP_MAX`, `FORMS_COMPLETION_MAX`)
 * becomes one shared bucket for the whole deployment instead of one per respondent. That is the
 * same misconfiguration {@link trustedProxyHops}'s boot-time throw guards against for a malformed
 * value; there is nothing to throw on for an unset one, since zero is also the legitimate,
 * directly-addressed default, so a request-time warning is the only way to surface it.
 *
 * Once per process, not per request, because a line on every request is a line nobody reads.
 */
function warnOnceIfForwardedWithoutTrustedHops(req: Request): void {
  if (warnedForwardedWithoutHops || req.headers['x-forwarded-for'] === undefined) {
    return;
  }
  warnedForwardedWithoutHops = true;
  LogError(
    '[Forms] Request arrived with X-Forwarded-For while FORMS_TRUSTED_PROXY_HOPS=0. If a load ' +
      'balancer fronts this API, every respondent is keyed on its address and the per-IP ceilings ' +
      '(FORMS_RATELIMIT_IP_MAX, FORMS_COMPLETION_MAX) apply to the whole deployment. Set ' +
      'FORMS_TRUSTED_PROXY_HOPS to the number of proxies you operate.',
  );
}

/** Test-only: forget that the X-Forwarded-For-without-trusted-hops warning has been emitted. */
export function resetForwardedWithoutHopsWarningForTests(): void {
  warnedForwardedWithoutHops = false;
}

/**
 * The identity handler itself, mountable anywhere — globally by {@link RequestIdentityMiddleware},
 * or directly on a route that MJ registers too early to see the global one.
 *
 * WHY THIS IS EXPORTED. MJServer collects `GetPreAuthMiddleware()` into an array at
 * `index.ts:815` but does not `app.use` it until `index.ts:1158`. In the SAME collection loop it
 * calls each middleware's `ConfigureExpressApp` (`index.ts:824`). Only ONE Forms route still
 * registers there: `POST /f/:slug/resume`. (The widget-bundle routes left that set in #121, and the
 * respondent host page, the favicon and the public asset read left it in #181 — all four to get
 * behind MJ's `compression()` at `index.ts:1129`. They are now in the "need nothing" group below,
 * with the caveat under it.) Express dispatches layers in
 * registration order, so every route added through `ConfigureExpressApp` is already in the stack
 * before the pre-auth handlers arrive and NEVER sees them — `currentRequestIdentity()` inside such
 * a route returns undefined, and any abuse ceiling keyed on it silently admits everyone. A route
 * in that position has to carry the handler itself:
 *
 *     app.get(ROUTE, requestIdentityHandler(), (req, res) => { ... });
 *
 * Mounting it twice for one request is harmless: `AsyncLocalStorage.run` simply nests, and the
 * inner store wins for the code inside it. Routes reached through `GetPostAuthMiddleware` (the
 * upload endpoint) or the Apollo handler are mounted after `index.ts:1158` and need nothing.
 *
 * A `GetPreAuthMiddleware` route needs nothing either — but only while this middleware's own
 * contribution is mounted first, and that is decided by import order in
 * `packages/Server/src/index.ts` (ClassFactory order is import order), not by anything structural.
 * `RespondentHostMiddleware`'s page route therefore keeps its own mount deliberately; see the note
 * on `hostPageHandler`.
 *
 * `hops` is resolved once at REGISTRATION time, not per request, matching the reasoning on
 * {@link trustedProxyHops}: it describes deployment topology, which does not change while the
 * process runs.
 */
export function requestIdentityHandler(hops: number = trustedProxyHops()): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (hops === 0) {
      warnOnceIfForwardedWithoutTrustedHops(req);
    }
    const ip = resolveClientIp(req, hops);
    const rawOrigin = req.headers['origin'];
    const origin = typeof rawOrigin === 'string' && rawOrigin.trim().length > 0 ? rawOrigin.trim() : undefined;
    // The store is now entered UNCONDITIONALLY. It used to be skipped when no peer address
    // resolved, which was harmless while `ip`/`ipHash` were its only passengers: a missing hash
    // and a missing store both read as "no ceiling", and every consumer already reads the address
    // as `currentRequestIdentity()?.ip`, so the routes behaved identically either way.
    // It is NOT harmless for `origin`. A request whose socket had already gone would reach the
    // resolver carrying no origin, and the embed gate reads a missing origin under an unrestricted
    // policy as "admit" — so a caller the author's allowlist should have refused would be let in
    // by a fact about our socket rather than a fact about them. A store of three optional fields
    // cannot make that mistake; an absent store, which no consumer can distinguish from an absent
    // field, can.
    //
    // The redeem forward (#207) is unaffected: `forwardedHeaders` already forwards nothing for an
    // absent address, so an absent `ip` here reaches core exactly as an absent store did.
    runWithRequestIdentity({ ip, ipHash: ip ? hashClientIp(ip) : undefined, origin }, next);
  };
}

@RegisterClass(BaseServerMiddleware, 'mj:formsRequestIdentity')
export class RequestIdentityMiddleware extends BaseServerMiddleware {
  public get Label(): string {
    return 'mj:formsRequestIdentity';
  }

  /**
   * Teach Express the same hop count we resolve with.
   *
   * Not cosmetic: MJ derives its own `RequestContext.ipAddress` — the address written to the
   * session/login audit log — from `req.ip`, which is `socket.remoteAddress` until `trust proxy`
   * is set. Configuring it here keeps the address in the audit trail and the address behind the
   * rate-limit bucket the same one. At the default of zero hops this is Express's existing
   * behaviour, so a deployment that sets nothing sees no change.
   */
  public override ConfigureExpressApp(app: Application): void {
    app.set('trust proxy', trustedProxyHops());
  }

  public override GetPreAuthMiddleware(): RequestHandler[] {
    const hops = trustedProxyHops();
    LogStatus(
      `[Forms] Request identity established pre-auth (trusted proxy hops: ${hops}).` +
        (hops === 0 ? ' Set FORMS_TRUSTED_PROXY_HOPS if a load balancer fronts this API.' : ''),
    );
    return [requestIdentityHandler(hops)];
  }
}
