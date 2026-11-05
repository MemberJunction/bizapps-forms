/**
 * The knockout path, EXECUTED (#303 DW8, DW18 — replaces `disqualification.wiring.spec.ts`).
 *
 * The live widget no longer judges a knockout: the respondent projection it is served has none
 * (#302). The server judges every save, and a partial save whose answers trip one comes back
 * `Outcome: 'ended'` with the knockout screen — WITHOUT sealing the row, because an autosave carries
 * half-typed values and a seal is permanent. So the widget's job is now:
 *
 *  - act on `ended` only for a save of the respondent's COMMITTED answers (blur / advance), never a
 *    keystroke autosave of half-typed ones (`1` on its way to `18`);
 *  - then seal it — ONE final submit, awaited, before the form leaves intake and before any redirect —
 *    and show the screen the server chose;
 *  - and never lose a knockout because one save was refused for something else.
 *
 * These specs run the real component against a fake `Forms.SaveResponse` that answers as the server's
 * engine does for a form with an `age < 18` knockout.
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormsSaveResponseInput, FormsSaveResponseOutput } from '@mj-biz-apps/forms-entities';
import { SCREENED_OUT_MESSAGE } from '@mj-biz-apps/forms-entities/contracts';

import { ResponseNotSavedError, SessionExpiredError } from './api/forms-api.interface';
import {
  deferred,
  FakeFormsApi,
  KO_ENDING,
  mountForm,
  refusal,
  screeningForm,
  type Responder,
  screeningServer,
  servedAs,
} from './testing/mj-form-harness';

// No renderer runs in this suite, so `afterNextRender` (focus moves) is recorded, not scheduled.
vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  afterNextRender: () => ({ destroy: () => undefined }),
}));

/** The autosave debounce (`AutosaveController`'s default). */
const DEBOUNCE_MS = 1500;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Let every queued promise continuation run (and any timer due now). */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

async function liveScreening(respond: Responder = screeningServer) {
  const api = new FakeFormsApi(servedAs(screeningForm()), respond);
  const { form, host } = await mountForm({ api });
  return { api, form, host };
}

describe('a knockout whose seal is refused as a call', () => {
  it('logs the server\'s reason, not just the fixed sentence', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reason = 'Forms.SaveResponse (final) for response r was refused (FORBIDDEN): not your link';
    const { form } = await liveScreening((input) => {
      if (input.Mode === 'final') {
        throw new ResponseNotSavedError(reason);
      }
      return screeningServer(input);
    });
    form.rt.setValue('age', 16);
    form.commit();
    await settle();

    expect(warn.mock.calls.map((call) => call.join(' ')).some((line) => line.includes(reason))).toBe(true);
    warn.mockRestore();
  });
});

describe('a knockout is judged on a finished answer, never a half-typed one', () => {
  it('ignores `ended` from a keystroke autosave — the respondent is still typing', async () => {
    const { api, form } = await liveScreening();
    form.rt.setValue('age', 1); // on its way to 18
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(api.savesOf('partial')).toHaveLength(1);
    expect(api.savesOf('final')).toHaveLength(0);
    expect(form.phaseNow).toBe('ready');
  });

  it('ends the form when the save of the COMMITTED answers comes back ended, and seals it with one final', async () => {
    const { api, form } = await liveScreening();
    form.rt.setValue('age', 16);
    form.commit();
    await settle();

    expect(api.saves.map((s) => s.Mode)).toEqual(['partial', 'final']);
    expect(form.phaseNow).toBe('done');
    expect(form.endingShown).toBe('ko');
    // The result shown is the SEAL's: the row the server sealed as Disqualified.
    expect(form.resultNow?.Status).toBe('Disqualified');
    expect(form.isScreenedOut).toBe(true);
  });

  it('acts on a keystroke save\'s verdict once those same answers are committed, without re-sending them', async () => {
    const { api, form } = await liveScreening();
    form.rt.setValue('age', 16);
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); // keystroke save: ended, ignored
    expect(form.phaseNow).toBe('ready');

    form.commit(); // the respondent leaves the field: those answers are now finished
    await settle();

    expect(api.saves.map((s) => s.Mode)).toEqual(['partial', 'final']);
    expect(form.phaseNow).toBe('done');
  });

  it('does not act on a verdict for answers edited after the commit (a save in flight carried the newer ones)', async () => {
    const held = deferred<FormsSaveResponseOutput>();
    let calls = 0;
    const { api, form } = await liveScreening((input) => (++calls === 1 ? held.promise : screeningServer(input)));
    // A save is already on the wire when the respondent commits age 30...
    form.rt.setValue('age', 30);
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    form.commit();
    // ...and, before it lands, they type a half-typed `1` into the same field.
    form.rt.setValue('age', 1);
    held.resolve(screeningServer(api.saves[0]));
    await settle();

    // The commit's save carried `1`, not the committed 30, so its `ended` is not a verdict on finished answers.
    expect(api.savesOf('partial').map((s) => s.Answers.find((a) => a.QuestionID === 'age')?.NumericValue)).toEqual([30, 1]);
    expect(api.savesOf('final')).toHaveLength(0);
    expect(form.phaseNow).toBe('ready');
  });

  it('commits from a blur that changed nothing reuse the last verdict, so tabbing through sends nothing', async () => {
    const { api, form } = await liveScreening();
    form.rt.setValue('age', 30);
    form.commit();
    await settle();
    form.commit();
    form.commit();
    await settle();
    expect(api.savesOf('partial')).toHaveLength(1);
    expect(form.phaseNow).toBe('ready');
  });
});

