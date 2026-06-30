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
}

/** DI token carrying the {@link FormsApiConfig} into the GraphQL transport. */
export const FORMS_API_CONFIG = new InjectionToken<FormsApiConfig>('FORMS_API_CONFIG');
