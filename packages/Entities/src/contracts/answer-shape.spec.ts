/**
 * The SHAPE an answer may arrive in — the rules `validateAnswers` applies before it judges any value,
 * shared by the widget and the server (#303 Task 8 fix round 2).
 *
 * A Remote Operation's input is JSON the caller wrote, so an answer can be structurally anything:
 * a ShortText answered with a JSON object, one answer filling three columns, a multi-choice of
 * nested arrays, a number the `decimal(18,4)` column cannot hold, or a 20000-deep array that
 * overflows the stack of any recursive reader. Each of these is refused, naming the question, before
 * anything recursive touches the value.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  answerShapeProblem,
  answersStructureRefusal,
  DECIMAL_ANSWER_BOUND_TEXT,
  MAX_ANSWER_JSON_DEPTH,
  MAX_ANSWER_JSON_ITEMS,
} from './answer-shape';
import { validateAnswers } from './answer-validation';
import type { PublishedFormDefinition, PublishedFormQuestion } from './form-definition';
import type { FormQuestionType } from './question-types';
import type { FormAnswerInput } from './submission';
import type { JSONValue } from './json-value';

/** An array nested `depth` levels deep, built without recursion. */
function nested(depth: number): JSONValue {
  let value: JSONValue = [];
  for (let i = 1; i < depth; i++) {
    value = [value];
  }
  return value;
}

function question(id: string, type: FormQuestionType, extra: Partial<PublishedFormQuestion> = {}): PublishedFormQuestion {
  return { id, type, prompt: id, isRequired: false, displayOrder: 1, options: [], ...extra };
}

function formOf(...questions: PublishedFormQuestion[]): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'Shapes',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    pages: [{ id: 'p1', displayOrder: 1, questions }],
    automations: [],
    endScreens: [],
  };
}

describe('answersStructureRefusal — the cheap pre-scan', () => {
  it('refuses a 20000-deep array without overflowing the stack, naming the question', () => {
    const deep: FormAnswerInput = { questionId: 'q-deep', jsonValue: nested(20_000) };
    let errors: ReturnType<typeof answersStructureRefusal> = [];
    expect(() => (errors = answersStructureRefusal([deep]))).not.toThrow();
    expect(errors).toEqual([{ questionId: 'q-deep', message: 'That answer is nested too deeply.' }]);
  });

  it(`admits exactly ${MAX_ANSWER_JSON_DEPTH} levels and refuses one more`, () => {
    expect(answersStructureRefusal([{ questionId: 'q', jsonValue: nested(MAX_ANSWER_JSON_DEPTH) }])).toEqual([]);
    expect(answersStructureRefusal([{ questionId: 'q', jsonValue: nested(MAX_ANSWER_JSON_DEPTH + 1) }])).toHaveLength(1);
  });

  it(`refuses an array or object of more than ${MAX_ANSWER_JSON_ITEMS} parts`, () => {
    const wide = Array.from({ length: MAX_ANSWER_JSON_ITEMS + 1 }, () => 'a');
    const keys = Object.fromEntries(wide.map((_, i) => [`k${i}`, 'v']));
    expect(answersStructureRefusal([{ questionId: 'q-wide', jsonValue: wide }])).toEqual([
      { questionId: 'q-wide', message: 'That answer has too many parts.' },
    ]);
    expect(answersStructureRefusal([{ questionId: 'q-keys', jsonValue: keys }])).toHaveLength(1);
  });

  // Fix round 3 (re-review N3): UTF-8 bytes >= UTF-16 length for every string, so a string LONGER
  // than the byte cap is refused without counting a single byte — a 50 MB answer costs nothing.
  it('refuses a 50 MB string without walking it', () => {
    const huge = 'é'.repeat(25_000_000);
    // Deterministic, not wall-clock: the byte count (`utf8ByteLength`) reads `codePointAt` once per
    // character, and measuring a JSON value serializes it first. Neither may run for a value whose
    // `.length` alone is over the cap.
    const counted = vi.spyOn(String.prototype, 'codePointAt');
    const serialized = vi.spyOn(JSON, 'stringify');
    try {
      const errors = answersStructureRefusal([{ questionId: 'q-huge', textValue: huge }, { questionId: 'q-huge-json', jsonValue: [huge] }]);
      expect(errors.map((e) => e.questionId)).toEqual(['q-huge', 'q-huge-json']);
      expect(errors.every((e) => /too large/.test(e.message))).toBe(true);
      expect(counted).not.toHaveBeenCalled();
      expect(serialized).not.toHaveBeenCalled();
    } finally {
      counted.mockRestore();
      serialized.mockRestore();
    }
  });

  it('refuses an answer over the size ceiling, in any column', () => {
    const big = 'x'.repeat(64 * 1024 + 1);
    expect(answersStructureRefusal([{ questionId: 'q-text', textValue: big }])[0].message).toMatch(/too large/);
    expect(answersStructureRefusal([{ questionId: 'q-json', jsonValue: [big] }])[0].message).toMatch(/too large/);
  });
});