describe('a commit sends a save only when there is something new for the server to judge (fix round 1)', () => {
  it('a blur on an untouched field sends nothing and announces no draft', async () => {
    // The reviewer's reproduction: focus the first field, tab away. Before the fix this wrote an empty
    // Partial row (counting against the per-version draft ceiling) and minted a device invite.
    const { api, form, host } = await liveScreening();
    form.commit();
    await settle();
    expect(api.saves).toEqual([]);
    expect(host.events.map((e) => e.name)).not.toContain('mjf-partial-saved');
  });

  it('a real first edit, committed, still saves and announces the draft', async () => {
    const { api, form, host } = await liveScreening();
    form.rt.setValue('name', 'Sam');
    form.commit();
    await settle();
    expect(api.savesOf('partial')).toHaveLength(1);
    expect(host.events.map((e) => e.name)).toContain('mjf-partial-saved');
  });

  it('once a save has landed, clearing every answer is a change and is saved', async () => {
    const { api, form } = await liveScreening();
    form.rt.setValue('name', 'Sam');
    form.commit();
    await settle();
    form.rt.setValue('name', null);
    form.commit();
    await settle();
    expect(api.savesOf('partial').map((s) => s.Answers.length)).toEqual([1, 0]);
  });

  it('after a save already ended the form, no further partial is sent (Minor 3)', async () => {
    const held = deferred<FormsSaveResponseOutput>();
    let calls = 0;
    const { api, form } = await liveScreening((input) => (++calls === 1 ? held.promise : screeningServer(input)));
    form.rt.setValue('age', 16);
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); // a save of these answers is on the wire
    form.commit(); // the respondent commits the same answers while it is in flight
    held.resolve(screeningServer(api.saves[0]));
    await settle();
    expect(api.saves.map((s) => s.Mode)).toEqual(['partial', 'final']);
    expect(form.phaseNow).toBe('done');
  });
});

describe('a knockout is not silently skipped when one save is refused for another reason', () => {
  it('retries the committed answers on the autosave backoff, and ends when a retry lands', async () => {
    let calls = 0;
    const { api, form } = await liveScreening((input) =>
      ++calls === 1 ? refusal('You have saved too often. Please wait 30 seconds and try again.') : screeningServer(input),
    );
    form.rt.setValue('age', 16);
    form.commit();
    await settle();
    expect(form.phaseNow).toBe('ready');
    expect(form.autosaveNow).toBe('error');

    await vi.advanceTimersByTimeAsync(5_000); // the first backoff retry
    expect(api.saves.map((s) => s.Mode)).toEqual(['partial', 'partial', 'final']);
    expect(form.phaseNow).toBe('done');
    expect(form.endingShown).toBe('ko');
  });
});

