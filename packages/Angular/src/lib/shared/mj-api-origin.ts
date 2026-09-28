/**
 * Where MJAPI lives, and the token to talk to it with, as seen from the builder.
 *
 * The builder runs inside Explorer, which is a DIFFERENT origin from MJAPI. Anything the builder
 * hands to a respondent — a `/f/:slug` link, an uploaded image URL — must be built against the
 * API origin, never `window.location.origin`. Using the latter is what once produced
 * `http://localhost:4321/f/:slug`, an Explorer login page where a form should have been.
 *
 * Extracted from `DistributionManagerComponent` when the asset uploader needed the same answer;
 * one resolution rule beats two that can disagree about where the API is. Moved out of `builder/`
 * when the Responses tab needed it too — a `responses/` module reaching into `builder/` would
 * have made a sibling look like a dependency.
 */
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { apiBaseOf } from '../widget/core/asset-ref';

/**
 * Origin of the configured MJAPI GraphQL endpoint, or `''` when it cannot be determined.
 *
 * Returns `''` rather than guessing: a caller that needs a fallback (the browser origin, an
 * explicit input) can apply its own, and one that has no sensible fallback needs to know.
 */
export function resolveApiOrigin(): string {
  try {
    const url = GraphQLDataProvider.Instance?.ConfigData?.URL;
    return url ? new URL(url).origin : '';
  } catch {
    // A malformed configured URL. Nothing here can fix that, and throwing would take down a
    // component that has a perfectly good fallback of its own.
    return '';
  }
}

/**
 * The configured MJAPI's BASE — origin plus any path prefix it is deployed under — or `''`.
 *
 * Deliberately not {@link resolveApiOrigin}: an MJAPI reverse-proxied at `https://h/api/graphql`
 * serves uploaded images at `/api/forms/asset/<id>`, so resolving a stored `/forms/asset/<id>`
 * against the bare origin would 404 (#270). The same holds for every request the builder makes to
 * an MJAPI route — the asset upload and the response-file download use this too. It is a second
 * function rather than a change to that one because the respondent link is built by
 * `DistributionManagerComponent` against the origin, and #270 does not touch that link.
 * `apiBaseOf` already maps an empty or malformed URL to `''`, so no try/catch is needed here.
 */
export function resolveApiBase(): string {
  return apiBaseOf(GraphQLDataProvider.Instance?.ConfigData?.URL ?? '');
}

/** The Explorer session's bearer token, or `''` when there is none (unauthenticated preview). */
export function resolveApiToken(): string {
  return GraphQLDataProvider.Instance?.ConfigData?.Token ?? '';
}
