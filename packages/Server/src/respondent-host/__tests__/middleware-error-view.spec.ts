import { describe, expect, it } from 'vitest';
import { redeemFailureToView, respondentErrorResponse } from '../error-view';

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

    it('is a temporary 503, never the 410 that closed links get', () => {
      expect(redeemFailureToView('distribution-not-yet-open', opensAt).status).toBe(503);
    });

    it('sends Retry-After as the HTTP-date of the opening time', () => {
      expect(redeemFailureToView('distribution-not-yet-open', opensAt).retryAfter).toBe(opensAt.toUTCString());
    });

    it('names when the form opens, in UTC, and says so', () => {
      const { message } = redeemFailureToView('distribution-not-yet-open', opensAt);
      expect(message).toContain('September 8, 2026');
      expect(message).toContain('6:41 PM');
      expect(message).toContain('UTC');
    });

    it('does not tell the holder the form is "no longer" taking responses', () => {
      const { message } = redeemFailureToView('distribution-not-yet-open', opensAt);
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
      const view = redeemFailureToView('distribution-not-yet-open', new Date(0));
      expect(view.status).toBe(503);
      expect(view.message).not.toContain('1970');
      expect(view.message).toBe("This form isn't open yet. Please check back later.");
    });

    it('sends no Retry-After for a time it will not name', () => {
      expect(redeemFailureToView('distribution-not-yet-open', new Date(0)).retryAfter).toBeUndefined();
    });

    it('still names a genuinely future opening time', () => {
      const soon = new Date(Date.now() + 60 * 60 * 1000);
      const view = redeemFailureToView('distribution-not-yet-open', soon);
      expect(view.retryAfter).toBe(soon.toUTCString());
      expect(view.message).toContain('It opens on');
    });
  });

  // The page TITLE is the browser tab, the bookmark and the link preview. "Form unavailable" is
  // the same wrong statement the 410 wording fix removed, one layer up: a form that opens next
  // week has not been made unavailable, and one awaiting publication is not gone either.
  describe('page title', () => {
    it('does not call a scheduled form unavailable', () => {
      const view = redeemFailureToView('distribution-not-yet-open', new Date(Date.now() + 60_000));
      expect(view.title).toBe('Form opens later');
    });

    it('says an unpublished form is not published, not unavailable', () => {
      expect(redeemFailureToView('form-unpublished').title).toBe('Form not published yet');
    });

    it('leaves the states it does not speak for on the default title', () => {
      for (const reason of ['distribution-closed', 'distribution-full', 'distribution-not-found', 'no-token', 'redeem-failed'] as const) {
        expect(redeemFailureToView(reason).title).toBeUndefined();
      }
    });
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

  it('sets no Retry-After on any reason but not-yet-open', () => {
    for (const reason of [
      'distribution-not-found',
      'distribution-closed',
      'distribution-full',
      'form-unpublished',
      'no-token',
      'redeem-failed',
    ] as const) {
      expect(redeemFailureToView(reason).retryAfter).toBeUndefined();
    }
  });

  it('returns a non-empty respondent-facing message for every reason', () => {
    for (const reason of [
      'distribution-not-found',
      'distribution-not-yet-open',
      'distribution-closed',
      'distribution-full',
      'form-unpublished',
      'no-token',
      'redeem-failed',
    ] as const) {
      const view = redeemFailureToView(reason);
      expect(view.message.length).toBeGreaterThan(0);
    }
  });
});

// The middleware used to build the response inline, so nothing could test that `Retry-After`
// actually reaches the wire or that the title reaches the page — deleting either line left the
// whole suite green. The shaping is pure now, and this is what pins it.
describe('respondentErrorResponse', () => {
  const soon = new Date(Date.now() + 60 * 60 * 1000);

  it('puts Retry-After on the wire for a link that opens later', () => {
    const res = respondentErrorResponse(redeemFailureToView('distribution-not-yet-open', soon));
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
    const html = respondentErrorResponse(redeemFailureToView('distribution-not-yet-open', soon)).html;
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