describe('a commit whose save never lands says so (fix round 1, Minor 4)', () => {
  it('shows the "couldn\'t be saved" notice once every retry is spent, and clears it when a save lands', async () => {
    let refusing = true;
    const { form } = await liveScreening((input) => (refusing ? refusal('The draft limit for this form has been reached.') : screeningServer(input)));
    form.rt.setValue('name', 'Sam');
    form.commit();
    await settle();
    await vi.advanceTimersByTimeAsync(5_000 + 15_000);
    expect(form.saveNoticeShown).toBe(false); // retries remain
    await vi.advanceTimersByTimeAsync(60_000);
    expect(form.saveNoticeShown).toBe(true);
    expect(form.phaseNow).toBe('ready'); // the respondent keeps going

    refusing = false;
    form.rt.setValue('name', 'Sam B');
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(form.saveNoticeShown).toBe(false);
  });

  it('the final submit still enforces the knockout the refused saves never delivered', async () => {
    const { api, form } = await liveScreening((input) => (input.Mode === 'partial' ? refusal('The draft limit for this form has been reached.') : screeningServer(input)));
    form.rt.setValue('age', 16);
    form.commit();
    await vi.advanceTimersByTimeAsync(80_000);
    expect(form.saveNoticeShown).toBe(true);
    await form.submit();
    expect(api.savesOf('final')).toHaveLength(1);
    expect(form.endingShown).toBe('ko');
    expect(form.isScreenedOut).toBe(true);
  });
});

describe('the seal', () => {
  it('announces a successful seal once, so the host can clear its resume pointer', async () => {
    const { api, form, host } = await liveScreening();
    form.rt.setValue('age', 16);
    form.commit();
    await settle();
    expect(host.events.filter((event) => event.name === 'mjf-submitted')).toEqual([
      { name: 'mjf-submitted', detail: { responseId: api.savesOf('final')[0].ClientResponseID } },
    ]);
  });

  it('keeps the resume pointer when the seal is refused', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { form, host } = await liveScreening((input) =>
      input.Mode === 'final' ? refusal('Quota reached') : screeningServer(input),
    );
    form.rt.setValue('age', 16);
    form.commit();
    await settle();
    expect(form.phaseNow).toBe('done');
    expect(host.events.filter((event) => event.name === 'mjf-submitted')).toEqual([]);
  });

  it('is sent while the form is still in intake, and the screen shows only after it resolves', async () => {
    const seal = deferred<FormsSaveResponseOutput>();
    const { api, form } = await liveScreening((input) => (input.Mode === 'final' ? seal.promise : screeningServer(input)));
    form.rt.setValue('age', 16);
    form.commit();
    await settle();

    expect(api.savesOf('final')).toHaveLength(1);
    expect(form.phaseNow).toBe('ready'); // still in intake while the seal is on the wire

    seal.resolve(screeningServer(api.savesOf('final')[0]));
    await settle();
    expect(form.phaseNow).toBe('done');
  });

  it('navigates only after the seal resolved, to the redirect the server returned', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { href: 'https://embed.example/page', assign, reload: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const seal = deferred<FormsSaveResponseOutput>();
    const withRedirect = (input: FormsSaveResponseInput): FormsSaveResponseOutput => ({
      ...screeningServer(input),
      ConfirmationMessage: undefined,
      RedirectURL: 'https://example.com/not-eligible',
    });
    const { form } = await liveScreening((input) => (input.Mode === 'final' ? seal.promise : withRedirect(input)));
    form.rt.setValue('age', 16);
    form.commit();
    await settle();
    expect(assign).not.toHaveBeenCalled();

    seal.resolve(withRedirect({ ...emptyFinal(), Mode: 'final' }));
    await settle();
    expect(assign).toHaveBeenCalledWith('https://example.com/not-eligible');
  });

  it('a refused seal still shows the respondent their screen; the knockout answer is already banked, so nothing is re-sent', async () => {
    const { api, form } = await liveScreening((input) =>
      input.Mode === 'final' ? refusal('This form is no longer accepting responses (quota reached).') : screeningServer(input),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    form.rt.setValue('age', 16);
    form.commit();
    await settle();

    // The partial that came back `ended` already stored these answers; banking them again would be
    // the redundant request fix round 1 removed (Minor 3).
    expect(api.saves.map((s) => s.Mode)).toEqual(['partial', 'final']);
    expect(form.phaseNow).toBe('done');
    expect(form.endingShown).toBe('ko');
    expect(form.isScreenedOut).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('the disqualification could not be recorded'));
  });

  it('is not sent while a required captcha is unsolved — the server would refuse it — and the draft stays banked', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm({ captcha: true })), screeningServer);
    const { form } = await mountForm({ api, turnstileSiteKey: '0x4AAAA_site' });
    form.rt.setValue('age', 16);
    form.commit();
    await settle();

    expect(api.savesOf('final')).toHaveLength(0);
    expect(api.savesOf('partial')).toHaveLength(1);
    expect(form.phaseNow).toBe('done');
    expect(form.endingShown).toBe('ko');
  });

  it('carries the solved captcha token when there is one', async () => {
    const api = new FakeFormsApi(servedAs(screeningForm({ captcha: true })), screeningServer);
    const { form } = await mountForm({ api, turnstileSiteKey: '0x4AAAA_site' });
    form.solveCaptcha('tok-1');
    form.rt.setValue('age', 16);
    form.commit();
    await settle();
    expect(api.savesOf('final').map((s) => s.TurnstileToken)).toEqual(['tok-1']);
    expect(api.savesOf('partial').every((s) => s.TurnstileToken === undefined)).toBe(true);
  });

  it('an expired session discovered by the seal ends the fill on the notice, not on the knockout screen', async () => {
    const { form } = await liveScreening((input) => {
      if (input.Mode === 'final') {
        throw new SessionExpiredError();
      }
      return screeningServer(input);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    form.rt.setValue('age', 16);
    form.commit();
    await settle();
    expect(form.phaseNow).toBe('expired');
  });
});

