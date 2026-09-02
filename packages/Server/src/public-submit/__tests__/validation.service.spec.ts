import { describe, expect, it } from 'vitest';
import type { FormAnswerInput, PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { answerValueOf, validateSubmission } from '../validation.service';

/** A required-MultiChoice form (the RSVP "dietary" shape that was rejecting every complete submit). */
function multiChoiceRequiredDefinition(): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'Dietary',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    endScreens: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          { id: 'q-diet', type: 'MultiChoice', prompt: 'Dietary?', isRequired: true, displayOrder: 1, options: [] },
        ],
      },
    ],
  };
}

describe('answerValueOf (null typed-column precedence)', () => {
  it('reads a MultiChoice answer from jsonValue even when textValue is null (GraphQL coerces omitted → null)', () => {
    const input = { questionId: 'q-diet', textValue: null, jsonValue: ['none'] } as unknown as FormAnswerInput;
    expect(answerValueOf(input)).toEqual(['none']);
  });

  it('still returns falsy-but-present scalars (0 / false)', () => {
    expect(answerValueOf({ questionId: 'n', numericValue: 0 } as unknown as FormAnswerInput)).toBe(0);
    expect(answerValueOf({ questionId: 'b', booleanValue: false } as unknown as FormAnswerInput)).toBe(false);
  });

  it('reads a FileUpload answer from fileId (the only column a file answer populates)', () => {
    const input = { questionId: 'q-resume', fileId: 'file-guid-1' } as unknown as FormAnswerInput;
    expect(answerValueOf(input)).toBe('file-guid-1');
  });
});

describe('validateSubmission — FileUpload answered via fileId', () => {
  /** A required-FileUpload form: the "attach your resume" shape. */
  function fileUploadRequiredDefinition(): PublishedFormDefinition {
    return {
      formId: 'f',
      formVersionId: 'v',
      name: 'Application',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      automations: [],
      endScreens: [],
      pages: [
        {
          id: 'p1',
          displayOrder: 1,
          questions: [
            { id: 'q-resume', type: 'FileUpload', prompt: 'Resume', isRequired: true, displayOrder: 1, options: [] },
          ],
        },
      ],
    };
  }

  it('accepts a required FileUpload answered through fileId, and keeps the answer for persistence', () => {
    const answers: FormAnswerInput[] = [{ questionId: 'q-resume', fileId: 'file-guid-1' } as unknown as FormAnswerInput];

    const outcome = validateSubmission(fileUploadRequiredDefinition(), answers, 'complete');

    // Before this was fixed, the file answer read as unanswered: the submit was rejected with
    // `"Resume" is required.` even though the upload had already succeeded, and — on an OPTIONAL
    // file question — the answer was silently dropped instead, so FormResponseAnswer.FileID was
    // never written by the public submit path at all.
    expect(outcome.errors).toEqual([]);
    expect(outcome.answers).toHaveLength(1);
    expect(outcome.answers[0].input.fileId).toBe('file-guid-1');
  });

  it('still reports a required FileUpload that carries no file', () => {
    const answers: FormAnswerInput[] = [{ questionId: 'q-resume' } as unknown as FormAnswerInput];

    const outcome = validateSubmission(fileUploadRequiredDefinition(), answers, 'complete');

    expect(outcome.errors).toEqual([{ questionId: 'q-resume', message: '"Resume" is required.' }]);
    expect(outcome.answers).toEqual([]);
  });
});

describe('validateSubmission — required MultiChoice via jsonValue', () => {
  it('accepts a required multi-select answered through jsonValue with textValue null (regression)', () => {
    const answers: FormAnswerInput[] = [
      { questionId: 'q-diet', textValue: null, jsonValue: ['none'] } as unknown as FormAnswerInput,
    ];
    const outcome = validateSubmission(multiChoiceRequiredDefinition(), answers, 'complete');
    expect(outcome.errors).toEqual([]);
  });
});

/**
 * A form whose format-bearing questions carry NO explicit `validationRule` — the shape the
 * seeded `contact-us-e2e` form actually has, and the one that was silently accepting anything.
 */
