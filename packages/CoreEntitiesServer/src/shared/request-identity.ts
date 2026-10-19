/**
 * The ambient identity of the public HTTP caller — the request-scoped store that carries it from the
 * Express pipeline to whatever handles the request (#303 Task 8).
 *
 * `RequestIdentityMiddleware` (in `@mj-biz-apps/forms-server`) resolves the peer address, hashes it,
 * and enters this store PRE-AUTH, ahead of both MJ's auth middleware and Apollo, so the store is
 * still in scope inside a GraphQL resolver and inside a Remote Operation dispatched from one. The
 * store moved here from forms-server because its readers did: the respondent operations
 * (`Forms.GetRespondentForm`, `Forms.SaveResponse`) receive no `AppContext` and no request object,
 * and this package cannot import forms-server. AsyncLocalStorage follows the async continuation, so
 * it cannot leak between concurrent requests the way a module-level variable would.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** What the public routes know about a caller, independent of anything the caller told us. */
export interface RequestIdentity {
  /**
   * The resolved client address itself, request-scoped and never persisted by Forms.
   *
   * Kept alongside the hash for ONE reason: the server-side redeem in `respondent-host/
   * redeem.service.ts` POSTs to core from inside this process, so without an address forwarded
   * on it core keys its per-IP redeem cap on the loopback peer — one bucket for every respondent
   * in the deployment (bizapps-forms register row 29). A hash cannot be forwarded: core reads the
   * value as an address, writes it to the magic-link redemption audit trail, and Express has to
   * parse it before `req.ip` exists at all.
   *
   * Everything that STORES or BUCKETS still uses `ipHash`. This field must not leak into a Forms
   * log line, bucket key or database column of Forms' own — see `hashClientIp` for why that rule
   * exists. Core's magic-link redemption audit trail, above, is the one place this address is
   * written on purpose; that write is core's, not Forms'.
   *
   * Optional for the same reason `ipHash` is, and the reason is the store's, not this field's:
   * the store is now entered even when no peer address resolved, so that `origin` below still
   * reaches the embed gate. Every consumer already reads it as `currentRequestIdentity()?.ip`
   * and `forwardedHeaders` already forwards nothing for an absent address, so an absent `ip`
   * behaves exactly as an absent store did before.
   */
  ip?: string;
  /**
   * Salted one-way hash of the resolved client IP (IPv6 reduced to its /64).
   *
   * Optional because the peer address can already be gone by the time the handler runs. When it
   * is, the abuse ceilings simply drop for that request rather than re-keying onto something
   * weaker — a header the caller writes would be worse than no ceiling, since it is a ceiling the
   * caller controls.
   */
  ipHash?: string;
  /**
   * The caller's `Origin` header, VERBATIM and unnormalised.
   *
   * The caller DID choose this, unlike `ipHash` beside it — so nothing keys an abuse ceiling on
   * it, and nothing here treats it as identity. What makes a caller-supplied value load-bearing
   * anyway is that it is checked against a list the form's AUTHOR wrote: a browser will not let a
   * page lie about its own origin, and a non-browser client that forges one still has to pass
   * every other gate on the public path.
   *
   * Left unnormalised on purpose. Normalisation runs at the point of comparison instead —
   * `normalizeOrigin` against the author's list, `normalizeReportedOrigin` against this API's own
   * origin — so this field and the header the caller actually sent are the same string when one
   * reaches a log line, which is the difference between a refusal an operator can act on and one
   * they have to guess at.
   */
  origin?: string;
  /**
   * The caller's `x-session-id` header, VERBATIM — the same value MJ core copies onto
   * `UserPayload.sessionId` in `extractAuthInputs`.
   *
   * Carried here because a Remote Operation receives no `AppContext`, so the respondent operations
   * cannot read `userPayload.sessionId` the way the retired GraphQL resolver did. It is the caller's
   * own CORRELATOR, never a credential and never an abuse key: it keys dedupe, the per-session rate
   * gate and the owner column, exactly as before (see `submission/source-metadata.ts`). Absent for a
   * client that sends no header, which the submit path already treats as "no session".
   */
  sessionId?: string;
}

const identityStorage = new AsyncLocalStorage<RequestIdentity>();

/** Run `fn` — and everything it awaits — with `identity` as the ambient caller identity. */
export function runWithRequestIdentity<T>(identity: RequestIdentity, fn: () => T): T {
  return identityStorage.run(identity, fn);
}

/**
 * The current request's caller identity, or `undefined` outside a request.
 *
 * Undefined is a real, expected answer — a unit test, or a deployment that has not mounted
 * `RequestIdentityMiddleware` (in `@mj-biz-apps/forms-server`) — so every caller must degrade rather than throw. What they
 * must NOT do is degrade silently; see `warnOnceIfAbuseKeyingDegraded` in `submission/source-metadata.ts`.
 */
export function currentRequestIdentity(): RequestIdentity | undefined {
  return identityStorage.getStore();
}
