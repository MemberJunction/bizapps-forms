import { describe, it, expect } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { resolveVisibleQuestions } from '@mj-biz-apps/forms-entities';
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

describe('FormRuntime composite part errors', () => {
  function contactForm(): PublishedFormDefinition {
    const def = makeDefinition();
    def.pages[0].questions = [
      { id: 'q-contact', type: 'ContactInfo', prompt: 'Your details', isRequired: false, displayOrder: 1, options: [] },
    ];
    return def;
  }

  it('stays silent until the question is touched, like the group message does', () => {
    const rt = new FormRuntime(contactForm());
    rt.setValue('q-contact', { email: 'fsa', phone: '12' });
    const question = rt.visiblePages()[0].questions[0];

    expect(rt.visiblePartErrorsFor(question)).toEqual({});

    rt.touchAll([question]);
    expect(rt.visiblePartErrorsFor(question)).toEqual({
      email: 'Enter a valid email address.',
      phone: 'Enter a valid phone number.',
    });
  });
});

// --- Progress ---------------------------------------------------------------

/** A form whose questions are described inline, so each progress case reads as its own shape. */
function formOf(
  questions: Array<Partial<PublishedFormQuestion> & { id: string }>,
): PublishedFormDefinition {
  const def = makeDefinition();
  def.pages[0].questions = questions.map((q, i) => ({
    type: 'ShortText',
    prompt: q.id,
    isRequired: false,
    displayOrder: i + 1,
    options: [],
    ...q,
  })) as PublishedFormQuestion[];
  return def;
}

describe('FormRuntime.transmittedAnswers', () => {
  /**
   * The set the widget SENDS is `visibleAnswerableQuestions` (see `buildAnswerInputs`), and the
   * server judges knockouts, endings and score from exactly what arrives. So any client-side
   * verdict has to be reached on the same set, or the two sides disagree about the same
   * submission — and the client's copy is the one the respondent sees while the server's is the
   * one that gets recorded.
   *
   * The raw map keeps an answer whose question has since been hidden: `setValue` deletes a key
   * only on null/undefined, and nothing prunes on visibility change.
   */
  it('drops an answer whose question is no longer visible', () => {
    const rt = new FormRuntime(
      formOf([
        { id: 'gate' },
        { id: 'detail', conditionalRule: { show: { all: [{ questionId: 'gate', op: 'equals', value: 'Company' }] } } },
      ]),
    );
    rt.setValue('gate', 'Company');
    rt.setValue('detail', 'left over');
    expect([...rt.transmittedAnswers().keys()].sort()).toEqual(['detail', 'gate']);

    rt.setValue('gate', 'Individual');
    // Still in the raw map — nothing prunes it — but no longer part of what this form is saying.
    expect(rt.currentAnswers().has('detail')).toBe(true);
    expect([...rt.transmittedAnswers().keys()]).toEqual(['gate']);
  });

  it('is exactly what buildAnswerInputs will send', () => {
    const rt = new FormRuntime(
      formOf([
        { id: 'gate' },
        { id: 'detail', conditionalRule: { show: { all: [{ questionId: 'gate', op: 'equals', value: 'Company' }] } } },
        { id: 'note', type: 'Statement' },
      ]),
    );
    rt.setValue('gate', 'Individual');
    rt.setValue('detail', 'left over');

    expect([...rt.transmittedAnswers().keys()].sort()).toEqual(rt.buildAnswerInputs().map((a) => a.questionId).sort());
  });
});

describe('FormRuntime.transmittedView', () => {
  /**
   * The server does TWO things with a submission: it reads the answers that arrive, and it
   * re-derives the visible question set FROM those answers. Matching only the first is not
   * matching. `visibleAnswers()` restricted the values while `visibleAnswerableQuestions` still
   * resolved over the RAW map, so a show-rule naming a question that is itself hidden made the two
   * sets differ — and the client's verdict was reached on a set the server would never compute.
   */
  const chained = () =>
    formOf([
      { id: 'type' },
      { id: 'sector', conditionalRule: { show: { all: [{ questionId: 'type', op: 'equals', value: 'Company' }] } } },
      { id: 'risk', conditionalRule: { show: { all: [{ questionId: 'sector', op: 'equals', value: 'Energy' }] } } },
    ]);

  it('derives the question set from what will be SENT, not from the raw map', () => {
    const rt = new FormRuntime(chained());
    rt.setValue('type', 'Company');
    rt.setValue('sector', 'Energy');
    rt.setValue('risk', 'High');
    expect(rt.transmittedView().questions.map((q) => q.id)).toEqual(['type', 'sector', 'risk']);

    // Hiding `sector` orphans `risk`'s rule: it reads `sector` from the raw map and still passes,
    // so the widget would render and send `risk` — but the server, resolving over the payload,
    // sees no `sector` and drops `risk`. That gap is the divergence.
    rt.setValue('type', 'Individual');
    // The two halves are deliberately different, and they mirror the server exactly. The payload
    // still carries `risk` — the widget rendered it, so it sends it — and the server evaluates
    // CONDITIONS against that raw payload (`buildAnswerMap(submission.answers)`). But the question
    // SET it derives from the payload excludes `risk`, because the rule revealing it reads a
    // `sector` answer that is no longer there, and that set is what the score folds over. Asserting
    // both is the point: agreeing on one and not the other is the bug.
    expect([...rt.transmittedView().answers.keys()]).toEqual(['type', 'risk']);
    expect(rt.transmittedView().questions.map((q) => q.id)).toEqual(['type']);
  });

  it('is stable: re-deriving from its own output changes nothing', () => {
    // The server makes exactly one pass over the payload, so the client must agree after one.
    const rt = new FormRuntime(chained());
    rt.setValue('type', 'Company');
    rt.setValue('sector', 'Energy');
    rt.setValue('risk', 'High');
    rt.setValue('type', 'Individual');

    const once = rt.transmittedView();
    const twice = resolveVisibleQuestions([...chained().pages], once.answers);
    expect(twice.map((q) => q.id)).toEqual(once.questions.map((q) => q.id));
  });
});

