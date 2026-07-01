/**
 * Connection config for the real GraphQL transport.
 *
 * The widget is an embeddable, anonymous custom element: it talks to the MJAPI
 * GraphQL endpoint directly over `fetch`, authenticated by an anonymous magic-link
 * bearer token (the per-form public-link token), NOT by an Explorer session. These
 * two values come from the `<mj-form>` element attributes (`api-url`, `token`).
 */
import { InjectionToken } from '@angular/core';

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
