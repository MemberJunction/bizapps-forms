import { describe, it, expect } from 'vitest';
import { assetErrorMessage, buildAssetFormData, parseAssetResponse } from './form-asset.service';

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
    expect(assetErrorMessage(500, null)).toMatch(/HTTP 500/);
  });

  it('ignores a blank server message instead of showing an empty error', () => {
    expect(assetErrorMessage(403, { error: '   ' })).toMatch(/permission/i);
  });
});
