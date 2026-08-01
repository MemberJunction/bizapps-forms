import { describe, expect, it } from 'vitest';
import { validateAnswerFormat } from './answer-format';

describe('validateAnswerFormat — Email', () => {
  it('rejects a value that is not an email address for an Email question', () => {
    expect(validateAnswerFormat('Email', 'not-an-email')).toBe('Enter a valid email address.');
  });

  it('accepts ordinary addresses, including the plus-tag and subdomain shapes real people use', () => {
    for (const ok of ['a@b.co', 'first.last@example.com', 'user+tag@mail.example.co.uk']) {
      expect(validateAnswerFormat('Email', ok)).toBeUndefined();
    }
  });

  it('ignores surrounding whitespace rather than failing on it', () => {
    expect(validateAnswerFormat('Email', '  someone@example.com  ')).toBeUndefined();
  });
});

describe('validateAnswerFormat — numeric types', () => {
  it('rejects a non-numeric answer to Number, Rating and NPS', () => {
    for (const type of ['Number', 'Rating', 'NPS'] as const) {
      expect(validateAnswerFormat(type, 'seven')).toBe('Enter a number.');
    }
  });

  it('accepts numbers, numeric strings, and zero', () => {
    expect(validateAnswerFormat('Number', 42)).toBeUndefined();
    expect(validateAnswerFormat('Number', '42')).toBeUndefined();
    expect(validateAnswerFormat('Number', '-3.5')).toBeUndefined();
    expect(validateAnswerFormat('Number', 0)).toBeUndefined();
  });

  it('rejects the non-finite values Number() happily produces', () => {
    expect(validateAnswerFormat('Number', Number.NaN)).toBe('Enter a number.');
    expect(validateAnswerFormat('Number', Number.POSITIVE_INFINITY)).toBe('Enter a number.');
  });
});

describe('validateAnswerFormat — Phone', () => {
  it('accepts the punctuation-and-spacing shapes real respondents type', () => {
    for (const ok of ['+1 (555) 123-4567', '555-1234', '+44 20 7946 0958', '5551234567']) {
      expect(validateAnswerFormat('Phone', ok)).toBeUndefined();
    }
  });

  it('rejects a value carrying no plausible number of digits', () => {
    expect(validateAnswerFormat('Phone', 'call me maybe')).toBe('Enter a valid phone number.');
    expect(validateAnswerFormat('Phone', '12345')).toBe('Enter a valid phone number.');
  });
});

describe('validateAnswerFormat — Date', () => {
  it('accepts an ISO date, which is how the widget spells one', () => {
    expect(validateAnswerFormat('Date', '2026-08-01')).toBeUndefined();
    expect(validateAnswerFormat('Date', '2026-08-01T12:30:00.000Z')).toBeUndefined();
  });

  it('rejects a string that is not a date at all', () => {
    expect(validateAnswerFormat('Date', 'sometime next week')).toBe('Enter a valid date.');
  });
});

describe('validateAnswerFormat — unanswered values', () => {
  // "Not answered" is the isRequired check's business. A format check that fired on an empty
  // value would report "Enter a valid email address." on a question the respondent simply left
  // blank — and `String(null)` is `'null'`, which is exactly the shape that trips an email test.
  it('never reports a format error for a value that was not answered', () => {
    for (const empty of [null, undefined, '', '   ']) {
      expect(validateAnswerFormat('Email', empty)).toBeUndefined();
      expect(validateAnswerFormat('Number', empty)).toBeUndefined();
      expect(validateAnswerFormat('Phone', empty)).toBeUndefined();
      expect(validateAnswerFormat('Date', empty)).toBeUndefined();
    }
  });
});

describe('validateAnswerFormat — types that imply no format', () => {
  it('never constrains free-text or choice questions', () => {
    for (const type of ['ShortText', 'LongText', 'SingleChoice', 'Dropdown', 'YesNo'] as const) {
      expect(validateAnswerFormat(type, 'anything at all')).toBeUndefined();
    }
  });
});
