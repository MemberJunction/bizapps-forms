/**
 * What a file question says while its upload runs.
 *
 * The bar used to read "Uploading resume.pdf — 100% …" for as long as the SERVER took to store the
 * file, because 100% measured bytes leaving the browser. A respondent read that as finished and
 * tapped Submit, which on a widget without the #248 wait sent the response without the file.
 */
import { describe, expect, it } from 'vitest';

import { uploadingLine } from './upload-status-line';
import { IDLE_UPLOAD, type UploadView } from './upload-store';

const uploading = (fields: Partial<UploadView>): UploadView => ({
  ...IDLE_UPLOAD,
  status: 'uploading',
  fileName: 'resume.pdf',
  ...fields,
});

describe('uploadingLine', () => {
  it('names the file and how much of it has been sent', () => {
    expect(uploadingLine(uploading({ phase: 'sending', progress: 0.634 }))).toBe('Uploading resume.pdf — 63%…');
  });

  it('drops the percent while the transport cannot tell', () => {
    expect(uploadingLine(uploading({ phase: 'sending', progress: null }))).toBe('Uploading resume.pdf…');
  });

  it('says the file is being saved, never "100%", once every byte is sent', () => {
    const line = uploadingLine(uploading({ phase: 'storing', progress: null }));
    expect(line).toBe('Saving resume.pdf…');
    expect(line).not.toMatch(/100%/);
  });

  it('says "saving" even if a transport reports 100% alongside the storing phase', () => {
    expect(uploadingLine(uploading({ phase: 'storing', progress: 1 }))).toBe('Saving resume.pdf…');
  });
});
