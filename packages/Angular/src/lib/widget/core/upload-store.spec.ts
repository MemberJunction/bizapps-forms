import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';

import { FormRuntime } from './form-runtime';
import { fullForm } from './widget-form';

/** A runtime over an author's full definition — the kind every case here was written against. */
const runtimeFor = (definition: PublishedFormDefinition): FormRuntime => new FormRuntime(fullForm(definition));
import {
  FormUploadStore,
  IDLE_UPLOAD,
  UPLOAD_RETRY_DELAYS_MS,
  UPLOAD_UNSAVED_MESSAGE,
  type UploadSend,
} from './upload-store';
import { UploadError, type UploadedFile } from '../api/form-upload.interface';

const fileNamed = (name: string): File => new File(['x'], name);

/** Two file questions, so "the wrong one" is a place an answer can actually land. */
function uploadForm(): PublishedFormDefinition {
  const fileQuestion = (id: string, order: number) => ({
    id,
    type: 'FileUpload' as const,
    prompt: id,
    isRequired: false,
    displayOrder: order,
    options: [],
  });
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Uploads',
    renderMode: 'OneQuestion',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    pages: [{ id: 'p1', displayOrder: 1, questions: [fileQuestion('q-resume', 1), fileQuestion('q-transcript', 2)] }],
    endScreens: [],
  };
}

/**
 * A store wired to a real `FormRuntime`, which is the only wiring that ships.
 *
 * The runtime rather than a stand-in on purpose: the store's whole job is to put an answer
 * somewhere the rest of the widget reads it, and a fake sink would let the two drift on what
 * "no answer" means.
 */
function connectedStore(): { store: FormUploadStore; runtime: FormRuntime } {
  const runtime = runtimeFor(uploadForm());
  const store = new FormUploadStore();
  store.connect(runtime);
  return { store, runtime };
}

describe('FormUploadStore — happy path', () => {
  it('shows a finished upload against the question it was made for', () => {
    const { store } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    store.succeed(token, 'file-resume');

    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', fileName: 'resume.txt' });
  });

  it('does NOT show that upload against any other question', () => {
    const { store } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    store.succeed(token, 'file-resume');

    // The defect this store exists to prevent: a recycled question component asking for a
    // DIFFERENT question must never be handed the resume's confirmation.
    expect(store.viewFor('q-transcript')).toMatchObject({ status: 'idle', fileName: '' });
  });
});

describe('FormUploadStore — the answer, not just the confirmation', () => {
  it('stores a finished upload against the question it was made for, even after the respondent moved on', () => {
    const { store, runtime } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.pdf'));
    // OneQuestion renders the whole deck through ONE component instance, so by the time a slow
    // upload resolves that instance is bound to the NEXT question. The upload is still the
    // resume's, and so is the answer.
    store.succeed(token, 'file-resume');

    expect(runtime.valueFor('q-resume')).toBe('file-resume');
    expect(runtime.valueFor('q-transcript')).toBeUndefined();
  });

  it('leaves the question unanswered while its upload is in flight', () => {
    const { store, runtime } = connectedStore();

    store.succeed(store.begin('q-resume', fileNamed('first.pdf')), 'file-first');
    store.begin('q-resume', fileNamed('second.pdf'));

    // A required FileUpload must not be satisfiable by a file that is not stored yet, and the
    // replaced file's id must not stand while its replacement uploads.
    expect(runtime.valueFor('q-resume')).toBeUndefined();
  });

  it('refuses to store an upload when nothing is listening for the answer', () => {
    const store = new FormUploadStore();

    // Loud, because the alternative is a respondent submitting a form without the file they
    // attached and nobody finding out.
    expect(() => store.begin('q-resume', fileNamed('resume.pdf'))).toThrow(/no answer sink/);
  });

  it('drops the previous form’s uploads when it is connected to a new runtime', () => {
    const { store, runtime } = connectedStore();
    store.succeed(store.begin('q-resume', fileNamed('resume.pdf')), 'file-resume');

    store.connect(runtimeFor(uploadForm()));

    // A reload mints a new response id; a confirmation carried across would name a file that
    // response never had.
    expect(store.viewFor('q-resume')).toEqual(IDLE_UPLOAD);
    expect(runtime.valueFor('q-resume')).toBe('file-resume');
  });
});

