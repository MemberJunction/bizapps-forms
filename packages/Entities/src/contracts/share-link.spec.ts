import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, respondentUrl, slugRefusal, slugify, suffixedSlug } from './share-link';

describe('respondentUrl', () => {
  it('joins base + /f/ + slug', () => {
    expect(respondentUrl('spring-survey', 'https://forms.example.com')).toBe('https://forms.example.com/f/spring-survey');
  });

  it('trims trailing slashes on the base', () => {
    expect(respondentUrl('abc', 'https://x.com///')).toBe('https://x.com/f/abc');
  });

  it('keeps a reverse-proxy path prefix on the base', () => {
    expect(respondentUrl('abc', 'https://x.com/api/')).toBe('https://x.com/api/f/abc');
  });

  it('url-encodes the slug', () => {
    expect(respondentUrl('a b', 'https://x.com')).toBe('https://x.com/f/a%20b');
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

  it(`caps length at ${SLUG_MAX_LENGTH} chars`, () => {
    expect(slugify('a'.repeat(100), suffix)).toHaveLength(SLUG_MAX_LENGTH);
  });

  it('never ends in a hyphen when the cap falls on a separator', () => {
    const slug = slugify(`${'a'.repeat(SLUG_MAX_LENGTH - 1)} b`, suffix);
    expect(slug).toBe('a'.repeat(SLUG_MAX_LENGTH - 1));
    expect(slugRefusal(slug)).toBeNull();
  });

  it('always produces a slug its own grammar accepts', () => {
    for (const name of ['Intake — Public link', 'Ünïcödé form', '   ', 'x'.repeat(200), 'a--b']) {
      expect(slugRefusal(slugify(name, suffix))).toBeNull();
    }
  });
});

describe('slugRefusal', () => {
  it('accepts lowercase words joined by single hyphens', () => {
    expect(slugRefusal('spring-2026')).toBeNull();
  });

  it.each([
    ['blank', ''],
    ['upper case', 'Spring'],
    ['a space', 'a b'],
    ['a slash', 'a/b'],
    ['a leading hyphen', '-a'],
    ['a trailing hyphen', 'a-'],
    ['a double hyphen', 'a--b'],
    ['an over-long slug', 'a'.repeat(SLUG_MAX_LENGTH + 1)],
  ])('refuses %s, saying what a slug must be', (_label, slug) => {
    expect(slugRefusal(slug)).toMatch(/lowercase letters and digits/);
  });
});

describe('suffixedSlug', () => {
  it('appends the suffix with a hyphen', () => {
    expect(suffixedSlug('lobby', 'ab12c')).toBe('lobby-ab12c');
  });

  it(`stays within ${SLUG_MAX_LENGTH} characters and inside the grammar, so a suffixed slug is a valid preferred slug too`, () => {
    for (const base of ['a'.repeat(SLUG_MAX_LENGTH), `${'a'.repeat(SLUG_MAX_LENGTH - 7)}-bcdef`, `${'a'.repeat(54)}-b`]) {
      const slug = suffixedSlug(base, 'xyz12');
      expect(slug.length, slug).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
      expect(slugRefusal(slug), slug).toBeNull();
      expect(slug.endsWith('-xyz12')).toBe(true);
    }
  });
});
