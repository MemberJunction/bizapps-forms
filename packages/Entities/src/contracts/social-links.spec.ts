import { describe, it, expect } from 'vitest';

import { SOCIAL_PLATFORMS, parseSocialLinks, serializeSocialLinks } from './social-links';

describe('SOCIAL_PLATFORMS', () => {
  it('gives every platform an icon, so the widget can never be asked to draw one it lacks', () => {
    for (const p of SOCIAL_PLATFORMS) {
      expect(p.icon, p.id).toMatch(/^fa-brands /);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });
});

describe('parseSocialLinks', () => {
  it('reads what serializeSocialLinks wrote', () => {
    const links = [
      { platform: 'linkedin' as const, url: 'https://linkedin.com/company/x' },
      { platform: 'instagram' as const, url: 'https://instagram.com/x' },
    ];
    expect(parseSocialLinks(serializeSocialLinks(links))).toEqual(links);
  });

  it('returns nothing for absent, blank or malformed storage rather than throwing', () => {
    expect(parseSocialLinks(null)).toEqual([]);
    expect(parseSocialLinks('')).toEqual([]);
    expect(parseSocialLinks('not json')).toEqual([]);
    expect(parseSocialLinks('{"not":"an array"}')).toEqual([]);
  });

  it('drops entries the widget could not render', () => {
    const raw = JSON.stringify([
      { platform: 'linkedin', url: 'https://linkedin.com/x' },
      { platform: 'myspace', url: 'https://myspace.com/x' },   // unknown platform
      { platform: 'facebook', url: '   ' },                     // no destination
      { platform: 'x', url: 'javascript:alert(1)' },            // not a web address
    ]);

    expect(parseSocialLinks(raw)).toEqual([
      { platform: 'linkedin', url: 'https://linkedin.com/x' },
    ]);
  });
});

describe('serializeSocialLinks', () => {
  it('stores null for an empty list, so absent and empty are one state', () => {
    expect(serializeSocialLinks([])).toBeNull();
  });
});
