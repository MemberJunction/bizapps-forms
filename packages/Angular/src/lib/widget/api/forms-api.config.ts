/**
 * Connection config for the real GraphQL transport.
 *
 * The widget is an embeddable, anonymous custom element: it talks to the MJAPI
 * GraphQL endpoint directly over `fetch`, authenticated by an anonymous magic-link
 * bearer token (the per-form public-link token), NOT by an Explorer session. These
 * two values come from the `<mj-form>` element attributes (`api-url`, `token`).
 */
import { InjectionToken } from '@angular/core';

import { DEFAULT_TURNSTILE_SCRIPT_URL } from '../core/turnstile-loader';

/** Resolved connection settings for {@link FormsGraphQLApiService}. */
export interface FormsApiConfig {
  /** Absolute URL of the MJAPI GraphQL endpoint, e.g. `https://api.example.com/graphql`. */
  graphqlUrl: string;
  /**
   * Anonymous magic-link bearer token carrying the `mj_scopes` for this form. Sent as
   * `Authorization: Bearer <token>`. Optional only so the widget can render a preview
   * with no live submit; submission requires it.
   */
  token?: string;
  /**
   * Absolute URL of the multipart file-upload endpoint (`POST /forms/upload`). Optional:
   * when omitted it is derived from {@link graphqlUrl} by {@link deriveUploadUrl}, so a
   * host that only supplies `api-url` still gets working uploads. Sent the same anonymous
   * bearer {@link token}.
   */
  uploadUrl?: string;
  /**
   * PUBLIC Cloudflare Turnstile site key (DG-4). Global — one Cloudflare widget across
   * all forms, NOT per-form — and safe to expose client-side. Only used when a form's
   * `settings.captchaRequired` is on: the widget renders a challenge against this key and
   * sends the resulting token as `turnstileToken`. When captcha-required forms are served
   * with no site key, the widget shows a config-gap message instead of failing silently.
   * Comes from the `<mj-form>` `turnstile-site-key` attribute.
   */
  turnstileSiteKey?: string;
  /**
   * Optional override for the Cloudflare Turnstile script URL. Defaults to
   * {@link DEFAULT_TURNSTILE_SCRIPT_URL}; overridable only for tests/self-hosting.
   */
  turnstileScriptUrl: string;
}

/** Build a {@link FormsApiConfig}, filling in derived defaults (script URL). */
export function normalizeApiConfig(
  partial: Omit<FormsApiConfig, 'turnstileScriptUrl'> & { turnstileScriptUrl?: string },
): FormsApiConfig {
  return {
    ...partial,
    turnstileScriptUrl: partial.turnstileScriptUrl?.trim() || DEFAULT_TURNSTILE_SCRIPT_URL,
  };
}

/**
 * Derive the file-upload endpoint from the GraphQL endpoint. MJAPI serves the widget's
 * anonymous upload route at `/forms/upload` on the same origin as `/graphql`, so we swap
 * the trailing `/graphql` path segment for `/forms/upload`. Falls back to appending the
 * path when the URL does not end in `/graphql`.
 */
export function deriveUploadUrl(graphqlUrl: string): string {
  if (!graphqlUrl) {
    return '';
  }
  try {
    const url = new URL(graphqlUrl);
    url.pathname = url.pathname.replace(/\/graphql\/?$/i, '') + '/forms/upload';
    return url.toString();
  } catch {
    // Not an absolute URL — fall back to a plain string swap.
    return graphqlUrl.replace(/\/graphql\/?$/i, '') + '/forms/upload';
  }
}

/** DI token carrying the {@link FormsApiConfig} into the GraphQL transport. */
export const FORMS_API_CONFIG = new InjectionToken<FormsApiConfig>('FORMS_API_CONFIG');