function typedQuestionsWithoutRulesDefinition(): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'Contact',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    endScreens: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          { id: 'q-email', type: 'Email', prompt: 'Email address', isRequired: true, displayOrder: 1, options: [] },
          { id: 'q-num', type: 'Number', prompt: 'How many?', isRequired: false, displayOrder: 2, options: [] },
        ],
      },
    ],
  };
}

describe('validateSubmission — type-derived format (the client/server asymmetry)', () => {
  // The widget has always enforced these type checks; the server consulted only the declarative
  // rule, so a direct POST at the GraphQL mutation persisted `not-an-email` into an Email
  // question as a Complete response. The docstring claimed format could not be bypassed.
  it('rejects a malformed email for an Email question carrying no validationRule', () => {
    const outcome = validateSubmission(
      typedQuestionsWithoutRulesDefinition(),
      [{ questionId: 'q-email', textValue: 'not-an-email' }],
      'complete',
    );
    expect(outcome.errors.map((e) => e.questionId)).toEqual(['q-email']);
    expect(outcome.errors[0].message).toBe('Enter a valid email address.');
  });

  it('still accepts a well-formed email, and does not invent errors for unanswered optionals', () => {
    const outcome = validateSubmission(
      typedQuestionsWithoutRulesDefinition(),
      [{ questionId: 'q-email', textValue: 'someone@example.com' }],
      'complete',
    );
    expect(outcome.errors).toEqual([]);
    expect(outcome.answers.map((a) => a.question.id)).toEqual(['q-email']);
  });

  it('rejects a non-numeric answer to a Number question carrying no validationRule', () => {
    const outcome = validateSubmission(
      typedQuestionsWithoutRulesDefinition(),
      [
        { questionId: 'q-email', textValue: 'someone@example.com' },
        { questionId: 'q-num', textValue: 'lots' },
      ],
      'complete',
    );
    expect(outcome.errors.map((e) => e.questionId)).toEqual(['q-num']);
  });

  it('does not apply a format check to a question left unanswered', () => {
    // An empty optional is the isRequired check's business; a format check must not fire on it.
    const outcome = validateSubmission(
      typedQuestionsWithoutRulesDefinition(),
      [
        { questionId: 'q-email', textValue: 'someone@example.com' },
        { questionId: 'q-num', textValue: '' },
      ],
      'complete',
    );
    expect(outcome.errors).toEqual([]);
  });
});

/** An Email question plus a ShortText carrying a minLength rule, for the partial-save cases. */
function partialSaveDefinition(): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'Draft',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    endScreens: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          { id: 'q-email', type: 'Email', prompt: 'Email address', isRequired: true, displayOrder: 1, options: [] },
          {
            id: 'q-code',
            type: 'ShortText',
            prompt: 'Reference code',
            isRequired: false,
            displayOrder: 2,
            validationRule: { minLength: 10 },
            options: [],
          },
        ],
      },
    ],
  };
}

/** A ShortText question with an upper bound, plus a Number question with a numeric ceiling. */
function cappedDefinition(): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'Capped',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    endScreens: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          {
            id: 'q-capped',
            type: 'ShortText',
            prompt: 'Short answer',
            isRequired: false,
            displayOrder: 1,
            validationRule: { maxLength: 50 },
            options: [],
          },
        ],
      },
    ],
  };
}