describe('FormUploadStore — superseded uploads', () => {
  it('refuses the result of an upload the respondent has already replaced', () => {
    const { store, runtime } = connectedStore();

    const first = store.begin('q-resume', fileNamed('draft.txt'));
    const second = store.begin('q-resume', fileNamed('final.txt'));

    // `first` resolves late — a slow link, not a cancelled request.
    store.succeed(first, 'file-draft');
    expect(store.viewFor('q-resume')).toMatchObject({ status: 'uploading', fileName: 'final.txt' });
    expect(runtime.valueFor('q-resume')).toBeUndefined();

    store.succeed(second, 'file-final');
    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', fileName: 'final.txt' });
    expect(runtime.valueFor('q-resume')).toBe('file-final');
  });
});

describe('FormUploadStore — failure', () => {
  it('shows the failure against its own question, and keeps the file for a retry', () => {
    const { store, runtime } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    store.fail(token, { kind: 'unsaved', message: 'Network unavailable.' });

    expect(store.viewFor('q-resume')).toMatchObject({
      status: 'error',
      failure: { kind: 'unsaved', message: 'Network unavailable.' },
      progress: null,
    });
    expect(store.viewFor('q-resume').file?.name).toBe('resume.txt');
    expect(runtime.valueFor('q-resume')).toBeUndefined();
  });

  it('does not let a stale failure wipe the newer upload that replaced it', () => {
    const { store, runtime } = connectedStore();

    const first = store.begin('q-resume', fileNamed('draft.txt'));
    const second = store.begin('q-resume', fileNamed('final.txt'));
    store.succeed(second, 'file-final');

    store.fail(first, { kind: 'unsaved', message: 'Network unavailable.' });

    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', fileName: 'final.txt' });
    expect(runtime.valueFor('q-resume')).toBe('file-final');
  });
});

describe('FormUploadStore — clearing', () => {
  it('empties the question and retires whatever was in flight for it', () => {
    const { store, runtime } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    store.clear('q-resume');

    expect(store.viewFor('q-resume')).toEqual(IDLE_UPLOAD);
    expect(store.viewFor('q-resume').file).toBeNull();

    // The respondent said they do not want this file; the upload already on the wire still
    // resolves, and must change nothing.
    store.succeed(token, 'file-resume');
    expect(store.viewFor('q-resume')).toEqual(IDLE_UPLOAD);
    expect(runtime.valueFor('q-resume')).toBeUndefined();
  });

  it('clears one question without touching another', () => {
    const { store, runtime } = connectedStore();

    store.succeed(store.begin('q-resume', fileNamed('resume.txt')), 'file-resume');
    store.succeed(store.begin('q-transcript', fileNamed('transcript.txt')), 'file-transcript');

    store.clear('q-transcript');

    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', fileName: 'resume.txt' });
    expect(runtime.valueFor('q-resume')).toBe('file-resume');
    expect(runtime.valueFor('q-transcript')).toBeUndefined();
  });
});

describe('FormUploadStore — progress', () => {
  it('reports progress for the running upload and ignores a superseded one', () => {
    const { store } = connectedStore();

    const first = store.begin('q-resume', fileNamed('draft.txt'));
    store.setProgress(first, 0.5);
    expect(store.viewFor('q-resume').progress).toBe(0.5);

    const second = store.begin('q-resume', fileNamed('final.txt'));
    store.setProgress(first, 0.9);
    expect(store.viewFor('q-resume').progress).toBe(0);

    store.setProgress(second, 0.3);
    expect(store.viewFor('q-resume').progress).toBe(0.3);
  });
});

