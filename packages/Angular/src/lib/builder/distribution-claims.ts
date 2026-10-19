/**
 * Client side of the share-link claim warning (#292): the reading of `Forms.GetDistributionClaims`'
 * answer, and the copy the Distribute tab shows. Everything here is pure; the one network call
 * lives in `DistributionService.claims`.
 *
 * The server is the single authority on what a claim may contain (including whether its
 * `respondentUrl` is safe to link), so nothing here re-validates URLs.
 */
import type { FormsGetDistributionClaimsOutput } from '@mj-biz-apps/forms-entities';

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

const MALFORMED = 'the server sent an answer this builder could not read';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** One wire claim, checked: the operation's output is typed, but it crossed the network as JSON. */
function claimOf(value: unknown): ShareLinkClaim | null {
  if (!isRecord(value)) return null;
  const { AppName, Slug, OwnerLabel, RespondentURL } = value;
  if (typeof AppName !== 'string' || typeof Slug !== 'string' || typeof OwnerLabel !== 'string') return null;
  if (RespondentURL !== null && typeof RespondentURL !== 'string') return null;
  return { appName: AppName, slug: Slug, ownerLabel: OwnerLabel, respondentUrl: RespondentURL };
}

function failureOf(value: unknown): ClaimProviderFailure | null {
  if (!isRecord(value) || typeof value['AppName'] !== 'string' || typeof value['Message'] !== 'string') return null;
  return { appName: value['AppName'], message: value['Message'] };
}

/**
 * `Forms.GetDistributionClaims`' answer as a {@link ClaimsResult}. Anything missing or garbled
 * becomes `{ ok: false }`, never an empty success — "nobody claims these links" must only ever
 * mean the server said so.
 */
export function toClaimsResult(output: FormsGetDistributionClaimsOutput): ClaimsResult {
  const claims = Array.isArray(output?.Claims) ? output.Claims.map(claimOf) : null;
  if (!claims || claims.some((c) => c === null)) {
    return { ok: false, error: `${MALFORMED} (claims missing or malformed)` };
  }
  const failures = Array.isArray(output?.Failures) ? output.Failures.map(failureOf) : null;
  if (!failures || failures.some((f) => f === null)) {
    return { ok: false, error: `${MALFORMED} (failures missing or malformed)` };
  }
  return {
    ok: true,
    claims: claims.filter((c): c is ShareLinkClaim => c !== null),
    failures: failures.filter((f): f is ClaimProviderFailure => f !== null),
  };
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
