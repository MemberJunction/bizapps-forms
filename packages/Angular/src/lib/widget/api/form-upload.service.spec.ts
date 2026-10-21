import { describe, it, expect } from 'vitest';
import { buildUploadFormData, parseUploadResponse } from './form-upload.service';
import { deriveUploadUrl } from './forms-api.config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { uploadErrorMessage, uploadFailure } from './form-upload.service';
import { UploadError } from './form-upload.interface';

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

  it('tells the respondent to choose a different file when the server gave no reason', () => {
    expect(uploadErrorMessage(413, '')).toBe('That file was not accepted. Choose a different file.');
  });
});

describe('uploadFailure', () => {
  it('calls a 4xx refused, because the same file will be refused again', () => {
    const failure = uploadFailure(413, '');
    expect(failure).toBeInstanceOf(UploadError);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.kind).toBe('refused');
    expect(failure.message).toBe('That file was not accepted. Choose a different file.');
  });

  it('calls a 5xx transient, because the next attempt may well land', () => {
    expect(uploadFailure(500, '').kind).toBe('transient');
  });

  it('draws the refused range at exactly 400-499', () => {
    // 399 cannot reach here from the XHR path (only non-2xx do, and 3xx are followed), but the
    // boundary is the function's contract, so pin both edges.
    expect(uploadFailure(399, '').kind).toBe('transient');
    expect(uploadFailure(400, '').kind).toBe('refused');
    expect(uploadFailure(499, '').kind).toBe('refused');
    expect(uploadFailure(500, '').kind).toBe('transient');
  });

  it('calls a status-0 failure (no response at all) transient', () => {
    expect(uploadFailure(0, '').kind).toBe('transient');
  });

  it('keeps the server sentence as the message', () => {
    const failure = uploadFailure(415, { error: 'Files of type "text/markdown" are not accepted here.' });
    expect(failure.kind).toBe('refused');
    expect(failure.message).toBe('Files of type "text/markdown" are not accepted here.');
  });
});

describe('the XHR transport classifies every failure', () => {
  // Source-level guards, kept alongside the executing transport tests in
  // form-upload.transport.spec.ts (which drive a fake XHR through the real service): these pin
  // which constructor each handler rejects with, which the executing tests check only by message.
  const code = readFileSync(join(__dirname, 'form-upload.service.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('rejects a non-2xx with uploadFailure, so the store can tell refused from transient', () => {
    const handler = code.slice(code.indexOf('xhr.onload'), code.indexOf('xhr.onerror'));
    expect(handler).toMatch(/reject\(uploadFailure\(xhr\.status, xhr\.response\)\)/);
  });

  it('rejects a network error and an abort as transient', () => {
    expect(code).toMatch(/xhr\.onerror = [^;]*new UploadError\([^;]*'transient'\)/);
    expect(code).toMatch(/xhr\.onabort = [^;]*new UploadError\([^;]*'transient'\)/);
  });

  it('rejects a missing endpoint as refused, since no retry can fix configuration', () => {
    expect(code).toMatch(/new UploadError\('Uploads are not available for this form\.', 'refused'\)/);
  });
});

describe('the XHR response handler', () => {
  it('reads the parsed body, not responseText', () => {
    // THE REGRESSION, guarded at the source: the property read is the defect, and a fake XHR
    // (see form-upload.transport.spec.ts) would only reproduce it if it modelled the browser's
    // InvalidStateError on responseText — which it does not.
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
