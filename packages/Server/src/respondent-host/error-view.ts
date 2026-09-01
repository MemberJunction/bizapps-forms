/**
 * Pure mapping from a {@link RedeemFailureReason} to a respondent-facing error message + HTTP
 * status. Kept in its own dependency-free module (no `@memberjunction/server` import) so it is
 * unit-testable without booting server config.
 */
import type { RedeemFailureReason } from './redeem.service.js';

/** A respondent-facing error message + HTTP status for a redeem failure. */
export interface RedeemErrorView {
  status: number;
  message: string;
  /** `Retry-After` header value, when the refusal is temporary and the door knows until when. */
  retryAfter?: string;
}

/**
 * Map a typed redeem failure to a friendly message + the right HTTP status.
 *
 * @param opensAt When the link opens — meaningful for `distribution-not-yet-open` only, where it
 *   names the time in the copy and becomes the `Retry-After` header.
 */
export function redeemFailureToView(reason: RedeemFailureReason, opensAt?: Date): RedeemErrorView {
  switch (reason) {
    case 'distribution-not-found':
      return { status: 404, message: 'This form link was not found. Please check the link and try again.' };
    // Not 410: a form that opens on schedule has not been removed, and "no longer accepting
    // responses" told the holder the opposite of the truth (bizapps-forms#118). 503 + Retry-After
    // is the standard "not now, and here is when" — a monitor records a temporary condition, and
    // the copy names the time so the person can actually come back.
    case 'distribution-not-yet-open':
      return notYetOpenView(opensAt);
    case 'distribution-closed':
      return { status: 410, message: 'This form is no longer accepting responses.' };
    // Same 410 as 'closed' — the resource really is gone either way — but a different sentence.
    // "Closed" invites the reader to come back or ask for it to be reopened; a form that has had
    // every response it asked for has not been withdrawn, and saying so is the difference between
    // a respondent thinking they were unlucky and thinking something is broken.
    case 'distribution-full':
      return { status: 410, message: 'This form has reached its response limit and is no longer accepting responses.' };
    // Sharing a link before publishing is an ordinary authoring mistake, so say that — not "not
    // available" plus a retry that can never succeed. 409 like `no-token` below: the link exists,
    // nothing is behind it yet, and only the author can change that. Not 404 (the author testing
    // their own link must not be told it does not exist) and not 410 (nothing was removed).
    case 'form-unpublished':
      return {
        status: 409,
        message: "This form hasn't been published yet. If you were sent this link, its author still needs to publish the form.",
      };
    case 'no-token':
      return { status: 409, message: 'This form link is not ready yet. Please try again later.' };
    case 'redeem-failed':
    default:
      return { status: 502, message: 'We could not open this form right now. Please try again later.' };
  }
}

/** The not-yet-open view; without a known opening time it still refuses, just without naming one. */
function notYetOpenView(opensAt: Date | undefined): RedeemErrorView {
  if (!opensAt || Number.isNaN(opensAt.getTime())) {
    return { status: 503, message: "This form isn't open yet. Please check back later." };
  }
  return {
    status: 503,
    message: `This form isn't open yet. It opens on ${formatOpensAt(opensAt)}.`,
    retryAfter: opensAt.toUTCString(),
  };
}

/**
 * "September 8, 2026 at 6:41 PM UTC". Rendered in UTC and labelled as such: the error page is
 * static and the server does not know the holder's time zone, and an unambiguous instant beats a
 * plausible-looking wrong local time.
 */
function formatOpensAt(opensAt: Date): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(opensAt);
  return `${formatted} UTC`;
}
