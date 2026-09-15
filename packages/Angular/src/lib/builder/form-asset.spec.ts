import { describe, it, expect } from 'vitest';
import { assetErrorMessage, buildAssetFormData, parseAssetResponse } from './form-asset.service';
import { isAcceptedType } from './image-formats';

/** A stand-in File; the browser type is not available under the node test environment. */
function fileNamed(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

describe('buildAssetFormData', () => {
  it('sends the field names the server matches on', () => {
    const body = buildAssetFormData(fileNamed('logo.png'), 'form-1');
    expect(body.get('formId')).toBe('form-1');
    expect((body.get('file') as File).name).toBe('logo.png');
  });
});

describe('parseAssetResponse', () => {
  it('reads a well-formed response', () => {
    expect(
      parseAssetResponse({
        fileId: 'file-1',
        url: 'https://api.example.com/forms/asset/file-1',
        name: 'logo.png',
        size: 1234,
        contentType: 'image/png',
      }),
    ).toEqual({
      fileId: 'file-1',
      url: 'https://api.example.com/forms/asset/file-1',
      name: 'logo.png',
      size: 1234,
      contentType: 'image/png',
    });
  });

  it('THROWS on a 200 that carries no url', () => {
    // The failure that matters. A missing url read as an empty string would be committed to the
    // field, so a "successful" upload would silently CLEAR the image the author already had.
    expect(() => parseAssetResponse({ fileId: 'file-1' })).toThrow(/did not return an image URL/);
    expect(() => parseAssetResponse({ fileId: 'file-1', url: '' })).toThrow(/did not return an image URL/);
    expect(() => parseAssetResponse({ url: 'https://x/y' })).toThrow(/did not return an image URL/);
  });

  it('throws on a non-object body', () => {
    expect(() => parseAssetResponse(null)).toThrow(/unexpected server response/);
    expect(() => parseAssetResponse('<html>502</html>')).toThrow(/unexpected server response/);
  });

  it('tolerates missing optional metadata rather than failing the upload', () => {
    const asset = parseAssetResponse({ fileId: 'f', url: 'https://x/y' });
    expect(asset).toEqual({ fileId: 'f', url: 'https://x/y', name: '', size: 0, contentType: '' });
  });
});

describe('assetErrorMessage', () => {
  it('prefers the server’s own message, which is the only thing that knows why', () => {
    expect(assetErrorMessage(413, { error: 'Image exceeds the maximum size of 5 MB.' })).toBe(
      'Image exceeds the maximum size of 5 MB.',
    );
  });

  it('falls back to a status-shaped message when there is no body', () => {
    // A proxy or a crash can produce a bare status; "HTTP 403" alone tells an author nothing.
    expect(assetErrorMessage(403, null)).toMatch(/permission/i);
    expect(assetErrorMessage(413, null)).toMatch(/too large/i);
    expect(assetErrorMessage(415, null)).toMatch(/not an image/i);
    // A server-side failure IS worth retrying, so it says so — but without naming a status
    // code. "HTTP 500" is a number that means nothing outside a spec, and the author can act on
    // "try again" without it.
    expect(assetErrorMessage(500, null)).toMatch(/try again/i);
    expect(assetErrorMessage(500, null)).not.toMatch(/HTTP|500/);
    // A 4xx the list above does not name is still a verdict on the file, so it must NOT invite a
    // retry of the same one — that was the shipped copy's mistake.
    expect(assetErrorMessage(422, null)).toMatch(/different file/i);
    expect(assetErrorMessage(422, null)).not.toMatch(/HTTP|422/);
  });

  it('ignores a blank server message instead of showing an empty error', () => {
    expect(assetErrorMessage(403, { error: '   ' })).toMatch(/permission/i);
  });
});

describe('isAcceptedType — the local screen before an upload', () => {
  it('accepts the four formats the server accepts', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(isAcceptedType(t)).toBe(true);
    }
  });

  it('rejects what the server would reject, saving the author a round trip', () => {
    // The point of screening locally: refusing a 4 MB PDF is instant here and costs an upload
    // plus a wait if left to the server.
    for (const t of ['application/pdf', 'text/plain', 'video/mp4', 'image/tiff']) {
      expect(isAcceptedType(t)).toBe(false);
    }
  });

  it('rejects SVG, matching the server default rather than being friendlier than it', () => {
    // A client that accepted SVG would upload it and then show a server rejection — worse than
    // never offering it. The server can be configured to allow it; this hint follows the default.
    expect(isAcceptedType('image/svg+xml')).toBe(false);
  });

  it('ignores a charset parameter and matches case-insensitively', () => {
    expect(isAcceptedType('IMAGE/PNG; charset=binary')).toBe(true);
  });

  it('rejects a blank type rather than guessing', () => {
    expect(isAcceptedType('')).toBe(false);
  });
});
