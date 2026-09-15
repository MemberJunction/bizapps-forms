/**
 * The server's embed-origin verdict: a distribution's authored policy composed with the API's OWN
 * browser origin (#203).
 *
 * WHY THE OWN-ORIGIN HALF EXISTS. The embed snippet this product generates is an `<iframe>`
 * pointing at our respondent host page, so the framed document's origin is OURS. Measured in a
 * real browser on 2026-09-12: a `fetch` from the top-level customer page reports
 * `http://127.0.0.1:8917`, and the same `fetch` from inside the embedded widget reports
 * `http://localhost:4000` — the API's own origin. `Referer` is no escape hatch; inside the iframe
 * it is our page too. So the API can NEVER see a legitimate embed's customer origin, and a gate
 * that consulted only the author's list would refuse every real embed it exists to permit. What it
 * CAN refuse is a caller that is neither our own page nor a declared origin — a leaked link
 * replayed from somebody else's page. The framing half of #203, which genuinely does see the
 * customer's origin, is `Content-Security-Policy: frame-ancestors` on the host page; that is a
 * different door and is not decided here.
 *
 * WHY THIS ISN'T IN THE PURE CONTRACT. "Which origin is ours" is a deployment fact read from the
 * environment. `forms-entities` owns the grammar, the parse and the match and stays pure; this
 * module is the one seam where that meets `MJAPI_PUBLIC_URL`, and the only place that reads it.
 *
 * WHEN `MJAPI_PUBLIC_URL` IS UNSET OR UNUSABLE the API cannot recognise its own origin, and the
 * gate then has nothing but the author's list to go on. That is a REFUSAL of our own widget, not
 * an admission of everyone: the fallback direction is always closed. It is announced the first
 * time an origin decision needs the value (and memoized, so it does not repeat per request),
 * because the symptom otherwise — one distribution's embed refusing its own host page while every
 * unrestricted link keeps working — points nowhere near the missing variable.
 *
 * WHY EVERY REFUSAL READS THE SAME. {@link FOREIGN_ORIGIN_MESSAGE} is one sentence for every
 * reason, so a prober cannot tell "this link has an allowlist and you are not on it" from "this
 * link has an allowlist that does not parse". The specifics go to the operator through `reason`
 * and a log line; the browser gets the sentence.
 */

import { LogError, LogStatus } from '@memberjunction/core';
import {
  ALLOWED_ORIGIN_GRAMMAR,
  isOriginAdmitted,
  normalizeReportedOrigin,
  parseAllowedOrigins,
  type EmbedOriginPolicy,
} from '@mj-biz-apps/forms-entities';

/**
 * What a refused caller is told — one sentence for every reason.
 *
 * A prober must not be able to tell "this link has an allowlist and you are not on it" from
 * "this link has an allowlist that does not parse", and a real respondent on a mis-embedded page
 * needs a sentence they can forward to whoever owns the page. The operator gets the specifics in
 * the log; the browser gets this.
 */
export const FOREIGN_ORIGIN_MESSAGE =
  'This form cannot be opened from this website. If you reached it from a link someone shared, open the link directly.';

export interface EmbedOriginVerdict {
  allowed: boolean;
  policy: EmbedOriginPolicy;
  /** Operator-facing detail. Present only on a refusal, and never shown to a respondent. */
  reason?: string;
}

/**
 * Memoized answer to "which origin is ours". Wrapped in an object rather than held as a bare
 * `string | undefined` so that "resolved, and the answer is none" is distinguishable from "not
 * resolved yet" — without the wrapper an unset variable would re-run the resolver, and re-log its
 * warning, on every single request.
 */
let ownOrigin: { value: string | undefined } | undefined;

/** This API's own browser origin, from `MJAPI_PUBLIC_URL`, or `undefined` if it cannot be read. */
export function apiOwnOrigin(): string | undefined {
  if (ownOrigin) {
    return ownOrigin.value;
  }
  ownOrigin = { value: resolveOwnOrigin() };
  return ownOrigin.value;
}

/**
 * Whether one request may act on one distribution, given what its author authorised.
 *
 * Admits under any of three conditions and refuses otherwise: the distribution authored nothing;
 * the caller's origin is on the author's list; or the caller's origin is this API's own, which is
 * what a legitimate iframe embed reports. A CLOSED policy — authored but unusable — refuses
 * everyone including us, deliberately: the author asked for a restriction and the honest answer to
 * a restriction nobody can evaluate is "no", not "everyone".
 */
