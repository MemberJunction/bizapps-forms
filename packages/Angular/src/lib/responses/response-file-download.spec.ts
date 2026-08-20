import { describe, expect, it } from 'vitest';

import { DOWNLOAD_PATH, downloadErrorMessage, downloadUrl } from './response-file-download';

describe('downloadUrl', () => {
  it('builds against the API origin, not the browser origin', () => {
    // The builder runs inside Explorer, a DIFFERENT origin from MJAPI. Using window.location is
    // what once produced an Explorer login page where a form should have been.
    expect(downloadUrl('http://localhost:4000', 'abc')).toBe(`http://localhost:4000${DOWNLOAD_PATH}/abc`);
  });

  it('does not double the slash when the origin has a trailing one', () => {
    expect(downloadUrl('http://localhost:4000/', 'abc')).toBe(`http://localhost:4000${DOWNLOAD_PATH}/abc`);
  });

  it('encodes the id rather than pasting it into a path', () => {
    expect(downloadUrl('http://api', 'a/b')).toContain('a%2Fb');
  });

  it('returns nothing when the origin is unknown, so the caller can say why', () => {
    // Fetching from a relative URL would hit Explorer, which answers with its own HTML.
    expect(downloadUrl('', 'abc')).toBe('');
  });

  it('returns nothing for a blank id', () => {
    expect(downloadUrl('http://api', '  ')).toBe('');
  });
});

describe('downloadErrorMessage', () => {
  it("uses the server's own sentence when there is one", () => {
    expect(downloadErrorMessage(410, '{"error":"That file was revoked and is no longer stored."}')).toBe(
      'That file was revoked and is no longer stored.',
    );
  });

  it('accepts an already-parsed body as well as text', () => {
    expect(downloadErrorMessage(404, { error: 'That file could not be found.' })).toBe(
      'That file could not be found.',
    );
  });

  it('ignores a blank server message rather than showing an empty error', () => {
    expect(downloadErrorMessage(500, '{"error":"   "}')).toBe('The download did not go through. Please try again.');
  });

  it('survives a body that is not JSON at all', () => {
    // A proxy's HTML error page.
    expect(downloadErrorMessage(502, '<html>bad gateway</html>')).toMatch(/did not go through/);
  });

  it('tells a signed-out reader what to actually do', () => {
    expect(downloadErrorMessage(401, '')).toMatch(/reloading/i);
    expect(downloadErrorMessage(403, '')).toMatch(/reloading/i);
  });

  it('does not tell someone to retry a verdict about the file', () => {
    // 4xx here is a judgement about this file; retrying returns the same answer forever.
    expect(downloadErrorMessage(404, '')).not.toMatch(/try again/i);
  });

  it('does suggest a retry for a server-side failure', () => {
    expect(downloadErrorMessage(500, '')).toMatch(/try again/i);
  });

  it('never shows a bare status code, which means nothing outside a spec', () => {
    for (const status of [400, 401, 404, 410, 500, 503]) {
      expect(downloadErrorMessage(status, '')).not.toContain(String(status));
    }
  });
});
