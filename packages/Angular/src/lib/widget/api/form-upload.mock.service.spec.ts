import { describe, it, expect } from 'vitest';

import { FormsMockUploadService } from './form-upload.mock.service';

const png = (name = 'signature.png'): File =>
  new File(['bytes'], name, { type: 'image/png' });

describe('FormsMockUploadService', () => {
  it('resolves with a usable file answer so a preview question can be completed', async () => {
    const result = await new FormsMockUploadService().upload(png(), 'preview', 'q-1');

    expect(result.fileId).not.toBe('');
    expect(result.name).toBe('signature.png');
    expect(result.contentType).toBe('image/png');
  });
});

describe('FormsMockUploadService ids', () => {
  it('gives each upload its own id so two file questions do not share one answer', async () => {
    const uploader = new FormsMockUploadService();

    const first = await uploader.upload(png('a.png'), 'preview', 'q-1');
    const second = await uploader.upload(png('b.png'), 'preview', 'q-2');

    expect(second.fileId).not.toBe(first.fileId);
  });
});

describe('FormsMockUploadService progress', () => {
  it('drives the progress callback to completion so the preview bar settles', async () => {
    const seen: (number | null)[] = [];

    await new FormsMockUploadService().upload(png(), 'preview', 'q-1', (f) => seen.push(f));

    expect(seen.at(-1)).toBe(1);
  });
});
