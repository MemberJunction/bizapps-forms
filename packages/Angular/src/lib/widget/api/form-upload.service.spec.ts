import { describe, it, expect } from 'vitest';
import { buildUploadFormData, parseUploadResponse } from './form-upload.service';
import { deriveUploadUrl } from './forms-api.config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { uploadErrorMessage } from './form-upload.service';

describe('deriveUploadUrl', () => {
  it('does not double the slash when the origin has no path', () => {
    // The shipped bug, exactly as it reached the browser: MJAPI is configured as
    // `http://localhost:4000/`, whose pathname is '/', the /graphql replace finds nothing,
    // and '/' + '/forms/upload' produces '//forms/upload'. Every FileUpload and Doodle
    // answer then POSTed to a URL the route does not serve and came back 400 — which read
    // as "drawings are broken" when it was the address that was wrong.
    expect(deriveUploadUrl('http://localhost:4000/')).toBe('http://localhost:4000/forms/upload');
    expect(deriveUploadUrl('http://localhost:4000')).toBe('http://localhost:4000/forms/upload');
  });

  it('does not double the slash when a base path has a trailing slash', () => {
    expect(deriveUploadUrl('https://api.example.com/mj/')).toBe(
      'https://api.example.com/mj/forms/upload',
    );
  });

  it('swaps a trailing /graphql for /forms/upload', () => {
    expect(deriveUploadUrl('https://api.example.com/graphql')).toBe(
      'https://api.example.com/forms/upload',
    );
  });

  it('handles a base path before /graphql', () => {
    expect(deriveUploadUrl('https://api.example.com/mj/graphql')).toBe(
      'https://api.example.com/mj/forms/upload',
    );
  });

  it('returns empty string for empty input', () => {
    expect(deriveUploadUrl('')).toBe('');
  });
});

describe('buildUploadFormData', () => {
  it('includes file, distributionSlug and questionId under the seam field names', () => {
    const file = new File(['hi'], 'photo.png', { type: 'image/png' });
    const fd = buildUploadFormData(file, 'my-survey', 'q-42');

    expect(fd.get('distributionSlug')).toBe('my-survey');
    expect(fd.get('questionId')).toBe('q-42');
    const sent = fd.get('file');
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe('photo.png');
  });
});

describe('parseUploadResponse', () => {
  it('parses a well-formed response', () => {
    expect(
      parseUploadResponse({ fileId: 'f1', name: 'a.png', size: 10, contentType: 'image/png' }),
    ).toEqual({ fileId: 'f1', name: 'a.png', size: 10, contentType: 'image/png' });
  });

  it('defaults missing metadata but keeps the required fileId', () => {
    expect(parseUploadResponse({ fileId: 'f1' })).toEqual({
      fileId: 'f1',
      name: '',
      size: 0,
      contentType: '',
    });
  });

  it('throws when fileId is missing', () => {
    expect(() => parseUploadResponse({ name: 'a.png' })).toThrow(/no file id/i);
  });

  it('throws on a non-object body', () => {
    expect(() => parseUploadResponse(null)).toThrow(/unexpected server response/i);
  });
});

describe('uploadErrorMessage', () => {
  it('tells the respondent what the server actually objected to', () => {
    // The widget threw the server's message away and showed "Upload failed (HTTP 415).
    // Please try again." — a status code and advice that cannot work. The server had
    // already written the useful sentence; nothing was passing it on.
    expect(uploadErrorMessage(415, '{"error":"Content type \\"text/markdown\\" is not allowed."}')).toBe(
      'Content type "text/markdown" is not allowed.',
    );
  });

  it('does not tell someone to retry a file that will never be accepted', () => {
    // 413 and 415 are verdicts on the file itself. "Please try again" sends the respondent
    // round a loop that cannot terminate.
    for (const status of [400, 413, 415]) {
      expect(uploadErrorMessage(status, '')).not.toMatch(/try again/i);
    }
  });

  it('does suggest retrying when retrying might genuinely help', () => {
    expect(uploadErrorMessage(500, '')).toMatch(/try again/i);
    expect(uploadErrorMessage(0, '')).toMatch(/try again/i);
  });

  it('falls back to something readable when the body is not the expected shape', () => {
    // A proxy returning an HTML error page must not surface as markup or as "[object Object]".
    const message = uploadErrorMessage(415, '<html>Gateway</html>');
    expect(message).not.toMatch(/[<>]/);
    expect(message.length).toBeGreaterThan(0);
  });

  it('never echoes a blank server message', () => {
    expect(uploadErrorMessage(415, '{"error":"   "}').trim().length).toBeGreaterThan(0);
  });
});

describe('the XHR response handler', () => {
  it('reads the parsed body, not responseText', () => {
    // THE REGRESSION, and it can only be guarded this way here: the service takes
    // FORMS_API_CONFIG through inject() in a field initialiser, so it cannot be constructed
    // in the vitest node env to drive a real XHR through.
    //
    // Reading `xhr.responseText` while `responseType` is 'json' throws InvalidStateError,
    // and it throws INSIDE onload — so the promise never settled, the widget sat at
    // "Uploading … 100%" indefinitely, and Submit stayed blocked behind an upload the
    // server had already refused. A test on the message text passes either way; what was
    // broken was that nothing settled at all.
    const source = readFileSync(join(__dirname, 'form-upload.service.ts'), 'utf8');
    // Comments discuss the forbidden property by name — strip them or the guard matches
    // the explanation of the bug instead of the bug.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const handler = code.slice(code.indexOf('xhr.onload'), code.indexOf('xhr.onerror'));
    expect(handler).not.toMatch(/responseText/);
    expect(handler).toMatch(/xhr\.response\b/);
  });

  it('reads an error out of an already-parsed body, which is what responseType json gives', () => {
    expect(uploadErrorMessage(415, { error: 'Files of type "text/markdown" are not accepted here.' })).toBe(
      'Files of type "text/markdown" are not accepted here.',
    );
  });

  it('still copes with a body that arrived as text', () => {
    expect(uploadErrorMessage(413, '{"error":"That file is larger than the 10 MB limit."}')).toBe(
      'That file is larger than the 10 MB limit.',
    );
  });

  it('falls back rather than throwing on a null or odd body', () => {
    expect(uploadErrorMessage(415, null).length).toBeGreaterThan(0);
    expect(uploadErrorMessage(415, 42).length).toBeGreaterThan(0);
  });
});