describe('answerShapeProblem — the column a question type stores, and nothing else', () => {
  it('refuses a ShortText answered in the JSON column (review out-of-scope 1)', () => {
    expect(answerShapeProblem('ShortText', { questionId: 'q', jsonValue: { a: { b: 'c' } } })).toBe(
      'That answer is not in the form this question takes.',
    );
  });

  it("refuses an answer in a column its type does not store, even when the value is well-formed for that column", () => {
    expect(answerShapeProblem('ShortText', { questionId: 'q', numericValue: 5 })).toBe('That answer is not in the form this question takes.');
    expect(answerShapeProblem('YesNo', { questionId: 'q', textValue: 'yes' })).toBe('That answer is not in the form this question takes.');
    expect(answerShapeProblem('Date', { questionId: 'q', booleanValue: true })).toBe('That answer is not in the form this question takes.');
    expect(answerShapeProblem('FileUpload', { questionId: 'q', textValue: 'file-id' })).toBe('That answer is not in the form this question takes.');
  });

  it('refuses an answer that fills more than one column', () => {
    expect(answerShapeProblem('ShortText', { questionId: 'q', textValue: 'a', numericValue: 1, booleanValue: true })).toBe(
      'That answer carries more than one value.',
    );
  });

  it('lets a numeric question carry text (the widget sends an unparseable number as text; the format rule then refuses it)', () => {
    expect(answerShapeProblem('Number', { questionId: 'q', textValue: '12abc' })).toBeUndefined();
  });

  it('refuses a multi-choice that is not a flat array of strings (review out-of-scope 4)', () => {
    for (const bad of [[['a']], [{ a: 1 }], ['a', 2], 'a']) {
      expect(answerShapeProblem('MultiChoice', { questionId: 'q', jsonValue: bad as JSONValue })).toBe(
        'That answer is not in the form this question takes.',
      );
    }
    expect(answerShapeProblem('MultiChoice', { questionId: 'q', jsonValue: ['a', 'b'] })).toBeUndefined();
    expect(answerShapeProblem('Ranking', { questionId: 'q', jsonValue: [['a']] })).toBeDefined();
  });

  it('holds a Matrix to rows of a column or a list of columns, and composites to a flat record', () => {
    expect(answerShapeProblem('Matrix', { questionId: 'q', jsonValue: { r1: 'c1', r2: ['c1', 'c2'] } })).toBeUndefined();
    expect(answerShapeProblem('Matrix', { questionId: 'q', jsonValue: { r1: [['c1']] } })).toBeDefined();
    expect(answerShapeProblem('Address', { questionId: 'q', jsonValue: { line1: '1 Main', city: null } })).toBeUndefined();
    expect(answerShapeProblem('Address', { questionId: 'q', jsonValue: { line1: { evil: 1 } } })).toBeDefined();
    expect(answerShapeProblem('ContactInfo', { questionId: 'q', jsonValue: ['not', 'a', 'record'] })).toBeDefined();
  });

  // review out-of-scope 3: `FormResponseAnswer.NumericValue` is decimal(18,4). A value it cannot hold
  // used to overflow inside the save transaction and reach the respondent as a generic failure.
  // Scale is REFUSED, not rounded: rounding would silently store a number the respondent did not give.
  it('refuses a number the decimal(18,4) column cannot hold — out of range, or more than 4 decimal places', () => {
    expect(answerShapeProblem('Number', { questionId: 'q', numericValue: 1e300 })).toBe(
      'Enter a number between -99999999999999.9999 and 99999999999999.9999.',
    );
    expect(answerShapeProblem('Number', { questionId: 'q', numericValue: 1.23456 })).toBe('Use at most 4 decimal places.');
    expect(answerShapeProblem('Number', { questionId: 'q', numericValue: 1.2345 })).toBeUndefined();
  });

  // Fix round 3 (re-review N1): 99999999999999.9999 is not a double — it rounds to exactly 1e14, so a
  // bound compared as `<= 99999999999999.9999` admitted ±1e14, which overflows decimal(18,4) at commit.
  // The bound is EXCLUSIVE at 1e14, and the message prints the column's true bound as text.
  it('refuses ±1e14 exactly and admits the largest number below it, printing the true bound', () => {
    expect(DECIMAL_ANSWER_BOUND_TEXT).toBe('99999999999999.9999');
    for (const edge of [1e14, -1e14]) {
      expect(answerShapeProblem('Number', { questionId: 'q', numericValue: edge })).toBe(
        'Enter a number between -99999999999999.9999 and 99999999999999.9999.',
      );
    }
    expect(answerShapeProblem('Number', { questionId: 'q', numericValue: 99_999_999_999_999.98 })).toBeUndefined();
    expect(answerShapeProblem('Number', { questionId: 'q', numericValue: -99_999_999_999_999.98 })).toBeUndefined();
  });
});

describe('validateAnswers refuses a malformed shape in every mode, naming the question', () => {
  const form = formOf(question('q-text', 'ShortText'), question('q-multi', 'MultiChoice', { options: [{ id: 'o', label: 'A', value: 'a', displayOrder: 1 }] }));
  for (const mode of ['complete', 'draft', 'screened-out'] as const) {
    it(`${mode}: a JSON-column ShortText and a nested multi-choice`, () => {
      const outcome = validateAnswers(
        form,
        [
          { questionId: 'q-text', jsonValue: { a: { b: 'c' } } },
          { questionId: 'q-multi', jsonValue: [['a']] },
        ],
        mode,
      );
      expect(outcome.errors.map((e) => e.questionId).sort()).toEqual(['q-multi', 'q-text']);
      expect(outcome.answers).toEqual([]);
    });
  }

  it('refuses a 20000-deep answer without throwing', () => {
    expect(() => validateAnswers(form, [{ questionId: 'q-text', jsonValue: nested(20_000) }], 'complete')).not.toThrow();
    expect(validateAnswers(form, [{ questionId: 'q-text', jsonValue: nested(20_000) }], 'complete').errors[0].questionId).toBe('q-text');
  });
});
