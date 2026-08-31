/**
 * What a share link is actually doing, right now.
 *
 * WHY THIS EXISTS. The Distribute tab used to badge a link with its `Status` column
 * verbatim — "Active" or "Closed". That is not the question the person is asking. They
 * want to know whether the link they are about to put on a poster will work, and
 * `Status` answers only one sixth of that: the server accepts a submission when the
 * distribution is active AND not closed AND past `OpenAt` AND before `CloseAt` AND under
 * `MaxResponses` AND has a minted `PublicLinkToken`. A distribution sitting at its
 * response cap still reads "Active" while every submission bounces, which is the worst
 * kind of UI defect — one that is confidently wrong.
 *
 * So this computes the EFFECTIVE state, from the same facts and in the same order the
 * server gates on: {@link redeemUrl}'s guard in `redeem.service.ts`, the submit guard in
 * `definition-loader.service.ts`, and the quota check in `quota.service.ts`. When those
 * gates change, this changes with them — that coupling is the point, and it is why the
 * kinds map one-to-one onto reasons a submission is refused rather than onto column
 * values.
 *
 * Pure and free of Angular so it is directly unit-testable, and free of date FORMATTING
 * so it does not drag a locale and a timezone into every assertion — the component holds
 * `OpenAt` / `CloseAt` already and renders them with the `date` pipe.
 */
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';

import { toDate } from '../shared';

/**
 * The facts a share link's state depends on.
 *
 * Field types are derived from the generated entity so a widened CHECK constraint flows
 * through here on the next CodeGen rather than silently drifting. The two datetimes are
 * the deliberate exception: a `ResultType: 'simple'` RunView hands datetimes back as
 * strings over GraphQL and as `Date` objects from a local provider, so accepting both is
 * the honest signature — see {@link toDate}.
 */
export interface ShareLinkFacts
  extends Pick<
    mjBizAppsFormsFormDistributionEntityType,
    'Status' | 'IsActive' | 'MaxResponses' | 'ResponseCount' | 'PublicLinkToken'
  > {
  OpenAt: Date | string | null;
  CloseAt: Date | string | null;
}

/**
 * Every key of {@link ShareLinkFacts}, present exactly once.
 *
 * `Record<keyof ShareLinkFacts, true>` is the whole point: TypeScript refuses a missing key
 * and refuses an unknown one, so this cannot drift from the interface in either direction.
 * A hand-written list could, and the drift would be silent — a `RunView` that stops asking
 * for a column hands the gate `undefined` and goes on rendering a confident answer, which is
 * the failure class this whole module exists to remove.
 */
const SHARE_LINK_FIELD_SET: Record<keyof ShareLinkFacts, true> = {
  Status: true,
  IsActive: true,
  OpenAt: true,
  CloseAt: true,
  MaxResponses: true,
  ResponseCount: true,
  PublicLinkToken: true,
};

/** The columns a read must request to be able to answer {@link shareState} or {@link formReach}. */
export const SHARE_LINK_FIELDS: readonly (keyof ShareLinkFacts)[] = Object.keys(
  SHARE_LINK_FIELD_SET,
) as (keyof ShareLinkFacts)[];

/** Why a link is or is not taking responses. One kind per reason the server can refuse. */
export type ShareStateKind = 'pending' | 'paused' | 'ended' | 'scheduled' | 'full' | 'live';

/** Which `.mjf-badge` modifier the state wears; `neutral` is the unmodified badge. */
export type ShareStateTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export interface ShareState {
  kind: ShareStateKind;
  /** Badge text. Two words at most — the sentence lives in {@link detail}. */
  label: string;
  tone: ShareStateTone;
  /**
   * What a respondent opening this link right now would experience, in plain language.
   *
   * Written from the RESPONDENT's side rather than the database's, because that is the
   * thing the author cannot see and is actually worried about. No dates: the component
   * renders those from the record with the `date` pipe, so this stays locale-free.
   */
  detail: string;
  /** Whether a submission through this link would be accepted right now. */
  accepting: boolean;
  /**
   * The one-click way out of this state, or null when there is nothing to fix.
   *
   * Every state that is not live names its own remedy and puts it next to the badge. A
   * status that tells you something is wrong and leaves you to find the cure is only half
   * a message — and the cure was genuinely hard to find here, since the switch that
   * reopens a paused link sits in a settings list below the fold, and the ones for a
   * passed closing date or a reached limit were not anywhere at all.
   */
  fix: string | null;
}

