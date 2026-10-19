/**
 * The builder's Preview: the author's FULL draft, resolved locally, and nothing sent (#303 Task 10c,
 * DW13 / #75).
 *
 * Preview hands the widget the unpublished definition through the `definition` input. It holds every
 * rule the server would apply, so it resolves where a response ends through the same contracts
 * function the server's `Forms.SaveResponse` runs (`resolveResponseOutcome`) — and, because the draft
 * is the author's and not a respondent's, it must never reach the respondent API: no load, no
 * autosave, no submit.
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveResponseOutcome,
  type PublishedFormDefinition,
  type PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities/contracts';

import { FakeFormsApi, mountForm, screeningForm, screeningServer, servedAs } from './testing/mj-form-harness';

vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  afterNextRender: () => ({ destroy: () => undefined }),
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function choice(id: string, points: Record<string, number>): PublishedFormQuestion {
  return {
    id,
    type: 'SingleChoice',
    prompt: id,
    isRequired: false,
    displayOrder: 1,
    options: Object.keys(points).map((value, i) => ({ id: `${id}-${value}`, label: value, value, displayOrder: i })),
    scoring: { points },
  };
}

/** Two scored questions and a score-gated ending: 10 points or more is the "high" band. */
function scoredForm(): PublishedFormDefinition {
  return {
    formId: 'form-2',
    formVersionId: 'version-2',
    name: 'Scored',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    pages: [{ id: 'p1', displayOrder: 1, questions: [choice('fit', { good: 6, poor: 0 }), { ...choice('size', { big: 5, small: 1 }), displayOrder: 2 }] }],
    endScreens: [
      {
        id: 'high',
        screenType: 'Ending',
        title: 'Great fit',
        displayOrder: 1,
        conditionalRule: { show: { all: [{ source: 'score', op: 'greaterThan', value: 9 }] } },
      },
      { id: 'default', screenType: 'Ending', title: 'Thanks', displayOrder: 2, isDefault: true },
    ],
  };
}

/** An API that fails the test if Preview ever reaches it. */
function untouchableApi(): FakeFormsApi {
  return new FakeFormsApi(
    () => Promise.reject(new Error('Preview must not load from the respondent API')),
    () => {
      throw new Error('Preview must not save to the respondent API');
    },
  );
}

describe('Preview resolves the ending locally, exactly as the server resolves it (DW13)', () => {
  it.each([
    [{ fit: 'good', size: 'big' }, 'high'],
    [{ fit: 'good', size: 'small' }, 'default'],
    [{ fit: 'poor', size: 'big' }, 'default'],
  ])('answers %o land on %s — the screen resolveResponseOutcome picks for them', async (answers, expected) => {
    const definition = scoredForm();
    const api = untouchableApi();
    const { form } = await mountForm({ api, definition });
    for (const [question, value] of Object.entries(answers)) {
      form.rt.setValue(question, value);
    }
    await form.submit();

    // The server's verdict for the same answers (it runs this one function over the settled payload).
    const server = resolveResponseOutcome(definition, new Map(Object.entries(answers)));
    expect(form.phaseNow).toBe('done');
    expect(form.endingShown).toBe(server.outcome.screen?.id);
    expect(form.endingShown).toBe(expected);
    expect(api.loads).toEqual([]);
    expect(api.saves).toEqual([]);
  });

  it('screens out locally on a committed knockout answer, and records nothing', async () => {
    const api = untouchableApi();
    const { form } = await mountForm({ api, definition: screeningForm() });
    form.rt.setValue('age', 16);
    form.commit();
    await vi.advanceTimersByTimeAsync(0);

    expect(form.phaseNow).toBe('done');
    expect(form.endingShown).toBe('ko');
    expect(api.saves).toEqual([]);
  });

  it('never autosaves, and never banks a checkpoint', async () => {
    const api = untouchableApi();
    const { form } = await mountForm({ api, definition: screeningForm() });
    form.rt.setValue('age', 30);
    form.rt.setValue('comment', 'past the checkpoint');
    form.progress();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.saves).toEqual([]);
    expect(form.autosaveNow).toBe('idle');
  });
});

describe('the live widget never resolves an ending itself', () => {
  it('shows the server\'s ending even where its own draft-side resolution would differ', async () => {
    // The projection has no endings to resolve from; whatever the server returns is what shows.
    const api = new FakeFormsApi(servedAs(screeningForm()), (input) => ({ ...screeningServer(input), Ending: undefined, ConfirmationMessage: 'From the server' }));
    const { form } = await mountForm({ api });
    form.rt.setValue('age', 30);
    await form.submit();
    expect(form.endingShown).toBeUndefined();
    expect(form.confirmation).toBe('From the server');
  });
});
