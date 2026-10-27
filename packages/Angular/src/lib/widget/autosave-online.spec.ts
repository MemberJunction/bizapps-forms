/**
 * The widget's autosave comes back on its own when the browser regains the network (F5).
 *
 * Runs the real component against a fake window: the `online` listener is added when the form
 * loads, calls `AutosaveController.resume()` (a failed save is re-sent without waiting for the
 * respondent's next edit), and is removed on destroy.
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublishedFormDefinition, PublishedFormQuestion } from '@mj-biz-apps/forms-entities/contracts';

import type { UploadedFile } from './api/form-upload.interface';
import { UPLOAD_RETRY_DELAYS_MS } from './core/upload-store';
import { FakeFormsApi, mountForm, screeningForm, screeningServer, servedAs } from './testing/mj-form-harness';

vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  afterNextRender: () => ({ destroy: () => undefined }),
}));

const DEBOUNCE_MS = 1500;
let fakeWindow: EventTarget;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  fakeWindow = new EventTarget();
  vi.stubGlobal('window', fakeWindow);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the online event resumes a failed autosave', () => {
  it('adds one listener on load and removes it on destroy', async () => {
    const add = vi.spyOn(fakeWindow, 'addEventListener');
    const remove = vi.spyOn(fakeWindow, 'removeEventListener');
    const { form } = await mountForm({ api: new FakeFormsApi(servedAs(screeningForm()), screeningServer) });

    expect(add.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1);
    const listener = add.mock.calls.find(([type]) => type === 'online')?.[1];
    form.ngOnDestroy();
    expect(remove).toHaveBeenCalledWith('online', listener);
  });

  it('re-sends the failed save the moment the network returns', async () => {
    let offline = true;
    const api = new FakeFormsApi(servedAs(screeningForm()), (input) => {
      if (offline) {
        throw new Error('Failed to fetch');
      }
      return screeningServer(input);
    });
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(form.autosaveNow).toBe('error');
    expect(api.savesOf('partial')).toHaveLength(1);

    offline = false;
    fakeWindow.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);

    expect(api.savesOf('partial')).toHaveLength(2);
    expect(form.autosaveNow).toBe('saved');
  });

  it('still resumes after an offline Submit failed and handed the form back', async () => {
    let offline = true;
    const api = new FakeFormsApi(servedAs(screeningForm()), (input) => {
      if (offline) {
        throw new Error('Failed to fetch');
      }
      return screeningServer(input);
    });
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(form.autosaveNow).toBe('error');

    await form.submit();
    expect(form.phaseNow).toBe('ready');
    const partialsBefore = api.savesOf('partial').length;

    offline = false;
    fakeWindow.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);

    expect(api.savesOf('partial')).toHaveLength(partialsBefore + 1);
    expect(form.autosaveNow).toBe('saved');
  });

  it('an upload retried during an offline Submit never reports a save it did not send', async () => {
    let offline = true;
    const api = new FakeFormsApi(servedAs(nameAndSignatureForm()), (input) => {
      if (offline) {
        throw new Error('Failed to fetch');
      }
      return screeningServer(input);
    });
    const { form } = await mountForm({ api });
    // The drawing never reaches the server: every attempt fails, so the upload ends `unsaved`.
    const send = (): Promise<UploadedFile> => Promise.reject(new Error('Failed to fetch'));
    void form.uploadStore.upload('sig', new File(['ink'], 'doodle.png', { type: 'image/png' }), send);
    await vi.advanceTimersByTimeAsync(ALL_UPLOAD_RETRIES_MS);
    form.rt.setValue('name', 'Sam');
    form.progress();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(form.autosaveNow).toBe('error');

    // Submit restarts the `unsaved` upload; its start and its failure each commit the answer.
    const seen = new Set<string>();
    const submitting = form.submit();
    for (let waited = 0; waited < SETTLE_MS; waited += 100) {
      await vi.advanceTimersByTimeAsync(100);
      seen.add(form.autosaveNow);
    }
    await submitting;

    expect(form.phaseNow).toBe('ready');
    // Not 'saved' for a save that was never sent, and not 'pending' either: nothing was armed.
    expect([...seen]).toEqual(['error']);
    expect(form.autosaveNow).toBe('error');
    const partialsBefore = api.savesOf('partial').length;

    offline = false;
    fakeWindow.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);

    expect(api.savesOf('partial')).toHaveLength(partialsBefore + 1);
    expect(form.autosaveNow).toBe('saved');
  });
});

/** Every retry delay the upload store sleeps through before it gives up as `unsaved`. */
const ALL_UPLOAD_RETRIES_MS = UPLOAD_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0);
/** Long enough for an upload's whole retry schedule AND the autosave debounce behind it. */
const SETTLE_MS = ALL_UPLOAD_RETRIES_MS + DEBOUNCE_MS * 2;

/** A name and a signature pad on one page. */
function nameAndSignatureForm(): PublishedFormDefinition {
  const question = (id: string, type: 'ShortText' | 'Doodle', order: number): PublishedFormQuestion => ({
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
