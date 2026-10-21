/**
 * #248: a submit while a doodle (or file) upload is still in flight sends the response WITHOUT
 * that answer, silently. The store commits `null` for the question at `begin()` and the file id
 * only at `succeed()`; nothing on the submit path waits for, or refuses on, an upload whose
 * status is `uploading`.
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';

import { FormUploadStore } from './core/upload-store';
import { FakeFormsApi, MjFormHarness, mountForm, screeningServer, servedAs } from './testing/mj-form-harness';

vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  afterNextRender: () => ({ destroy: () => undefined }),
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A name and a signature pad on one page. */
function consentForm(): PublishedFormDefinition {
  const question = (id: string, type: 'ShortText' | 'Doodle', order: number) => ({
    id, type, prompt: id, isRequired: false, displayOrder: order, options: [],
  });
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Consent',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    pages: [{ id: 'p1', displayOrder: 1, questions: [question('name', 'ShortText', 1), question('sig', 'Doodle', 2)] }],
    endScreens: [],
  };
}

/** The store the component's question children write through (provided by the harness injector). */
function storeOf(form: MjFormHarness): FormUploadStore {
  return (form as unknown as { uploads: FormUploadStore }).uploads;
}

describe('submit while an upload is in flight (#248)', () => {
  it('the final submit carries the signature the respondent drew just before tapping Submit', async () => {
    const api = new FakeFormsApi(servedAs(consentForm()), screeningServer);
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    const store = storeOf(form);

    // Pen-up: the pad exports a PNG and the question component starts the upload.
    const token = store.begin('sig', new File(['ink'], 'doodle.png', { type: 'image/png' }));
    // Submit straight away, while the POST is on the wire.
    const submitting = form.submit();
    await vi.advanceTimersByTimeAsync(0);
    // The upload finishes afterwards.
    store.succeed(token, 'file-sig');
    await submitting;

    expect(form.phaseNow).toBe('done');
    const final = api.savesOf('final');
    expect(final).toHaveLength(1);
    const sig = final[0].Answers.find((a) => a.QuestionID === 'sig');
    expect(sig?.FileID ?? sig?.TextValue ?? null).toBe('file-sig');
  });
});
