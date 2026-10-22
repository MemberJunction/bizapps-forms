import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';
import { UploadError, type UploadedFile } from './api/form-upload.interface';
import { UPLOAD_RETRY_DELAYS_MS, UPLOAD_UNSAVED_MESSAGE } from './core/upload-store';
import { FakeFormsApi, mountForm, screeningServer, servedAs } from './testing/mj-form-harness';

vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  afterNextRender: () => ({ destroy: () => undefined }),
}));

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
  vi.useRealTimers();
});

/** A form whose ONLY question is an optional signature pad. */
function signatureOnlyForm(): PublishedFormDefinition {
  return {
    formId: 'f1', formVersionId: 'v1', name: 'Sign', renderMode: 'OneQuestion',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} }, automations: [],
    pages: [{ id: 'p1', displayOrder: 1, questions: [
      { id: 'sig', type: 'Doodle', prompt: 'sig', isRequired: false, displayOrder: 1, options: [] },
    ] }],
    endScreens: [],
  };
}
const drawing = (): File => new File(['ink'], 'doodle.png', { type: 'image/png' });
const ALL_RETRIES_MS = UPLOAD_RETRY_DELAYS_MS.reduce((s, ms) => s + ms, 0);

describe('#328: the only answer is a file still uploading', () => {
  it('waits for the upload instead of refusing with "answer at least one question"', async () => {
    const api = new FakeFormsApi(servedAs(signatureOnlyForm()), screeningServer);
    const { form } = await mountForm({ api });
    const token = form.uploadStore.begin('sig', drawing());

    const submitting = form.submit();
    await vi.advanceTimersByTimeAsync(0);
    form.uploadStore.succeed(token, 'file-sig');
    await submitting;

    expect(form.bannerText).toBe('');
    expect(form.phaseNow).toBe('done');
    expect(api.savesOf('final')).toHaveLength(1);
    expect(api.savesOf('final')[0].Answers.find((a) => a.QuestionID === 'sig')?.FileID).toBe('file-sig');
  });

  it('restarts an unsaved upload instead of refusing with "answer at least one question"', async () => {
    const api = new FakeFormsApi(servedAs(signatureOnlyForm()), screeningServer);
    const { form } = await mountForm({ api });
    let online = false;
    const send = vi.fn((): Promise<UploadedFile> => online
      ? Promise.resolve({ fileId: 'file-sig', name: 'doodle.png', size: 3, contentType: 'image/png' })
      : Promise.reject(new UploadError('network', 'transient')));
    void form.uploadStore.upload('sig', drawing(), send);
    await vi.advanceTimersByTimeAsync(ALL_RETRIES_MS);
    expect(form.uploadStore.failureAmong(['sig'])?.message).toBe(UPLOAD_UNSAVED_MESSAGE);
    const before = send.mock.calls.length;

    online = true;
    await form.submit();

    expect(send).toHaveBeenCalledTimes(before + 1);
    expect(form.phaseNow).toBe('done');
    expect(api.savesOf('final')).toHaveLength(1);
  });
});
