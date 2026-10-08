/**
 * Client side of the share-link claim warning (#292): the query, the parse of its answer, and
 * the copy the Distribute tab shows. Everything here is pure; the one network call lives in
 * `DistributionService.claims`.
 *
 * The server is the single authority on what a claim may contain (including whether its
 * `respondentUrl` is safe to link), so nothing here re-validates URLs.
 */

/** One app's claim on a share-link slug. */
export interface ShareLinkClaim {
  appName: string;
  slug: string;
  ownerLabel: string;
  respondentUrl: string | null;
}

/** An app that could not be asked, or did not answer. */
export interface ClaimProviderFailure {
  appName: string;
  message: string;
}

/**
 * A failed check is NOT "nobody claims these links": `{ ok: true, claims: [] }` would tell the
 * author a link is unclaimed when we simply could not find out.
 */
export type ClaimsResult =
  | { ok: true; claims: ShareLinkClaim[]; failures: ClaimProviderFailure[] }
  | { ok: false; error: string };

export const FORM_DISTRIBUTION_CLAIMS_QUERY = `query FormDistributionClaims($formId: String!) {
  FormDistributionClaims(formId: $formId) {
    claims { appName slug ownerLabel respondentUrl }
    failures { appName message }
  }
}`;

const MALFORMED = 'the server sent an answer this builder could not read';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isClaim(value: unknown): value is ShareLinkClaim {
  return (
    isRecord(value) &&
    typeof value['appName'] === 'string' &&
    typeof value['slug'] === 'string' &&
    typeof value['ownerLabel'] === 'string' &&
    (value['respondentUrl'] === null || typeof value['respondentUrl'] === 'string')
  );
}

function isFailure(value: unknown): value is ClaimProviderFailure {
  return isRecord(value) && typeof value['appName'] === 'string' && typeof value['message'] === 'string';
}

/**
 * Narrow the GraphQL root object to a {@link ClaimsResult}.
 *
 * `payload` is `unknown` ONLY because this is the network boundary: nothing upstream has typed
 * it. Anything missing or garbled becomes `{ ok: false }`, never an empty success.
 */
export function parseClaimsPayload(payload: unknown): ClaimsResult {
  const root = isRecord(payload) ? payload['FormDistributionClaims'] : undefined;
  if (!isRecord(root)) return { ok: false, error: `${MALFORMED} (no FormDistributionClaims result)` };
  const { claims, failures } = root;
  if (!Array.isArray(claims) || !claims.every(isClaim)) {
    return { ok: false, error: `${MALFORMED} (claims missing or malformed)` };
  }
  if (!Array.isArray(failures) || !failures.every(isFailure)) {
    return { ok: false, error: `${MALFORMED} (failures missing or malformed)` };
  }
  return { ok: true, claims, failures };
}

/** Group claims by slug, preserving the server's order within each slug. */
export function claimsBySlug(claims: ShareLinkClaim[]): Map<string, ShareLinkClaim[]> {
  const grouped = new Map<string, ShareLinkClaim[]>();
  for (const claim of claims) {
    const forSlug = grouped.get(claim.slug);
    if (forSlug) forSlug.push(claim);
    else grouped.set(claim.slug, [claim]);
  }
  return grouped;
}

/**
 * The warning for one slug's claims: a headline, plus one line per claiming app.
 * Precondition: `claims` is non-empty (the single-claim branch reads `claims[0]`); callers gate on that.
 */
export function claimNotice(claims: ShareLinkClaim[]): {
  headline: string;
  lines: { appName: string; ownerLabel: string; respondentUrl: string | null }[];
} {
  const lines = claims.map(({ appName, ownerLabel, respondentUrl }) => ({ appName, ownerLabel, respondentUrl }));
  if (claims.length === 1) {
    const { appName, ownerLabel } = claims[0];
    return {
      headline: `${appName} uses this link for ${ownerLabel}. Responses sent here are saved as form responses only. ${appName} never sees them.`,
      lines,
    };
  }
  return {
    headline:
      'Other apps use this link. Responses sent here are saved as form responses only; those apps never see them.',
    lines,
  };
}

/** `FailureLog` in the server reports a nameless provider as this; it is not a real app name. */
const UNNAMED_APP_SENTINEL = 'unknown';

/**
 * Text for a check that did not fully succeed, or null when every app answered.
 *
 * `failures` mixes two things: an app that could not be asked at all, and an app whose answer was
 * partly refused (a nulled URL, an unasked slug, a bad label). The lead therefore claims neither.
 */
export function failureNotice(result: ClaimsResult): string | null {
  if (!result.ok) return `Couldn't check whether another app uses these links: ${result.error}`;
  if (result.failures.length === 0) return null;
  const entries = result.failures.map((f) => `${f.appName === UNNAMED_APP_SENTINEL ? 'an unnamed app' : f.appName}: ${f.message}`);
  return `Some apps' answers about these links had problems: ${entries.join('; ')}`;
}
