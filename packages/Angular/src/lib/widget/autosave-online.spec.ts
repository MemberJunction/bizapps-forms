/**
 * The widget's autosave comes back on its own when the browser regains the network (F5).
 *
 * Runs the real component against a fake window: the `online` listener is added when the form
 * loads, calls `AutosaveController.resume()` (a failed save is re-sent without waiting for the
 * respondent's next edit), and is removed on destroy.
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
});
