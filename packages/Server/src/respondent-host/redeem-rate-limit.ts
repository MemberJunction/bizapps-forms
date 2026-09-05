/**
 * How often one caller may hit the public `/f/:slug` redeem route, and how many such requests
 * may run at once.
 *
 * Until this existed the route was entirely unmetered — and every hit does real work: a DB slug
 * lookup as the system user plus a server-side POST to core's `/magic-link/redeem`, which mints a
 * session JWT. A caller in a loop could burn redeem work (and JWT minting) at line rate while the
 * submit and upload routes beside it were both capped.
 *
 * Mirrors `upload/upload-rate-limit.ts` deliberately:
 *  - Keyed on the resolved peer IP (`RequestIdentityMiddleware`, mounted pre-auth like this
 *    route), which is the one caller attribute they did not choose. Keying on the slug would put
 *    the bucket back under the caller's control.
 *  - The window comes from the shared public-submit config (`FORMS_RATELIMIT_WINDOW_MS`), so a
 *    deployment tuning how long it remembers a caller tunes every public route at once.
 *  - WITH NO IP, THE PER-CALLER GATE DOES NOTHING — on purpose. The only alternative identity is
 *    caller-supplied, and a shared bucket would let one caller refuse the page for everyone. The
 *    degraded mode is announced once per process by `warnOnceIfAbuseKeyingDegraded`; the
 *    process-wide in-flight cap below still bounds concurrency either way.
 *
 * Env vars:
 *  - `FORMS_REDEEM_IP_MAX`            Max `/f/:slug` requests per window per client IP.
 *                                     Default 30 (matches the upload route's per-IP ceiling).
 *  - `FORMS_REDEEM_MAX_IN_FLIGHT`     Max simultaneous in-flight redeems (process-wide).
 *                                     Default 25.
 */
import { FormsRateLimiter, type RateLimitResult } from '../public-submit/rate-limit.service.js';
import { abuseIdentity, warnOnceIfAbuseKeyingDegraded } from '../public-submit/source-metadata.service.js';
import { InFlightLimiter } from '../http/in-flight-limiter.js';

/** Numeric env read with a default; non-positive/invalid falls back to the default. */
function numberFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Max `/f/:slug` requests one caller may make per rate-limit window. Read per call (see upload/config). */
export function redeemRateLimitMax(): number {
  return numberFromEnv('FORMS_REDEEM_IP_MAX', 30);
}

/**
 * Consult and charge this caller's redeem budget.
 *
 * Admits everything when the caller cannot be identified — a deliberate no-op rather than a
 * shared bucket (see the module note), announced once per process rather than taken quietly.
 */
export function checkRedeemRateLimit(clientIpHash: string | undefined): RateLimitResult {
  const identity = abuseIdentity(clientIpHash);
  if (!identity) {
    warnOnceIfAbuseKeyingDegraded(clientIpHash);
    return { allowed: true };
  }
  return FormsRateLimiter.Instance.charge([{ key: `redeem:${identity}`, max: redeemRateLimitMax() }]);
}

/**
 * Process-wide in-flight cap on the redeem route, lazily built from config.
 *
 * Module-level (not per-instance) so the bound is one number for the whole process however many
 * times ClassFactory instantiates the middleware — the same shape as `UploadMiddleware`. Bounds
 * simultaneous work, which the per-caller window above does not: a caller inside every window can
 * still open many concurrent requests, each holding a DB read and an outbound redeem POST.
 */
let redeemInFlight: InFlightLimiter | undefined;

export function redeemInFlightLimiter(): InFlightLimiter {
  if (!redeemInFlight) {
    redeemInFlight = new InFlightLimiter(numberFromEnv('FORMS_REDEEM_MAX_IN_FLIGHT', 25));
  }
  return redeemInFlight;
}

/** Test-only: drop the memoized limiter so a fresh config takes effect. */
export function resetRedeemInFlightForTests(): void {
  redeemInFlight = undefined;
}
