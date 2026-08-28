import { describe, expect, it } from 'vitest';

import {
  autoShareName,
  formReach,
  shareState,
  SHARE_LINK_FIELDS,
  type ShareLinkFacts,
} from './share-state';

const NOW = new Date('2026-08-19T12:00:00Z');
const PAST = new Date('2026-08-01T12:00:00Z');
const FUTURE = new Date('2026-09-01T12:00:00Z');

/** A link with nothing wrong with it; each test breaks exactly one thing. */
function link(overrides: Partial<ShareLinkFacts> = {}): ShareLinkFacts {
  return {
    Status: 'Active',
    IsActive: true,
    OpenAt: null,
    CloseAt: null,
    MaxResponses: null,
    ResponseCount: 0,
    PublicLinkToken: 'tok_abc',
    ...overrides,
  };
}

describe('shareState', () => {
  it('is live when nothing stands in the way', () => {
    const state = shareState(link(), NOW);
    expect(state.kind).toBe('live');
    expect(state.accepting).toBe(true);
  });

  it('reports each reason a submission would be refused', () => {
    // One case per server-side gate. If a gate is added and this list is not, the badge
    // starts claiming "Live" for a link that bounces every response — the exact defect
    // this module exists to prevent.
    expect(shareState(link({ Status: 'Closed' }), NOW).kind).toBe('paused');
    expect(shareState(link({ IsActive: false }), NOW).kind).toBe('paused');
    expect(shareState(link({ Status: 'Draft' }), NOW).kind).toBe('paused');
    expect(shareState(link({ CloseAt: PAST }), NOW).kind).toBe('ended');
    expect(shareState(link({ OpenAt: FUTURE }), NOW).kind).toBe('scheduled');
    expect(shareState(link({ MaxResponses: 50, ResponseCount: 50 }), NOW).kind).toBe('full');
    expect(shareState(link({ PublicLinkToken: null }), NOW).kind).toBe('pending');
  });

  it('accepts responses only when live', () => {
    const broken: Partial<ShareLinkFacts>[] = [
      { Status: 'Closed' },
      { IsActive: false },
      { CloseAt: PAST },
      { OpenAt: FUTURE },
      { MaxResponses: 1, ResponseCount: 1 },
      { PublicLinkToken: null },
    ];
    for (const override of broken) {
      expect(shareState(link(override), NOW).accepting).toBe(false);
    }
  });

  it('reads a datetime that arrived over the wire as a string', () => {
    // RunView hands datetimes back as strings over GraphQL and as Dates from a local
    // provider. A state machine that only understood Date would call every scheduled
    // link live in the browser and be right only in tests.
    expect(shareState(link({ CloseAt: PAST.toISOString() }), NOW).kind).toBe('ended');
    expect(shareState(link({ OpenAt: FUTURE.toISOString() }), NOW).kind).toBe('scheduled');
  });

  it('stays inside its window at the boundaries', () => {
    const open = new Date(NOW);
    expect(shareState(link({ OpenAt: open }), NOW).kind).toBe('live');
    expect(shareState(link({ CloseAt: open }), NOW).kind).toBe('live');
  });

  describe('when several things are wrong at once', () => {
    it('puts a missing link ahead of every other reason', () => {
      // Telling someone their never-issued link is merely "Scheduled" sends them to
      // edit a date when the actual problem is that the host never minted a token.
      const state = shareState(
        link({ PublicLinkToken: null, Status: 'Closed', OpenAt: FUTURE, MaxResponses: 0 }),
        NOW,
      );
      expect(state.kind).toBe('pending');
    });

    it('puts a human decision ahead of a calendar one', () => {
      expect(shareState(link({ Status: 'Closed', OpenAt: FUTURE }), NOW).kind).toBe('paused');
      expect(shareState(link({ Status: 'Closed', MaxResponses: 0 }), NOW).kind).toBe('paused');
    });

    it('puts a passed closing date ahead of a cap that was never hit', () => {
      expect(shareState(link({ CloseAt: PAST, MaxResponses: 9, ResponseCount: 0 }), NOW).kind).toBe(
        'ended',
      );
    });
  });

  it('names a way out of every state that is not live', () => {
    // A status that reports a problem and leaves you to find the cure is half a message.
    // The component switches on `kind` to perform these, so a kind with no `fix` is a
    // dead end in the UI.
    const broken: Array<[string, Partial<ShareLinkFacts>]> = [
      ['pending', { PublicLinkToken: null }],
      ['paused', { Status: 'Closed' }],
      ['ended', { CloseAt: PAST }],
      ['scheduled', { OpenAt: FUTURE }],
      ['full', { MaxResponses: 1, ResponseCount: 1 }],
    ];
    for (const [kind, override] of broken) {
      const state = shareState(link(override), NOW);
      expect(state.kind).toBe(kind);
      expect(state.fix, `${kind} offers no way out`).toBeTruthy();
    }
  });

  it('offers no fix when the link is already live', () => {
    expect(shareState(link(), NOW).fix).toBeNull();
  });

  it('treats a zero cap as already full, not as unlimited', () => {
    // `MaxResponses: 0` is a falsy number, and a truthiness check here would silently
    // read it as "no limit" — the inverse of what it says.
    expect(shareState(link({ MaxResponses: 0, ResponseCount: 0 }), NOW).kind).toBe('full');
  });

  it('is full once the count passes the cap, not only when it lands on it', () => {
    expect(shareState(link({ MaxResponses: 5, ResponseCount: 9 }), NOW).kind).toBe('full');
  });
});