describe('validateSubmission — partial (autosave) saves', () => {
  // The widget autosaves on a 1500ms debounce with no validity gate, so a respondent who
  // pauses while typing an address autosaves something like "someone@examp". A partial is a
  // snapshot of work in progress, not an assertion that the work is done — the same reason
  // `isRequired` is already skipped when partial. Blocking it loses the respondent's progress
  // for the most ordinary thing they can do: type slowly.
  it('accepts a half-typed email, so autosave does not fail mid-word', () => {
    const outcome = validateSubmission(
      partialSaveDefinition(),
      [{ questionId: 'q-email', textValue: 'someone@examp' }],
      'draft',
    );
    expect(outcome.errors).toEqual([]);
    expect(outcome.answers.map((a) => a.question.id)).toEqual(['q-email']);
  });

  // Pre-dates the type-format check: a minLength rule has always been evaluated on partials,
  // so any question with one failed every autosave until the respondent had typed enough.
  it('accepts a value still shorter than its minLength rule', () => {
    const outcome = validateSubmission(
      partialSaveDefinition(),
      [{ questionId: 'q-code', textValue: 'AB' }],
      'draft',
    );
    expect(outcome.errors).toEqual([]);
    expect(outcome.answers.map((a) => a.question.id)).toEqual(['q-code']);
  });

  // An upper bound is not a "not finished yet" condition. A value under minLength, a half-typed
  // email or a value that does not match a pattern are all states a respondent passes THROUGH on
  // the way to a good answer, which is why a draft is excused from them. A value already past
  // maxLength is not on the way to anything — it is wrong now and gets worse with every
  // keystroke. This is the anonymous public write path, `TextValue` is NVARCHAR(MAX), the
  // GraphQL body limit is 50mb and the widget sets no `maxlength` attribute, so autosave was
  // the one door left open to storing unbounded values.
  it('still enforces maxLength on a partial, because exceeding a cap is never work in progress', () => {
    const outcome = validateSubmission(
      cappedDefinition(),
      [{ questionId: 'q-capped', textValue: 'x'.repeat(500) }],
      'draft',
    );
    expect(outcome.errors.map((e) => e.message)).toEqual(['Must be at most 50 characters.']);
  });

  it('still lets a partial stay under the cap', () => {
    const outcome = validateSubmission(
      cappedDefinition(),
      [{ questionId: 'q-capped', textValue: 'still typing' }],
      'draft',
    );
    expect(outcome.errors).toEqual([]);
    expect(outcome.answers.map((a) => a.question.id)).toEqual(['q-capped']);
  });

  it('still enforces both format and rule on the real submit', () => {
    const outcome = validateSubmission(
      partialSaveDefinition(),
      [
        { questionId: 'q-email', textValue: 'someone@examp' },
        { questionId: 'q-code', textValue: 'AB' },
      ],
      'complete',
    );
    expect(outcome.errors.map((e) => e.questionId).sort()).toEqual(['q-code', 'q-email']);
  });
});

/** One `Date` and one `Time` question, both optional, no rules — the all-types fixture's last page. */
function temporalDefinition(): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'When',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    endScreens: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          { id: 'q-date', type: 'Date', prompt: 'Which day', isRequired: false, displayOrder: 1, options: [] },
          { id: 'q-time', type: 'Time', prompt: 'What time', isRequired: false, displayOrder: 2, options: [] },
        ],
      },
    ],
  };
}

