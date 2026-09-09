/**
 * The widget half of the `javascript:` redirect fix.
 *
 * This one guards a path the server cannot: `mj-form.component.ts` follows
 * `outcome.screen.redirectURL` straight from the published definition, without asking the server
 * for an echo. If this predicate is wrong, a `javascript:` URL authored into an ending screen
 * executes in the origin of whatever third-party site embeds the widget.
 */
import { describe, expect, it } from 'vitest';

import { judgeRedirect, redirectRefusalMessage } from './safe-redirect';

const PAGE = 'https://careers.example.com/jobs/apply';

describe('judgeRedirect', () => {
  describe('refuses a scheme that can execute', () => {
    it.each([
      ['javascript', 'javascript:alert(1)'],
      ['data', 'data:text/html,<script>alert(1)</script>'],
      ['vbscript', 'vbscript:msgbox(1)'],
      ['file', 'file:///etc/passwd'],
      ['blob', 'blob:https://example.com/abc'],
    ])('%s', (_label, url) => {
      expect(judgeRedirect(url, PAGE)).toEqual({ reason: 'scheme', protocol: expect.any(String) });
    });

    it.each([
      ['upper case', 'JAVASCRIPT:alert(1)'],
      ['mixed case', 'JaVaScRiPt:alert(1)'],
      ['leading spaces', '   javascript:alert(1)'],
      ['an embedded tab', 'java\tscript:alert(1)'],
      ['an embedded newline', 'java\nscript:alert(1)'],
      ['an embedded carriage return', 'java\rscript:alert(1)'],
      ['a leading NUL', '\u0000javascript:alert(1)'],
    ])('even when obfuscated by %s', (_label, url) => {
      // Parsing WITH the base is what makes these safe: the WHATWG parser strips the control
      // characters and lower-cases the scheme first, so each of these is recognised as
      // `javascript:` rather than mistaken for a relative path.
      expect(judgeRedirect(url, PAGE)).toMatchObject({ reason: 'scheme', protocol: 'javascript:' });
    });
  });

  describe('allows a real navigation', () => {
    it.each([
      ['https', 'https://example.com/thanks'],
      ['http', 'http://example.com/thanks'],
      ['https with query and fragment', 'https://example.com/t?a=1#done'],
      ['root-relative', '/thanks'],
      ['document-relative', 'thanks'],
      ['query-only', '?done=1'],
      ['fragment-only', '#done'],
      ['protocol-relative', '//example.com/thanks'],
    ])('%s', (_label, url) => {
      expect(judgeRedirect(url, PAGE)).toBeNull();
    });

    it('resolves a relative URL against the embedding page, not against nothing', () => {
      // The reason the base is threaded in at all: a bare `thanks` is only judgeable once you
      // know what it resolves to. Judged with no base it would simply fail to parse.
      expect(judgeRedirect('thanks', PAGE)).toBeNull();
      expect(judgeRedirect('thanks', 'javascript:void 0')).not.toBeNull();
    });
  });

  describe('refuses what cannot be parsed at all', () => {
    it('an unclosed IPv6 literal', () => {
      expect(judgeRedirect('http://[', PAGE)).toEqual({ reason: 'unparseable' });
    });

    it('but a bare colon is a RELATIVE path, and is allowed', () => {
      // Checked deliberately rather than assumed: `:` resolves against the base to an ordinary
      // https path, so refusing it would break a legitimate (if odd) relative redirect. The
      // "unparseable" branch is narrower than it looks.
      expect(judgeRedirect(':', PAGE)).toBeNull();
    });
  });
});

describe('redirectRefusalMessage', () => {
  it('names the offending scheme so a builder can see what was dropped', () => {
    const refusal = judgeRedirect('javascript:alert(1)', PAGE);
    expect(refusal).not.toBeNull();
    expect(redirectRefusalMessage('javascript:alert(1)', refusal!)).toContain('javascript:');
  });

  it('says "unparseable" for a URL that never parsed, rather than blaming a scheme', () => {
    const refusal = judgeRedirect('http://[', PAGE);
    expect(refusal).not.toBeNull();
    expect(redirectRefusalMessage('http://[', refusal!)).toMatch(/unparseable/i);
  });
});