describe('formReach', () => {
  it('does not call a form with no share links reachable', () => {
    // Issue #83: the builder header announced "Everything in this form is live on its public
    // link" the instant a form was published, with FormDistribution holding zero rows for it.
    expect(formReach([], NOW).kind).toBe('unshared');
  });

  it('is reachable as soon as one link would accept a response', () => {
    expect(formReach([link()], NOW).kind).toBe('live');
  });

  it('is closed when no link would accept a response, for any of the reasons', () => {
    // Not just "Open to responses: off". Every gate that makes `shareState` refuse counts,
    // because every one of them turns a respondent away — a form whose only link sits at
    // its cap, or past its closing date, is exactly as unreachable as one switched off.
    const dead: Partial<ShareLinkFacts>[] = [
      { Status: 'Closed' },
      { IsActive: false },
      { CloseAt: PAST },
      { OpenAt: FUTURE },
      { MaxResponses: 1, ResponseCount: 1 },
      { PublicLinkToken: null },
    ];
    for (const override of dead) {
      expect(formReach([link(override)], NOW).kind, JSON.stringify(override)).toBe('closed');
    }
    expect(formReach(dead.map(link), NOW).kind).toBe('closed');
  });

  it('needs only one survivor among many dead links', () => {
    expect(formReach([link({ Status: 'Closed' }), link(), link({ CloseAt: PAST })], NOW).kind).toBe(
      'live',
    );
  });

  it('does not mistake links it could not read for links that do not exist', () => {
    // A failed RunView is not an empty list — the same distinction `DistributionService.list`
    // already makes. Sending an author to create a second link because we could not see the
    // first is a worse answer than admitting we do not know.
    expect(formReach(null, NOW).kind).toBe('unknown');
  });

  it('claims a public link in words only when there is a live one', () => {
    // THE INVARIANT. Everything else here is machinery in service of this line: the wording
    // that reaches the author may promise a reachable URL only in the `live` kind.
    expect(formReach([link()], NOW).detail).toMatch(/live on its public link/i);
    for (const unreachable of [formReach([], NOW), formReach([link({ Status: 'Closed' })], NOW), formReach(null, NOW)]) {
      expect(unreachable.detail, unreachable.kind).not.toMatch(/live on its public link/i);
    }
  });

  it('names the next step whenever there is one to name', () => {
    // "Not shared" without "so go and share it" is half a message — the same reasoning
    // `shareState.fix` is built on. Even the unreadable case has somewhere to send them:
    // the Distribute tab is where the load failure is actually explained.
    expect(formReach([], NOW).detail).toMatch(/Distribute/);
    expect(formReach([link({ Status: 'Closed' })], NOW).detail).toMatch(/Distribute/);
    expect(formReach(null, NOW).detail).toMatch(/Distribute/);
  });

  it('calls only the live form reachable, so only it gets the reassuring rendering', () => {
    // `reachable` is what the header branches on. A failed read must land on the same side
    // as a form with no links: not reassured. Rendering an unverified claim as a verified one
    // is this bug wearing a different hat.
    expect(formReach([link()], NOW).reachable).toBe(true);
    expect(formReach([], NOW).reachable).toBe(false);
    expect(formReach([link({ Status: 'Closed' })], NOW).reachable).toBe(false);
    expect(formReach(null, NOW).reachable).toBe(false);
  });

  it('says on the chip itself what the tooltip says, because a phone has no hover', () => {
    expect(formReach([link()], NOW).label).toBe('Published');
    for (const unreachable of [
      formReach([], NOW),
      formReach([link({ Status: 'Closed' })], NOW),
      formReach(null, NOW),
    ]) {
      expect(unreachable.label, unreachable.kind).not.toBe('Published');
    }
  });

  it('tells "never shared" apart from "stopped collecting", because the cures differ', () => {
    // One wants a link created, the other wants an existing link reopened. A chip that reads
    // the same in both sends half its readers to the wrong control.
    expect(formReach([], NOW).label).not.toBe(formReach([link({ Status: 'Closed' })], NOW).label);
  });

  it('asks for every column its own gates read, and cannot fall out of step with them', () => {
    // A read that stops requesting a column hands `shareState` `undefined` for it and goes on
    // producing a confident answer. Deriving the list from the interface makes that a compile
    // error rather than a silent one; this pins the derivation itself.
    expect([...SHARE_LINK_FIELDS].sort()).toEqual(Object.keys(link()).sort());
  });
});

describe('autoShareName', () => {
  it('names the first one plainly', () => {
    expect(autoShareName([])).toBe('Share link');
  });

  it('numbers from two, so there is never a lonely "1"', () => {
    expect(autoShareName(['Share link'])).toBe('Share link 2');
    expect(autoShareName(['Share link', 'Share link 2'])).toBe('Share link 3');
  });

  it('fills a gap left by a deletion instead of colliding with a live name', () => {
    expect(autoShareName(['Share link', 'Share link 3'])).toBe('Share link 2');
  });

  it('ignores case and padding, which is how duplicates actually get typed', () => {
    expect(autoShareName(['  share LINK  '])).toBe('Share link 2');
  });

  it('leaves names the author chose alone', () => {
    expect(autoShareName(['Careers poster', 'Homepage'])).toBe('Share link');
  });
});
