/**
 * How a stored answer row is read — the one copy both sides use (#303 Task 9): the server derives a
 * list row's respondent label and counts answers through these; the dashboard labels a response's
 * detail through the same functions.
 */
import { describe, expect, it } from 'vitest';
import {
  answerHoldsValue,
  deriveRespondentLabel,
  extractChoiceValues,
  renderAnswer,
} from './answer-values';
import type { StoredAnswerColumns } from './answer-canonical';
import type { PublishedFormQuestion } from './form-definition';
import type { FormQuestionType } from './question-types';

function q(id: string, type: FormQuestionType, prompt: string, options: { value: string; label: string; matrixAxis?: 'Row' | 'Column' }[] = []): PublishedFormQuestion {
  return {
    id,
    type,
    prompt,
    isRequired: false,
    displayOrder: 1,
    options: options.map((o, i) => ({ id: `${id}-o${i}`, displayOrder: i + 1, isDefault: false, ...o })),
  };
}

const blank: StoredAnswerColumns = {
  TextValue: null,
  NumericValue: null,
  DateValue: null,
  BooleanValue: null,
  JSONValue: null,
  FileID: null,
};

describe('extractChoiceValues', () => {
  it('reads a multi-select array, dropping null and blank entries but keeping 0 and false', () => {
    expect(extractChoiceValues({ ...blank, JSONValue: '[null, " a ", "", 0, false]' })).toEqual(['a', '0', 'false']);
  });

  it('falls back to the text column for a single choice, and for JSON that is not an array', () => {
    expect(extractChoiceValues({ ...blank, TextValue: 'a' })).toEqual(['a']);
    expect(extractChoiceValues({ ...blank, TextValue: 'a', JSONValue: '{"x":1}' })).toEqual(['a']);
    expect(extractChoiceValues({ ...blank, TextValue: 'a', JSONValue: '[not json' })).toEqual(['a']);
  });

  it('reads nothing from an empty array or an empty text', () => {
    expect(extractChoiceValues({ ...blank, JSONValue: '[]', TextValue: 'ignored' })).toEqual([]);
    expect(extractChoiceValues({ ...blank, TextValue: '' })).toEqual([]);
  });
});

describe('renderAnswer', () => {
  it('label-maps choices, numbers a ranking, and reads Legal as Accepted/Declined', () => {
    const choice = q('c', 'MultiChoice', 'Pick', [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }]);
    expect(renderAnswer(choice, { ...blank, JSONValue: '["b","a","z"]' })).toBe('Banana, Apple, z');
    const ranking = q('r', 'Ranking', 'Rank', [{ value: 'a', label: 'Apple' }]);
    expect(renderAnswer(ranking, { ...blank, JSONValue: '["a","x"]' })).toBe('1. Apple, 2. x');
    expect(renderAnswer(q('l', 'Legal', 'Terms'), { ...blank, BooleanValue: false })).toBe('Declined');
    expect(renderAnswer(q('y', 'YesNo', 'Ok?'), { ...blank, BooleanValue: true })).toBe('Yes');
  });

  it('renders numbers, dates as their calendar day, and a file answer as nothing', () => {
    expect(renderAnswer(q('n', 'Number', 'How many'), { ...blank, NumericValue: 0 })).toBe('0');
    expect(renderAnswer(q('d', 'Date', 'When'), { ...blank, DateValue: '2026-09-01T00:00:00.000Z' })).toBe('2026-09-01');
    expect(renderAnswer(q('t', 'Time', 'At'), { ...blank, DateValue: new Date('1970-01-01T14:30:00Z') })).toBe('14:30');
    expect(renderAnswer(q('f', 'FileUpload', 'Upload'), { ...blank, FileID: 'file-1' })).toBe('');
  });

  it('renders a Matrix through its option labels and an Address as its parts', () => {
    const matrix = q('m', 'Matrix', 'Rate', [
      { value: 'venue', label: 'Venue', matrixAxis: 'Row' },
      { value: 'great', label: 'Great', matrixAxis: 'Column' },
    ]);
    expect(renderAnswer(matrix, { ...blank, JSONValue: '{"venue":"great"}' })).toBe('Venue: Great');
    expect(renderAnswer(q('a', 'Address', 'Where'), { ...blank, JSONValue: '{"city":"Leeds","country":"UK"}' })).toBe('Leeds, UK');
    expect(renderAnswer(matrix, { ...blank, JSONValue: '{broken' })).toBe('');
  });
});

describe('answerHoldsValue', () => {
  it('counts 0, false and a file as values, and a blank row or whitespace as none', () => {
    expect(answerHoldsValue({ ...blank, NumericValue: 0 })).toBe(true);
    expect(answerHoldsValue({ ...blank, BooleanValue: false })).toBe(true);
    expect(answerHoldsValue({ ...blank, FileID: 'f' })).toBe(true);
    expect(answerHoldsValue(blank)).toBe(false);
    expect(answerHoldsValue({ ...blank, TextValue: '   ', JSONValue: ' ' })).toBe(false);
  });
});

describe('deriveRespondentLabel', () => {
  const questions = [
    q('e', 'Email', 'Email'),
    q('f', 'ShortText', 'First name'),
    q('l', 'ShortText', 'Last name'),
  ];

  it('prefers the linked Person', () => {
    expect(deriveRespondentLabel('Ada Lovelace', [{ ...blank, QuestionID: 'f', TextValue: 'Someone' }], questions)).toBe('Ada Lovelace');
  });

  it('builds a name from first and last name answers, else the email, else Anonymous', () => {
    const named = [
      { ...blank, QuestionID: 'f', TextValue: 'Ada' },
      { ...blank, QuestionID: 'l', TextValue: 'Lovelace' },
      { ...blank, QuestionID: 'e', TextValue: 'ada@example.org' },
    ];
    expect(deriveRespondentLabel(null, named, questions)).toBe('Ada Lovelace');
    expect(deriveRespondentLabel(null, [{ ...blank, QuestionID: 'e', TextValue: 'ada@example.org' }], questions)).toBe('ada@example.org');
    expect(deriveRespondentLabel('', [], questions)).toBe('Anonymous');
  });

  it('matches answers to questions whatever the GUID casing the database returned', () => {
    const upper = [q('aaaaaaaa-0000-4000-8000-00000000000f', 'ShortText', 'Full name')];
    const answer = { ...blank, QuestionID: 'AAAAAAAA-0000-4000-8000-00000000000F', TextValue: 'Ada Lovelace' };
    expect(deriveRespondentLabel(null, [answer], upper)).toBe('Ada Lovelace');
  });
});
