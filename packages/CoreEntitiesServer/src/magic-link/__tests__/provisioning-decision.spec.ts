import { describe, it, expect } from 'vitest';
import { decideProvisioning, resolveExpiry, type DistributionProvisioningState } from '../provisioning-decision.js';
import type { MagicLinkProvisioningConfig } from '../config.js';

const config: MagicLinkProvisioningConfig = Object.freeze({
  linkableChannels: new Set(['PublicLink', 'Embed', 'QR'] as const),
  defaultMaxUses: 1_000_000,
  fixedExpiryHours: undefined,
  applicationName: 'Forms',
  roleName: 'Form Respondent',
});

const INVITE = '11111111-1111-1111-1111-111111111111';

/** A distribution with no credential yet, live and linkable — the first-mint case. */
function state(overrides: Partial<DistributionProvisioningState> = {}): DistributionProvisioningState {
  return {
    channelType: 'PublicLink',
    status: 'Active',
    isActive: true,
    magicLinkInviteId: null,
    publicLinkToken: null,
    closeAt: null,
    ...overrides,
  };
}

/** A live link that already holds a working credential — the steady state. */
function live(overrides: Partial<DistributionProvisioningState> = {}): DistributionProvisioningState {
  return state({ magicLinkInviteId: INVITE, publicLinkToken: 'mj_ml_abc', ...overrides });
}

describe('decideProvisioning', () => {
  it('mints for an active public-link distribution with no credential', () => {
    expect(decideProvisioning(state(), config)).toEqual({ revoke: false, mint: true, reason: 'mint' });
  });

  it('mints for Embed and QR channels (configured linkable)', () => {
    expect(decideProvisioning(state({ channelType: 'Embed' }), config).mint).toBe(true);
    expect(decideProvisioning(state({ channelType: 'QR' }), config).mint).toBe(true);
  });

  it('leaves a live link with a working credential completely alone', () => {
    // AC6: no churn. Every save of an unchanged live link must be a no-op, or every
    // rename would hand the author a new token and break URLs already in the wild.
    expect(decideProvisioning(live(), config)).toEqual({
      revoke: false,
      mint: false,
      reason: 'current',
    });
  });

  it('revokes when the link leaves Active', () => {
    // AC1. Both halves of "not live" — the status column and the flag.
    expect(decideProvisioning(live({ status: 'Closed' }), config)).toEqual({
      revoke: true,
      mint: false,
      reason: 'revoke-deactivated',
    });
    expect(decideProvisioning(live({ status: 'Draft' }), config).revoke).toBe(true);
    expect(decideProvisioning(live({ isActive: false }), config).revoke).toBe(true);
  });

  it('revokes when the channel stops being a public link', () => {
    // Same invariant, other half: an Email distribution is individually addressed, not
    // an anonymous public link, so it must not keep an anonymous credential either.
    expect(decideProvisioning(live({ channelType: 'Email' }), config)).toEqual({
      revoke: true,
      mint: false,
      reason: 'revoke-channel-not-linkable',
    });
  });

  it('reissues — revoke AND mint — when a live link has lost its token', () => {
    // AC5. Clearing `PublicLinkToken` on a live link is the reissue request: the old
    // credential dies and a fresh one replaces it, under the same slug.
    expect(decideProvisioning(live({ publicLinkToken: null }), config)).toEqual({
      revoke: true,
      mint: true,
      reason: 'reissue',
    });
  });

  it('treats a blank token as no token, so whitespace cannot pass for a credential', () => {
    expect(decideProvisioning(live({ publicLinkToken: '   ' }), config).mint).toBe(true);
  });

  it('treats a whitespace-only invite id as no credential (mints, revokes nothing)', () => {
    expect(decideProvisioning(state({ magicLinkInviteId: '   ' }), config)).toEqual({
      revoke: false,
      mint: true,
      reason: 'mint',
    });
  });

  it('does nothing for a distribution that neither holds nor warrants a credential', () => {
    const cases: Partial<DistributionProvisioningState>[] = [
      { status: 'Draft' },
      { status: 'Closed' },
      { isActive: false },
      { channelType: 'Email' },
    ];
    for (const override of cases) {
      expect(decideProvisioning(state(override), config)).toEqual({
        revoke: false,
        mint: false,
        reason: 'not-eligible',
      });
    }
  });

  it('never mints for a paused link, however its token got lost', () => {
    // The reissue signal is only a reissue on a LIVE link. A paused one is revoked and
    // left credential-less; reopening it is what mints again.
    expect(decideProvisioning(live({ status: 'Closed', publicLinkToken: null }), config)).toEqual({
      revoke: true,
      mint: false,
      reason: 'revoke-deactivated',
    });
  });

  it('mints a replacement when only the token survives an out-of-band edit', () => {
    // A data fix that cleared the invite id alone leaves a token pointing at nothing.
    // There is no invite to revoke, and the record must end up holding the new one.
    expect(decideProvisioning(state({ publicLinkToken: 'mj_ml_orphan' }), config)).toEqual({
      revoke: false,
      mint: true,
      reason: 'mint',
    });
  });
});

describe('resolveExpiry', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('uses a configured fixed expiry (hours from now) when set', () => {
    expect(resolveExpiry(null, 48, now)?.toISOString()).toBe('2026-01-03T00:00:00.000Z');
  });

  it('falls back to CloseAt when no fixed expiry is configured', () => {
    const closeAt = new Date('2026-06-30T00:00:00.000Z');
    expect(resolveExpiry(closeAt, undefined, now)).toBe(closeAt);
  });

  it('takes the EARLIER of the fixed expiry and CloseAt', () => {
    // AC7. Both are upper bounds on the credential's life, so the earlier one is the
    // only correct combination: a host-wide 30-day ceiling must not outlive a link that
    // closes on Friday, and a link closing next year must not outlive the ceiling.
    const closesFirst = new Date('2026-01-02T00:00:00.000Z');
    expect(resolveExpiry(closesFirst, 24 * 30, now)).toBe(closesFirst);

    const ceilingFirst = new Date('2026-12-31T00:00:00.000Z');
    expect(resolveExpiry(ceilingFirst, 24, now)?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('returns null (no expiry) when neither fixed expiry nor CloseAt is set', () => {
    expect(resolveExpiry(null, undefined, now)).toBeNull();
  });

  it('ignores an unparseable CloseAt rather than minting a credential that never expires', () => {
    expect(resolveExpiry(new Date('nonsense'), 24, now)?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});