describe('validateSubmission — the date column, in every mode (#116)', () => {
  // `<input type="time">` emits `14:30`. There was no Time format case, so the value passed
  // validation untouched, persistence did `new Date('14:30')`, and the Invalid Date threw from
  // inside Save() as an unattributed "Invalid time value". Every form carrying a Time question
  // was unsubmittable the moment someone answered it.
  it('accepts a Time answered as the control emits it, and keeps it for persistence', () => {
    const outcome = validateSubmission(temporalDefinition(), [{ questionId: 'q-time', dateValue: '14:30' }], 'complete');
    expect(outcome.errors).toEqual([]);
    expect(outcome.answers.map((a) => a.question.id)).toEqual(['q-time']);
  });

  it('rejects a Time the column cannot store, attributed to its question', () => {
    const outcome = validateSubmission(temporalDefinition(), [{ questionId: 'q-time', dateValue: '25:99' }], 'complete');
    expect(outcome.errors).toEqual([{ questionId: 'q-time', message: 'Enter a valid time.' }]);
    expect(outcome.answers).toEqual([]);
  });

  // A draft was held to upper bounds only, on the theory that everything else describes a
  // finished value a respondent is still typing towards. A date control emits nothing until the
  // value is whole, so an unparseable date is never "still typing" — and DateValue is a
  // DATETIMEOFFSET, which cannot hold the string as a draft any more than as a submission. On
  // `next`, a draft `Date` + "garbage" reached Save() and came back as "Invalid time value".
  it('rejects an unstorable Date on a DRAFT too, since the column will not hold it either way', () => {
    const outcome = validateSubmission(temporalDefinition(), [{ questionId: 'q-date', dateValue: 'garbage' }], 'draft');
    expect(outcome.errors).toEqual([{ questionId: 'q-date', message: 'Enter a valid date.' }]);
  });

  it('rejects an unstorable Time on a DRAFT', () => {
    const outcome = validateSubmission(temporalDefinition(), [{ questionId: 'q-time', dateValue: 'garbage' }], 'draft');
    expect(outcome.errors).toEqual([{ questionId: 'q-time', message: 'Enter a valid time.' }]);
  });

  it('still lets a DRAFT carry a whole date or time', () => {
    const outcome = validateSubmission(
      temporalDefinition(),
      [
        { questionId: 'q-date', dateValue: '2026-09-01' },
        { questionId: 'q-time', dateValue: '09:05' },
      ],
      'draft',
    );
    expect(outcome.errors).toEqual([]);
    expect(outcome.answers.map((a) => a.question.id).sort()).toEqual(['q-date', 'q-time']);
  });
});

/** A definition where q-other is shown only when q-choice equals 'Other'. */
function conditionalDefinition(): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'Conditional',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    endScreens: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          { id: 'q-choice', type: 'SingleChoice', prompt: 'Pick', isRequired: true, displayOrder: 1, options: [] },
          {
            id: 'q-other',
            type: 'ShortText',
            prompt: 'Specify',
            isRequired: true,
            displayOrder: 2,
            conditionalRule: { show: { all: [{ questionId: 'q-choice', op: 'equals', value: 'Other' }] } },
            options: [],
          },
        ],
      },
    ],
  };
}

