import { describe, expect, it } from 'vitest';

import { FALLBACK_FILE_NAME, attachmentDisposition } from '../content-disposition';

describe('attachmentDisposition', () => {
  it('says attachment, which is what turns a click into a download', () => {
    // Without this the PNG opens in the tab and the reader has to right-click-save — the exact
    // behaviour this route replaces.
    expect(attachmentDisposition('signature.png')).toBe('attachment; filename="signature.png"');
  });

  it('does not repeat a plain ASCII name in both parameters', () => {
    expect(attachmentDisposition('resume.pdf')).not.toContain('filename*');
  });

  it('carries a non-ASCII name in the RFC 5987 parameter, with an ASCII fallback', () => {
    // A raw non-ASCII byte in a header is rejected by Node outright, so the fallback is not
    // cosmetic — without it the response throws.
    const header = attachmentDisposition('Lebenslauf Müller.pdf');
    expect(header).toContain('filename="Lebenslauf M_ller.pdf"');
    expect(header).toContain("filename*=UTF-8''Lebenslauf%20M%C3%BCller.pdf");
  });

  it("escapes the apostrophe, which would otherwise end the UTF-8'' parameter early", () => {
    // encodeURIComponent leaves ' alone; it is the delimiter of this form.
    const header = attachmentDisposition("Bob's CV — final.pdf");
    expect(header).toContain('%27');
  });

  it('drops quotes and backslashes rather than letting them close the quoted string', () => {
    // Header injection: the rest of a chosen name would land outside the filename parameter.
    const header = attachmentDisposition('a".pdf');
    expect(header).toContain('filename="a.pdf"');
  });

  it('strips control characters', () => {
    expect(attachmentDisposition('bad\r\nname.pdf')).toContain('filename="badname.pdf"');
  });

  it('keeps only the basename, so a stored path cannot become a download instruction', () => {
    expect(attachmentDisposition('../../.bashrc')).toContain('filename=".bashrc"');
  });

  it('falls back rather than emitting an empty filename', () => {
    for (const empty of ['', '   ', null, undefined, '..', '/']) {
      expect(attachmentDisposition(empty)).toContain(`filename="${FALLBACK_FILE_NAME}"`);
    }
  });

  it('falls back when stripping removes everything', () => {
    expect(attachmentDisposition('世界')).toContain(`filename="${FALLBACK_FILE_NAME}"`);
  });
});
