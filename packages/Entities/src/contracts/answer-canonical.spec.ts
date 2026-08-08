import { describe, it, expect } from 'vitest';
import {
  CanonicalAnswers,
  collapseAnswer,
  foldQuestionId,
  isFileAnswer,
  type StoredAnswerRow,
} from './answer-canonical';

/** Build a stored answer row, defaulting every typed column to null (the DB's own shape). */
function row(overrides: Partial<StoredAnswerRow> = {}): StoredAnswerRow {
  return {
    QuestionID: 'q1',
    TextValue: null,
    NumericValue: null,
    DateValue: null,
    BooleanValue: null,
    JSONValue: null,
    FileID: null,
    ...overrides,
  };
}

describe('collapseAnswer', () => {
  describe('column precedence', () => {
    it('takes TextValue first', () => {
      expect(collapseAnswer(row({ TextValue: 'hello', NumericValue: 5 }))).toBe('hello');
    });

    it('takes NumericValue when there is no text', () => {
      expect(collapseAnswer(row({ NumericValue: 42, BooleanValue: true }))).toBe(42);
    });

    it('takes DateValue before BooleanValue', () => {
      const value = collapseAnswer(row({ DateValue: new Date('2026-08-07T12:00:00Z'), BooleanValue: true }));
      expect(value).toBe('2026-08-07T12:00:00.000Z');
    });

    it('takes BooleanValue before JSONValue', () => {
      expect(collapseAnswer(row({ BooleanValue: false, JSONValue: '["a"]' }))).toBe(false);
    });

    it('takes JSONValue before FileID', () => {
      expect(collapseAnswer(row({ JSONValue: '["a","b"]', FileID: 'f-1' }))).toEqual(['a', 'b']);
    });

    it('falls through to FileID last', () => {
      expect(collapseAnswer(row({ FileID: 'file-guid' }))).toEqual({ fileId: 'file-guid' });
    });
  });

  describe('absent vs empty (the merge-policy-critical distinction)', () => {
    it('returns undefined when every column is null', () => {
      expect(collapseAnswer(row())).toBeUndefined();
    });

    it('returns undefined when every column is absent (the RunView "simple" shape)', () => {
      expect(collapseAnswer({})).toBeUndefined();
    });

    it('treats an empty string as a PRESENT answer, not an absent one', () => {
      expect(collapseAnswer(row({ TextValue: '' }))).toBe('');
    });

    it('treats zero as a PRESENT answer', () => {
      expect(collapseAnswer(row({ NumericValue: 0 }))).toBe(0);
    });

    it('treats false as a PRESENT answer', () => {
      expect(collapseAnswer(row({ BooleanValue: false }))).toBe(false);
    });

    it('treats a JSON literal null as a PRESENT answer whose value is null', () => {
      expect(collapseAnswer(row({ JSONValue: 'null' }))).toBeNull();
    });
  });

  describe('dates', () => {
    it('normalizes a Date object to an ISO instant', () => {
      expect(collapseAnswer(row({ DateValue: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)) }))).toBe(
        '2026-01-02T03:04:05.000Z',
      );
    });

    it('normalizes a date STRING to the same ISO spelling (the "simple" RunView shape)', () => {
      expect(collapseAnswer(row({ DateValue: '2026-01-02T03:04:05.000Z' }))).toBe('2026-01-02T03:04:05.000Z');
    });

    it('keeps an unparseable date string verbatim rather than losing what was stored', () => {
      expect(collapseAnswer(row({ DateValue: 'sometime next tuesday' }))).toBe('sometime next tuesday');
    });

    it('falls through to later columns for an invalid Date object, and never throws', () => {
      const value = collapseAnswer(row({ DateValue: new Date('nonsense'), FileID: 'file-guid' }));
      expect(value).toEqual({ fileId: 'file-guid' });
    });
  });

  describe('JSON', () => {
    it('parses an object', () => {
      expect(collapseAnswer(row({ JSONValue: '{"a":1}' }))).toEqual({ a: 1 });
    });

    it('parses an array (the MultiChoice shape)', () => {
      expect(collapseAnswer(row({ JSONValue: '["x","y"]' }))).toEqual(['x', 'y']);
    });

    it('keeps unparseable JSON as the raw string', () => {
      expect(collapseAnswer(row({ JSONValue: '{not json' }))).toBe('{not json');
    });
  });
});

