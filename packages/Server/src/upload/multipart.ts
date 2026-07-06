/**
 * A small, dependency-free `multipart/form-data` parser for the public upload endpoint
 * (Task 3). MJ's stack ships no multipart body-parser (its own file path uses pre-auth
 * URLs, not server uploads), and multer/busboy are not in the dependency tree — rather
 * than pull in a new runtime dependency, we parse the well-bounded multipart format here.
 *
 * SCOPE (deliberately narrow, fail-closed): the widget posts exactly a handful of text
 * fields plus ONE file part. We extract the first file part and all text fields; anything
 * malformed yields a typed error the middleware maps to a 400. It is NOT a general-purpose
 * multipart implementation (no nested multipart, no streaming) — the caller enforces a hard
 * byte cap on the raw body BEFORE parsing so memory use is bounded.
 */

/** A parsed file part: its bytes plus the declared filename/content-type. */
export interface ParsedFile {
  fieldName: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

/**
 * Parse outcome. Flat (non-discriminated) shape so field access stays safe under this
 * package's non-`strictNullChecks` compile (matches persistence/definition-loader).
 *  - `ok:false`  malformed body; `reason` is set.
 *  - `ok:true`   `fields` is the text-field map; `file` is the first file part (if any).
 */
export interface MultipartParseResult {
  ok: boolean;
  file?: ParsedFile;
  fields: Record<string, string>;
  reason?: string;
}

/** Extract the `boundary=...` token from a `multipart/form-data` Content-Type header. */
export function boundaryFromContentType(contentType: string | undefined): string | undefined {
  if (!contentType) {
    return undefined;
  }
  const match = /;\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const raw = match?.[1] ?? match?.[2];
  return raw?.trim() || undefined;
}

/** Read one header line's `name="..."; filename="..."` params from a Content-Disposition. */
function parseContentDisposition(line: string): { name?: string; filename?: string } {
  const name = /;\s*name="([^"]*)"/i.exec(line)?.[1];
  const filename = /;\s*filename="([^"]*)"/i.exec(line)?.[1];
  return { name, filename };
}

/** Split the raw part headers (before the blank line) from the body bytes. */
function splitHeadersAndBody(part: Buffer): { headerText: string; body: Buffer } | undefined {
  const sep = part.indexOf('\r\n\r\n');
  if (sep === -1) {
    return undefined;
  }
  return {
    headerText: part.subarray(0, sep).toString('utf8'),
    body: part.subarray(sep + 4),
  };
}

/** Parse the header block of one part into its disposition name/filename + content-type. */
function parsePartHeaders(headerText: string): { name?: string; filename?: string; contentType: string } {
  let name: string | undefined;
  let filename: string | undefined;
  let contentType = 'application/octet-stream';
  for (const line of headerText.split('\r\n')) {
    if (/^content-disposition:/i.test(line)) {
      const cd = parseContentDisposition(line);
      name = cd.name;
      filename = cd.filename;
    } else if (/^content-type:/i.test(line)) {
      contentType = line.slice(line.indexOf(':') + 1).trim() || contentType;
    }
  }
  return { name, filename, contentType };
}

/** Trim the trailing CRLF that precedes each boundary delimiter from a part body. */
function trimTrailingCrlf(body: Buffer): Buffer {
  if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
    return body.subarray(0, body.length - 2);
  }
  return body;
}

/** Split the raw body into part buffers on the `--boundary` delimiter. */
function splitParts(body: Buffer, boundary: string): Buffer[] {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let index = body.indexOf(delimiter);
  while (index !== -1) {
    const start = index + delimiter.length;
    const next = body.indexOf(delimiter, start);
    // The segment immediately after a delimiter is either "--\r\n" (final) or "\r\n<part>".
    const end = next === -1 ? body.length : next;
    const segment = body.subarray(start, end);
    // Final boundary is "--"; skip it. Otherwise strip the leading CRLF.
    if (!(segment.length >= 2 && segment[0] === 0x2d && segment[1] === 0x2d)) {
      const partBody = segment[0] === 0x0d && segment[1] === 0x0a ? segment.subarray(2) : segment;
      parts.push(partBody);
    }
    if (next === -1) {
      break;
    }
    index = next;
  }
  return parts;
}

/**
 * Parse a `multipart/form-data` body. Returns the FIRST file part plus every text field.
 * Fail-closed: a missing boundary or a body with no valid parts is a typed error.
 */
export function parseMultipart(body: Buffer, contentType: string | undefined): MultipartParseResult {
  const boundary = boundaryFromContentType(contentType);
  if (!boundary) {
    return { ok: false, fields: {}, reason: 'Missing or invalid multipart boundary.' };
  }
  const rawParts = splitParts(body, boundary);
  if (rawParts.length === 0) {
    return { ok: false, fields: {}, reason: 'Malformed multipart body (no parts found).' };
  }

  const fields: Record<string, string> = {};
  let file: ParsedFile | undefined;

  for (const part of rawParts) {
    const split = splitHeadersAndBody(part);
    if (!split) {
      continue;
    }
    const { name, filename, contentType: partType } = parsePartHeaders(split.headerText);
    if (!name) {
      continue;
    }
    const value = trimTrailingCrlf(split.body);
    if (filename !== undefined) {
      // First file part wins (the widget sends exactly one).
      if (!file) {
        file = { fieldName: name, filename, contentType: partType, data: value };
      }
    } else {
      fields[name] = value.toString('utf8');
    }
  }

  return { ok: true, file, fields };
}
