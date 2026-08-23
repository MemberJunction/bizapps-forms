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
 */
import { FormsRateLimiter, type RateLimitResult } from '../public-submit/rate-limit.service.js';
import { abuseIdentity } from '../public-submit/source-metadata.service.js';
import { uploadRateLimitMax } from './config.js';

/** What the limiter needs to know about an upload caller. */
export interface UploadCaller {
  /** Salted hash of the resolved peer IP, from `RequestIdentityMiddleware`. */
  clientIpHash?: string;
  /** Anonymous session id — the fallback identity only, since the caller supplies it. */
  sessionId?: string;
}

/** Consult and charge this caller's upload budget. */
export function checkUploadRateLimit(caller: UploadCaller): RateLimitResult {
  const gates = [
    {
      key: `upload:${abuseIdentity({ clientIpHash: caller.clientIpHash, sessionId: caller.sessionId ?? '' })}`,
      max: uploadRateLimitMax(),
    },
  ];
  const verdict = FormsRateLimiter.Instance.wouldAllowAll(gates);
  if (verdict.allowed) {
    FormsRateLimiter.Instance.recordAll(gates);
  }
  return verdict;
}
