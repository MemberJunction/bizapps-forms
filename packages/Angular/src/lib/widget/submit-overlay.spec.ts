/**
 * What a submit in flight does to the form, EXECUTED (#303 DW18 — the executable half of
 * `submit-overlay.wiring.spec.ts`; the markup half moved to `mj-form-template.wiring.spec.ts`).
 *
 * The sending state is an OVERLAY on a still-mounted form, never a phase that replaces it: a failed
 * submit must put the respondent back in front of the SAME form — same runtime, same answers — or a
 * network blip on question twenty means filling the form in again. The template keeps the children
 * mounted (pinned there); this pins that the component never rebuilds what they render from.
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormsSaveResponseOutput } from '@mj-biz-apps/forms-entities';

import { ResponseNotSavedError, RESPONSE_NOT_SAVED_MESSAGE } from './api/forms-api.interface';
import { deferred, FakeFormsApi, mountForm, refusal, screeningForm, screeningServer, servedAs } from './testing/mj-form-harness';

vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  afterNextRender: () => ({ destroy: () => undefined }),
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the form survives its own submit', () => {
  it('is `submitting` while the request is on the wire, with the same runtime underneath', async () => {
    const sent = deferred<FormsSaveResponseOutput>();
    const api = new FakeFormsApi(servedAs(screeningForm()), () => sent.promise);
    const { form } = await mountForm({ api });
    const runtime = form.rt;
    form.rt.setValue('name', 'Sam');

    const submitting = form.submit();
    await vi.advanceTimersByTimeAsync(0);
    expect(form.phaseNow).toBe('submitting');
    expect(form.rt).toBe(runtime);

    sent.resolve(screeningServer(api.saves[0]));
    await submitting;
    expect(form.phaseNow).toBe('done');
  });

  it('a call the server refuses returns the respondent to the same form, answers intact, with the fixed sentence', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm()), () => {
      throw new ResponseNotSavedError('Forms.SaveResponse (final) for response r was refused (FORBIDDEN): not your link');
    });
    const { form } = await mountForm({ api });
    const runtime = form.rt;
    form.rt.setValue('name', 'Sam');

    await form.submit();

    expect(form.phaseNow).toBe('ready');
    expect(form.rt).toBe(runtime);
    expect(form.rt.valueFor('name')).toBe('Sam');
    expect(form.bannerText).toBe(RESPONSE_NOT_SAVED_MESSAGE);
  });

  it('a call the server refuses leaves its reason in the console — the banner\'s fixed sentence names no cause', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = new FakeFormsApi(servedAs(screeningForm()), () => {
      throw new ResponseNotSavedError('Forms.SaveResponse (final) for response r was refused (FORBIDDEN): not your link');
    });
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');

    await form.submit();

    expect(warn.mock.calls.map((call) => call.join(' ')).some((line) => line.includes('Forms.SaveResponse (final) for response r was refused (FORBIDDEN): not your link'))).toBe(true);
    warn.mockRestore();
  });

  it('a refusal RESULT puts each message under the question it names, and in the banner with its prompt', async () => {
    // The server's required refusal no longer names the question in its text, so the banner alone
    // would say "This question is required." about nothing in particular.
    const api = new FakeFormsApi(servedAs(screeningForm()), () => ({
      ...refusal('This question is required.', 'age'),
      Errors: [
        { QuestionID: 'age', Message: 'This question is required.' },
        { QuestionID: null, Message: 'Captcha verification failed (timeout-or-duplicate).' },
      ],
    }));
    const { form } = await mountForm({ api });
    form.rt.setValue('name', 'Sam');

    await form.submit();

    const age = form.rt.visibleAnswerableQuestions().find((q) => q.id === 'age');
    expect(age && form.rt.visibleErrorFor(age)).toBe('This question is required.');
    expect(form.bannerText).toBe('Your age: This question is required. Captcha verification failed (timeout-or-duplicate).');
    expect(form.phaseNow).toBe('ready');

    // The respondent's edit is what the refusal asked for; it clears with it.
    form.rt.setValue('age', 30);
    expect(age && form.rt.visibleErrorFor(age)).toBeNull();
  });

  it('a success shows the ending the server chose, its image resolved against this widget\'s API', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm()), screeningServer);
    const { form, host } = await mountForm({ api, graphqlUrl: 'https://h/api/graphql' });
    form.rt.setValue('age', 30);
    await form.submit();

    expect(form.endingShown).toBe('thanks');
    expect(form.endingMedia).toBe('https://h/api/forms/asset/a1137587-b23a-4f0d-9049-efc0bdcfc59a');
    expect(host.events.map((e) => e.name)).toContain('mjf-submitted');
  });

  it('a success with no ending screen shows the server\'s confirmation copy', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm()), (input) => ({
      Success: true,
      ResponseID: input.ClientResponseID,
      Status: 'Complete',
      Outcome: 'ended',
      ConfirmationMessage: 'All done, thank you.',
      Errors: [],
    }));
    const { form } = await mountForm({ api });
    form.rt.setValue('age', 30);
    await form.submit();
    expect(form.endingShown).toBeUndefined();
    expect(form.confirmation).toBe('All done, thank you.');
  });
});
