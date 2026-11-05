/**
 * A final submit that failed because the device was offline is sent again by itself when the
 * browser says the network is back.
 *
 * Found driving the upload race live (2026-11-04): the connection dropped mid-submit, the widget
 * showed "You appear to be offline … try again when you're connected", the connection returned, and
 * nothing happened until the respondent pressed Submit a second time. A respondent on a train who
 * already pressed Submit, saw the offline line, and put the phone away has a response that never
 * goes in. The autosave already resumed on `online`; the submit the respondent asked for did not.
 *
 * Two limits keep the promise honest: it is armed only when the browser itself reports offline (an
 * unreachable API on a connected device — DNS, CORS, a down host — fires no `online` event, so it
 * would be a promise nothing keeps), and an edit after the failure disarms it, because the
 * respondent is changing the answers they asked to send.
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_UNREACHABLE_MESSAGE, FormsApiUnreachableError } from './api/forms-api.interface';
import { SUBMIT_WHEN_ONLINE_MESSAGE } from './core/submit-progress';
import { FakeFormsApi, mountForm, screeningForm, screeningServer, servedAs, type MjFormHarness } from './testing/mj-form-harness';

vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  afterNextRender: () => ({ destroy: () => undefined }),
}));

let fakeWindow: EventTarget;
let online = true;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  fakeWindow = new EventTarget();
  vi.stubGlobal('window', fakeWindow);
  online = true;
  vi.stubGlobal('navigator', {
    userAgent: 'vitest',
    get onLine() {
      return online;
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A form whose final saves fail as unreachable until `reachable` is set. */
async function formWithFlakyNetwork(): Promise<{ form: MjFormHarness; api: FakeFormsApi; reach: () => void }> {
  let reachable = false;
  const api = new FakeFormsApi(servedAs(screeningForm()), (input) => {
    if (input.Mode === 'final' && !reachable) {
      throw new FormsApiUnreachableError('Failed to fetch');
    }
    return screeningServer(input);
  });
  const { form } = await mountForm({ api });
  form.rt.setValue('name', 'Sam');
  return { form, api, reach: () => (reachable = true) };
}

const backOnline = async (): Promise<void> => {
  online = true;
  fakeWindow.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(0);
};

describe('a submit that failed offline is sent when the network returns', () => {
  it('says it will send, and sends once the browser is back online', async () => {
    const { form, api, reach } = await formWithFlakyNetwork();
    online = false;

    await form.submit();
    expect(form.phaseNow).toBe('ready');
    expect(form.bannerText).toBe(SUBMIT_WHEN_ONLINE_MESSAGE);
    expect(api.savesOf('final')).toHaveLength(1);

    reach();
    await backOnline();

    expect(api.savesOf('final')).toHaveLength(2);
    expect(form.phaseNow).toBe('done');
  });

  it('sends only once, however many online events arrive', async () => {
    const { form, api, reach } = await formWithFlakyNetwork();
    online = false;
    await form.submit();

    reach();
    await backOnline();
    await backOnline();

    expect(api.savesOf('final')).toHaveLength(2);
    expect(form.phaseNow).toBe('done');
  });

  it('does not send by itself once the respondent edits after the failure, and says to try again', async () => {
    const { form, api, reach } = await formWithFlakyNetwork();
    online = false;
    await form.submit();

    form.rt.setValue('name', 'Samantha');
    form.progress();
    expect(form.bannerText).toBe(API_UNREACHABLE_MESSAGE);

    reach();
    await backOnline();

    expect(api.savesOf('final')).toHaveLength(1);
    expect(form.phaseNow).toBe('ready');
  });

  it('does not promise to send when the browser says it is online (DNS, CORS, a host that is down)', async () => {
    const { form, api, reach } = await formWithFlakyNetwork();
    online = true;

    await form.submit();
    expect(form.bannerText).toBe(API_UNREACHABLE_MESSAGE);

    reach();
    await backOnline();

    expect(api.savesOf('final')).toHaveLength(1);
  });

  it('a manual Submit that fails for another reason replaces the waiting one', async () => {
    let attempt = 0;
    const api = new FakeFormsApi(servedAs(screeningForm()), (input) => {
      if (input.Mode !== 'final') {
        return screeningServer(input);
      }
      attempt++;
      throw attempt === 1 ? new FormsApiUnreachableError('Failed to fetch') : new Error('The server said no.');
    });
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    online = false;
    await form.submit();
    online = true;
    await form.submit();
    expect(form.bannerText).toBe('The server said no.');

    await backOnline();

    expect(api.savesOf('final')).toHaveLength(2);
  });

  it('does nothing on an online event when no submit is waiting', async () => {
    const { form, api } = await formWithFlakyNetwork();

    await backOnline();

    expect(api.savesOf('final')).toHaveLength(0);
    expect(form.phaseNow).toBe('ready');
  });
});
