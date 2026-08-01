import { describe, it, expect } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { FormRuntime } from './form-runtime';

/** A small two-page form with a conditional follow-up + a required field. */
function makeDefinition(): PublishedFormDefinition {
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Test',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          {
            id: 'q-color',
            type: 'SingleChoice',
            prompt: 'Favorite color',
            isRequired: true,
            displayOrder: 1,
            options: [
              { id: 'o1', label: 'Blue', value: 'blue', displayOrder: 1 },
              { id: 'o2', label: 'Other', value: 'other', displayOrder: 2 },
            ],
          },
          {
            id: 'q-other',
            type: 'ShortText',
            prompt: 'Which color?',
            isRequired: true,
            displayOrder: 2,
            options: [],
            conditionalRule: { show: { all: [{ questionId: 'q-color', op: 'equals', value: 'other' }] } },
          },
          {
            id: 'q-note',
            type: 'Statement',
            prompt: 'Thanks!',
            isRequired: false,
            displayOrder: 3,
            options: [],
          },
        ],
      },
    ],
  };
}

describe('FormRuntime', () => {
  it('hides a conditional question until its trigger is met', () => {
    const rt = new FormRuntime(makeDefinition());
    const page = rt.visiblePages()[0];
    expect(rt.visibleQuestions(page).map((q) => q.id)).toEqual(['q-color', 'q-note']);

    rt.setValue('q-color', 'other');
    expect(rt.visibleQuestions(page).map((q) => q.id)).toEqual(['q-color', 'q-other', 'q-note']);
  });

  it('excludes Statement questions from the answerable set', () => {
    const rt = new FormRuntime(makeDefinition());
    expect(rt.visibleAnswerableQuestions().some((q) => q.type === 'Statement')).toBe(false);
  });

  it('computes progress over visible answerable questions', () => {
    const rt = new FormRuntime(makeDefinition());
    expect(rt.progress()).toBe(0); // q-color unanswered, q-other hidden
    rt.setValue('q-color', 'blue');
    expect(rt.progress()).toBe(1); // only q-color is answerable while q-other is hidden
  });

  it('is invalid while a required visible question is empty', () => {
    const rt = new FormRuntime(makeDefinition());
    expect(rt.isFormValid()).toBe(false);
    rt.setValue('q-color', 'blue');
    expect(rt.isFormValid()).toBe(true);
  });

  it('re-requires the conditional question once it becomes visible', () => {
    const rt = new FormRuntime(makeDefinition());
    rt.setValue('q-color', 'other');
    expect(rt.isFormValid()).toBe(false); // q-other now visible + required + empty
    rt.setValue('q-other', 'teal');
    expect(rt.isFormValid()).toBe(true);
  });

  it('builds wire answers only for visible answered questions', () => {
    const rt = new FormRuntime(makeDefinition());
    rt.setValue('q-color', 'blue');
    const inputs = rt.buildAnswerInputs();
    expect(inputs).toEqual([{ questionId: 'q-color', textValue: 'blue' }]);
  });
});

/** A single Phone question — the type this branch newly taught the widget to validate. */
function phoneDefinition(): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'Phone',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    pages: [
      {
        id: 'p',
        displayOrder: 1,
        questions: [
          { id: 'q-phone', type: 'Phone', prompt: 'Phone', isRequired: false, displayOrder: 1, options: [] },
        ],
      },
    ],
  };
}

describe('FormRuntime — a value being typed is not yet a wrong answer', () => {
  // The CONTRACT the components must honour: `setValue` is the keystroke, `markTouched` is the
  // commit. Keeping them separate is what stops a format error appearing while the respondent is
  // still typing. Before this branch `Phone` fell through to `default: return VALID`, so it never
  // errored at all; now `isPhone` wants 7+ digits, and a component that marks touched on every
  // keystroke shows "Enter a valid phone number." from the first digit to the sixth — re-announced
  // each time, since the message carries `role="alert"`. That is the client-side twin of the
  // autosave bug on the server: holding an in-progress value to a finished value's standard.
  const q = () => phoneDefinition().pages[0].questions[0];

  // NOTE ON WHAT THIS CAN AND CANNOT CATCH. The bug lived in the COMPONENTS — they called
  // `markTouched` on every keystroke — and the runtime was correct throughout, so the first test
  // below passes on `origin/next` too. It is a contract test, not a regression test: it pins the
  // half of the rule the runtime owns. The other half is template wiring, and this repo has no
  // TestBed, so nothing here can catch a component that marks touched at the wrong moment. That
  // was verified in a real browser instead, and would need a component/e2e harness to automate.
  it('shows no error while a phone number is being typed', () => {
    const runtime = new FormRuntime(phoneDefinition());
    for (const partial of ['5', '55', '555', '55501']) {
      runtime.setValue('q-phone', partial);
      expect(runtime.visibleErrorFor(q())).toBeNull();
    }
  });

  it('shows the error once the field is committed, and clears it when the value becomes valid', () => {
    const runtime = new FormRuntime(phoneDefinition());
    runtime.setValue('q-phone', '55501');
    runtime.markTouched('q-phone');
    expect(runtime.visibleErrorFor(q())).toBe('Enter a valid phone number.');

    runtime.setValue('q-phone', '555 010 1234');
    expect(runtime.visibleErrorFor(q())).toBeNull();
  });
});
