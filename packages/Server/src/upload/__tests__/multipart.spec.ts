/**
 * Unit tests for the dependency-free multipart/form-data parser.
 */
import { describe, expect, it } from 'vitest';
import { boundaryFromContentType, parseMultipart } from '../multipart';

const BOUNDARY = '----formsBoundary123';
const CT = `multipart/form-data; boundary=${BOUNDARY}`;

/** Build a multipart body from text fields + one file part (mirrors a browser FormData POST). */
function buildBody(fields: Record<string, string>, file?: { field: string; filename: string; type: string; bytes: Buffer }): Buffer {
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.type}\r\n\r\n`,
      ),
    );
    parts.push(file.bytes);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(parts);
}

describe('boundaryFromContentType', () => {
  it('extracts an unquoted boundary', () => {
    expect(boundaryFromContentType(CT)).toBe(BOUNDARY);
  });
  it('extracts a quoted boundary', () => {
    expect(boundaryFromContentType(`multipart/form-data; boundary="${BOUNDARY}"`)).toBe(BOUNDARY);
  });
  it('returns undefined when absent', () => {
    expect(boundaryFromContentType('application/json')).toBeUndefined();
    expect(boundaryFromContentType(undefined)).toBeUndefined();
  });
});

describe('parseMultipart', () => {
  it('parses text fields and a single file part with exact bytes', () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
    const body = buildBody(
      { distributionSlug: 'public-1', questionId: 'q-file' },
      { field: 'file', filename: 'pic.png', type: 'image/png', bytes },
    );

    const result = parseMultipart(body, CT);

    expect(result.ok).toBe(true);
    expect(result.fields.distributionSlug).toBe('public-1');
    expect(result.fields.questionId).toBe('q-file');
    expect(result.file?.filename).toBe('pic.png');
    expect(result.file?.contentType).toBe('image/png');
    expect(result.file?.data.equals(bytes)).toBe(true);
  });

  it('handles a body with only text fields (no file)', () => {
    const body = buildBody({ distributionSlug: 'public-1', questionId: 'q-1' });
    const result = parseMultipart(body, CT);
    expect(result.ok).toBe(true);
    expect(result.file).toBeUndefined();
    expect(result.fields.distributionSlug).toBe('public-1');
  });

  it('fails closed with no boundary', () => {
    const result = parseMultipart(Buffer.from('nope'), 'application/json');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/boundary/i);
  });

  it('fails closed on a body with no parts', () => {
    const result = parseMultipart(Buffer.from('garbage-without-delimiters'), CT);
    expect(result.ok).toBe(false);
  });

  it('preserves binary bytes containing CRLF sequences', () => {
    const bytes = Buffer.from([0x00, 0x0d, 0x0a, 0xff, 0x0d, 0x0a, 0x2d, 0x2d]);
    const body = buildBody({ questionId: 'q' }, { field: 'file', filename: 'b.bin', type: 'application/octet-stream', bytes });
    const result = parseMultipart(body, CT);
    expect(result.file?.data.equals(bytes)).toBe(true);
  });
});
