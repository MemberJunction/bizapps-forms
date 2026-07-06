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

  it('honors a custom channel allow-list and ignores unknown tokens', () => {
    process.env.FORMS_MAGICLINK_CHANNELS = 'PublicLink, bogus ,QR';
    resetMagicLinkProvisioningConfigForTests();
    const c = getMagicLinkProvisioningConfig();
    expect([...c.linkableChannels].sort()).toEqual(['PublicLink', 'QR']);
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