describe('FormRuntime progress', () => {
  it('does not let optional questions dilute the bar', () => {
    const rt = new FormRuntime(
      formOf([
        { id: 'req', isRequired: true },
        { id: 'opt-a' },
        { id: 'opt-b' },
        { id: 'opt-c' },
      ]),
    );

    rt.setValue('req', 'answered');

    // Everything that could stop a submit is done, so the bar is done.
    expect(rt.progress()).toBe(1);
  });
});

describe('FormRuntime progress with nothing required', () => {
  it('still moves as an all-optional form is filled in, rather than dividing by zero', () => {
    const rt = new FormRuntime(formOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]));

    expect(rt.progress()).toBe(0);

    rt.setValue('a', 'x');
    expect(rt.progress()).toBe(0.25);
  });
});

describe('FormRuntime progress and conditional questions', () => {
  /** A required follow-up that only exists once the trigger says 'yes'. */
  function conditionalForm(): PublishedFormDefinition {
    return formOf([
      { id: 'trigger', isRequired: true },
      {
        id: 'followup',
        isRequired: true,
        conditionalRule: { show: { all: [{ questionId: 'trigger', op: 'equals', value: 'yes' }] } },
      },
    ]);
  }

  it('ignores a required question the respondent cannot see', () => {
    const rt = new FormRuntime(conditionalForm());

    rt.setValue('trigger', 'no');

    // Only `trigger` is on the path, and it is answered.
    expect(rt.progress()).toBe(1);
  });

  it('drops back when an answer reveals more required work', () => {
    const rt = new FormRuntime(conditionalForm());

    rt.setValue('trigger', 'yes');

    // The follow-up now exists and is unanswered: 1 of 2.
    expect(rt.progress()).toBe(0.5);

    rt.setValue('followup', 'done');
    expect(rt.progress()).toBe(1);
  });
});

describe('FormRuntime progress and conditional requiredness', () => {
  /**
   * The bar must agree with the submit button (progress.ts states this invariant outright).
   * `computeProgress` short-circuits to 1 once every REQUIRED question is satisfied, so feeding
   * it the static `isRequired` while validity is judged by `isRequiredNow` reports a full bar on
   * a form the respondent cannot submit — and gives them no clue which field is holding it.
   */
  it('counts a conditionally-required question as required', () => {
    const rt = new FormRuntime(
      formOf([
        { id: 'q1', isRequired: true },
        {
          id: 'q2',
          conditionalRule: { require: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] } },
        },
      ]),
    );
    rt.setValue('q1', 'Other');

    expect(rt.isFormValid()).toBe(false);
    expect(rt.progress()).toBeLessThan(1);
  });

  it('stops counting it once the require group no longer fires', () => {
    const rt = new FormRuntime(
      formOf([
        { id: 'q1', isRequired: true },
        {
          id: 'q2',
          conditionalRule: { require: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] } },
        },
      ]),
    );
    rt.setValue('q1', 'Red');

    expect(rt.isFormValid()).toBe(true);
    expect(rt.progress()).toBe(1);
  });
});

describe('FormRuntime progress edge cases', () => {
  it('reports complete for a form with nothing to answer', () => {
    expect(new FormRuntime(formOf([{ id: 's', type: 'Statement' }])).progress()).toBe(1);
  });

  it('goes back down when an answer is cleared', () => {
    const rt = new FormRuntime(formOf([{ id: 'a', isRequired: true }, { id: 'b', isRequired: true }]));

    rt.setValue('a', 'x');
    expect(rt.progress()).toBe(0.5);

    rt.setValue('a', '');
    expect(rt.progress()).toBe(0);
  });

  it('counts a supplied answer even while it is still invalid, so the bar does not flicker as you type', () => {
    const rt = new FormRuntime(formOf([{ id: 'e', type: 'Email', isRequired: true }]));

    rt.setValue('e', 'not-an-email-yet');

    expect(rt.progress()).toBe(1);
  });

  it('never leaves the 0..1 range it is rendered as a percentage from', () => {
    const rt = new FormRuntime(formOf([{ id: 'a', isRequired: true }, { id: 'b' }]));
    for (const v of ['', 'x']) {
      rt.setValue('a', v);
      rt.setValue('b', v);
      expect(rt.progress()).toBeGreaterThanOrEqual(0);
      expect(rt.progress()).toBeLessThanOrEqual(1);
    }
  });
});
