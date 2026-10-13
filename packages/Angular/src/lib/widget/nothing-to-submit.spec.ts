/**
 * The client half of #124, EXECUTED (#303 DW18 — replaces `nothing-to-submit.wiring.spec.ts`).
 *
 * The server refuses a final submit that would store nothing on a form that asked something. The
 * widget answers that without a round trip — every other validation rule here blocks or annotates
 * inline, and this one had respondents press Submit, wait, and read a banner. These run the real
 * component: where the gate sits in `onSubmit`, and how the banner it raises clears again.
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTCHA_NOT_CONFIGURED_MESSAGE, NOTHING_TO_SUBMIT_MESSAGE } from '@mj-biz-apps/forms-entities/contracts';

import { FakeFormsApi, mountForm, screeningForm, screeningServer, servedAs } from './testing/mj-form-harness';

const focusMoves: string[] = [];
// No renderer runs in this suite: `afterNextRender` callbacks are run straight away, and the banner
// they focus is recorded.
vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  afterNextRender: (callback: () => void) => {
    focusMoves.push('after-render');
    callback();
    return { destroy: () => undefined };
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  focusMoves.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('the widget refuses a submit that would store nothing (#124)', () => {
  it('sends nothing, stays exactly where it was, and says the shared sentence', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm()), screeningServer);
    const { form } = await mountForm({ api });
    const runtime = form.rt;

    await form.submit();

    expect(api.saves).toEqual([]);
    expect(form.phaseNow).toBe('ready');
    expect(form.rt).toBe(runtime);
    expect(form.bannerText).toBe(NOTHING_TO_SUBMIT_MESSAGE);
  });

  it('moves the respondent to the refusal instead of only rendering it', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm()), screeningServer);
    const { form } = await mountForm({ api });
    await form.submit();
    expect(focusMoves).toEqual(['after-render']);
  });

  it('refuses BEFORE the captcha gate, because this refusal costs the respondent nothing', async () => {
    // Captcha required and NO site key: the captcha gate would answer with its own sentence.
    const api = new FakeFormsApi(servedAs(screeningForm({ captcha: true })), screeningServer);
    const { form } = await mountForm({ api });
    await form.submit();
    expect(form.bannerText).toBe(NOTHING_TO_SUBMIT_MESSAGE);

    form.rt.setValue('name', 'Sam');
    await form.submit();
    expect(form.bannerText).toBe(CAPTCHA_NOT_CONFIGURED_MESSAGE);
    expect(api.savesOf('final')).toEqual([]);
  });

  it('clears the banner once the respondent answers — on a keystroke or on a commit', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm()), screeningServer);
    const { form } = await mountForm({ api });
    await form.submit();
    form.rt.setValue('name', 'S');
    form.progress();
    expect(form.bannerText).toBe('');

    form.rt.setValue('name', null);
    await form.submit();
    form.rt.setValue('name', 'Sam');
    form.commit();
    expect(form.bannerText).toBe('');
  });

  it('leaves any OTHER banner alone when the respondent types', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm({ captcha: true })), screeningServer);
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    await form.submit();
    form.rt.setValue('name', 'Sam B');
    form.progress();
    expect(form.bannerText).toBe(CAPTCHA_NOT_CONFIGURED_MESSAGE);
  });
});
