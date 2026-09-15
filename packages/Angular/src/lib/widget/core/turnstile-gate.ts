/**
 * Pure, Angular-free helpers for the client-side Cloudflare Turnstile gate (DG-4).
 *
 * Captcha is a per-form / per-distribution toggle: the published definition carries
 * `settings.captchaRequired`, and the server is fail-closed. The widget mirrors that
 * decision here — deciding whether to render a challenge, whether the config is complete
 * enough to render one, whether a final submit may proceed, and whether a failed
 * submit's error came from Turnstile (so the challenge can be reset for a retry).
 *
 * These functions are deliberately free of Angular/DOM so they can be unit-tested
 * without a browser or the Turnstile global (the package's Vitest suite is node-only).
 */
import { CAPTCHA_NOT_CONFIGURED_MESSAGE, type PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

/**
 * Server-side Turnstile error codes that reach the client inside a message
 * (see Server/turnstile.service.ts, and `Captcha verification failed (<code>).` in submit-pipeline).
 *
 * `turnstile-not-configured` is listed but is NO LONGER one of them: the pipeline intercepts that
 * code and answers with {@link CAPTCHA_NOT_CONFIGURED_MESSAGE} instead, so it can only arrive here
 * from an older server. It stays in the list for exactly that reason — a widget bundle outlives the
 * server it was built against — not because the current server can still send it.
 */
export const TURNSTILE_ERROR_CODES = [
  'missing-token',
  'turnstile-not-configured',
  'verification-failed',
  'turnstile-unreachable',
  'invalid-input-response',
  'timeout-or-duplicate',
] as const;

/** Does this published form require a captcha challenge before submit? */
export function captchaRequired(def: PublishedFormDefinition | null): boolean {
  return def?.settings.captchaRequired === true;
}

/**
 * Can the challenge actually be rendered? Requires captcha to be on AND a public site
 * key to be configured. When captcha is on but the site key is missing, the widget
 * shows a config-gap message rather than a silent dead-end.
 */
export function canRenderChallenge(
  def: PublishedFormDefinition | null,
  siteKey: string | undefined,
): boolean {
  return captchaRequired(def) && isSiteKeyConfigured(siteKey);
}

/** True when captcha is required but no site key was supplied to the widget. */
export function isConfigGap(
  def: PublishedFormDefinition | null,
  siteKey: string | undefined,
): boolean {
  return captchaRequired(def) && !isSiteKeyConfigured(siteKey);
}

/** A site key counts as configured only when it is a non-blank string. */
export function isSiteKeyConfigured(siteKey: string | undefined): boolean {
  return typeof siteKey === 'string' && siteKey.trim().length > 0;
}

/**
 * May the final submit proceed? When captcha is not required, always yes (behave exactly
 * as before this feature). When required, a non-empty solved token must be held. If the
 * site key is missing the answer is no — there is no way to produce a token, so the
 * config-gap message is what the respondent sees instead.
 */
export function canSubmit(
  def: PublishedFormDefinition | null,
  siteKey: string | undefined,
  token: string | null,
): boolean {
  if (!captchaRequired(def)) {
    return true;
  }
  if (!isSiteKeyConfigured(siteKey)) {
    return false;
  }
  return typeof token === 'string' && token.trim().length > 0;
}

/**
 * Whether a failed-submit error message came from the Turnstile check, meaning the
 * (single-use) token was consumed/rejected and the challenge must be reset so the
 * respondent can solve a fresh one. The server phrases most of these as
 * `Captcha verification failed (<code>).`.
 *
 * The one that is NOT phrased that way is the host's own config gap, which is deliberately worded
 * to blame nobody and therefore contains neither the word "captcha" nor a code (#122). It is
 * matched against the shared constant rather than sniffed for, because that is the only clause
 * here that cannot drift when the copy is next reworded — which is exactly how this case was lost
 * the first time.
 *
 * `includes`, not `===`: the caller joins every error's message before classifying
 * (`(res.errors ?? []).map((e) => e.message).join(' ')` in mj-form.component), so an identity test
 * would hold only while the server happens to return exactly one error. That is a property of
 * today's `fail(message)` call, not of the contract — and relying on it would be the same kind of
 * accident as relying on the word "captcha" was.
 */
export function isTurnstileError(message: string | undefined | null): boolean {
  if (!message) {
    return false;
  }
  if (message.includes(CAPTCHA_NOT_CONFIGURED_MESSAGE)) {
    return true;
  }
  const lower = message.toLowerCase();
  if (lower.includes('captcha')) {
    return true;
  }
  return TURNSTILE_ERROR_CODES.some((code) => lower.includes(code));
}