describe('validateSubmission', () => {
  it('drops a hidden conditional answer and does not require it', () => {
    const outcome = validateSubmission(conditionalDefinition(), [{ questionId: 'q-choice', textValue: 'Yes' }], 'complete');
    expect(outcome.errors).toHaveLength(0);
    expect(outcome.answers.map((a) => a.question.id)).toEqual(['q-choice']);
  });

  it('requires the conditional answer when its trigger condition is met', () => {
    const outcome = validateSubmission(conditionalDefinition(), [{ questionId: 'q-choice', textValue: 'Other' }], 'complete');
    expect(outcome.errors.some((e) => e.questionId === 'q-other')).toBe(true);
  });

  it('keeps a visible conditional answer when both questions are answered', () => {
    const outcome = validateSubmission(
      conditionalDefinition(),
      [
        { questionId: 'q-choice', textValue: 'Other' },
        { questionId: 'q-other', textValue: 'Detail' },
      ],
      'complete',
    );
    expect(outcome.errors).toHaveLength(0);
    expect(outcome.answers).toHaveLength(2);
  });

  // `min`/`max` were reachable only when the answer arrived as `numericValue`, because the rule
  // path branched on `typeof value` and sent every string to the length/pattern checks. A text
  // input produces a STRING, the widget coerces it and enforces the range, and the shared
  // `coerceAnswerToNumber` documents `textValue` as a legitimate numeric spelling — so the two
  // sides disagreed about the same answer depending only on which typed column carried it.
  it('enforces a numeric range whichever typed column carried the answer', () => {
    const def: PublishedFormDefinition = {
      formId: 'f',
      formVersionId: 'v',
      name: 'Range',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      automations: [],
      endScreens: [],
      pages: [
        {
          id: 'p',
          displayOrder: 1,
          questions: [
            {
              id: 'q-num',
              type: 'Number',
              prompt: 'How many?',
              isRequired: true,
              displayOrder: 1,
              validationRule: { min: 1, max: 100 },
              options: [],
            },
          ],
        },
      ],
    };
    for (const over of [{ numericValue: 9999 }, { textValue: '9999' }]) {
      const outcome = validateSubmission(def, [{ questionId: 'q-num', ...over }], 'complete');
      expect(outcome.errors.map((e) => e.message)).toEqual(['Must be at most 100.']);
    }
    for (const under of [{ numericValue: 0 }, { textValue: '0' }]) {
      const outcome = validateSubmission(def, [{ questionId: 'q-num', ...under }], 'complete');
      expect(outcome.errors.map((e) => e.message)).toEqual(['Must be at least 1.']);
    }
    for (const good of [{ numericValue: 42 }, { textValue: '42' }]) {
      expect(validateSubmission(def, [{ questionId: 'q-num', ...good }], 'complete').errors).toEqual([]);
    }
  });

  it('enforces a ValidationRule pattern', () => {
    const def: PublishedFormDefinition = {
      formId: 'f',
      formVersionId: 'v',
      name: 'Pattern',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      automations: [],
      endScreens: [],
      pages: [
        {
          id: 'p',
          displayOrder: 1,
          questions: [
            {
              id: 'q-zip',
              type: 'ShortText',
              prompt: 'ZIP',
              isRequired: true,
              displayOrder: 1,
              validationRule: { pattern: '\\d{5}', patternMessage: 'Five digits required.' },
              options: [],
            },
          ],
        },
      ],
    };
    const bad = validateSubmission(def, [{ questionId: 'q-zip', textValue: 'abc' }], 'complete');
    expect(bad.errors[0].message).toBe('Five digits required.');

    const good = validateSubmission(def, [{ questionId: 'q-zip', textValue: '12345' }], 'complete');
    expect(good.errors).toHaveLength(0);
  });

  it('skips required enforcement for partial submissions', () => {
    const outcome = validateSubmission(conditionalDefinition(), [], 'draft');
    expect(outcome.errors).toHaveLength(0);
  });

  // The widget treated an uncompilable author pattern as "valid" and the server treated it as
  // "invalid", so a form carrying a malformed regex looked fine while the respondent filled it
  // in and then refused every submit with an error no input could clear. Both sides now fail
  // open on a pattern that cannot compile; the respondent is not the one who made the mistake.
  it('does not reject a respondent because the author pattern will not compile', () => {
    const def: PublishedFormDefinition = {
      formId: 'f',
      formVersionId: 'v',
      name: 'Broken pattern',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      automations: [],
      endScreens: [],
      pages: [
        {
          id: 'p',
          displayOrder: 1,
          questions: [
            {
              id: 'q-code',
              type: 'ShortText',
              prompt: 'Code',
              isRequired: true,
              displayOrder: 1,
              validationRule: { pattern: '[' },
              options: [],
            },
          ],
        },
      ],
    };
    const outcome = validateSubmission(def, [{ questionId: 'q-code', textValue: 'ABC' }], 'complete');
    expect(outcome.errors).toEqual([]);
    expect(outcome.answers.map((a) => a.question.id)).toEqual(['q-code']);
  });

  // Contract test (the fix was driven by the unit-level test in forms-entities): a whitespace-only
  // answer used to satisfy an `isAnswered` conditional, because the evaluator tested
  // `answer.length > 0` while every validator tested `value.trim().length > 0`. One space
  // revealed the dependent branch AND left the trigger question reported as unanswered.
  it('does not reveal an isAnswered branch for a whitespace-only answer', () => {
    const def: PublishedFormDefinition = {
      formId: 'f',
      formVersionId: 'v',
      name: 'Whitespace trigger',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      automations: [],
      endScreens: [],
      pages: [
        {
          id: 'p',
          displayOrder: 1,
          questions: [
            { id: 'q-trigger', type: 'ShortText', prompt: 'Anything?', isRequired: false, displayOrder: 1, options: [] },
            {
              id: 'q-dependent',
              type: 'ShortText',
              prompt: 'Tell us more',
              isRequired: true,
              displayOrder: 2,
              conditionalRule: { show: { all: [{ questionId: 'q-trigger', op: 'isAnswered' }] } },
              options: [],
            },
          ],
        },
      ],
    };
    const outcome = validateSubmission(def, [{ questionId: 'q-trigger', textValue: '   ' }], 'complete');
    // The branch stayed hidden, so nothing asks for `q-dependent`. The one error left is the
    // form-level "nothing to submit" (#124): a whitespace-only answer stores nothing, and a
    // completion that stores nothing is refused rather than sealed.
    expect(outcome.errors.map((e) => e.questionId)).toEqual([undefined]);
    expect(outcome.answers).toEqual([]);
  });

  // The end-to-end shape of the Date bypass: `FormAnswerInputType` exposes the typed columns
  // independently and never cross-checks them against the question's declared type, so an
  // anonymous caller can answer a Date question with `numericValue` and skip the string branch
  // entirely. It persisted as a Complete response with NumericValue set on a Date question.
  it('rejects a Date question answered through numericValue', () => {
    const def: PublishedFormDefinition = {
      formId: 'f',
      formVersionId: 'v',
      name: 'Date',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      automations: [],
      endScreens: [],
      pages: [
        {
          id: 'p',
          displayOrder: 1,
          questions: [
            { id: 'q-date', type: 'Date', prompt: 'When?', isRequired: true, displayOrder: 1, options: [] },
          ],
        },
      ],
    };
    const outcome = validateSubmission(def, [{ questionId: 'q-date', numericValue: 999999 }], 'complete');
    expect(outcome.errors.map((e) => e.questionId)).toEqual(['q-date']);
    expect(outcome.answers).toEqual([]);
  });
});

