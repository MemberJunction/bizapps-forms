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
import { LogStatus } from '@memberjunction/core';

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

/**
 * The identity handler itself, mountable anywhere — globally by {@link RequestIdentityMiddleware},
 * or directly on a route that MJ registers too early to see the global one.
 *
 * WHY THIS IS EXPORTED. MJServer collects `GetPreAuthMiddleware()` into an array at
 * `index.ts:800` but does not `app.use` it until `index.ts:1143`. In the SAME collection loop it
 * calls each middleware's `ConfigureExpressApp` (`index.ts:809`), which is where the respondent
 * host, widget-bundle and asset routes register themselves. Express dispatches layers in
 * registration order, so every route added through `ConfigureExpressApp` is already in the stack
 * before the pre-auth handlers arrive and NEVER sees them — `currentRequestIdentity()` inside such
 * a route returns undefined, and any abuse ceiling keyed on it silently admits everyone. A route
 * in that position has to carry the handler itself:
 *
 *     app.get(ROUTE, requestIdentityHandler(), (req, res) => { ... });
 *
 * Mounting it twice for one request is harmless: `AsyncLocalStorage.run` simply nests, and the
 * inner store wins for the code inside it. Routes reached through `GetPostAuthMiddleware` (the
 * upload endpoint) or the Apollo handler are mounted after `index.ts:1143` and need nothing.
 *
 * `hops` is resolved once at REGISTRATION time, not per request, matching the reasoning on
 * {@link trustedProxyHops}: it describes deployment topology, which does not change while the
 * process runs.
 */
export function requestIdentityHandler(hops: number = trustedProxyHops()): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip = resolveClientIp(req, hops);
    if (!ip) {
      // No peer address at all (a socket already gone). Nothing to key on, so the request
      // continues under the session-derived fallback rather than being refused here — the
      // routes decide what an unidentifiable caller may do, not this middleware.
      next();
      return;
    }
    runWithRequestIdentity({ ipHash: hashClientIp(ip) }, next);
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
