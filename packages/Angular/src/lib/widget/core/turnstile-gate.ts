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
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

/** Server-side Turnstile error codes surfaced to the client (see Server/turnstile.service.ts). */
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
 * respondent can solve a fresh one. The server phrases these as
 * `Captcha verification failed (<code>).`.
 */
export function isTurnstileError(message: string | undefined | null): boolean {
  if (!message) {
    return false;
  }
  const lower = message.toLowerCase();
  if (lower.includes('captcha')) {
    return true;
  }
  return TURNSTILE_ERROR_CODES.some((code) => lower.includes(code));
}