describe('a knockout in flight owns the rest of the response', () => {
  it('a Submit pressed while the seal is on the wire sends nothing more', async () => {
    const seal = deferred<FormsSaveResponseOutput>();
    const { api, form } = await liveScreening((input) => (input.Mode === 'final' ? seal.promise : screeningServer(input)));
    form.rt.setValue('age', 16);
    form.rt.setValue('name', 'Sam');
    form.commit();
    await settle();
    await form.submit();
    form.commit();
    form.progress();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(api.savesOf('final')).toHaveLength(1);
    seal.resolve(screeningServer(api.savesOf('final')[0]));
    await settle();
    expect(form.phaseNow).toBe('done');
  });

  it('every save of the sitting carries the same client response id', async () => {
    const { api, form } = await liveScreening();
    form.rt.setValue('age', 30);
    form.commit();
    await settle();
    form.rt.setValue('age', 16);
    form.commit();
    await settle();
    expect(new Set(api.saves.map((s) => s.ClientResponseID)).size).toBe(1);
    expect(api.saves.map((s) => s.FormVersionID)).toEqual(['version-1', 'version-1', 'version-1']);
  });
});

describe('a knockout the server finds at Submit is shown as one', () => {
  it('shows the server\'s knockout screen and never a thank-you', async () => {
    // The server sees knockouts the widget never could: the projection carries none, so a respondent
    // can reach Submit with a knockout answer (here, no commit ever fired).
    const { api, form } = await liveScreening();
    form.rt.setValue('age', 12);
    await form.submit();

    expect(api.saves.map((s) => s.Mode)).toEqual(['final']);
    expect(form.phaseNow).toBe('done');
    expect(form.endingShown).toBe(KO_ENDING.ID);
    expect(form.isScreenedOut).toBe(true);
  });

  it('a screening with a redirect and no message still never falls back to the form-wide thank-you', async () => {
    vi.stubGlobal('window', { location: { href: 'https://embed.example/page', assign: vi.fn(), reload: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const { form } = await liveScreening((input) => ({
      Success: true,
      ResponseID: input.ClientResponseID,
      Status: 'Disqualified',
      Outcome: 'ended',
      RedirectURL: 'https://example.com/elsewhere',
      Errors: [],
    }));
    form.rt.setValue('age', 12);
    await form.submit();
    expect(form.endingShown).toBeUndefined();
    expect(form.confirmation).toBe(SCREENED_OUT_MESSAGE);
  });
});

/** A final input with nothing in it, for re-answering a held seal in a spec. */
function emptyFinal(): FormsSaveResponseInput {
  return { Slug: 's', FormVersionID: 'version-1', Mode: 'final', ClientResponseID: 'c', Answers: [{ QuestionID: 'age', NumericValue: 16 }] };
}
