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
    // Both halves now agree, and an earlier version of this case asserted that they would NOT —
    // it expected the payload to carry an orphaned `risk` while the server dropped it, which
    // described the divergence rather than the fix. Once the rendered set is a fixed point, `risk`
    // is not rendered, so it is not sent, so there is nothing for the server to disagree about.
    expect([...rt.transmittedView().answers.keys()]).toEqual(['type']);
    expect(rt.transmittedView().questions.map((q) => q.id)).toEqual(['type']);
  });

  it('renders the same set the server will derive from the payload', () => {
    // THE invariant, and the one an earlier version of this case could not test: it compared
    // `resolveVisibleQuestions(pages, view.answers)` against `view.questions`, which is how
    // `view.questions` is defined — `f(x) === f(x)`, unfailable. What actually matters is whether
    // the RENDERED set agrees, because that is the set whose answers get sent.
    const rt = new FormRuntime(chained());
    rt.setValue('type', 'Company');
    rt.setValue('sector', 'Energy');
    rt.setValue('risk', 'High');
    rt.setValue('type', 'Individual');

    expect(rt.visibleAnswerableQuestions().map((q) => q.id)).toEqual(
      rt.transmittedView().questions.map((q) => q.id),
    );
  });

  it('renders a question the server will REQUIRE, even when the raw map hides it', () => {
    // The mirror of the divergence `transmittedView` fixed, and it is unrecoverable rather than
    // merely wrong. `why` is shown when `detail isNotAnswered` — an operator this PR added. The
    // respondent picks Company, types a detail, switches to Individual: nothing prunes `detail`
    // from the raw map, so the widget reads it as answered and hides `why`, and sends neither.
    // The server, seeing no `detail`, finds `isNotAnswered` true, makes `why` visible AND required,
    // and rejects the submission naming a field that was never on screen. Every retry sends the
    // identical payload, so the respondent cannot get out of it.
    const rt = new FormRuntime(
      formOf([
        { id: 'gate' },
        { id: 'detail', conditionalRule: { show: { all: [{ questionId: 'gate', op: 'equals', value: 'Company' }] } } },
        {
          id: 'why',
          isRequired: true,
          conditionalRule: { show: { all: [{ questionId: 'detail', op: 'isNotAnswered' }] } },
        },
      ]),
    );
    rt.setValue('gate', 'Company');
    rt.setValue('detail', 'Acme');
    rt.setValue('gate', 'Individual');

    expect(rt.visibleAnswerableQuestions().map((q) => q.id)).toEqual(['gate', 'why']);
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

describe('FormRuntime progress agrees with the submit button', () => {
  /**
   * The bar must agree with the submit button (progress.ts states this invariant outright).
   * `computeProgress` short-circuits to 1 once every REQUIRED question is satisfied, so a bar
   * that reads a different notion of "required" than validity does reports a full bar on a form
   * the respondent cannot submit — and gives them no clue which field is holding it.
   *
   * These cases used to exercise the `require` verb, which was the way the two readings could
   * diverge. Visibility is the way they still can: `progress` counts only visible questions, and
   * `isFormValid` judges only visible questions, so the pair has to move together as a show rule
   * opens and closes.
   */
  it('a required question revealed by a show rule holds both the bar and the button back', () => {
    const rt = new FormRuntime(
      formOf([
        { id: 'q1', isRequired: true },
        {
          id: 'q2',
          isRequired: true,
          conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] } },
        },
      ]),
    );
    rt.setValue('q1', 'Other');

    expect(rt.isFormValid()).toBe(false);
    expect(rt.progress()).toBeLessThan(1);
  });

  it('and stops counting once the show rule no longer fires', () => {
    const rt = new FormRuntime(
      formOf([
        { id: 'q1', isRequired: true },
        {
          id: 'q2',
          isRequired: true,
          conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] } },
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

/**
 * What the SCROLL renderer puts on screen.
 *
 * Scroll mode asks the runtime for one page's questions at a time, and that reader applied the
 * question's own `show` rule and nothing else — so a `Go to` rule changed what the form SUBMITS
 * without changing what it DISPLAYS. Three things came apart at once, all silent:
 *
 *  - a skipped question stayed on screen, asterisk and all, and was never validated on submit;
 *  - whatever the respondent typed into it was dropped from the payload;
 *  - the progress bar counted the flow's set, so it could read 100% with visibly empty
 *    required fields still on the page.
 *
 * One walk decides what renders, and the renderer reads that walk. `visibleAnswerableQuestions`
 * is the same walk narrowed to answerable types, so the two cannot disagree by construction.
 */
function jumpDefinition(): PublishedFormDefinition {
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Jump',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          {
            id: 'q-first',
            type: 'ShortText',
            prompt: 'First name',
            isRequired: false,
            displayOrder: 1,
            options: [],
            conditionalRule: {
              jump: [
                {
                  when: { all: [{ questionId: 'q-first', op: 'equals', value: 'Soham' }] },
                  target: { kind: 'question', id: 'q-email' },
                },
              ],
            },
          },
          { id: 'q-last', type: 'ShortText', prompt: 'Last name', isRequired: true, displayOrder: 2, options: [] },
          { id: 'q-note', type: 'Statement', prompt: 'Nearly there', isRequired: false, displayOrder: 3, options: [] },
          { id: 'q-email', type: 'ShortText', prompt: 'Email', isRequired: true, displayOrder: 4, options: [] },
        ],
      },
    ],
  };
}

