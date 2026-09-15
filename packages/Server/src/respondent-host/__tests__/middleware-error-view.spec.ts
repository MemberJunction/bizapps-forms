import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redeemFailureToView, respondentErrorResponse } from '../error-view';
import { REDEEM_FAILURE_REASONS } from '../redeem.service';

describe('redeemFailureToView', () => {
  it('maps distribution-not-found to 404', () => {
    expect(redeemFailureToView('distribution-not-found').status).toBe(404);
  });

  it('maps distribution-closed to 410', () => {
    expect(redeemFailureToView('distribution-closed').status).toBe(410);
  });

  it('maps distribution-full to 410 with wording that names the limit, not just closure', () => {
    const full = redeemFailureToView('distribution-full');
    expect(full.status).toBe(410);
    expect(full.message).not.toBe(redeemFailureToView('distribution-closed').message);
    expect(full.message.toLowerCase()).toContain('limit');
  });

  it('maps no-token to 409', () => {
    expect(redeemFailureToView('no-token').status).toBe(409);
  });

  it('maps redeem-failed to 502', () => {
    expect(redeemFailureToView('redeem-failed').status).toBe(502);
  });

  // 410 asserts permanent removal, which is what crawlers and monitors would record for a form
  // that opens on schedule. 503 + Retry-After is "not now, and here is when" (bizapps-forms#118).
  describe('distribution-not-yet-open', () => {
    const opensAt = new Date('2026-09-08T18:41:58Z');
    // The clock is frozen, because the assertions below name a specific date and time and the
    // production guard only names an opening time that is still AHEAD of now ("an opening time
    // that is not in the future", below). Against the real clock this block passed until
    // 2026-09-08T18:41:58Z and has failed on every run since — a date literal written in the
    // future is a test that expires. Frozen a day before, `opensAt` is always ahead of now, so
    // the literal expectations stay meaningful instead of being derived from the code they check.
    // Same pattern as redeem.service.spec.ts in this directory.
    const NOW = new Date('2026-09-07T00:00:00Z');
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('is a temporary 503, never the 410 that closed links get', () => {
      expect(redeemFailureToView('distribution-not-yet-open', { opensAt }).status).toBe(503);
    });

    it('sends Retry-After as the HTTP-date of the opening time', () => {
      expect(redeemFailureToView('distribution-not-yet-open', { opensAt }).retryAfter).toBe(opensAt.toUTCString());
    });

    it('names when the form opens, in UTC, and says so', () => {
      const { message } = redeemFailureToView('distribution-not-yet-open', { opensAt });
      expect(message).toContain('September 8, 2026');
      expect(message).toContain('6:41 PM');
      expect(message).toContain('UTC');
    });

    it('does not tell the holder the form is "no longer" taking responses', () => {
      const { message } = redeemFailureToView('distribution-not-yet-open', { opensAt });
      expect(message).not.toBe(redeemFailureToView('distribution-closed').message);
      expect(message.toLowerCase()).not.toContain('no longer');
    });

    it('still refuses, with a sentence and no header, when no opening time is known', () => {
      const view = redeemFailureToView('distribution-not-yet-open');
      expect(view.status).toBe(503);
      expect(view.retryAfter).toBeUndefined();
      expect(view.message.length).toBeGreaterThan(0);
      expect(view.message).not.toContain('undefined');
    });
  });

  // The sibling "link exists, nothing behind it yet, author action needed" state (no-token) is
  // already 409: non-2xx for monitors, not 410 (nothing was removed), not 404 (the link IS known,
  // and the author testing it must not be told it does not exist).
  // bizapps-forms#118 review. `opensAt` reaches this function as `new Date(dist.OpenAt)` from a
  // package compiled WITHOUT strictNullChecks, so a missing column arrives as `new Date(null)` —
  // the epoch, whose `getTime()` is 0, not NaN, and which is not falsy. The old guard let it
  // through and the page announced "It opens on January 1, 1970". The precondition of the sentence
  // "it opens on X" is that X is still ahead of us; anything else is a missing value wearing a date.
  describe('an opening time that is not in the future', () => {
    it('refuses without naming a time rather than announcing the epoch', () => {
      const view = redeemFailureToView('distribution-not-yet-open', { opensAt: new Date(0) });
      expect(view.status).toBe(503);
      expect(view.message).not.toContain('1970');
      expect(view.message).toBe("This form isn't open yet. Please check back later.");
    });

    it('sends no Retry-After for a time it will not name', () => {
      expect(redeemFailureToView('distribution-not-yet-open', { opensAt: new Date(0) }).retryAfter).toBeUndefined();
    });

    it('still names a genuinely future opening time', () => {
      const soon = new Date(Date.now() + 60 * 60 * 1000);
      const view = redeemFailureToView('distribution-not-yet-open', { opensAt: soon });
      expect(view.retryAfter).toBe(soon.toUTCString());
      expect(view.message).toContain('It opens on');
    });
  });

  // The page TITLE is the browser tab, the bookmark and the link preview. "Form unavailable" is
  // the same wrong statement the 410 wording fix removed, one layer up: a form that opens next
  // week has not been made unavailable, and one awaiting publication is not gone either.
  describe('page title', () => {
    it('does not call a scheduled form unavailable', () => {
      const view = redeemFailureToView('distribution-not-yet-open', { opensAt: new Date(Date.now() + 60_000) });
      expect(view.title).toBe('Form opens later');
    });

    it('says an unpublished form is not published, not unavailable', () => {
      expect(redeemFailureToView('form-unpublished').title).toBe('Form not published yet');
    });

    it('leaves the states it does not speak for on the default title', () => {
      // Derived, not listed: a reason added later lands here automatically and must either have a
      // title of its own (add it to the exclusion) or prove it wants the default.
      const speaksForItself = new Set(['distribution-not-yet-open', 'form-unpublished']);
      for (const reason of REDEEM_FAILURE_REASONS.filter((r) => !speaksForItself.has(r))) {
        expect(redeemFailureToView(reason).title).toBeUndefined();
      }
    });
  });

  // Every reason must reach a deliberate arm of the switch. The `default` answers 502 at runtime
  // for a value from outside the union, so a NEW member silently inheriting 502 is exactly the
  // failure this pins — the compile-time assert cannot see a member that was never added here.
  it('gives every declared reason a view, including the two redeem outcomes', () => {
    expect(REDEEM_FAILURE_REASONS).toContain('redeem-unreachable');
    expect(REDEEM_FAILURE_REASONS).toContain('redeem-refused');
    for (const reason of REDEEM_FAILURE_REASONS) {
      const view = redeemFailureToView(reason);
      expect(view.message.length).toBeGreaterThan(0);
      expect(view.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('keeps both new redeem reasons on the generic 502 (#139 splits the page, not this change)', () => {
    expect(redeemFailureToView('redeem-unreachable').status).toBe(502);
    expect(redeemFailureToView('redeem-refused').status).toBe(502);
    expect(redeemFailureToView('redeem-unreachable').message).toBe(redeemFailureToView('redeem-failed').message);
    expect(redeemFailureToView('redeem-refused').message).toBe(redeemFailureToView('redeem-failed').message);
  });

  // The `default` arm must keep answering 502 at runtime — the compile-time guard added alongside
  // it is there so a NEW reason cannot reach here, not to change what happens if one does.
  it('still falls back to 502 for a reason it does not know', () => {
    const view = redeemFailureToView('a-reason-from-the-future' as Parameters<typeof redeemFailureToView>[0]);
    expect(view.status).toBe(502);
  });

  describe('form-unpublished', () => {
    it('is a 409 like the other not-ready state', () => {
      expect(redeemFailureToView('form-unpublished').status).toBe(409);
    });

    it("names the author's mistake plainly rather than a generic 'not available'", () => {
      const { message } = redeemFailureToView('form-unpublished');
      expect(message.toLowerCase()).toContain('published');
      expect(message.toLowerCase()).not.toContain('not available');
      expect(message).not.toBe(redeemFailureToView('distribution-closed').message);
    });
  });

  // bizapps-forms#139. 502 says "the upstream server is broken". The truth is "this network asked
  // more times in a minute than the cap allows" — and because the cap is keyed by IP, the people
  // who hit it are a classroom, an office behind NAT or a conference wifi, not attackers. 429 with
  // a retry hint is what browsers, CDNs, monitors and humans already understand.
  describe('rate-limited', () => {
    it('is a 429, never the 502 that means the server is broken', () => {
      const view = redeemFailureToView('rate-limited');
      expect(view.status).toBe(429);
      expect(view.status).not.toBe(redeemFailureToView('redeem-failed').status);
    });

    it('blames the network, not the form, and promises a retry', () => {
      const { message } = redeemFailureToView('rate-limited');
      expect(message).toBe('Too many attempts from this network. Please try again in a minute.');
    });

    it('names the wait, and sends it as Retry-After, when the refusal said how long', () => {
      const view = redeemFailureToView('rate-limited', { retryAfterSeconds: 54 });
      expect(view.message).toContain('54 seconds');
      expect(view.retryAfter).toBe('54');
    });

    it('rounds a longer wait to whole minutes rather than reciting seconds', () => {
      const view = redeemFailureToView('rate-limited', { retryAfterSeconds: 150 });
      expect(view.message).toContain('3 minutes');
      expect(view.retryAfter).toBe('150');
    });

    it('says "1 second" and "1 minute", not "1 seconds"', () => {
      expect(redeemFailureToView('rate-limited', { retryAfterSeconds: 1 }).message).toContain('1 second.');
      expect(redeemFailureToView('rate-limited', { retryAfterSeconds: 60 }).message).toContain('1 minute.');
    });

    it('is a failure the page states plainly, not a quiet notice', () => {
      const res = respondentErrorResponse(redeemFailureToView('rate-limited', { retryAfterSeconds: 54 }));
      expect(res.status).toBe(429);
      expect(res.headers['Retry-After']).toBe('54');
      expect(res.html).toContain('class="mjf-host__error" role="alert"');
    });
  });

  // The other half of #139: the two cases must stay distinguishable in the response. A genuinely
  // broken redeem — revoked token, endpoint unreachable — is still the 502 it always was.
  it('leaves a genuinely broken redeem on 502', () => {
    const view = redeemFailureToView('redeem-failed');
    expect(view.status).toBe(502);
    expect(view.retryAfter).toBeUndefined();
    expect(view.message).toBe('We could not open this form right now. Please try again later.');
  });

  // Derived, not listed. The two reasons that DO name a wait are named here and everything else
  // must not: a reason added later with an accidental `retryAfter` fails this without anyone
  // remembering to extend a list. `rate-limited` joined the exclusion when #139 gave it a wait.
  it('sets no Retry-After on the reasons that cannot name one', () => {
    const namesAWait = new Set(['distribution-not-yet-open', 'rate-limited']);
    for (const reason of REDEEM_FAILURE_REASONS.filter((r) => !namesAWait.has(r))) {
      expect(redeemFailureToView(reason).retryAfter).toBeUndefined();
    }
  });

  it('returns a non-empty respondent-facing message for every reason', () => {
    for (const reason of REDEEM_FAILURE_REASONS) {
      expect(redeemFailureToView(reason).message.length).toBeGreaterThan(0);
    }
  });
});

// The middleware used to build the response inline, so nothing could test that `Retry-After`
// actually reaches the wire or that the title reaches the page — deleting either line left the
// whole suite green. The shaping is pure now, and this is what pins it.
describe('respondentErrorResponse', () => {
  const soon = new Date(Date.now() + 60 * 60 * 1000);

  it('puts Retry-After on the wire for a link that opens later', () => {
    const res = respondentErrorResponse(redeemFailureToView('distribution-not-yet-open', { opensAt: soon }));
    expect(res.status).toBe(503);
    expect(res.headers['Retry-After']).toBe(soon.toUTCString());
  });

  it('sends no Retry-After for any other refusal', () => {
    for (const reason of ['distribution-closed', 'distribution-full', 'form-unpublished', 'no-token'] as const) {
      expect(respondentErrorResponse(redeemFailureToView(reason)).headers['Retry-After']).toBeUndefined();
    }
  });

  it('always tells the browser not to store the page', () => {
    expect(respondentErrorResponse(redeemFailureToView('distribution-closed')).headers['Cache-Control']).toBe('no-store');
  });

  it('carries the view title into the rendered page, not just into the view', () => {
    const html = respondentErrorResponse(redeemFailureToView('form-unpublished')).html;
    expect(html).toContain('<title>Form not published yet</title>');
  });

  it('falls back to the default title for the states that really are over', () => {
    const html = respondentErrorResponse(redeemFailureToView('distribution-closed')).html;
    expect(html).toContain('<title>Form unavailable</title>');
  });

  // A page whose title says "opens later" must not paint its one sentence in error red and
  // announce it assertively. The two states that are not failures render as a notice.
  it('renders a not-yet-open page as a notice, not an error', () => {
    const html = respondentErrorResponse(redeemFailureToView('distribution-not-yet-open', { opensAt: soon })).html;
    expect(html).toContain('class="mjf-host__notice" role="status"');
    // Not a bare `not.toContain('mjf-host__error')`: the inlined stylesheet defines BOTH classes on
    // every page, so that assertion can only ever fail. What must be absent is the error PARAGRAPH.
    expect(html).not.toContain('<p class="mjf-host__error"');
  });

  it('renders an unpublished page as a notice, not an error', () => {
    const html = respondentErrorResponse(redeemFailureToView('form-unpublished')).html;
    expect(html).toContain('class="mjf-host__notice" role="status"');
  });

  it('still renders a genuine failure as an error', () => {
    const html = respondentErrorResponse(redeemFailureToView('redeem-failed')).html;
    expect(html).toContain('class="mjf-host__error" role="alert"');
  });
});
