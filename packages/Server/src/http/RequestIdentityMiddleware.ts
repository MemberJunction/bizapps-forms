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
 * reading. Zero (the default) means the API is addressed directly and nothing in that header is
 * evidence of anything.
 *
 * Read once at boot rather than per request: it describes the deployment's topology, which does
 * not change while the process runs.
 */
export function trustedProxyHops(): number {
  const raw = Number(process.env.FORMS_TRUSTED_PROXY_HOPS ?? '0');
  return Number.isInteger(raw) && raw > 0 ? raw : 0;
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
    return [
      (req: Request, _res: Response, next: NextFunction): void => {
        const ip = resolveClientIp(req, hops);
        if (!ip) {
          // No peer address at all (a socket already gone). Nothing to key on, so the request
          // continues under the session-derived fallback rather than being refused here — the
          // routes decide what an unidentifiable caller may do, not this middleware.
          next();
          return;
        }
        runWithRequestIdentity({ ipHash: hashClientIp(ip) }, next);
      },
    ];
  }
}