const STATES: Record<ShareStateKind, Omit<ShareState, 'kind'>> = {
  pending: {
    label: 'Not ready',
    tone: 'danger',
    detail: 'This link has no web address yet, so it will not open. Issue it to fix that.',
    accepting: false,
    fix: 'Issue the link',
  },
  paused: {
    label: 'Paused',
    tone: 'neutral',
    detail:
      'Turned off. Anyone opening it is told the form is not taking responses, and its access ' +
      'token has been withdrawn. Turning it back on issues a fresh one at the same web address.',
    accepting: false,
    fix: 'Turn it back on',
  },
  ended: {
    label: 'Finished',
    tone: 'neutral',
    detail: 'It passed its expiry date, so it has stopped taking responses.',
    accepting: false,
    fix: 'Remove the expiry',
  },
  scheduled: {
    label: 'Scheduled',
    tone: 'info',
    detail: 'Waiting for its start date. Until then it turns people away.',
    accepting: false,
    fix: 'Open it now',
  },
  full: {
    label: 'Limit reached',
    tone: 'warning',
    detail: 'It has collected every response you allowed.',
    accepting: false,
    fix: 'Remove the limit',
  },
  live: {
    label: 'Live',
    tone: 'success',
    detail: 'Anyone with this link can open the form and answer it. No sign-in needed.',
    accepting: true,
    fix: null,
  },
};

/**
 * The state of a share link at `now`.
 *
 * Order is deliberate, and it is "the thing the author can act on first" rather than the
 * order the server happens to check in: an explicit human decision (paused) outranks a
 * missing token, which outranks a calendar reason, which outranks the cap.
 *
 * Paused leads because of bizapps-forms#104: pausing a link now REVOKES its magic-link
 * credential and clears `PublicLinkToken`, so a paused link legitimately has no token.
 * The two used to be the other way round, on the reasoning that a link with no token is
 * broken however else it looks — true while a token was minted once and never withdrawn,
 * and wrong now, because it would badge every deliberately-paused link "Not ready" and
 * offer "Issue the link" as the cure for a switch the author had turned off themselves.
 * `pending` still leads the rest: it means the host could not mint, and telling someone
 * that link is merely "Scheduled" sends them to edit a date that is not the problem.
 */
export function shareState(facts: ShareLinkFacts, now: Date): ShareState {
  const kind = stateKind(facts, now);
  return { kind, ...STATES[kind] };
}

function stateKind(facts: ShareLinkFacts, now: Date): ShareStateKind {
  if (!facts.IsActive || facts.Status !== 'Active') {
    return 'paused';
  }
  if (!facts.PublicLinkToken) {
    return 'pending';
  }
  const closeAt = toDate(facts.CloseAt);
  if (closeAt && closeAt.getTime() < now.getTime()) {
    return 'ended';
  }
  const openAt = toDate(facts.OpenAt);
  if (openAt && openAt.getTime() > now.getTime()) {
    return 'scheduled';
  }
  // `!= null` rather than `!== null`: the column is typed `number | null`, but the server's
  // own quota check guards `undefined` too, which says a missing cell reaches JS in practice.
  // Loose-equality-to-null is the one comparison that catches both and still narrows.
  if (facts.MaxResponses != null && facts.ResponseCount >= facts.MaxResponses) {
    return 'full';
  }
  return 'live';
}

/**
 * Whether a FORM — not one of its links — can be reached by a respondent right now.
 *
 * `live` is the only kind that entitles a surface to say the form is on a public link.
 */
export type FormReachKind = 'live' | 'unshared' | 'closed' | 'unknown';

