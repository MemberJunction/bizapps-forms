/**
 * The autosave's honesty, EXECUTED (#271, #303 Task 8 fix round 4; DW18 — replaces
 * `autosave-refusal.wiring.spec.ts`).
 *
 * A server-REFUSED autosave (the autosave rate-limit bucket, a draft ceiling) must never look like a
 * saved one, and a HELD draft — an unstorable answer a rule may read — must send nothing at all. Both
 * used to be pinned by reading `savePartial()`'s source; these run it, through the real
 * `AutosaveController`, against a fake `Forms.SaveResponse`.
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseNotSavedError } from './api/forms-api.interface';
import { FakeFormsApi, mountForm, refusal, screeningForm, screeningServer, servedAs } from './testing/mj-form-harness';

vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  afterNextRender: () => ({ destroy: () => undefined }),
}));

const DEBOUNCE_MS = 1500;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a refused autosave is an error, not a save (#271)', () => {
  it('a refused CALL leaves its reason in the console, not just the fixed sentence', async () => {
    const reason = 'Forms.SaveResponse (partial) for response r was refused (EXECUTION_ERROR): draft ceiling';
    const api = new FakeFormsApi(servedAs(screeningForm()), () => {
      throw new ResponseNotSavedError(reason);
    });
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(form.autosaveNow).toBe('error');
    const lines = vi.mocked(console.warn).mock.calls.map((call) => call.map(String).join(' '));
    expect(lines.some((line) => line.includes(reason))).toBe(true);
  });

  it('records `error`, never `saved`, and announces no draft', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm()), () => refusal('You have saved too often.'));
    const { form, host } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(api.savesOf('partial')).toHaveLength(1);
    expect(form.autosaveNow).toBe('error');
    expect(host.events.map((e) => e.name)).not.toContain('mjf-partial-saved');
  });

  it('an accepted save says `saved`, threads the response id, and announces the draft ONCE', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm()), screeningServer);
    const { form, host } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    form.rt.setValue('name', 'Sam B');
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(form.autosaveNow).toBe('saved');
    const announced = host.events.filter((e) => e.name === 'mjf-partial-saved');
    expect(announced).toEqual([{ name: 'mjf-partial-saved', detail: { responseId: api.saves[0].ClientResponseID, sessionId: 'session-1' } }]);
    expect(api.saves.every((s) => s.Mode === 'partial' && s.ClientResponseID === api.saves[0].ClientResponseID)).toBe(true);
  });

  it('an autosave carries no captcha token — the token is single-use and only a final may spend it', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm({ captcha: true })), screeningServer);
    const { form } = await mountForm({ api, turnstileSiteKey: '0x4AAAA_site' });
    form.solveCaptcha('tok-1');
    form.rt.setValue('name', 'Sam');
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(api.savesOf('partial')[0].TurnstileToken).toBeUndefined();
  });
});

describe('an autosave with nothing new sends nothing (fix round 1)', () => {
  it('an edit undone before the debounce fires posts no empty partial and claims no save', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm()), screeningServer);
    const { form, host } = await mountForm({ api });
    form.rt.setValue('name', 'S');
    form.progress();
    form.rt.setValue('name', null);
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(api.saves).toEqual([]);
    expect(form.autosaveNow).toBe('idle');
    expect(host.events.map((e) => e.name)).not.toContain('mjf-partial-saved');
  });
});

describe('a held autosave sends nothing and is not reported as saved (fix round 4)', () => {
  it('on the live projection, an unstorable answer holds the draft: no request, status `error`', async () => {
    // Every field counts as rule-read on the projection (`rulesMayRead`, kind `projection`), because
    // the server's knockout, score and automation rules were removed from it.
    const api = new FakeFormsApi(servedAs(screeningForm()), screeningServer);
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    form.rt.setValue('age', 3.14159); // decimal(18,4) cannot store it
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(api.saves).toEqual([]);
    expect(form.autosaveNow).toBe('error');
  });

  it('once the answer is fixed, the next save sends everything', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm()), screeningServer);
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');
    form.rt.setValue('age', 3.14159);
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    form.rt.setValue('age', 30);
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(api.saves.map((s) => s.Answers.map((a) => a.QuestionID))).toEqual([['age', 'name']]);
    expect(form.autosaveNow).toBe('saved');
  });
});

describe('a checkpoint banks the draft at once, not on the debounce', () => {
  it('answering past a partial-submit page saves immediately, once', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm()), screeningServer);
    const { form } = await mountForm({ api });
    form.rt.setValue('age', 30);
    form.rt.setValue('comment', 'later page');
    form.progress();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.savesOf('partial')).toHaveLength(1);

    form.rt.setValue('comment', 'later page, edited');
    form.progress();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.savesOf('partial')).toHaveLength(1); // banked once; the edit waits for the debounce
  });
});
