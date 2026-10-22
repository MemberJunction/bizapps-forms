import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedFormDefinition, PublishedFormQuestion } from '@mj-biz-apps/forms-entities/contracts';

import type { UploadedFile } from '../api/form-upload.interface';
import { FormRuntime } from './form-runtime';
import { StepJudge } from './settled-validation';
import { FormUploadStore, type UploadSend } from './upload-store';
import { fullForm } from './widget-form';

/** One optional Doodle on its own section, as in the live repro. */
function doodleForm(): PublishedFormDefinition {
  return {
    formId: 'f1', formVersionId: 'v1', name: 'Drawing', renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} }, automations: [],
    pages: [{ id: 'p1', displayOrder: 1, questions: [
      { id: 'q-doodle', type: 'Doodle', prompt: 'Draw', isRequired: false, displayOrder: 1, options: [] },
    ] }],
    endScreens: [],
  };
}

function connected(): { store: FormUploadStore; runtime: FormRuntime; questions: PublishedFormQuestion[] } {
  const runtime = new FormRuntime(fullForm(doodleForm()));
  const store = new FormUploadStore();
  store.connect(runtime);
  return { store, runtime, questions: runtime.visibleAnswerableQuestions() };
}

const drawing = (): File => new File(['png'], 'doodle.png', { type: 'image/png' });
const stored = (fileId: string): UploadedFile => ({ fileId, name: 'doodle.png', size: 3, contentType: 'image/png' });

function heldSend() {
  let settle: ((f: UploadedFile) => void) | null = null;
  const send = vi.fn<UploadSend>(() => new Promise<UploadedFile>((resolve) => (settle = resolve)));
  return { send, resolve: (fileId: string) => settle?.(stored(fileId)) };
}

async function peek<T>(promise: Promise<T>): Promise<{ done: false } | { done: true; value: T }> {
  let result: { done: false } | { done: true; value: T } = { done: false };
  void promise.then((value) => (result = { done: true, value }));
  await vi.advanceTimersByTimeAsync(0);
  return result;
}

describe('#333: a drawing still being exported holds Next until its upload lands', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a reserved question is pending: Next waits, the upload that follows supersedes the reservation, and Next resolves when it lands', async () => {
    const { store, runtime, questions } = connected();
    const judge = new StepJudge(store, () => 'p1');

    const reservation = store.reserve('q-doodle');
    expect(store.viewFor('q-doodle').status).toBe('uploading');
    expect(store.hasPendingAmong(['q-doodle'])).toBe(true);

    const verdict = judge.judge(runtime, questions);
    expect(await peek(verdict)).toEqual({ done: false });

    const { send, resolve } = heldSend();
    const upload = store.upload('q-doodle', drawing(), send);
    expect(await peek(verdict)).toEqual({ done: false });

    resolve('file-1');
    await upload;
    expect(await peek(verdict)).toEqual({ done: true, value: 'valid' });
    expect(runtime.valueFor('q-doodle')).toBe('file-1');
    // The reservation is gone, not merely covered: releasing it late must not undo the stored answer.
    store.release(reservation);
    expect(runtime.valueFor('q-doodle')).toBe('file-1');
    expect(store.viewFor('q-doodle').status).toBe('done');
  });

  it('releasing a reservation that produced no file settles Next and leaves the question idle', async () => {
    const { store, runtime, questions } = connected();
    const judge = new StepJudge(store, () => 'p1');

    const reservation = store.reserve('q-doodle');
    const verdict = judge.judge(runtime, questions);
    expect(await peek(verdict)).toEqual({ done: false });

    store.release(reservation);
    expect(await peek(verdict)).toEqual({ done: true, value: 'valid' });
    expect(store.viewFor('q-doodle').status).toBe('idle');
    expect(store.hasPendingAmong(['q-doodle'])).toBe(false);
  });

  it('a second reservation on the same question supersedes the first, so releasing the first changes nothing', () => {
    const { store } = connected();
    const first = store.reserve('q-doodle');
    store.reserve('q-doodle');
    store.release(first);
    expect(store.viewFor('q-doodle').status).toBe('uploading');
  });

  it('retryUnsaved and restart do not try to send a reservation, which has no transport call', async () => {
    const { store } = connected();
    store.reserve('q-doodle');
    store.retryUnsaved(['q-doodle']);
    await expect(store.restart('q-doodle')).resolves.toBeUndefined();
    expect(store.viewFor('q-doodle').status).toBe('uploading');
  });
});
