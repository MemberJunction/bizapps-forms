/**
 * The URL grammar Express's router gave these routes, as a table.
 *
 * Every expectation here was probed against a real `app.get('/f/:slug', …)` /
 * `app.get('/forms/asset/:fileId', …)` before it was written down (design doc §4.1), because the
 * failure this file exists to prevent is silent: a moved route that answers slightly fewer URLs
 * than it used to sends a respondent to MJAPI's authenticated routes and a bare 401.
 */
import { describe, expect, it } from 'vitest';

import { matchesExactRoute, matchSingleSegmentRoute } from '../route-match';

describe('matchesExactRoute', () => {
  it.each([
    ['/favicon.ico', true],
    ['/favicon.ico/', true],
    ['/FAVICON.ICO', true],
    ['/Favicon.Ico/', true],
  ])('claims %s', (path, expected) => {
    expect(matchesExactRoute(path, '/favicon.ico')).toBe(expected);
  });

  it.each([
    ['/favicon.ico//'],
    ['/favicon'],
    ['/favicon.ico.map'],
    ['/a/favicon.ico'],
    // Not percent-decoded, exactly as the router was not: this stayed unclaimed before the move.
    ['/favicon%2Eico'],
  ])('leaves %s to the next handler', (path) => {
    expect(matchesExactRoute(path, '/favicon.ico')).toBe(false);
  });
});

describe('matchSingleSegmentRoute', () => {
  it.each([
    ['/f/abc', 'abc'],
    ['/f/abc/', 'abc'],
    // The literal is case-insensitive; the segment keeps the case it arrived in, because it is a
    // lookup key and `Slug` is not necessarily case-insensitive in the database.
    ['/F/ABC', 'ABC'],
    ['/f/ABC', 'ABC'],
    ['/f/a%20b', 'a b'],
    // Decoded AFTER the split, so an encoded slash is a character in the slug, not a separator.
    ['/f/a%2Fb', 'a/b'],
    // `+` is not a space in a path segment.
    ['/f/a+b', 'a+b'],
  ])('reads %s as the slug %j', (path, slug) => {
    expect(matchSingleSegmentRoute(path, '/f')).toBe(slug);
  });

  it.each([
    ['/f/abc//'],
    ['/f/'],
    ['/f'],
    ['/f//'],
    ['/f/a/b'],
    ['/fx/abc'],
    ['/'],
    [''],
    // The one deliberate divergence from the router, which answered 400 (design doc §4.2):
    // a segment that cannot be decoded names no distribution, so this is not our route.
    ['/f/%zz'],
    ['/f/%2'],
  ])('leaves %s to the next handler', (path) => {
    expect(matchSingleSegmentRoute(path, '/f')).toBeUndefined();
  });

  it('works for a multi-segment prefix', () => {
    expect(matchSingleSegmentRoute('/forms/asset/xyz', '/forms/asset')).toBe('xyz');
    expect(matchSingleSegmentRoute('/FORMS/ASSET/xyz', '/forms/asset')).toBe('xyz');
    expect(matchSingleSegmentRoute('/forms/asset/xyz/', '/forms/asset')).toBe('xyz');
    expect(matchSingleSegmentRoute('/forms/asset', '/forms/asset')).toBeUndefined();
    expect(matchSingleSegmentRoute('/forms/asset/', '/forms/asset')).toBeUndefined();
    expect(matchSingleSegmentRoute('/forms/asset/a/b', '/forms/asset')).toBeUndefined();
  });

  it('keeps a NUL byte in the slug rather than inventing a rule the router did not have', () => {
    // `/f/abc%00` matched and yielded "abc\0" before the move. Refusing it here would be a new
    // policy smuggled in as a refactor; if that byte is unwanted, it is the slug lookup's business.
    expect(matchSingleSegmentRoute('/f/abc%00', '/f')).toBe('abc\u0000');
  });
});
