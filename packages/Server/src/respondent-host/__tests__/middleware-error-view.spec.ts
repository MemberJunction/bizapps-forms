import { describe, expect, it } from 'vitest';
import { redeemFailureToView } from '../error-view';

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
