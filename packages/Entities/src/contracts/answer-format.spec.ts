import { describe, expect, it } from 'vitest';
import {
  matchesValidationPattern,
  validateAnswerFormat,
  validateCompositeParts,
  isRequiredSatisfied,
} from './answer-format';

describe('matchesValidationPattern', () => {
  it('anchors the author pattern to the whole value', () => {
    expect(matchesValidationPattern('12345', '\\d{5}')).toBe(true);
    expect(matchesValidationPattern('123456', '\\d{5}')).toBe(false);
    expect(matchesValidationPattern('abc', '\\d{5}')).toBe(false);
  });

  // An author's pattern that will not compile is an AUTHORING defect, and the respondent is
  // the wrong person to punish for it. The widget already failed open here; the server failed
  // CLOSED, so a form carrying a malformed pattern showed the respondent no error, accepted
  // their input client-side, then rejected the submit with a field error nothing they could
  // type would clear — an unsubmittable form. Both sides now fail open, and the type floor
  // (validateAnswerFormat) still applies, so failing open does not mean "unvalidated".
  it('does not block the respondent when the author pattern cannot compile', () => {
    for (const broken of ['[', '(', '*', '\\']) {
      expect(matchesValidationPattern('anything', broken)).toBe(true);
    }
  });
});

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

  // `Number('0x10')` is 16, so a bare `Number.isFinite` check called these valid. The value is
  // then persisted verbatim as the text the respondent typed, and nothing downstream — a report,
  // a SQL numeric cast, `parseFloat` — reads "0x10" as 16. Accepting a number we do not go on to
  // store as that number is worse than rejecting it.
  it('rejects non-decimal numeric literals that Number() would silently convert', () => {
    for (const literal of ['0x10', '0b101', '0o17']) {
      expect(validateAnswerFormat('Number', literal)).toBe('Enter a number.');
    }
  });

  it('still accepts every decimal spelling a respondent might reasonably type', () => {
    for (const ok of ['1e5', '1E-5', '+7', '.5', '12.', '  42  ', '-3.5', '0']) {
      expect(validateAnswerFormat('Number', ok)).toBeUndefined();
    }
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

  // `dateValue` is a plain nullable GraphQL String (`FormAnswerInputType`), so nothing upstream
  // coerces or rejects it — there is no date scalar in the schema. A `Date` question answered
  // through a different typed column therefore arrives here as a number/boolean/array, and
  // waving those through is the same "posted straight at the mutation" bypass this module was
  // written to close for Email.
  it('rejects a non-string smuggled in through another typed column', () => {
    expect(validateAnswerFormat('Date', 1754006400000)).toBe('Enter a valid date.');
    expect(validateAnswerFormat('Date', true)).toBe('Enter a valid date.');
    expect(validateAnswerFormat('Date', ['2026-08-01'])).toBe('Enter a valid date.');
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

describe('validateCompositeParts', () => {
  it('reports every wrong part, not just the first', () => {
    const parts = validateCompositeParts('ContactInfo', { email: 'fsa', phone: '12' });

    expect(parts).toEqual({
      email: 'Enter a valid email address.',
      phone: 'Enter a valid phone number.',
    });
  });
});

describe('validateAnswerFormat for ContactInfo', () => {
  it('keeps the single message unchanged when only one part is wrong', () => {
    expect(validateAnswerFormat('ContactInfo', { email: 'fsa', phone: '5512161548' })).toBe(
      'Enter a valid email address.',
    );
  });

  it('mentions both problems when both parts are wrong', () => {
    const message = validateAnswerFormat('ContactInfo', { email: 'fsa', phone: '12' });

    expect(message).toContain('email');
    expect(message).toContain('phone');
  });

  it('stays valid when the parts are fine', () => {
    expect(
      validateAnswerFormat('ContactInfo', { email: 'a@b.com', phone: '5512161548' }),
    ).toBeUndefined();
  });
});

describe('isRequiredSatisfied', () => {
  it('demands a TICK from a required consent box, not merely a value', () => {
    expect(isRequiredSatisfied('Legal', false)).toBe(false);
    expect(isRequiredSatisfied('Checkbox', false)).toBe(false);
    expect(isRequiredSatisfied('Legal', true)).toBe(true);
  });

  it('does not confuse a legitimate falsy answer with an absent one', () => {
    // A zero rating and an explicit "No" are real answers, and a required question is
    // satisfied by them.
    expect(isRequiredSatisfied('NPS', 0)).toBe(true);
    expect(isRequiredSatisfied('Rating', 0)).toBe(true);
    expect(isRequiredSatisfied('YesNo', false)).toBe(true);
  });

  it('falls back to the ordinary answered test for everything else', () => {
    expect(isRequiredSatisfied('ShortText', '')).toBe(false);
    expect(isRequiredSatisfied('ShortText', '  ')).toBe(false);
    expect(isRequiredSatisfied('ShortText', 'hi')).toBe(true);
    expect(isRequiredSatisfied('Ranking', [])).toBe(false);
  });
});
