/**
 * What to say while a submit is in flight.
 *
 * The submit was doing the least a busy state can do: the button relabelled itself
 * "Submitting…". On a long form that button is often below whatever the respondent was last
 * looking at, so the click produced no visible change where their eyes were — and a click
 * that appears to do nothing gets clicked again.
 *
 * The escalation is the part that matters. The risk in a slow submit is not the waiting, it
 * is the moment the respondent decides the page has broken and closes it, losing a form they
 * have already filled in and will not fill in twice. Naming the situation and asking them to
 * stay costs nothing and is the only defence against that.
 *
 * What it deliberately never does: blame their connection (we do not know — the wait is
 * usually ours), or name a number of seconds (we do not know that either, and a promise the
 * page cannot keep is worse than no promise).
 */

/**
 * When "sending" becomes "still sending".
 *
 * Beyond a couple of seconds a wait stops reading as the system working and starts reading as
 * the system stuck, which is when people reach for the tab close. Early enough to catch that,
 * late enough that an ordinary fast submit never shows it at all.
 */
export const STILL_WORKING_AFTER_MS = 2500;

/** The line to show under the spinner, given how long the submit has been running. */
export function submitWaitMessage(elapsedMs: number): string {
  return elapsedMs >= STILL_WORKING_AFTER_MS
    ? 'Still sending — please keep this page open.'
    : 'Sending your response…';
}
