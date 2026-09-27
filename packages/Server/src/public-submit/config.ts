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
 *  - `FORMS_RATELIMIT_MAX`            Max FINAL submits (completions and knockouts) per window
 *                                     per (session, distribution) key. Default 10. An autosave
 *                                     never charges this bucket — see `FORMS_AUTOSAVE_RATELIMIT_MAX`.
 *  - `FORMS_AUTOSAVE_RATELIMIT_MAX`   Max AUTOSAVES (partial saves) per window per
 *                                     (session, distribution) key. Default 60. Its own bucket,
 *                                     separate from `FORMS_RATELIMIT_MAX`, so a respondent's
 *                                     typing can never spend the budget their own Submit press
 *                                     needs (#271) — sharing one counter meant a session that
 *                                     autosaved a handful of times had nothing left when it
 *                                     actually pressed Submit.
 *  - `FORMS_RATELIMIT_IP_MAX`         Max submissions per window per (client IP, distribution).
 *                                     Default 120. This is the cap that actually bounds abuse:
 *                                     the key above is derived from a header the caller sets,
 *                                     this one from the peer address they cannot choose.
 *  - `FORMS_COMPLETION_MAX`           Max COMPLETED submissions per window per (client IP,
 *                                     distribution). Default 20. Separate from the save caps
 *                                     because a completion fires the on-submit automations.
 *  - `FORMS_RATELIMIT_WINDOW_MS`      Sliding-window length in ms. Default 60000 (1 min).
 *  - `FORMS_RATELIMIT_MAX_KEYS`       How many buckets the in-memory window store may retain
 *                                     before evicting the least recently charged. Default 50000.
 *  - `FORMS_SUBMIT_MAX_IN_FLIGHT`     Max simultaneous in-flight submit-pipeline runs
 *                                     (process-wide). Default 50. Bounds CONCURRENT work rather
 *                                     than rate, which no sliding window can do at any setting —
 *                                     a caller inside every limit can still open many requests at
 *                                     once. Orthogonal to the ceilings above, not a substitute.
 *  - `FORMS_KNOCKOUT_MAX`             Per (caller, distribution) ceiling on DISQUALIFYING submits
 *                                     per window. Defaults to `FORMS_COMPLETION_MAX`. A knockout
 *                                     may not share the completion bucket — it fires none of the
 *                                     work that bucket is tight for, and a burst of ineligible
 *                                     respondents behind one NAT would lock real completions out
 *                                     — but it must not be unthrottled either: each one leaves a
 *                                     PERMANENT row, so with only the save ceiling above it the
 *                                     durable row ceiling below falls an order of magnitude
 *                                     faster. Its own bucket is the only answer that is not one
 *                                     of those two mistakes.
 *  - `FORMS_MAX_PARTIALS_PER_VERSION` Hard ceiling on the rows a single published version may
 *                                     accumulate that NO QUOTA bounds — `Partial` autosaves and
 *                                     `Disqualified` knockouts alike, since the response quota
 *                                     counts completions and a knockout is not one. Default
 *                                     10000. Raise it on a high-rejection screener: knockout
 *                                     rows are permanent, so a form that rejects most applicants
 *                                     will approach this over its life, and reaching it stops
 *                                     new drafts AND new knockout records for that version.
 *                                     The only DURABLE bound here: the caps above are per-window
 *                                     and per-process, so a caller pacing themselves under all of
 *                                     them, or spread across addresses, still accumulates rows
 *                                     forever. This counts what is actually in the table.
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
  /**
   * Per-(session, distribution) ceiling on FINAL submits — completions and knockouts, i.e. every
   * request `rateLimitGatesFor` (submit-pipeline.ts) sees with `complete || knockout` true.
   *
   * An autosave never charges this bucket; it has its own, {@link autosaveRateLimitMax}, right
   * beside it. Before that split the two shared one counter, and #271 is what that produced: a
   * respondent's own typing (partial saves) could spend the budget their eventual Submit press
   * needed, so the final submit was refused "Too many submissions" by traffic that was entirely
   * theirs.
   */
  rateLimitMax: number;
  /**
   * Per-(session, distribution) ceiling on AUTOSAVES (partial saves) — {@link rateLimitMax}'s
   * counterpart for everything that is not a final submit, so a respondent's typing can never
   * spend the budget their Submit needs (#271).
   *
   * The widget debounces autosaves 1.5s apart and never overlaps two in flight, so in practice a
   * session lands around 40/minute — not a hard ceiling: a submit-point checkpoint (`flushNow()`)
   * fires undebounced, and a failed save now retries itself on a capped backoff, so a session
   * working through a rough patch can exceed that naive arithmetic. 60 sits comfortably above the
   * in-practice rate (headroom for checkpoints/retries/jitter) and below {@link ipRateLimitMax}
   * (120 — the per-IP save ceiling that bounds a whole address, many respondents, not one
   * session's typing).
   */
  autosaveRateLimitMax: number;
  /**
   * Per-(client IP, distribution) ceiling on saves.
   *
   * Deliberately LOOSER than {@link rateLimitMax} and keyed differently: the per-session cap is
   * the fine-grained limit for a client that identifies itself honestly, and this is the ceiling
   * for one that does not. It must stay generous enough for a shared egress IP — an office or a
   * campus behind one NAT is many legitimate respondents, and autosave means each of them emits
   * several saves a minute.
   *
   * It is keyed per DISTRIBUTION *and* per IP on purpose. A cap keyed on the distribution alone
   * would be a bucket every respondent of a form shares, which turns a single abusive caller
   * into an outage for everyone filling that form in — trading a rate-limit bypass for a DoS.
   *
   * Sized generously (120/min ≈ 24 concurrent respondents behind one egress address) because
   * generosity is nearly free here: the point of an IP key is not the number, it is that abuse
   * now costs the attacker ADDRESSES. Going from "unbounded via a header" to "bounded per
   * address" is the categorical change; picking a tight number only buys a refused office.
   */
  ipRateLimitMax: number;
  /**
   * Per-(client IP, distribution) ceiling on COMPLETIONS, charged only when a submission is
   * final.
   *
   * Separate from the save caps because the two requests cost unrelated amounts: an autosave
   * upserts one row, while a completion fires the on-submit automations — a confirmation email
   * to an address the submission chose, an LLM run, entity upserts. A single counter covering
   * both has to be either loose enough for a respondent still typing (and therefore no limit at
   * all on the expensive path) or tight enough to bound completions (and therefore a limit that
   * fires while someone fills the form in). This is the tight one.
   */
  completionMax: number;
  /** Per (caller, distribution) ceiling on disqualifying submits — see the env doc above. */
  knockoutMax: number;
  /**
   * Hard cap on how many buckets the in-memory window store retains.
   *
   * The store is keyed partly on values a public caller influences, so without a cap its key
   * space is itself a target: a caller minting a fresh key per request grows the map for as long
   * as they keep going, and expiry does not help — timestamps inside a bucket are pruned on
   * access, but nothing ever removes the bucket.
   *
   * Eviction is least-recently-USED, where a refusal counts as a use. That distinction is the
   * whole security property: evicting a bucket forgives what it had accumulated, and if only
   * successful charges kept a bucket alive then a saturated one would go stale FASTER than an
   * idle one — so the cap would hand a fresh budget to whoever had just exhausted theirs.
   */
  rateLimitMaxKeys: number;
  rateLimitWindowMs: number;
  /** Simultaneous in-flight submit-pipeline runs across the process — the concurrency bound. */
  maxInFlight: number;
  /** Hard ceiling on `Partial` rows per published version — bounds rotated-session partial spam. */
  maxPartialsPerVersion: number;
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
    rateLimitMax: numberFromEnv('FORMS_RATELIMIT_MAX', 10),
    autosaveRateLimitMax: numberFromEnv('FORMS_AUTOSAVE_RATELIMIT_MAX', 60),
    ipRateLimitMax: numberFromEnv('FORMS_RATELIMIT_IP_MAX', 120),
    completionMax: numberFromEnv('FORMS_COMPLETION_MAX', 20),
    rateLimitMaxKeys: numberFromEnv('FORMS_RATELIMIT_MAX_KEYS', 50_000),
    rateLimitWindowMs: numberFromEnv('FORMS_RATELIMIT_WINDOW_MS', 60_000),
    maxInFlight: numberFromEnv('FORMS_SUBMIT_MAX_IN_FLIGHT', 50),
    knockoutMax: numberFromEnv('FORMS_KNOCKOUT_MAX', numberFromEnv('FORMS_COMPLETION_MAX', 20)),
    maxPartialsPerVersion: numberFromEnv('FORMS_MAX_PARTIALS_PER_VERSION', 10_000),
  });
  return cached;
}

/** Test-only: clear the memoized config so env changes take effect. */
export function resetPublicSubmitConfigForTests(): void {
  cached = undefined;
}