describe('FormUploadStore — edge cases', () => {
  it('accepts an indeterminate progress report', () => {
    const { store } = connectedStore();

    const token = store.begin('q-resume', fileNamed('resume.txt'));
    // Not "no progress" — the transport says it cannot tell, and the bar renders indeterminate.
    store.setProgress(token, null);

    expect(store.viewFor('q-resume')).toMatchObject({ status: 'uploading', progress: null });
  });

  it('reports an untouched question as idle', () => {
    const { store } = connectedStore();

    expect(store.viewFor('q-never-touched')).toEqual(IDLE_UPLOAD);
  });
});

const stored = (fileId: string): UploadedFile => ({ fileId, name: 'f', size: 1, contentType: 'text/plain' });

/** A transport stub: each call takes the next scripted outcome; the last one repeats. */
function scriptedSend(...outcomes: Array<UploadedFile | Error>) {
  let calls = 0;
  const send = vi.fn<UploadSend>(() => {
    const outcome = outcomes[Math.min(calls++, outcomes.length - 1)];
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
  });
  return send;
}

/** A transport call that stays on the wire until the test settles it. */
function heldSend() {
  let settle: { resolve: (f: UploadedFile) => void; reject: (e: unknown) => void } | null = null;
  const send = vi.fn<UploadSend>(
    () => new Promise<UploadedFile>((resolve, reject) => (settle = { resolve, reject })),
  );
  return {
    send,
    resolve: (fileId: string) => settle?.resolve(stored(fileId)),
    reject: (err: unknown) => settle?.reject(err),
  };
}

/** Has `promise` settled yet? Reads it without waiting for it. */
async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => (done = true));
  await vi.advanceTimersByTimeAsync(0);
  return done;
}

const transient = (): UploadError => new UploadError('Upload failed. Check your connection and try again.', 'transient');

describe('FormUploadStore — whenSettled', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves at once when nothing is uploading', async () => {
    const { store } = connectedStore();

    expect(await isSettled(store.whenSettled())).toBe(true);
    expect(store.waiting()).toBe(false);
  });

  it('waits for an upload in flight, and is released by its success', async () => {
    const { store } = connectedStore();
    const token = store.begin('q-resume', fileNamed('resume.pdf'));

    const settled = store.whenSettled();
    expect(await isSettled(settled)).toBe(false);
    expect(store.waiting()).toBe(true);

    store.succeed(token, 'file-resume');

    expect(await isSettled(settled)).toBe(true);
    expect(store.waiting()).toBe(false);
  });

  it('is released by a failure', async () => {
    const { store } = connectedStore();
    const token = store.begin('q-resume', fileNamed('resume.pdf'));
    const settled = store.whenSettled();

    store.fail(token, { kind: 'refused', message: 'That file was not accepted. Choose a different file.' });

    expect(await isSettled(settled)).toBe(true);
    expect(store.waiting()).toBe(false);
  });

  it('is released by clearing the only uploading question', async () => {
    const { store } = connectedStore();
    store.begin('q-resume', fileNamed('resume.pdf'));
    const settled = store.whenSettled();

    store.clear('q-resume');

    expect(await isSettled(settled)).toBe(true);
    expect(store.waiting()).toBe(false);
  });

  it('waits only for the questions it was asked about', async () => {
    const { store } = connectedStore();
    store.begin('q-resume', fileNamed('resume.pdf'));
    const transcript = store.begin('q-transcript', fileNamed('transcript.pdf'));

    const settled = store.whenSettled(['q-transcript']);
    store.succeed(transcript, 'file-transcript');

    // The resume is still uploading, but that is another section's business.
    expect(await isSettled(settled)).toBe(true);
  });
});