/**
 * The three things a submission can be, and how much of the rulebook each is held to.
 *
 * This was a boolean, `partial`, and the pipeline passed `true` for two unrelated situations: an
 * autosaved draft, and a COMPLETED submission from someone a knockout rule screened out. They
 * are not the same claim. A draft is unfinished, so judging its half-typed values would be
 * unfair. A screened-out submission is finished — it is a terminal write that seals the response
 * — and the only thing it legitimately needs waived is `isRequired` on questions the respondent
 * never reached. Waiving format as well meant the one path where an author's own validation was
 * silently off was the path that writes a permanent row.
 */
describe('validateSubmission — what each mode waives', () => {
  function emailForm(): PublishedFormDefinition {
    return {
      formId: 'f',
      formVersionId: 'v',
      name: 'Screening',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      automations: [],
      endScreens: [],
      pages: [
        {
          id: 'p1',
          displayOrder: 1,
          questions: [
            { id: 'q-email', type: 'Email', prompt: 'Email', isRequired: false, displayOrder: 1, options: [] },
            { id: 'q-name', type: 'ShortText', prompt: 'Name', isRequired: true, displayOrder: 2, options: [] },
          ],
        },
      ],
    };
  }

  const malformed = [{ questionId: 'q-email', textValue: 'not-an-email' }];

  describe('happy', () => {
    it("'screened-out' does not ask for what the respondent never reached", () => {
      const outcome = validateSubmission(emailForm(), [{ questionId: 'q-email', textValue: 'a@b.com' }], 'screened-out');
      expect(outcome.errors).toEqual([]);
    });

    it("'complete' asks for everything", () => {
      const outcome = validateSubmission(emailForm(), [{ questionId: 'q-email', textValue: 'a@b.com' }], 'complete');
      expect(outcome.errors.map((e) => e.questionId)).toEqual(['q-name']);
    });
  });

  describe('edge', () => {
    it("'draft' waives the format of a value still being typed", () => {
      expect(validateSubmission(emailForm(), malformed, 'draft').errors).toEqual([]);
    });
  });

  describe('worst', () => {
    it("'screened-out' still refuses a malformed answer the respondent DID supply", () => {
      // The terminal write that seals a disqualification is the last chance to catch this; the
      // row it writes is permanent and nothing revalidates it afterwards.
      expect(validateSubmission(emailForm(), malformed, 'screened-out').errors.map((e) => e.questionId)).toEqual([
        'q-email',
      ]);
    });
  });
});

