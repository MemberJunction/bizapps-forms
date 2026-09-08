/**
 * The order in which a share link's reasons for not working outrank one another — as ONE table,
 * checked by both surfaces that answer the question.
 *
 * A link can be several kinds of unusable at once: switched off AND scheduled, or never issued a
 * credential AND over its cap. Two places decide what to say about that, and they say it to
 * different people:
 *
 *   - the builder's share badge (`share-state.ts`, `forms-ng`) tells the AUTHOR what to fix;
 *   - the respondent-host door (`redeem.service.ts`, `forms-server`) tells the HOLDER why the link
 *     will not open.
 *
 * WHY THIS EXISTS. A review of bizapps-forms#118 asserted in a changeset that the two agreed on
 * precedence. That claim was checked on ONE pair of states, found to hold, and generalised — and it
 * was false for a second pair: the door ranked "no credential" last, so a scheduled link that had
 * never been issued a token was answered `503 It opens on <date>` with a `Retry-After` naming an
 * instant at which the same URL would answer 409. The builder had ranked it correctly all along and
 * its spec even said why. A partial check written up as a general claim reads as evidence while
 * being worth less than no check, so the claim is a table now and each side proves its own half.
 *
 * Consumed by `redeem.service.spec.ts` and `share-state.precedence.spec.ts`. Neither imports the
 * other's package — both already depend on this one.
 */

/** A relative instant, so one table serves tests that each pick their own "now". */
export type RelativeInstant = 'past' | 'future' | null;

/** The distribution columns that decide whether a link works. */
export interface LinkPrecedenceFacts {
  Status: 'Active' | 'Closed' | 'Draft';
  IsActive: boolean;
  PublicLinkToken: string | null;
  OpenAt: RelativeInstant;
  CloseAt: RelativeInstant;
  MaxResponses: number | null;
  ResponseCount: number;
}

/** What the builder's badge calls this state to the author. */
export type AuthorFacingKind = 'pending' | 'paused' | 'ended' | 'scheduled' | 'full' | 'live';

/**
 * What the door answers the respondent. `null` means the row raises no objection — the door goes on
 * to the published-version check, which this table says nothing about because it is not a property
 * of the row.
 */
export type RespondentFacingReason =
  | 'distribution-closed'
  | 'distribution-not-yet-open'
  | 'distribution-full'
  | 'no-token'
  | null;

export interface LinkPrecedenceCase {
  /** Reads as the assertion in a test name. */
  name: string;
  facts: LinkPrecedenceFacts;
  authorKind: AuthorFacingKind;
  respondentReason: RespondentFacingReason;
  /**
   * Set ONLY where the two surfaces deliberately answer differently, with the reason. An entry
   * here is a decision; its absence is a promise that both sides agree.
   */
  divergence?: string;
}

const OPEN: LinkPrecedenceFacts = {
  Status: 'Active',
  IsActive: true,
  PublicLinkToken: 'a-real-token',
  OpenAt: null,
  CloseAt: null,
  MaxResponses: null,
  ResponseCount: 0,
};

const withFacts = (overrides: Partial<LinkPrecedenceFacts>): LinkPrecedenceFacts => ({ ...OPEN, ...overrides });

export const LINK_PRECEDENCE_CASES: readonly LinkPrecedenceCase[] = [
  // ---- one reason at a time -------------------------------------------------------------
  {
    name: 'an open, credentialled, uncapped link works',
    facts: OPEN,
    authorKind: 'live',
    respondentReason: null,
  },
  {
    name: 'a switched-off link is paused',
    facts: withFacts({ IsActive: false }),
    authorKind: 'paused',
    respondentReason: 'distribution-closed',
  },
  {
    name: 'a Closed link is paused',
    facts: withFacts({ Status: 'Closed' }),
    authorKind: 'paused',
    respondentReason: 'distribution-closed',
  },
  {
    name: 'a Draft link is paused',
    facts: withFacts({ Status: 'Draft' }),
    authorKind: 'paused',
    respondentReason: 'distribution-closed',
  },
  {
    name: 'a link with no credential is not ready',
    facts: withFacts({ PublicLinkToken: null }),
    authorKind: 'pending',
    respondentReason: 'no-token',
  },
  {
    name: 'a link past its closing date is over',
    facts: withFacts({ CloseAt: 'past' }),
    authorKind: 'ended',
    respondentReason: 'distribution-closed',
  },
  {
    name: 'a link that has not opened yet is scheduled',
    facts: withFacts({ OpenAt: 'future' }),
    authorKind: 'scheduled',
    respondentReason: 'distribution-not-yet-open',
  },
  {
    name: 'a link at its cap is full',
    facts: withFacts({ MaxResponses: 3, ResponseCount: 3 }),
    authorKind: 'full',
    respondentReason: 'distribution-full',
  },

  // ---- the precedences, which is what the table is FOR -----------------------------------
  {
    name: 'a human decision outranks a calendar one: switched off beats scheduled',
    facts: withFacts({ Status: 'Closed', OpenAt: 'future' }),
    authorKind: 'paused',
    respondentReason: 'distribution-closed',
  },
  {
    name: 'switched off outranks a missing credential',
    facts: withFacts({ Status: 'Closed', PublicLinkToken: null }),
    authorKind: 'paused',
    respondentReason: 'distribution-closed',
  },
  {
    // The case bizapps-forms#118's review got wrong. Answering "it opens on <date>" here promises
    // an instant at which the link still will not work.
    name: 'a missing credential outranks the calendar: never issued beats scheduled',
    facts: withFacts({ PublicLinkToken: null, OpenAt: 'future' }),
    authorKind: 'pending',
    respondentReason: 'no-token',
  },
  {
    name: 'a missing credential outranks the cap',
    facts: withFacts({ PublicLinkToken: null, MaxResponses: 3, ResponseCount: 3 }),
    authorKind: 'pending',
    respondentReason: 'no-token',
  },
  {
    name: 'the cap is judged after the calendar: scheduled and full reads as scheduled',
    facts: withFacts({ OpenAt: 'future', MaxResponses: 3, ResponseCount: 3 }),
    authorKind: 'scheduled',
    respondentReason: 'distribution-not-yet-open',
  },

  // ---- the one place the two deliberately differ -----------------------------------------
  {
    name: 'a link both past its closing date and never issued a credential',
    facts: withFacts({ CloseAt: 'past', PublicLinkToken: null }),
    authorKind: 'pending',
    respondentReason: 'distribution-closed',
    divergence:
      'The author is told the actionable thing — no credential was ever issued — because that is ' +
      'what they can fix, and the closing date is moot until it is. The holder is told the link is ' +
      'over, because it is: a credential issued now would not make a link whose window has passed ' +
      'work. Both refuse; neither promises anything.',
  },
];
