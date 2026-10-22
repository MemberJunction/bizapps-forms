/**
 * The XHR transport, EXECUTED against a fake `XMLHttpRequest` (#248).
 *
 * The service is built in an injection context, the way `forms-api.graphql.service.spec.ts` builds
 * its own, and the global `XMLHttpRequest` is stubbed with a fake the test drives event by event.
 *
 * The stall watchdog is why this exists. A request that stops making progress — a dead socket the
 * browser has not noticed, a proxy holding the connection open — fired no event at all, so the
 * upload's promise never settled, the store's capped retries never got a turn, and "Saving your
 * file…" covered the form forever.
 */
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UploadError, type UploadedFile } from './form-upload.interface';
import { FormUploadService, UPLOAD_STALL_MS } from './form-upload.service';
import { FORMS_API_CONFIG, normalizeApiConfig } from './forms-api.config';

type Handler = ((event: ProgressEvent) => void) | null;

/** Just the XHR surface the service touches, recorded and driven by hand. */
class FakeXhr {
  public static last: FakeXhr | null = null;

  public method = '';
  public url = '';
  public readonly headers: Record<string, string> = {};
  public responseType = '';
  public status = 0;
  public response: unknown = null;
  public responseText = '';
  public body: unknown = undefined;
  public abortCalls = 0;
  public readonly upload: { onprogress: Handler; onload: Handler } = { onprogress: null, onload: null };
  public onprogress: Handler = null;
  public onload: Handler = null;
  public onerror: Handler = null;
  public onabort: Handler = null;

  public constructor() {
    FakeXhr.last = this;
  }

  public open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  public setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  public send(body: unknown): void {
    this.body = body;
  }

  /** A real XHR fires `abort` when aborted; so does this one. */
  public abort(): void {
    this.abortCalls++;
    this.onabort?.(progress(0, 0));
  }
}

const progress = (loaded: number, total: number): ProgressEvent =>
  ({ lengthComputable: total > 0, loaded, total }) as ProgressEvent;

function wire(): FakeXhr {
  const xhr = FakeXhr.last;
  if (!xhr) {
    throw new Error('No XMLHttpRequest was opened.');
  }
  return xhr;
}

function service(): FormUploadService {
  const injector = Injector.create({
    providers: [
      {
        provide: FORMS_API_CONFIG,
        useValue: normalizeApiConfig({ graphqlUrl: 'https://api.example/graphql', token: 'tok-1' }),
      },
    ],
  });
  return runInInjectionContext(injector, () => new FormUploadService());
}

/**
 * Has `promise` settled yet, and how? Reads it without waiting for it. A rejection is reduced to
 * the two things the store acts on — the sentence and the kind — and anything that is not an
 * `UploadError` is kept whole so it fails the comparison visibly.
 */
async function peek<T>(promise: Promise<T>): Promise<'pending' | { value: T } | { error: unknown }> {
  let result: 'pending' | { value: T } | { error: unknown } = 'pending';
  promise.then(
    (value) => (result = { value }),
    (error: unknown) => (result = { error: error instanceof UploadError ? failure(error.message, error.kind) : error }),
  );
  await vi.advanceTimersByTimeAsync(0);
  return result;
}

const failure = (message: string, kind: UploadError['kind']) => ({ message, kind });

const STALLED = failure('The upload stalled. Check your connection and try again.', 'transient');

function startUpload(onProgress?: (fraction: number | null) => void): Promise<UploadedFile> {
  const pending = service().upload(new File(['ink'], 'doodle.png'), 'the-slug', 'q-sig', onProgress, 'resp-1');
  // Unhandled-rejection noise otherwise: every test reads the outcome through peek().
  pending.catch(() => undefined);
  return pending;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeXhr.last = null;
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('FormUploadService — the request it sends', () => {
  it('POSTs the multipart body to the derived endpoint with the bearer token, as before the watchdog', () => {
    void startUpload();
    const xhr = wire();

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('https://api.example/forms/upload');
    expect(xhr.headers).toEqual({ Authorization: 'Bearer tok-1' });
    expect(xhr.responseType).toBe('json');
    const body = xhr.body as FormData;
    // `get`, not `keys()`: the typecheck gate's lib has no DOM.Iterable.
    expect((body.get('file') as File | null)?.name).toBe('doodle.png');
    expect(body.get('distributionSlug')).toBe('the-slug');
    expect(body.get('questionId')).toBe('q-sig');
    expect(body.get('responseId')).toBe('resp-1');
  });

  it('still reports upload progress to the caller', () => {
    const onProgress = vi.fn();
    void startUpload(onProgress);

    wire().upload.onprogress?.(progress(1, 4));

    expect(onProgress).toHaveBeenCalledWith(0.25);
  });
});

describe('FormUploadService — the stall watchdog', () => {
  it('aborts and rejects as a transient stall when nothing happens for UPLOAD_STALL_MS', async () => {
    const pending = startUpload();

    await vi.advanceTimersByTimeAsync(UPLOAD_STALL_MS - 1);
    expect(await peek(pending)).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);

    // The stall's own sentence, not "Upload cancelled." from the abort it causes: first settle wins.
    expect(await peek(pending)).toEqual({ error: STALLED });
    expect(wire().abortCalls).toBe(1);
  });

  it('restarts on every sign of life: upload progress, the body finishing, and response progress', async () => {
    const pending = startUpload();
    const xhr = wire();
    const nearlyStalled = UPLOAD_STALL_MS - 1_000;

    await vi.advanceTimersByTimeAsync(nearlyStalled);
    xhr.upload.onprogress?.(progress(1, 2));
    await vi.advanceTimersByTimeAsync(nearlyStalled);
    xhr.upload.onload?.(progress(2, 2));
    await vi.advanceTimersByTimeAsync(nearlyStalled);
    xhr.onprogress?.(progress(10, 0));
    await vi.advanceTimersByTimeAsync(nearlyStalled);

    // A slow upload that keeps moving is not a stalled one.
    expect(await peek(pending)).toBe('pending');
    expect(xhr.abortCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(await peek(pending)).toEqual({ error: STALLED });
  });

  it('stops watching once the response arrives', async () => {
    const pending = startUpload();
    const xhr = wire();
    xhr.status = 200;
    xhr.response = { fileId: 'file-1', name: 'doodle.png', size: 3, contentType: 'image/png' };

    xhr.onload?.(progress(0, 0));
    await vi.advanceTimersByTimeAsync(UPLOAD_STALL_MS * 2);

    expect(await peek(pending)).toEqual({ value: xhr.response });
    expect(xhr.abortCalls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops watching on a refusal, a network error, and an abort it did not cause', async () => {
    const outcomes: Array<[string, (xhr: FakeXhr) => void, ReturnType<typeof failure>]> = [
      [
        'refusal',
        (xhr) => {
          xhr.status = 413;
          xhr.response = null;
          xhr.onload?.(progress(0, 0));
        },
        failure('That file was not accepted. Choose a different file.', 'refused'),
      ],
      ['network error', (xhr) => xhr.onerror?.(progress(0, 0)), failure('Upload failed. Check your connection and try again.', 'transient')],
      ['abort', (xhr) => xhr.onabort?.(progress(0, 0)), failure('Upload cancelled.', 'transient')],
    ];
    for (const [, settle, expected] of outcomes) {
      const pending = startUpload();
      const xhr = wire();

      settle(xhr);
      await vi.advanceTimersByTimeAsync(UPLOAD_STALL_MS * 2);

      expect(await peek(pending)).toEqual({ error: expected });
      expect(xhr.abortCalls).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    }
  });
});