describe('foldQuestionId', () => {
  it('lowercases', () => {
    expect(foldQuestionId('3E4F-AB')).toBe('3e4f-ab');
  });

  it('trims', () => {
    expect(foldQuestionId('  3e4f  ')).toBe('3e4f');
  });
});

describe('CanonicalAnswers', () => {
  it('finds a SQL-Server-uppercase stored GUID via a client-lowercase lookup', () => {
    const answers = new CanonicalAnswers([
      row({ QuestionID: '3E4F1A2B-0000-4000-8000-000000000001', TextValue: 'a@b.com' }),
    ]);
    expect(answers.Get('3e4f1a2b-0000-4000-8000-000000000001')).toBe('a@b.com');
    expect(answers.Has('3e4f1a2b-0000-4000-8000-000000000001')).toBe(true);
  });

  it('finds a lowercase stored GUID via an uppercase lookup', () => {
    const answers = new CanonicalAnswers([row({ QuestionID: 'abc-1', TextValue: 'v' })]);
    expect(answers.Get('ABC-1')).toBe('v');
  });

  it('omits unanswered questions entirely, so Has() is a real presence test', () => {
    const answers = new CanonicalAnswers([row({ QuestionID: 'q-blank' }), row({ QuestionID: 'q-real', TextValue: 'x' })]);
    expect(answers.Has('q-blank')).toBe(false);
    expect(answers.Get('q-blank')).toBeUndefined();
    expect(answers.Has('q-real')).toBe(true);
    expect(answers.Size).toBe(1);
  });

  it('distinguishes a present-but-empty answer from an absent one', () => {
    const answers = new CanonicalAnswers([row({ QuestionID: 'q-empty', TextValue: '' })]);
    expect(answers.Has('q-empty')).toBe(true);
    expect(answers.Get('q-empty')).toBe('');
    expect(answers.Has('q-never-asked')).toBe(false);
  });

  it('keeps the first present value when a question id repeats', () => {
    const answers = new CanonicalAnswers([
      row({ QuestionID: 'dup', TextValue: 'first' }),
      row({ QuestionID: 'DUP', TextValue: 'second' }),
    ]);
    expect(answers.Get('dup')).toBe('first');
    expect(answers.Size).toBe(1);
  });

  it('does not let a later blank duplicate erase an earlier answer', () => {
    const answers = new CanonicalAnswers([
      row({ QuestionID: 'dup', TextValue: 'real answer' }),
      row({ QuestionID: 'dup' }),
    ]);
    expect(answers.Get('dup')).toBe('real answer');
  });

  it('exposes entries keyed by the folded id', () => {
    const answers = new CanonicalAnswers([row({ QuestionID: 'ABC', NumericValue: 7 })]);
    expect([...answers.Entries()]).toEqual([['abc', 7]]);
  });

  it('is empty for a response with no answers', () => {
    const answers = new CanonicalAnswers([]);
    expect(answers.Size).toBe(0);
    expect(answers.Get('anything')).toBeUndefined();
  });
});

describe('isFileAnswer', () => {
  it('recognizes a collapsed file answer', () => {
    expect(isFileAnswer(collapseAnswer(row({ FileID: 'f-1' })))).toBe(true);
  });

  it('rejects a JSON answer that merely carries a fileId key', () => {
    expect(isFileAnswer(collapseAnswer(row({ JSONValue: '{"fileId":"f-1","other":true}' })))).toBe(false);
  });

  it('rejects a fileId whose value is not a string', () => {
    expect(isFileAnswer(collapseAnswer(row({ JSONValue: '{"fileId":123}' })))).toBe(false);
  });

  it('rejects strings, numbers, arrays, null and absent', () => {
    expect(isFileAnswer('f-1')).toBe(false);
    expect(isFileAnswer(7)).toBe(false);
    expect(isFileAnswer(['f-1'])).toBe(false);
    expect(isFileAnswer(null)).toBe(false);
    expect(isFileAnswer(undefined)).toBe(false);
  });
});
