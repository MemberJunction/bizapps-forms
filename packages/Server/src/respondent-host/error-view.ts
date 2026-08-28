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
}

/** Map a typed redeem failure to a friendly message + the right HTTP status. */
export function redeemFailureToView(reason: RedeemFailureReason): RedeemErrorView {
  switch (reason) {
    case 'distribution-not-found':
      return { status: 404, message: 'This form link was not found. Please check the link and try again.' };
    case 'distribution-closed':
      return { status: 410, message: 'This form is no longer accepting responses.' };
    // Same 410 as 'closed' — the resource really is gone either way — but a different sentence.
    // "Closed" invites the reader to come back or ask for it to be reopened; a form that has had
    // every response it asked for has not been withdrawn, and saying so is the difference between
    // a respondent thinking they were unlucky and thinking something is broken.
    case 'distribution-full':
      return { status: 410, message: 'This form has reached its response limit and is no longer accepting responses.' };
    case 'no-token':
      return { status: 409, message: 'This form link is not ready yet. Please try again later.' };
    case 'redeem-failed':
    default:
      return { status: 502, message: 'We could not open this form right now. Please try again later.' };
  }
}