/**
 * Issue #124. An answer whose question id names NO question in the published version used to
 * fall straight through: the walk visits the definition's questions and looks the inputs up, so
 * an input nothing looks up is neither an error nor an answer. Persistence then sealed whatever
 * was left — including nothing — as `Complete` and counted it against the quota.
 */
describe('validateSubmission — answers that match no question (#124)', () => {
  /** Two OPTIONAL questions plus a Statement, so "nothing answered" is reachable without a required error. */
  function optionalForm(): PublishedFormDefinition {
    return {
      formId: 'f',
      formVersionId: 'v',
      name: 'Optional',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      pages: [
        {
          id: 'p1',
          displayOrder: 1,
          questions: [
            { id: 'q-first', type: 'ShortText', prompt: 'First name', isRequired: false, displayOrder: 1, options: [] },
            { id: 'q-colour', type: 'ShortText', prompt: 'Colour', isRequired: false, displayOrder: 2, options: [] },
            { id: 'q-note', type: 'Statement', prompt: 'Display only', isRequired: false, displayOrder: 3, options: [] },
          ],
        },
      ],
    };
  }

  const ghost = { questionId: 'q-ghost', textValue: 'boo' };

  describe('unknown question id', () => {
    it('refuses an answer set that matches nothing, naming the id it could not place', () => {
      const outcome = validateSubmission(optionalForm(), [ghost], 'complete');
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0].questionId).toBe('q-ghost');
      expect(outcome.answers).toEqual([]);
    });

    it('refuses a MIXED set whole, and names only the unknown id', () => {
      const outcome = validateSubmission(
        optionalForm(),
        [{ questionId: 'q-first', textValue: 'Ada' }, ghost],
        'complete',
      );
      expect(outcome.errors.map((e) => e.questionId)).toEqual(['q-ghost']);
    });

    it('is malformed input in every mode, so a draft is refused too', () => {
      expect(validateSubmission(optionalForm(), [ghost], 'draft').errors.map((e) => e.questionId)).toEqual(['q-ghost']);
    });

    it('still drops a KNOWN question hidden by a rule silently (an autosave may predate the rule)', () => {
      const outcome = validateSubmission(
        conditionalDefinition(),
        [
          { questionId: 'q-choice', textValue: 'Yes' },
          { questionId: 'q-other', textValue: 'stale' },
        ],
        'complete',
      );
      expect(outcome.errors).toEqual([]);
      expect(outcome.answers.map((a) => a.question.id)).toEqual(['q-choice']);
    });

    it('still drops an answer to a display-only question silently', () => {
      const outcome = validateSubmission(
        optionalForm(),
        [
          { questionId: 'q-first', textValue: 'Ada' },
          { questionId: 'q-note', textValue: 'noise' },
        ],
        'complete',
      );
      expect(outcome.errors).toEqual([]);
      expect(outcome.answers.map((a) => a.question.id)).toEqual(['q-first']);
    });
  });

  describe('a completion that stores nothing', () => {
    it('refuses an empty answer set on a final submit with a form-level error', () => {
      const outcome = validateSubmission(optionalForm(), [], 'complete');
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0].questionId).toBeUndefined();
      expect(outcome.errors[0].message).toMatch(/at least one/i);
    });

    it('refuses a final submit whose only answers are blank', () => {
      const outcome = validateSubmission(optionalForm(), [{ questionId: 'q-first', textValue: '   ' }], 'complete');
      expect(outcome.errors.map((e) => e.questionId)).toEqual([undefined]);
    });

    it('lets an empty draft through — an autosave with nothing typed yet is normal', () => {
      expect(validateSubmission(optionalForm(), [], 'draft').errors).toEqual([]);
    });

    it('does not double up on a required-field error', () => {
      const outcome = validateSubmission(conditionalDefinition(), [], 'complete');
      expect(outcome.errors.map((e) => e.questionId)).toEqual(['q-choice']);
    });
  });
});
