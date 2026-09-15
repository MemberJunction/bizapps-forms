/**
 * How often one caller may hit the public upload route.
 *
 * The route already enforced a byte cap, a content-type allowlist, the anonymous CanCreate scope
 * and that the slug resolves to an open form — but nothing bounded FREQUENCY, and every accepted
 * call stores bytes and creates an `MJ: Files` row. A caller with a valid magic link could
 * therefore fill storage at line rate.
 *
 * Keyed on the resolved peer IP, which is what lets this run BEFORE the slug is resolved: keying
 * on the multipart `distributionId` the caller asserted would put the bucket back under their
 * control, and resolving the slug first means doing the work the limit exists to prevent. The IP
 * is known the moment the request arrives, so the cheapest gate is also the safest one.
 *
 * The window comes from the public-submit config, deliberately: a deployment tuning
 * `FORMS_RATELIMIT_WINDOW_MS` is describing how long it wants to remember a caller, and that
 * answer should not differ between two routes the same respondent uses in the same sitting.
 *
 * WITH NO IP, THIS GATE DOES NOTHING — on purpose. The only other identity available is the
 * `x-session-id` header, which MJ leaves blank for any client that omits it, so every such
 * caller would share ONE bucket and a single one of them could refuse uploads for the whole
 * deployment. Declining to limit is the same posture this route had before the gate existed;
 * inventing a shared bucket would be a new denial-of-service that no caller could route around.
 * The warning below is what stops that being a silent decision.
 */
import { FormsRateLimiter, type RateLimitResult } from '../public-submit/rate-limit.service.js';
import { abuseIdentity, warnOnceIfAbuseKeyingDegraded } from '../public-submit/source-metadata.service.js';
import { uploadRateLimitMax } from './config.js';

/** What the limiter needs to know about an upload caller. */
export interface UploadCaller {
  /** Salted hash of the resolved peer IP, from `RequestIdentityMiddleware`. */
  clientIpHash?: string;
  /** Anonymous session id — the fallback identity only, since the caller supplies it. */
  sessionId?: string;
}

/**
 * Consult and charge this caller's upload budget.
 *
 * Admits everything when the caller cannot be identified — see the module note above. That is a
 * deliberate no-op rather than a shared bucket, and it is announced once per process rather than
 * taken quietly.
 */
export function checkUploadRateLimit(caller: UploadCaller): RateLimitResult {
  const identity = abuseIdentity(caller.clientIpHash);
  if (!identity) {
    warnOnceIfAbuseKeyingDegraded(caller.clientIpHash);
    return { allowed: true };
  }
  return FormsRateLimiter.Instance.charge([{ key: `upload:${identity}`, max: uploadRateLimitMax() }]);
}