describe('FormRuntime — the scroll renderer follows the flow, not just show rules', () => {
  describe('happy', () => {
    it('takes a jumped-over question off the page', () => {
      const rt = new FormRuntime(jumpDefinition());
      const page = rt.visiblePages()[0];
      expect(rt.visibleQuestions(page).map((q) => q.id)).toEqual(['q-first', 'q-last', 'q-note', 'q-email']);

      rt.setValue('q-first', 'Soham');
      expect(rt.visibleQuestions(page).map((q) => q.id)).toEqual(['q-first', 'q-email']);
    });

    it('still renders display-only questions the flow reaches', () => {
      const rt = new FormRuntime(jumpDefinition());
      const page = rt.visiblePages()[0];
      expect(rt.visibleQuestions(page).some((q) => q.type === 'Statement')).toBe(true);
    });
  });

  describe('edge', () => {
    it('what renders and what submits describe the same questions', () => {
      const rt = new FormRuntime(jumpDefinition());
      rt.setValue('q-first', 'Soham');
      const rendered = rt.visibleQuestions(rt.visiblePages()[0]).filter((q) => q.type !== 'Statement');
      expect(rendered.map((q) => q.id)).toEqual(rt.visibleAnswerableQuestions().map((q) => q.id));
    });
  });

  describe('worst', () => {
    it('a skipped REQUIRED question neither blocks the submit nor sits on the page asking', () => {
      // The two halves have to move together. Off the page but still required is an unsubmittable
      // form; on the page but no longer required is a question the respondent answers for nothing.
      const rt = new FormRuntime(jumpDefinition());
      rt.setValue('q-first', 'Soham');
      rt.setValue('q-email', 'a@b.com');
      expect(rt.visibleQuestions(rt.visiblePages()[0]).map((q) => q.id)).not.toContain('q-last');
      expect(rt.isFormValid()).toBe(true);
    });

    it('a full progress bar means nothing on the page is still being asked for', () => {
      const rt = new FormRuntime(jumpDefinition());
      rt.setValue('q-first', 'Soham');
      rt.setValue('q-email', 'a@b.com');
      expect(rt.progress()).toBe(1);
      const unanswered = rt
        .visibleQuestions(rt.visiblePages()[0])
        .filter((q) => q.isRequired && !rt.valueFor(q.id));
      expect(unanswered).toEqual([]);
    });
  });
});
