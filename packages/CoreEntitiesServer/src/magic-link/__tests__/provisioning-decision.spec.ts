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

function state(overrides: Partial<DistributionProvisioningState> = {}): DistributionProvisioningState {
  return {
    channelType: 'PublicLink',
    status: 'Active',
    isActive: true,
    magicLinkInviteId: null,
    closeAt: null,
    ...overrides,
  };
}

describe('decideProvisioning', () => {
  it('mints for an active public-link distribution with no invite', () => {
    const d = decideProvisioning(state(), config);
    expect(d).toEqual({ shouldMint: true, reason: 'mint' });
  });

  it('mints for Embed and QR channels (configured linkable)', () => {
    expect(decideProvisioning(state({ channelType: 'Embed' }), config).shouldMint).toBe(true);
    expect(decideProvisioning(state({ channelType: 'QR' }), config).shouldMint).toBe(true);
  });

  it('is idempotent: never re-mints when an invite already exists', () => {
    const d = decideProvisioning(state({ magicLinkInviteId: '11111111-1111-1111-1111-111111111111' }), config);
    expect(d).toEqual({ shouldMint: false, reason: 'already-minted' });
  });

  it('treats a whitespace-only invite id as not minted (mints)', () => {
    expect(decideProvisioning(state({ magicLinkInviteId: '   ' }), config).shouldMint).toBe(true);
  });

  it('skips the Email channel (not a public/anonymous link)', () => {
    const d = decideProvisioning(state({ channelType: 'Email' }), config);
    expect(d).toEqual({ shouldMint: false, reason: 'channel-not-linkable' });
  });

  it('skips when the distribution is not yet live (Draft)', () => {
    const d = decideProvisioning(state({ status: 'Draft' }), config);
    expect(d).toEqual({ shouldMint: false, reason: 'not-active-public-channel' });
  });

  it('skips a Closed distribution', () => {
    expect(decideProvisioning(state({ status: 'Closed' }), config).shouldMint).toBe(false);
  });

  it('skips when IsActive is false even if Status is Active', () => {
    const d = decideProvisioning(state({ isActive: false }), config);
    expect(d).toEqual({ shouldMint: false, reason: 'not-active-public-channel' });
  });
});

describe('resolveExpiry', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('uses a configured fixed expiry (hours from now) when set', () => {
    const exp = resolveExpiry(null, 48, now);
    expect(exp?.toISOString()).toBe('2026-01-03T00:00:00.000Z');
  });

  it('prefers the fixed expiry over CloseAt', () => {
    const closeAt = new Date('2026-12-31T00:00:00.000Z');
    const exp = resolveExpiry(closeAt, 24, now);
    expect(exp?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('falls back to CloseAt when no fixed expiry is configured', () => {
    const closeAt = new Date('2026-06-30T00:00:00.000Z');
    expect(resolveExpiry(closeAt, undefined, now)).toBe(closeAt);
  });

  it('returns null (no expiry) when neither fixed expiry nor CloseAt is set', () => {
    expect(resolveExpiry(null, undefined, now)).toBeNull();
  });
});
