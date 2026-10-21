/**
 * #248: a submit while a doodle (or file) upload is still in flight sent the response WITHOUT
 * that answer, silently. The store commits `null` for the question at `begin()` and the file id
 * only at `succeed()`, and nothing on the submit path waited for, or refused on, an upload whose
 * status was `uploading`.
 *
 * Now `onSubmit` waits for the visible questions' uploads, says "Saving your file…" while it does,
 * and refuses to send when one of them ended in a failure — restarting an `unsaved` one first.
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormsSaveResponseOutput } from '@mj-biz-apps/forms-entities';
import type { PublishedFormDefinition, PublishedFormQuestion } from '@mj-biz-apps/forms-entities/contracts';

import { UploadError, type UploadedFile } from './api/form-upload.interface';
import { uploadFailure } from './api/form-upload.service';
import { UPLOAD_RETRY_DELAYS_MS, UPLOAD_UNSAVED_MESSAGE } from './core/upload-store';
import { deferred, FakeFormsApi, mountForm, screeningServer, servedAs } from './testing/mj-form-harness';

vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  afterNextRender: () => ({ destroy: () => undefined }),
}));

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  // The store logs every failed attempt; these specs fail attempts on purpose.
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
  vi.useRealTimers();
});

/**
 * A name and a signature pad on one page. With `sigShownWhen`, the pad shows only while the name
 * equals that value. The name is what keeps the nothing-to-submit gate (which runs first) quiet.
 */
function consentForm(sigShownWhen?: string): PublishedFormDefinition {
  const question = (id: string, type: 'ShortText' | 'Doodle', order: number): PublishedFormQuestion => ({
    id, type, prompt: id, isRequired: false, displayOrder: order, options: [],
  });
  const sig = question('sig', 'Doodle', 2);
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Consent',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          question('name', 'ShortText', 1),
          sigShownWhen === undefined
            ? sig
            : { ...sig, conditionalRule: { show: { all: [{ questionId: 'name', op: 'equals', value: sigShownWhen }] } } },
        ],
      },
    ],
    endScreens: [],
  };
}

const drawing = (): File => new File(['ink'], 'doodle.png', { type: 'image/png' });

/** Every retry delay the store sleeps through before it gives up as `unsaved`. */
const ALL_RETRIES_MS = UPLOAD_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0);

/** The answer the final submit carried for `questionId`. */
function finalAnswer(api: FakeFormsApi, questionId: string): string | null {
  const answer = api.savesOf('final')[0]?.Answers.find((a) => a.QuestionID === questionId);
  return answer?.FileID ?? answer?.TextValue ?? null;
}

