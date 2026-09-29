import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `upload()` reads the API location and token from the Explorer's GraphQL provider; this spec
// supplies them, and drives the real service against a fake XHR, so what it asserts is what the
// service SENDS rather than what its source text contains.
vi.mock('../shared/mj-api-origin', () => ({
  resolveApiBase: (): string => 'http://api.test',
  resolveApiToken: (): string => 'token',
}));

const optimizeCalls: Array<{ name: string; use: string | undefined }> = [];
vi.mock('./image-optimize', () => ({
  optimizeImageForUpload: async (file: File, use?: string): Promise<File> => {
    optimizeCalls.push({ name: file.name, use });
    return new File([new Uint8Array(10)], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' });
  },
}));

import { AssetUploadError, FormAssetService } from './form-asset.service';

/** One scripted answer per `send()`, in order. */
type Answer = { status: number; body: unknown };

class FakeXhr {
  static answers: Answer[] = [];
  static sent: Array<{ fileName: string; type: string }> = [];
  status = 0;
  response: unknown = null;
  responseText = '';
  responseType = '';
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(): void {}
  setRequestHeader(): void {}
  send(body: FormData): void {
    const file = body.get('file') as File;
    FakeXhr.sent.push({ fileName: file.name, type: file.type });
    const answer = FakeXhr.answers.shift();
    if (!answer) {
      throw new Error('FakeXhr: no scripted answer left');
    }
    this.status = answer.status;
    this.response = answer.body;
    queueMicrotask(() => this.onload?.());
  }
}

const ok = (name: string): Answer => ({ status: 200, body: { fileId: 'f1', url: `http://api.test/forms/asset/f1`, name, size: 10, contentType: 'image/webp' } });
const photo = (): File => new File([new Uint8Array(1000)], 'photo.jpg', { type: 'image/jpeg' });

describe('FormAssetService.upload', () => {
  beforeEach(() => {
    optimizeCalls.length = 0;
    FakeXhr.answers = [];
    FakeXhr.sent = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shrinks for the surface it is told the image is for', async () => {
    FakeXhr.answers = [ok('photo.webp'), ok('photo.webp')];
    const service = new FormAssetService();
    await service.upload(photo(), 'form-1', undefined, 'page-background');
    await service.upload(photo(), 'form-1');
    expect(optimizeCalls).toEqual([
      { name: 'photo.jpg', use: 'page-background' },
      { name: 'photo.jpg', use: 'content' },
    ]);
  });

  it('sends the optimized file, and the original once after a 415', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    FakeXhr.answers = [{ status: 415, body: { error: '"image/webp" is not an accepted image type.' } }, ok('photo.jpg')];
    await new FormAssetService().upload(photo(), 'form-1');
    expect(FakeXhr.sent).toEqual([
      { fileName: 'photo.webp', type: 'image/webp' },
      { fileName: 'photo.jpg', type: 'image/jpeg' },
    ]);
  });

  it('does not retry any other refusal', async () => {
    FakeXhr.answers = [{ status: 413, body: { error: 'Image exceeds the maximum size of 5 MB.' } }];
    await expect(new FormAssetService().upload(photo(), 'form-1')).rejects.toEqual(new AssetUploadError('Image exceeds the maximum size of 5 MB.', 413));
    expect(FakeXhr.sent).toHaveLength(1);
  });
});
