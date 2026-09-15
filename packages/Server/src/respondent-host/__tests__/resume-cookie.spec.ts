import { describe, expect, it } from 'vitest';

import { buildResumeCookie, clearResumeCookieHeader, readResumeCookie } from '../resume-cookie';

describe('buildResumeCookie', () => {
  it('is HttpOnly, Secure, SameSite=Lax and scoped to this one form', () => {
    expect(buildResumeCookie({ token: 'mj_ml_abc', slug: 'share-link-3gc41', maxAgeSeconds: 1296000, secure: true })).toBe(
      'mjf_resume=mj_ml_abc; Path=/f/share-link-3gc41; Max-Age=1296000; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('drops Secure only when the host configured it off, for an http harness', () => {
    const header = buildResumeCookie({ token: 't', slug: 's', maxAgeSeconds: 60, secure: false });
    expect(header).not.toContain('Secure');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
  });

  it('percent-encodes the path so a slug can never inject a cookie attribute', () => {
    // The slug comes off the URL. Unencoded, `; Domain=…` would end the Path attribute and widen
    // the cookie to every host in a parent domain.
    const header = buildResumeCookie({ token: 't', slug: 'a; Domain=evil.test', maxAgeSeconds: 60, secure: true });
    expect(header).not.toContain('Domain=');
    expect(header).toContain('Path=/f/a%3B%20Domain%3Devil.test');
  });

  it('never emits a negative or fractional Max-Age', () => {
    expect(buildResumeCookie({ token: 't', slug: 's', maxAgeSeconds: -5, secure: true })).toContain('Max-Age=0');
    expect(buildResumeCookie({ token: 't', slug: 's', maxAgeSeconds: 90.7, secure: true })).toContain('Max-Age=90');
  });
});

describe('clearResumeCookieHeader', () => {
  it('expires the cookie at the SAME path it was written with', () => {
    // A browser keys a cookie on (name, domain, path). A clear sent for a different path plants a
    // second, empty cookie beside the live one and leaves the pointer exactly where it was.
    expect(clearResumeCookieHeader('share-link-3gc41', true)).toBe(
      'mjf_resume=; Path=/f/share-link-3gc41; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    );
  });
});

describe('readResumeCookie', () => {
  it('finds the pointer among other cookies, whatever the spacing', () => {
    expect(readResumeCookie('a=1; mjf_resume=mj_ml_abc; b=2')).toBe('mj_ml_abc');
    expect(readResumeCookie('mjf_resume=mj_ml_abc')).toBe('mj_ml_abc');
    expect(readResumeCookie('a=1;mjf_resume=mj_ml_abc;b=2')).toBe('mj_ml_abc');
  });

  it('answers undefined when there is no pointer', () => {
    expect(readResumeCookie('a=1; b=2')).toBeUndefined();
    expect(readResumeCookie('')).toBeUndefined();
    expect(readResumeCookie(undefined)).toBeUndefined();
  });

  it('treats a CLEARED cookie as absent rather than as an empty pointer', () => {
    // A cleared cookie lingers as `mjf_resume=` until the browser drops it. Reading that as a
    // pointer would send the resume route off to redeem the empty string on every load.
    expect(readResumeCookie('mjf_resume=')).toBeUndefined();
    expect(readResumeCookie('a=1; mjf_resume=; b=2')).toBeUndefined();
  });

  it('round-trips a token through the encoding it was written with', () => {
    const token = 'mj_ml_0123456789abcdef';
    const header = buildResumeCookie({ token, slug: 's', maxAgeSeconds: 60, secure: true });
    const value = header.split(';')[0].split('=').slice(1).join('=');
    expect(readResumeCookie(`mjf_resume=${value}`)).toBe(token);
  });

  it('does not match a cookie whose name merely ends with ours', () => {
    expect(readResumeCookie('not_mjf_resume=nope')).toBeUndefined();
  });

  it('treats a malformed escape as absent rather than throwing on the request path', () => {
    expect(readResumeCookie('mjf_resume=%E0%A4%A')).toBeUndefined();
  });
});
