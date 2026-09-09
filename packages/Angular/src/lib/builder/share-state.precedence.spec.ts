/**
 * The builder's half of the shared refusal-precedence table (`contracts/link-precedence.ts`).
 *
 * The door's half is asserted by `redeem.service.spec.ts` against the SAME cases. Neither package
 * imports the other; both import the table. So a change to either surface's ordering fails one of
 * the two suites and names the case it broke, instead of being noticed — or, as happened in the
 * review of bizapps-forms#118, NOT noticed — by someone reading both implementations by eye and
 * generalising from one agreeing pair.
 *
 * Kept in its own file rather than appended to `share-state.spec.ts`: that file tests what the
 * badge SAYS (labels, tones, the fix hint), and this one tests only which state wins.
 */
import { describe, expect, it } from 'vitest';
import {
  LINK_PRECEDENCE_CASES,
  type LinkPrecedenceFacts,
  type RelativeInstant,
} from '@mj-biz-apps/forms-entities';

import { shareState, type ShareLinkFacts } from './share-state';

const NOW = new Date('2026-06-15T12:00:00Z');
const PAST = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2027-01-01T00:00:00Z');

const instant = (r: RelativeInstant): Date | null => (r === 'past' ? PAST : r === 'future' ? FUTURE : null);

const linkFor = (facts: LinkPrecedenceFacts): ShareLinkFacts => ({
  Status: facts.Status,
  IsActive: facts.IsActive,
  PublicLinkToken: facts.PublicLinkToken,
  OpenAt: instant(facts.OpenAt),
  CloseAt: instant(facts.CloseAt),
  MaxResponses: facts.MaxResponses,
  ResponseCount: facts.ResponseCount,
});

describe('the share badge follows the shared refusal precedence', () => {
  for (const testCase of LINK_PRECEDENCE_CASES) {
    it(testCase.name, () => {
      expect(shareState(linkFor(testCase.facts), NOW).kind).toBe(testCase.authorKind);
    });
  }

  // The table is only worth having if a divergence has to be declared to exist. This asserts the
  // declared ones ARE divergent — a case that quietly starts agreeing should lose its note rather
  // than keep an explanation of a difference that is no longer there.
  it('every declared divergence really is one', () => {
    const declared = LINK_PRECEDENCE_CASES.filter((c) => c.divergence);
    expect(declared.length).toBeGreaterThan(0);
    for (const testCase of declared) {
      const authorSays = shareState(linkFor(testCase.facts), NOW).kind;
      expect(authorSays).toBe(testCase.authorKind);
      // 'paused' / 'ended' / 'full' / 'scheduled' / 'pending' map onto the door's reasons one for
      // one; a divergent case is precisely one where that mapping does not hold.
      const doorEquivalent: Record<string, string | null> = {
        paused: 'distribution-closed',
        ended: 'distribution-closed',
        pending: 'no-token',
        scheduled: 'distribution-not-yet-open',
        full: 'distribution-full',
        live: null,
      };
      expect(doorEquivalent[authorSays]).not.toBe(testCase.respondentReason);
    }
  });
});
