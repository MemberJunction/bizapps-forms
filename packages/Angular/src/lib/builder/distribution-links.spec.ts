import { describe, it, expect } from 'vitest';
import { publicUrl, redeemUrl, shareUrl, embedSnippet, slugify } from './distribution-links';

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
  it('uses the redeem URL when a token exists', () => {
    expect(shareUrl('mj_ml_tok', 'spring', 'https://x.com')).toBe(
      'https://x.com/magic-link/redeem?token=mj_ml_tok',
    );
  });

  it('falls back to the slug URL when no token yet', () => {
    expect(shareUrl(null, 'spring', 'https://x.com')).toBe('https://x.com/f/spring');
    expect(shareUrl(undefined, 'spring', 'https://x.com')).toBe('https://x.com/f/spring');
  });
});

describe('embedSnippet', () => {
  it('produces an iframe pointing at the redeem url when a token exists', () => {
    const snippet = embedSnippet('mj_ml_tok', 's1', 'https://x.com');
    expect(snippet).toContain('<iframe');
    expect(snippet).toContain('src="https://x.com/magic-link/redeem?token=mj_ml_tok"');
    expect(snippet).toContain('width:100%');
  });

  it('falls back to the slug url when no token', () => {
    const snippet = embedSnippet(null, 's1', 'https://x.com');
    expect(snippet).toContain('src="https://x.com/f/s1"');
  });
});

describe('slugify', () => {
  const suffix = () => 'abcde';

  it('lowercases and hyphenates', () => {
    expect(slugify('Spring 2026 Member Survey', suffix)).toBe('spring-2026-member-survey');
  });

  it('strips punctuation and collapses separators', () => {
    expect(slugify('Hello, World!!  Now', suffix)).toBe('hello-world-now');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  --Edge--  ', suffix)).toBe('edge');
  });

  it('falls back to a random token when nothing usable remains', () => {
    expect(slugify('!!!', suffix)).toBe('form-abcde');
  });

  it('caps length at 60 chars', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long, suffix).length).toBeLessThanOrEqual(60);
  });
});
