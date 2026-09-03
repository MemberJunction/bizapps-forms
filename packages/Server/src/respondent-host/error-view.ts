/**
 * Pure mapping from a {@link RedeemFailureReason} to a respondent-facing error message + HTTP
 * status. Kept in its own dependency-free module (no `@memberjunction/server` import) so it is
 * unit-testable without booting server config.
 */
import { renderRespondentHostErrorPage } from './host-page.js';
import type { RedeemFailureReason } from './redeem.service.js';

/** A respondent-facing error message + HTTP status for a redeem failure. */
export interface RedeemErrorView {
  status: number;
  message: string;
  /** `Retry-After` header value, when the refusal is temporary and the door knows until when. */
  retryAfter?: string;
  /**
   * The page's `<title>`, when the default "Form unavailable" would be untrue. Undefined means the
   * default is right. The title is the browser tab, the bookmark and the link preview, so a form
   * that merely has not started yet must not be announced there as unavailable — the same mistake
   * the 410 wording fix removed one layer down (bizapps-forms#118).
   */
  title?: string;
  /**
   * How the page should carry the sentence. `'notice'` for the two refusals that are not failures —
   * a form awaiting publication or its opening date is not broken, and painting either in error red
   * and announcing it with `role="alert"` contradicts the page's own title. Default `'error'`.
   */
  tone?: RespondentErrorTone;
}

/** Whether a refusal is a failure or merely news. See {@link RedeemErrorView.tone}. */
export type RespondentErrorTone = 'error' | 'notice';

/**
 * Map a typed redeem failure to a friendly message + the right HTTP status.
 *
 * @param opensAt When the link opens — meaningful for `distribution-not-yet-open` only, where it
 *   names the time in the copy and becomes the `Retry-After` header.
 * @param now Injected rather than read inside, so "is this opening time still ahead of us" is a
 *   testable decision instead of a hidden clock.
 */
export function redeemFailureToView(
  reason: RedeemFailureReason,
  opensAt?: Date,
  now: Date = new Date(),
): RedeemErrorView {
  switch (reason) {
    case 'distribution-not-found':
      return { status: 404, message: 'This form link was not found. Please check the link and try again.' };
    // Not 410: a form that opens on schedule has not been removed, and "no longer accepting
    // responses" told the holder the opposite of the truth (bizapps-forms#118). 503 + Retry-After
    // is the standard "not now, and here is when" — a monitor records a temporary condition, and
    // the copy names the time so the person can actually come back.
    case 'distribution-not-yet-open':
      return notYetOpenView(opensAt, now);
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
        title: 'Form not published yet',
        tone: 'notice',
        message: "This form hasn't been published yet. If you were sent this link, its author still needs to publish the form.",
      };
    case 'no-token':
      return { status: 409, message: 'This form link is not ready yet. Please try again later.' };
    case 'redeem-failed':
      return redeemFailedView();
    default:
      // A reason with no `case` above is a decision nobody made. The assignment fails the BUILD so
      // it has to be made; the `return` still answers at runtime, because a value that reached here
      // anyway (an older caller, a hand-rolled string) must not crash the door. Assert-then-return,
      // not assert-instead-of-return.
      assertEveryReasonIsHandled(reason);
      return redeemFailedView();
  }
}

/** The generic failure view, shared by `redeem-failed` and the unreachable default. */
function redeemFailedView(): RedeemErrorView {
  return { status: 502, message: 'We could not open this form right now. Please try again later.' };
}

/**
 * Compile-time proof that the switch above covers every {@link RedeemFailureReason}.
 *
 * The `default` arm used to share a line with `case 'redeem-failed'`, so adding a reason to the
 * union compiled cleanly and shipped that reason to respondents as a generic 502. This PR adds two
 * reasons to that union; the next one gets no such review.
 */
function assertEveryReasonIsHandled(reason: never): void {
  void reason;
}

/**
 * The not-yet-open view; without a usable opening time it still refuses, just without naming one.
 *
 * "It opens on X" is only true while X is still ahead of the person reading it, so that — not
 * merely "is a Date" — is the test. It also catches the way a missing value actually arrives here:
 * `redeem.service.ts` builds this from the distribution's `OpenAt`, in a package compiled without
 * `strictNullChecks`, and `new Date(null)` is the EPOCH — `getTime()` is 0, not NaN, and the value
 * is not falsy, so a null column used to be announced as "It opens on January 1, 1970" with a 1970
 * `Retry-After`. A `Retry-After` in the past is worse than none: it invites an immediate retry that
 * will refuse again.
 */
function notYetOpenView(opensAt: Date | undefined, now: Date): RedeemErrorView {
  const knowsWhen = opensAt !== undefined && !Number.isNaN(opensAt.getTime()) && opensAt > now;
  if (!knowsWhen) {
    return {
      status: 503,
      title: NOT_YET_OPEN_TITLE,
      tone: 'notice',
      message: "This form isn't open yet. Please check back later.",
    };
  }
  return {
    status: 503,
    title: NOT_YET_OPEN_TITLE,
    tone: 'notice',
    message: `This form isn't open yet. It opens on ${formatOpensAt(opensAt)}.`,
    retryAfter: opensAt.toUTCString(),
  };
}

const NOT_YET_OPEN_TITLE = 'Form opens later';

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

/** Everything the route must put on the wire for a refusal. Pure, so it can be asserted whole. */
export interface RedeemErrorResponse {
  status: number;
  headers: Record<string, string>;
  html: string;
}

/**
 * Turn a view into the complete response.
 *
 * Extracted from `RespondentHostMiddleware.sendError`, where it was inline express calls that no
 * test could reach: deleting the `Retry-After` line or the `pageTitle` argument left the entire
 * suite green, which is exactly the shape `.claude/rules/testing.md` says a load-bearing guard must
 * not have. The middleware now only applies what this decides.
 *
 * `Cache-Control: no-store` on every refusal, not just the ones carrying a session: a cached 503
 * would outlive the condition that caused it.
 */
export function respondentErrorResponse(view: RedeemErrorView): RedeemErrorResponse {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (view.retryAfter) {
    // The header the HTTP spec reserves for "not now, and here is when", so a monitor or crawler
    // records "later" rather than "gone".
    headers['Retry-After'] = view.retryAfter;
  }
  return {
    status: view.status,
    headers,
    html: renderRespondentHostErrorPage({
      message: view.message,
      pageTitle: view.title,
      tone: view.tone,
    }),
  };
}