describe('FormUploadStore — upload retries a bad moment by itself', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stores the file id when the first attempt lands', async () => {
    const { store, runtime } = connectedStore();
    const send = scriptedSend(stored('file-resume'));

    await store.upload('q-resume', fileNamed('resume.pdf'), send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', failure: null });
    expect(runtime.valueFor('q-resume')).toBe('file-resume');
  });

  it('routes the transport’s progress reports to the running upload', async () => {
    const { store } = connectedStore();
    const held = heldSend();

    void store.upload('q-resume', fileNamed('resume.pdf'), held.send);
    await vi.advanceTimersByTimeAsync(0);
    held.send.mock.calls[0][0](0.4);

    expect(store.viewFor('q-resume').progress).toBe(0.4);
  });

  it('retries a transient failure at 5 s, 15 s and 60 s — not before — then gives up as unsaved', async () => {
    const { store, runtime } = connectedStore();
    const send = scriptedSend(transient());

    void store.upload('q-resume', fileNamed('resume.pdf'), send);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);

    let calls = 1;
    for (const delay of UPLOAD_RETRY_DELAYS_MS) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(send).toHaveBeenCalledTimes(calls);
      // Still "uploading" between attempts, so a submit keeps waiting rather than judging.
      expect(store.viewFor('q-resume')).toMatchObject({ status: 'uploading', progress: null, failure: null });
      await vi.advanceTimersByTimeAsync(1);
      expect(send).toHaveBeenCalledTimes(++calls);
    }

    expect(send).toHaveBeenCalledTimes(4);
    expect(store.viewFor('q-resume')).toMatchObject({
      status: 'error',
      failure: { kind: 'unsaved', message: UPLOAD_UNSAVED_MESSAGE },
    });
    expect(store.viewFor('q-resume').file?.name).toBe('resume.pdf');
    expect(runtime.valueFor('q-resume')).toBeUndefined();

    // The cap is the cap: no fifth attempt, however long we wait.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('stores the file id when a retry lands', async () => {
    const { store, runtime } = connectedStore();
    const send = scriptedSend(transient(), stored('file-resume'));

    const running = store.upload('q-resume', fileNamed('resume.pdf'), send);
    await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAYS_MS[0]);
    await running;

    expect(send).toHaveBeenCalledTimes(2);
    expect(runtime.valueFor('q-resume')).toBe('file-resume');
  });

  it('does not retry a refused file, and shows the transport’s sentence', async () => {
    const { store } = connectedStore();
    const send = scriptedSend(new UploadError('That file is larger than the 10 MB limit.', 'refused'));

    await store.upload('q-resume', fileNamed('huge.pdf'), send);
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(store.viewFor('q-resume')).toMatchObject({
      status: 'error',
      failure: { kind: 'refused', message: 'That file is larger than the 10 MB limit.' },
    });
  });

  it('retries a plain Error, because a transport that does not classify must not lose the answer', async () => {
    const { store, runtime } = connectedStore();
    const send = scriptedSend(new Error('Upload failed: could not read server response.'), stored('file-resume'));

    const running = store.upload('q-resume', fileNamed('resume.pdf'), send);
    await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAYS_MS[0]);
    await running;

    expect(send).toHaveBeenCalledTimes(2);
    expect(runtime.valueFor('q-resume')).toBe('file-resume');
  });

  it('stops retrying once a newer upload has replaced this one', async () => {
    const { store } = connectedStore();
    const send = scriptedSend(transient());

    void store.upload('q-resume', fileNamed('draft.pdf'), send);
    await vi.advanceTimersByTimeAsync(0);
    store.begin('q-resume', fileNamed('final.pdf'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(store.viewFor('q-resume')).toMatchObject({ status: 'uploading', fileName: 'final.pdf' });
  });

  it('stops retrying once the question is cleared', async () => {
    const { store } = connectedStore();
    const send = scriptedSend(transient());

    void store.upload('q-resume', fileNamed('resume.pdf'), send);
    await vi.advanceTimersByTimeAsync(0);
    store.clear('q-resume');
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(store.viewFor('q-resume')).toEqual(IDLE_UPLOAD);
  });

  it('stops retrying on a reload, and releases whoever was waiting', async () => {
    const { store } = connectedStore();
    const send = scriptedSend(transient());

    void store.upload('q-resume', fileNamed('resume.pdf'), send);
    await vi.advanceTimersByTimeAsync(0);
    const settled = store.whenSettled();
    expect(await isSettled(settled)).toBe(false);

    // A reload mid-sleep: the sleeping retry belongs to a response that no longer exists.
    const reloaded = runtimeFor(uploadForm());
    store.connect(reloaded);

    expect(await isSettled(settled)).toBe(true);
    expect(store.waiting()).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.viewFor('q-resume')).toEqual(IDLE_UPLOAD);
    expect(reloaded.valueFor('q-resume')).toBeUndefined();
  });

  it('keeps a submit waiting through the retries, and releases it when they are spent', async () => {
    const { store } = connectedStore();
    const send = scriptedSend(transient());

    void store.upload('q-resume', fileNamed('resume.pdf'), send);
    const settled = store.whenSettled(['q-resume']);
    await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAYS_MS[0] + UPLOAD_RETRY_DELAYS_MS[1]);
    expect(await isSettled(settled)).toBe(false);

    await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAYS_MS[2]);

    expect(await isSettled(settled)).toBe(true);
    expect(store.failureAmong(['q-resume'])).toEqual({ kind: 'unsaved', message: UPLOAD_UNSAVED_MESSAGE });
  });
});