export function checkEmbedOrigin(
  allowedOriginsColumn: string | null | undefined,
  requestOrigin: string | null | undefined,
): EmbedOriginVerdict {
  const policy = parseAllowedOrigins(allowedOriginsColumn);
  if (policy.kind === 'unrestricted') {
    return { allowed: true, policy };
  }
  if (policy.kind === 'closed') {
    return { allowed: false, policy, reason: policy.reason };
  }
  if (isOriginAdmitted(requestOrigin, policy)) {
    return { allowed: true, policy };
  }
  // Both sides of THIS comparison are reported origins, never authored ones: the left is an
  // inbound `Origin` header and the right is `MJAPI_PUBLIC_URL`, so both go through
  // `normalizeReportedOrigin`. The author-list match a few lines above keeps using the authoring
  // grammar on purpose — a caller can only match an entry an author was able to write, so holding
  // it to the same grammar that produced those entries is what makes the comparison total.
  // Running the header through the AUTHORING grammar here instead would re-refuse a plain-http
  // deployment on the way in, undoing the resolver's whole point (see `resolveOwnOrigin`).
  const own = apiOwnOrigin();
  if (own !== undefined && typeof requestOrigin === 'string' && normalizeReportedOrigin(requestOrigin) === own) {
    return { allowed: true, policy };
  }
  return {
    allowed: false,
    policy,
    reason:
      `Origin ${requestOrigin ?? '(absent)'} is not this API's own origin (${own ?? 'UNKNOWN — MJAPI_PUBLIC_URL is not set'}) `
      + `and is not one of the ${policy.origins.length} the distribution allows (${policy.origins.join(', ')}). `
      + `Each allowed entry is ${ALLOWED_ORIGIN_GRAMMAR}`,
  };
}

/** Test-only: clear the memoized own-origin so an env change takes effect. */
export function resetEmbedOriginConfigForTests(): void {
  ownOrigin = undefined;
}

/**
 * Read `MJAPI_PUBLIC_URL` down to a bare origin, announcing loudly when it cannot be.
 *
 * THIS IS THE ONE PLACE THAT DIVERGES FROM THE AUTHORING GRAMMAR, and the divergence is the whole
 * reason `normalizeReportedOrigin` exists beside `normalizeOrigin`. `MJAPI_PUBLIC_URL` is a
 * deployment fact, not something a person chose from a list of embed hosts, so the two rules the
 * authoring grammar adds do not apply to it:
 *
 *   - A PATH is discarded rather than refused. An API mounted under `https://host/forms/` is a
 *     normal deployment; in an authored allowlist entry the same path would mean the author wrote
 *     a page and meant every page on the host.
 *   - PLAIN HTTP is accepted on any host, not just loopback. The authoring rule exists to stop an
 *     author naming a plaintext embed host nobody can authenticate. Applying it here instead broke
 *     self-hosted, docker-compose and LAN installs — `http://10.0.0.5:4000`, `http://mjapi.internal:4000`
 *     — where this resolver returned `undefined` and every distribution with an allowlist then
 *     refused its OWN embedded widget. Worse, the refusal was unrepairable: the log line told the
 *     operator to list the origin their host page is served from, and `authorAllowedOrigins`
 *     refused that same value, so the builder rejected the only entry that would have fixed it.
 *
 * What does NOT relax is the character screen — whatever is returned here is compared against an
 * inbound `Origin` header, so it must be a string a browser could have sent. `normalizeReportedOrigin`
 * applies exactly the screen the authoring path applies, from the same constant.
 */
function resolveOwnOrigin(): string | undefined {
  const raw = process.env.MJAPI_PUBLIC_URL?.trim();
  if (!raw) {
    LogStatus(
      '[Forms] MJAPI_PUBLIC_URL is not set, so this API cannot recognise its own browser origin. '
        + 'Any distribution that authors AllowedOrigins will then refuse its own embedded widget, '
        + 'because that widget calls us from inside our own iframe and reports our origin, not the '
        + 'customer\'s. Set MJAPI_PUBLIC_URL to the URL this API is reached at. (Listing that origin '
        + 'in the allowlist instead only works where the authoring grammar accepts it — https '
        + 'anywhere, http only on loopback — so it is not a remedy on a plain-http deployment.)',
    );
    return undefined;
  }
  let reduced: string;
  try {
    reduced = new URL(raw).origin;
  } catch {
    // Not a URL at all — a hostname with no scheme is the usual mistake. Named rather than
    // swallowed, because the consequence (our own widget refused by any restricted link) shows up
    // far from here. Kept separate from the refusal below so the two mistakes read differently.
    LogError(
      `[Forms] MJAPI_PUBLIC_URL is not a URL ("${raw}"), so this API cannot recognise its own origin. `
        + 'Expected the full URL this API is reached at in a browser, e.g. https://forms.acme.com '
        + 'or http://10.0.0.5:4000.',
    );
    return undefined;
  }
  const own = normalizeReportedOrigin(reduced);
  if (own === null) {
    LogError(
      `[Forms] MJAPI_PUBLIC_URL is not an origin a browser could report ("${raw}"), so this API cannot `
        + 'recognise its own. Expected an http or https URL whose host is a hostname, an IPv4 address '
        + 'or a bracketed IPv6 literal, with an optional port.',
    );
    return undefined;
  }
  return own;
}