export interface FormReach {
  kind: FormReachKind;
  /**
   * The chip's own words, and the only half of this an author on a phone ever sees — a
   * `title` is a hover affordance and there is no hover on a touch screen. So the label,
   * alone and out of context, has to be true.
   */
  label: string;
  /** The sentence behind the chip. Promises a reachable URL in the `live` kind and nowhere else. */
  detail: string;
  /**
   * Whether a respondent could open this form right now — the one thing that earns the
   * reassuring rendering.
   *
   * Redundant with `kind === 'live'` on purpose, the same way {@link ShareState.accepting}
   * is: the question a surface is asking is "may I reassure them", and it should not have to
   * spell that as a string comparison it could get subtly wrong.
   *
   * NOT true for `unknown`. A failed read dressed as a green check is the exact defect this
   * module exists to prevent, one level up — an unverified claim rendered as a verified one.
   */
  reachable: boolean;
}

const REACH: Record<FormReachKind, Omit<FormReach, 'kind'>> = {
  live: {
    label: 'Published',
    detail: 'Everything in this form is live on its public link.',
    reachable: true,
  },
  unshared: {
    label: 'Published, not shared',
    detail:
      'This form is published, but it has no share link yet, so nobody can open it. Create one on the Distribute tab to start collecting responses.',
    reachable: false,
  },
  closed: {
    // Not "not shared" — the links exist and may well be in the wild. What stopped is the
    // collecting, and that is the distinction between the two remedies: create one, or
    // reopen one.
    label: 'Published, not collecting',
    detail:
      'This form is published, but none of its share links are taking responses. Reopen one on the Distribute tab to start collecting again.',
    reachable: false,
  },
  unknown: {
    // Deliberately NOT the reassuring wording. "Published" over a green check is what a
    // genuinely live form looks like, so rendering a failed read that way would make the UI
    // confidently wrong in the one situation where it knows least. The Distribute tab is
    // where the real load error is shown, which is also why this state points there.
    label: 'Published, link unchecked',
    detail:
      'This form is published. Its share links could not be read just now, so whether anyone can reach it is unknown. Open the Distribute tab to see why.',
    reachable: false,
  },
};

/**
 * What the form's share links, taken together, mean for a respondent.
 *
 * WHY THIS EXISTS. The builder header announced "Everything in this form is live on its
 * public link" from `Form.Status` alone, so a form published thirty seconds ago — with no
 * `FormDistribution` row anywhere and the Distribute tab still showing its empty state —
 * told its author it was reachable. Publishing makes a *version*; only a share link makes
 * a *URL*, and the two are separate acts.
 *
 * Reachability is `shareState().accepting`, not `Status`, for the reason that module was
 * written: a link at its response cap, past its closing date, or never issued a token is
 * refused by the server while its column still reads Active. One predicate, so the header
 * and the Distribute tab can never disagree about whether the form is collecting.
 *
 * `now` is passed in rather than read, so a link that expires while the builder is open
 * stops being counted on the next render instead of at the next reload.
 */
export function formReach(links: readonly ShareLinkFacts[] | null, now: Date): FormReach {
  const kind = reachKind(links, now);
  return { kind, ...REACH[kind] };
}

function reachKind(links: readonly ShareLinkFacts[] | null, now: Date): FormReachKind {
  if (links === null) {
    return 'unknown';
  }
  if (links.length === 0) {
    return 'unshared';
  }
  return links.some((l) => shareState(l, now).accepting) ? 'live' : 'closed';
}

/**
 * A name for a newly created share link.
 *
 * Creating a link asks for NOTHING — no name, no channel, no confirmation — because the
 * one thing a person came to this tab for is a URL, and every field between them and it
 * is a chance to bounce. The trade is that the name has to be written for them, so it is
 * written to look provisional: "Share link" reads as a placeholder and invites the rename
 * that is one click away, where "Untitled" reads as an error and a real-sounding name
 * would discourage the rename entirely.
 *
 * Numbering scans the names in use rather than counting rows, so deleting link 2 of 3 and
 * creating another gives "Share link 4" instead of a duplicate "Share link 3".
 */
export function autoShareName(existingNames: readonly string[]): string {
  const base = 'Share link';
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) {
    return base;
  }
  // Bounded rather than `while (true)`: the cap is the number of names that could
  // possibly collide, so overshooting it by one is provably free.
  const limit = taken.size + 2;
  for (let n = 2; n <= limit; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  /* istanbul ignore next -- unreachable: `limit` exceeds the number of possible collisions. */
  return `${base} ${limit + 1}`;
}
