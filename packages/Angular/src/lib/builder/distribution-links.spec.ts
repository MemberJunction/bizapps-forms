import { describe, it, expect } from 'vitest';
import { publicUrl, redeemUrl, shareUrl, embedSnippet } from './distribution-links';

describe('publicUrl', () => {
  it('joins base + /f/ + slug', () => {
    expect(publicUrl('spring-survey', 'https://forms.example.com')).toBe(
      'https://forms.example.com/f/spring-survey',
    );
  });

  it('trims trailing slashes on the base', () => {
    expect(publicUrl('abc', 'https://x.com///')).toBe('https://x.com/f/abc');
  });

  it('url-encodes the slug', () => {
    expect(publicUrl('a b', 'https://x.com')).toBe('https://x.com/f/a%20b');
  });
});

describe('redeemUrl', () => {
  it('builds the magic-link redeem path carrying the token', () => {
    expect(redeemUrl('mj_ml_abc123', 'https://forms.example.com')).toBe(
      'https://forms.example.com/magic-link/redeem?token=mj_ml_abc123',
    );
  });

  it('trims trailing slashes and url-encodes the token', () => {
    expect(redeemUrl('a/b c', 'https://x.com//')).toBe(
      'https://x.com/magic-link/redeem?token=a%2Fb%20c',
    );
  });
});

describe('shareUrl', () => {
  it('always uses the /f/:slug host page (which redeems server-side), never the raw redeem URL', () => {
    expect(shareUrl('spring', 'https://x.com')).toBe('https://x.com/f/spring');
  });

  it('url-encodes the slug', () => {
    expect(shareUrl('a b', 'https://x.com')).toBe('https://x.com/f/a%20b');
  });
});

describe('embedSnippet', () => {
  it('produces an iframe pointing at the /f/:slug public URL', () => {
    const snippet = embedSnippet('s1', 'https://x.com');
    expect(snippet).toContain('<iframe');
    expect(snippet).toContain('src="https://x.com/f/s1"');
    expect(snippet).toContain('width:100%');
  });
});