describe('submit while an upload is in flight (#248)', () => {
  it('the final submit carries the signature the respondent drew just before tapping Submit', async () => {
    const api = new FakeFormsApi(servedAs(consentForm()), screeningServer);
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    const store = form.uploadStore;

    // Pen-up: the pad exports a PNG and the question component starts the upload.
    const token = store.begin('sig', drawing());
    // Submit straight away, while the POST is on the wire.
    const submitting = form.submit();
    await vi.advanceTimersByTimeAsync(0);
    // Nothing goes out while the drawing is still on the wire.
    expect(api.savesOf('final')).toHaveLength(0);
    // The upload finishes afterwards.
    store.succeed(token, 'file-sig');
    await submitting;

    expect(form.phaseNow).toBe('done');
    expect(api.savesOf('final')).toHaveLength(1);
    expect(finalAnswer(api, 'sig')).toBe('file-sig');
  });

  it('says "saving your file" while it waits, then "sending" once the request is on the wire', async () => {
    const sent = deferred<FormsSaveResponseOutput>();
    const api = new FakeFormsApi(servedAs(consentForm()), () => sent.promise);
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    const token = form.uploadStore.begin('sig', drawing());
    expect(form.overlayNow).toBeNull();

    const submitting = form.submit();
    await vi.advanceTimersByTimeAsync(0);
    expect(form.overlayNow).toBe('saving-file');

    form.uploadStore.succeed(token, 'file-sig');
    await vi.advanceTimersByTimeAsync(0);
    expect(form.overlayNow).toBe('sending');

    sent.resolve(screeningServer(api.saves[api.saves.length - 1]));
    await submitting;
    expect(form.phaseNow).toBe('done');
    expect(form.overlayNow).toBeNull();
  });

  it('does not send when every retry of the upload failed, and says so in the banner', async () => {
    const api = new FakeFormsApi(servedAs(consentForm()), screeningServer);
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    const send = vi.fn((): Promise<UploadedFile> => Promise.reject(new UploadError('network', 'transient')));
    void form.uploadStore.upload('sig', drawing(), send);

    const submitting = form.submit();
    await vi.advanceTimersByTimeAsync(0);
    expect(form.overlayNow).toBe('saving-file');
    await vi.advanceTimersByTimeAsync(ALL_RETRIES_MS);
    await submitting;

    expect(send).toHaveBeenCalledTimes(UPLOAD_RETRY_DELAYS_MS.length + 1);
    expect(api.savesOf('final')).toHaveLength(0);
    expect(form.phaseNow).toBe('ready');
    expect(form.bannerText).toBe(UPLOAD_UNSAVED_MESSAGE);
    expect(form.overlayNow).toBeNull();
  });

  it('does not send when the server refused the file, says why, and does not upload it again', async () => {
    const api = new FakeFormsApi(servedAs(consentForm()), screeningServer);
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    const refused = uploadFailure(413, '');
    const send = vi.fn((): Promise<UploadedFile> => Promise.reject(refused));
    await form.uploadStore.upload('sig', drawing(), send);

    await form.submit();

    expect(send).toHaveBeenCalledTimes(1);
    expect(api.savesOf('final')).toHaveLength(0);
    expect(form.phaseNow).toBe('ready');
    expect(form.bannerText).toBe('That file was not accepted. Choose a different file.');
  });

  it('submit again restarts an unsaved upload, waits for it, and sends once it lands', async () => {
    const api = new FakeFormsApi(servedAs(consentForm()), screeningServer);
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    let online = false;
    const send = vi.fn(
      (): Promise<UploadedFile> =>
        online
          ? Promise.resolve({ fileId: 'file-sig', name: 'doodle.png', size: 3, contentType: 'image/png' })
          : Promise.reject(new UploadError('network', 'transient')),
    );
    void form.uploadStore.upload('sig', drawing(), send);
    const first = form.submit();
    await vi.advanceTimersByTimeAsync(ALL_RETRIES_MS);
    await first;
    expect(form.bannerText).toBe(UPLOAD_UNSAVED_MESSAGE);
    const attemptsBefore = send.mock.calls.length;

    online = true;
    await form.submit();

    expect(send).toHaveBeenCalledTimes(attemptsBefore + 1);
    expect(form.phaseNow).toBe('done');
    expect(api.savesOf('final')).toHaveLength(1);
    expect(finalAnswer(api, 'sig')).toBe('file-sig');
  });

  it('a failed upload on a question a rule has hidden does not block the submit', async () => {
    const api = new FakeFormsApi(servedAs(consentForm('show the pad')), screeningServer);
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'show the pad');
    const send = vi.fn((): Promise<UploadedFile> => Promise.reject(uploadFailure(413, '')));
    await form.uploadStore.upload('sig', drawing(), send);
    // The respondent changes the answer the pad depended on, so the pad (and its failure) goes away.
    form.rt.setValue('name', 'Sam');
    expect(form.rt.visibleAnswerableQuestions().map((q) => q.id)).toEqual(['name']);

    await form.submit();

    expect(form.phaseNow).toBe('done');
    expect(api.savesOf('final')).toHaveLength(1);
  });
});