describe('FormUploadStore — restart and retryUnsaved', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Run `questionId`'s upload through every retry until it is `unsaved`. */
  async function spendRetries(store: FormUploadStore, questionId: string, send: UploadSend): Promise<void> {
    const running = store.upload(questionId, fileNamed(`${questionId}.pdf`), send);
    await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0));
    await running;
  }

  it('restarts an unsaved upload with the same file and transport, and stores the id', async () => {
    const { store, runtime } = connectedStore();
    const send = scriptedSend(transient(), transient(), transient(), transient(), stored('file-resume'));
    await spendRetries(store, 'q-resume', send);
    expect(store.viewFor('q-resume').failure?.kind).toBe('unsaved');

    await store.restart('q-resume');

    expect(send).toHaveBeenCalledTimes(5);
    expect(store.viewFor('q-resume')).toMatchObject({ status: 'done', failure: null, fileName: 'q-resume.pdf' });
    expect(runtime.valueFor('q-resume')).toBe('file-resume');
  });

  it('does nothing for a question with no upload to restart', async () => {
    const { store } = connectedStore();

    await store.restart('q-resume');

    expect(store.viewFor('q-resume')).toEqual(IDLE_UPLOAD);
  });

  it('restarts the unsaved questions it is given and leaves a refused one alone', async () => {
    const { store, runtime } = connectedStore();
    const resumeSend = scriptedSend(transient(), transient(), transient(), transient(), stored('file-resume'));
    await spendRetries(store, 'q-resume', resumeSend);
    const refusedSend = scriptedSend(new UploadError('That file was not accepted. Choose a different file.', 'refused'));
    await store.upload('q-transcript', fileNamed('huge.pdf'), refusedSend);

    store.retryUnsaved(['q-resume', 'q-transcript']);
    await store.whenSettled();

    expect(resumeSend).toHaveBeenCalledTimes(5);
    expect(refusedSend).toHaveBeenCalledTimes(1);
    expect(runtime.valueFor('q-resume')).toBe('file-resume');
    expect(store.viewFor('q-transcript').failure?.kind).toBe('refused');
  });

  it('only restarts the questions it is given', async () => {
    const { store } = connectedStore();
    const send = scriptedSend(transient());
    await spendRetries(store, 'q-resume', send);

    store.retryUnsaved(['q-transcript']);

    expect(send).toHaveBeenCalledTimes(4);
  });
});

describe('FormUploadStore — failureAmong', () => {
  it('reports the first failure among the listed questions', () => {
    const { store } = connectedStore();
    store.fail(store.begin('q-transcript', fileNamed('t.pdf')), { kind: 'refused', message: 'No.' });

    expect(store.failureAmong(['q-resume', 'q-transcript'])).toEqual({ kind: 'refused', message: 'No.' });
  });

  it('is null when none of the listed questions failed', () => {
    const { store } = connectedStore();
    store.fail(store.begin('q-transcript', fileNamed('t.pdf')), { kind: 'refused', message: 'No.' });
    store.begin('q-resume', fileNamed('r.pdf'));

    expect(store.failureAmong(['q-resume'])).toBeNull();
  });
});
