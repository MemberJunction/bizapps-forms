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

  it('returns a non-empty respondent-facing message for every reason', () => {
    for (const reason of [
      'distribution-not-found',
      'distribution-closed',
      'distribution-full',
      'no-token',
      'redeem-failed',
    ] as const) {
      const view = redeemFailureToView(reason);
      expect(view.message.length).toBeGreaterThan(0);
    }
  });
});
