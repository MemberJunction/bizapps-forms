/**
 * The decisions the host page's boot script makes about resuming (#138).
 *
 * They live HERE, not inside `BOOT_SCRIPT`, because that string is deliberately static and
 * un-interpolated — nothing attacker-controlled is ever spliced into it — which also means nothing
 * inside it can be imported and tested. A source-text assertion on the script would prove the words
 * are present and nothing about what they decide. So the two decisions that matter are pure
 * functions here, tested directly, and the script transcribes them.
 */

/** Machine-readable reasons the host returns when a reopen did not happen. */
export type ResumeNoticeReason =
  | 'no-pointer'
  | 'disabled'
  | 'door-closed'
  | 'open-elsewhere'
  | 'dead-pointer'
  | 'rate-limited'
  | 'redeem-failed'
  | 'network';

/**
 * ONE neutral sentence for every reason a pointer did not work — with a single exception.
 *
 * Neutral because the alternatives leak: "this link expired" and "no draft here" are different
 * answers to the question "does this person have a saved draft?", and a page that answers it is a
 * page that can be asked. Everything that means "your pointer is no good" says the same thing.
 *
 * The exception is a DOUBLE OPEN, which is not a failure at all — the respondent has the form open
 * in another tab, and telling them so is both true and actionable. It reveals nothing they did not
 * already know, because they are the one who opened it.
 */
export function resumeNoticeFor(reason: string | undefined): string {
  if (reason === 'open-elsewhere') {
    return 'This form is already open in another tab. Continue there, or start fresh here.';
  }
  return "We couldn't reopen your saved answers on this device. Start fresh, or request a link by email.";
}

/** The widget events the page acts on, and the host route each one maps to. */
const EVENT_ROUTES = {
  'mjf-partial-saved': 'remember',
  'mjf-start-over': 'forget',
  'mjf-submitted': 'forget',
} as const;

/** An event the boot script listens for. */
export type ResumeWidgetEvent = keyof typeof EVENT_ROUTES;

/** The route an event posts to, or `undefined` for anything else on the page. */
export function routeForEvent(event: string): 'remember' | 'forget' | undefined {
  return EVENT_ROUTES[event as ResumeWidgetEvent];
}

/** Exactly the events the page subscribes to — derived, never hand-listed beside the table. */
export const RESUME_WIDGET_EVENTS = Object.keys(EVENT_ROUTES) as readonly ResumeWidgetEvent[];

/**
 * Whether a start-over must reload the page.
 *
 * It must, and the reason is not obvious: under a response-scoped session the submit pipeline
 * UPDATES the scoped row rather than creating a new one, so a "start over" that only cleared the
 * answers on screen would write the fresh ones straight back into the draft the respondent was
 * trying to walk away from. A genuine start-over needs a fresh DISTRIBUTION session, and the only
 * thing that mints one is a new page load.
 */
export function startOverRequiresReload(): boolean {
  return true;
}
