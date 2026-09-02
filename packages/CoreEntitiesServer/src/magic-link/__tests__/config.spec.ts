import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getMagicLinkProvisioningConfig,
  resetMagicLinkProvisioningConfigForTests,
} from '../config.js';

const ENV_KEYS = [
  'FORMS_MAGICLINK_CHANNELS',
  'FORMS_MAGICLINK_MAX_USES',
  'FORMS_MAGICLINK_EXPIRY_HOURS',
  'FORMS_MAGICLINK_APPLICATION',
  'FORMS_MAGICLINK_ROLE',
] as const;

describe('getMagicLinkProvisioningConfig', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    resetMagicLinkProvisioningConfigForTests();
  });
  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    resetMagicLinkProvisioningConfigForTests();
  });

  it('defaults: PublicLink/Embed/QR linkable (not Email), high maxUses, no fixed expiry', () => {
    const c = getMagicLinkProvisioningConfig();
    expect(c.linkableChannels.has('PublicLink')).toBe(true);
    expect(c.linkableChannels.has('Embed')).toBe(true);
    expect(c.linkableChannels.has('QR')).toBe(true);
    expect(c.linkableChannels.has('Email')).toBe(false);
    expect(c.defaultMaxUses).toBe(1_000_000);
    expect(c.fixedExpiryHours).toBeUndefined();
    expect(c.applicationName).toBe('Forms');
    expect(c.roleName).toBe('Form Respondent');
  });

  it('honors a custom channel allow-list', () => {
    process.env.FORMS_MAGICLINK_CHANNELS = 'PublicLink, QR';
    resetMagicLinkProvisioningConfigForTests();
    const c = getMagicLinkProvisioningConfig();
    expect([...c.linkableChannels].sort()).toEqual(['PublicLink', 'QR']);
  });

  it('REFUSES an unrecognised channel token, naming it, rather than silently dropping it', () => {
    // This used to be tolerated ("ignores unknown tokens"), and that was correct while the list
    // was a mint GATE: an ignored token meant "mint nothing new for it". `decideProvisioning` is
    // a state function now, so a channel missing from the set means every live link of that
    // channel is unwarranted, and the next save of each — typically a respondent submitting —
    // revokes its credential. `embed` for `Embed` would take every embedded form on the host
    // dark with no error anywhere. Refusing is fail-safe by construction: the one save-path
    // caller evaluates this inside a try, so a throw leaves every credential exactly as it was.
    process.env.FORMS_MAGICLINK_CHANNELS = 'PublicLink, embed ,QR';
    resetMagicLinkProvisioningConfigForTests();
    expect(() => getMagicLinkProvisioningConfig()).toThrow(/'embed'/);
    expect(() => getMagicLinkProvisioningConfig()).toThrow(/Email, Embed, PublicLink, QR/);
  });

  it('honors custom maxUses, fixed expiry, application and role', () => {
    process.env.FORMS_MAGICLINK_MAX_USES = '250';
    process.env.FORMS_MAGICLINK_EXPIRY_HOURS = '72';
    process.env.FORMS_MAGICLINK_APPLICATION = 'Custom App';
    process.env.FORMS_MAGICLINK_ROLE = 'Custom Role';
    resetMagicLinkProvisioningConfigForTests();
    const c = getMagicLinkProvisioningConfig();
    expect(c.defaultMaxUses).toBe(250);
    expect(c.fixedExpiryHours).toBe(72);
    expect(c.applicationName).toBe('Custom App');
    expect(c.roleName).toBe('Custom Role');
  });

  it('falls back to defaults on invalid numerics and empty channel list', () => {
    process.env.FORMS_MAGICLINK_MAX_USES = '-5';
    process.env.FORMS_MAGICLINK_EXPIRY_HOURS = 'abc';
    process.env.FORMS_MAGICLINK_CHANNELS = ' , ,';
    resetMagicLinkProvisioningConfigForTests();
    const c = getMagicLinkProvisioningConfig();
    expect(c.defaultMaxUses).toBe(1_000_000);
    expect(c.fixedExpiryHours).toBeUndefined();
    expect([...c.linkableChannels].sort()).toEqual(['Embed', 'PublicLink', 'QR']);
  });
});
