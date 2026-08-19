/**
 * Environment-driven configuration for the public submit endpoint (WP-B).
 *
 * All knobs are read from `process.env` ONCE and frozen. The defaults are safe
 * for local dev; production overrides them via the MJAPI `.env`.
 *
 * Env vars introduced by WP-B:
 *  - `FORMS_TURNSTILE_SECRET`         Cloudflare Turnstile secret key (server side).
 *                                     When unset, captcha verification is treated as
 *                                     mis-configured and any captcha-required form is
 *                                     rejected (fail-closed).
 *  - `FORMS_TURNSTILE_VERIFY_URL`     Override the Turnstile siteverify endpoint
 *                                     (default Cloudflare production URL).
 *  - `FORMS_RATELIMIT_MAX`            Max submissions per window per (session,distribution)
 *                                     key. Default 5.
 *  - `FORMS_RATELIMIT_WINDOW_MS`      Sliding-window length in ms. Default 60000 (1 min).
 *
 * Note: the repo `.env` has a known typo on an unrelated key
 * (`GRAPHQL_BASE_URL='httkp://localhost'`); WP-B does not depend on it.
 */

/** Numeric env read with a default; non-numeric/invalid falls back to the default. */
function numberFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Frozen, validated configuration for the public submit pipeline. */
export interface PublicSubmitConfig {
  turnstileSecret: string | undefined;
  turnstileVerifyUrl: string;
  /**
   * Wait for on-submit hooks before answering the respondent.
   *
   * OFF by default, which is the change that took submit from ~8.3s to ~0.3s: the response
   * is already persisted before hooks run, so nothing the respondent is told depends on
   * them, and awaiting an automation chain made every respondent pay for work that is not
   * theirs. The switch exists because this is the PUBLIC submit path and an operator whose
   * automation turns out to matter for the confirmation needs a way back without a deploy.
   */
  hooksBlocking: boolean;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

const DEFAULT_TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

let cached: PublicSubmitConfig | undefined;

/** Read (and memoize) the public-submit configuration from the environment. */
export function getPublicSubmitConfig(): PublicSubmitConfig {
  if (cached) {
    return cached;
  }
  cached = Object.freeze({
    turnstileSecret: process.env.FORMS_TURNSTILE_SECRET?.trim() || undefined,
    turnstileVerifyUrl: process.env.FORMS_TURNSTILE_VERIFY_URL?.trim() || DEFAULT_TURNSTILE_VERIFY_URL,
    hooksBlocking: (process.env.FORMS_HOOKS_BLOCKING ?? '').trim().toLowerCase() === 'true',
    rateLimitMax: numberFromEnv('FORMS_RATELIMIT_MAX', 5),
    rateLimitWindowMs: numberFromEnv('FORMS_RATELIMIT_WINDOW_MS', 60_000),
  });
  return cached;
}

/** Test-only: clear the memoized config so env changes take effect. */
export function resetPublicSubmitConfigForTests(): void {
  cached = undefined;
}
