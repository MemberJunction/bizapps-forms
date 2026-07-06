import { describe, it, expect } from 'vitest';
import { buildUploadFormData, parseUploadResponse } from './form-upload.service';
import { deriveUploadUrl } from './forms-api.config';

describe('deriveUploadUrl', () => {
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
