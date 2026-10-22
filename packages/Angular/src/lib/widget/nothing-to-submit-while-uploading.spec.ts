import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTHING_TO_SUBMIT_MESSAGE, type PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';
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

describe('#328: the nothing-to-submit refusal and the uploads behind it', () => {
  it.each([['commit', (f: { commit(): void }) => f.commit()], ['progress', (f: { progress(): void }) => f.progress()]] as const)(
    'clears the refusal once an upload begins (%s)',
    async (_name, fire) => {
      const api = new FakeFormsApi(servedAs(signatureOnlyForm()), screeningServer);
      const { form } = await mountForm({ api });
      await form.submit();
      expect(form.bannerText).toBe(NOTHING_TO_SUBMIT_MESSAGE);

      form.uploadStore.begin('sig', drawing());
      fire(form as never);

      expect(form.bannerText).toBe('');
    },
  );

  it('still refuses a blank form with no upload at all', async () => {
    const api = new FakeFormsApi(servedAs(signatureOnlyForm()), screeningServer);
    const { form } = await mountForm({ api });
    await form.submit();
    expect(form.bannerText).toBe(NOTHING_TO_SUBMIT_MESSAGE);
    expect(api.savesOf('final')).toHaveLength(0);
  });

  it('a refused upload is still refused with its own message', async () => {
    const api = new FakeFormsApi(servedAs(signatureOnlyForm()), screeningServer);
    const { form } = await mountForm({ api });
    const token = form.uploadStore.begin('sig', drawing());
    form.uploadStore.fail(token, { kind: 'refused', message: 'That file type is not allowed.' });

    await form.submit();

    expect(form.bannerText).toBe('That file type is not allowed.');
    expect(form.phaseNow).toBe('ready');
    expect(api.savesOf('final')).toHaveLength(0);
  });

  it('clears the refused-upload sentence once a new upload is on its way', async () => {
    const api = new FakeFormsApi(servedAs(signatureOnlyForm()), screeningServer);
    const { form } = await mountForm({ api });
    const token = form.uploadStore.begin('sig', drawing());
    form.uploadStore.fail(token, { kind: 'refused', message: 'That file type is not allowed.' });
    await form.submit();
    expect(form.bannerText).toBe('That file type is not allowed.');

    form.uploadStore.begin('sig', drawing());
    form.commit();

    expect(form.bannerText).toBe('');
  });

  it('keeps the refused-upload sentence while nothing is on its way', async () => {
    const api = new FakeFormsApi(servedAs(signatureOnlyForm()), screeningServer);
    const { form } = await mountForm({ api });
    const token = form.uploadStore.begin('sig', drawing());
    form.uploadStore.fail(token, { kind: 'refused', message: 'That file type is not allowed.' });
    await form.submit();

    form.progress();

    expect(form.bannerText).toBe('That file type is not allowed.');
  });
});

/** The signature pad beside an optional text question. */
function signatureAndNameForm(): PublishedFormDefinition {
  const form = signatureOnlyForm();
  return {
    ...form,
    pages: [{ ...form.pages[0], questions: [
      ...form.pages[0].questions,
      { id: 'name', type: 'ShortText', prompt: 'name', isRequired: false, displayOrder: 2, options: [] },
    ] }],
  };
}

describe('#328 cross-review: an upload failure in the banner clears only once the failure is gone', () => {
  it('keeps the refused sentence when another question is answered but the refused upload still stands', async () => {
    const api = new FakeFormsApi(servedAs(signatureAndNameForm()), screeningServer);
    const { form } = await mountForm({ api });
    const token = form.uploadStore.begin('sig', drawing());
    form.uploadStore.fail(token, { kind: 'refused', message: 'That file type is not allowed.' });
    await form.submit();
    expect(form.bannerText).toBe('That file type is not allowed.');

    form.rt.setValue('name', 'Sam');
    form.progress();

    expect(form.bannerText).toBe('That file type is not allowed.');
  });

  it('clears a refusal raised by the upload wait once a new upload begins', async () => {
    const api = new FakeFormsApi(servedAs(signatureOnlyForm()), screeningServer);
    const { form } = await mountForm({ api });
    const token = form.uploadStore.begin('sig', drawing());
    const submitting = form.submit();
    await vi.advanceTimersByTimeAsync(0);
    form.uploadStore.fail(token, { kind: 'refused', message: 'That file type is not allowed.' });
    await submitting;
    expect(form.bannerText).toBe('That file type is not allowed.');
    expect(form.phaseNow).toBe('ready');

    form.uploadStore.begin('sig', drawing());
    form.commit();

    expect(form.bannerText).toBe('');
  });
});
