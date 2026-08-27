import { describe, expect, it } from 'vitest';
import {
  matchesValidationPattern,
  validateAnswerFormat,
  validateCompositeParts,
  isRequiredSatisfied,
  answerCompleteness,
  ratingScaleMax,
  numericScalePoints,
  impliedAnswerValues,
  MAX_IMPLIED_SCALE_POINTS,
} from './answer-format';
import { FORM_QUESTION_TYPES } from './question-types';

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
    expect(validateAnswerFormat({ type: 'Email' }, 'not-an-email')).toBe('Enter a valid email address.');
  });

  it('accepts ordinary addresses, including the plus-tag and subdomain shapes real people use', () => {
    for (const ok of ['a@b.co', 'first.last@example.com', 'user+tag@mail.example.co.uk']) {
      expect(validateAnswerFormat({ type: 'Email' }, ok)).toBeUndefined();
    }
  });

  it('ignores surrounding whitespace rather than failing on it', () => {
    expect(validateAnswerFormat({ type: 'Email' }, '  someone@example.com  ')).toBeUndefined();
  });
});

describe('validateAnswerFormat — numeric types', () => {
  it('rejects a non-numeric answer to Number, Rating and NPS', () => {
    for (const type of ['Number', 'Rating', 'NPS'] as const) {
      expect(validateAnswerFormat({ type }, 'seven')).toBe('Enter a number.');
    }
  });

  it('accepts numbers, numeric strings, and zero', () => {
    expect(validateAnswerFormat({ type: 'Number' }, 42)).toBeUndefined();
    expect(validateAnswerFormat({ type: 'Number' }, '42')).toBeUndefined();
    expect(validateAnswerFormat({ type: 'Number' }, '-3.5')).toBeUndefined();
    expect(validateAnswerFormat({ type: 'Number' }, 0)).toBeUndefined();
  });

  it('rejects the non-finite values Number() happily produces', () => {
    expect(validateAnswerFormat({ type: 'Number' }, Number.NaN)).toBe('Enter a number.');
    expect(validateAnswerFormat({ type: 'Number' }, Number.POSITIVE_INFINITY)).toBe('Enter a number.');
  });

  // `Number('0x10')` is 16, so a bare `Number.isFinite` check called these valid. The value is
  // then persisted verbatim as the text the respondent typed, and nothing downstream — a report,
  // a SQL numeric cast, `parseFloat` — reads "0x10" as 16. Accepting a number we do not go on to
  // store as that number is worse than rejecting it.
  it('rejects non-decimal numeric literals that Number() would silently convert', () => {
    for (const literal of ['0x10', '0b101', '0o17']) {
      expect(validateAnswerFormat({ type: 'Number' }, literal)).toBe('Enter a number.');
    }
  });

  it('still accepts every decimal spelling a respondent might reasonably type', () => {
    for (const ok of ['1e5', '1E-5', '+7', '.5', '12.', '  42  ', '-3.5', '0']) {
      expect(validateAnswerFormat({ type: 'Number' }, ok)).toBeUndefined();
    }
  });
});

describe('validateAnswerFormat — Phone', () => {
  it('accepts the punctuation-and-spacing shapes real respondents type', () => {
    for (const ok of ['+1 (555) 123-4567', '555-1234', '+44 20 7946 0958', '5551234567']) {
      expect(validateAnswerFormat({ type: 'Phone' }, ok)).toBeUndefined();
    }
  });

  it('rejects a value carrying no plausible number of digits', () => {
    expect(validateAnswerFormat({ type: 'Phone' }, 'call me maybe')).toBe('Enter a valid phone number.');
    expect(validateAnswerFormat({ type: 'Phone' }, '12345')).toBe('Enter a valid phone number.');
  });
});

describe('validateAnswerFormat — Date', () => {
  it('accepts an ISO date, which is how the widget spells one', () => {
    expect(validateAnswerFormat({ type: 'Date' }, '2026-08-01')).toBeUndefined();
    expect(validateAnswerFormat({ type: 'Date' }, '2026-08-01T12:30:00.000Z')).toBeUndefined();
  });

  it('rejects a string that is not a date at all', () => {
    expect(validateAnswerFormat({ type: 'Date' }, 'sometime next week')).toBe('Enter a valid date.');
  });

  // `dateValue` is a plain nullable GraphQL String (`FormAnswerInputType`), so nothing upstream
  // coerces or rejects it — there is no date scalar in the schema. A `Date` question answered
  // through a different typed column therefore arrives here as a number/boolean/array, and
  // waving those through is the same "posted straight at the mutation" bypass this module was
  // written to close for Email.
  it('rejects a non-string smuggled in through another typed column', () => {
    expect(validateAnswerFormat({ type: 'Date' }, 1754006400000)).toBe('Enter a valid date.');
    expect(validateAnswerFormat({ type: 'Date' }, true)).toBe('Enter a valid date.');
    expect(validateAnswerFormat({ type: 'Date' }, ['2026-08-01'])).toBe('Enter a valid date.');
  });
});

describe('validateAnswerFormat — unanswered values', () => {
  // "Not answered" is the isRequired check's business. A format check that fired on an empty
  // value would report "Enter a valid email address." on a question the respondent simply left
  // blank — and `String(null)` is `'null'`, which is exactly the shape that trips an email test.
  it('never reports a format error for a value that was not answered', () => {
    for (const empty of [null, undefined, '', '   ']) {
      expect(validateAnswerFormat({ type: 'Email' }, empty)).toBeUndefined();
      expect(validateAnswerFormat({ type: 'Number' }, empty)).toBeUndefined();
      expect(validateAnswerFormat({ type: 'Phone' }, empty)).toBeUndefined();
      expect(validateAnswerFormat({ type: 'Date' }, empty)).toBeUndefined();
    }
  });
});

describe('validateAnswerFormat — types that imply no format', () => {
  it('never constrains free-text or choice questions', () => {
    for (const type of ['ShortText', 'LongText', 'SingleChoice', 'Dropdown', 'YesNo'] as const) {
      expect(validateAnswerFormat({ type }, 'anything at all')).toBeUndefined();
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
    expect(validateAnswerFormat({ type: 'ContactInfo' }, { email: 'fsa', phone: '5512161548' })).toBe(
      'Enter a valid email address.',
    );
  });

  it('mentions both problems when both parts are wrong', () => {
    const message = validateAnswerFormat({ type: 'ContactInfo' }, { email: 'fsa', phone: '12' });

    expect(message).toContain('email');
    expect(message).toContain('phone');
  });

  it('stays valid when the parts are fine', () => {
    expect(
      validateAnswerFormat({ type: 'ContactInfo' }, { email: 'a@b.com', phone: '5512161548' }),
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

describe('answerCompleteness', () => {
  it('gives a composite credit per sub-field, so filling one of five is not the whole question', () => {
    expect(answerCompleteness('ContactInfo', { firstName: 'Ada' })).toBeCloseTo(0.2);
    expect(answerCompleteness('ContactInfo', { firstName: 'Ada', lastName: 'L' })).toBeCloseTo(0.4);
    expect(
      answerCompleteness('ContactInfo', {
        firstName: 'Ada', lastName: 'L', email: 'a@b.co', phone: '5551234567', company: 'X',
      }),
    ).toBe(1);
  });

  it('counts address parts the same way', () => {
    expect(answerCompleteness('Address', { line1: '1 High St' })).toBeCloseTo(1 / 6);
  });

  it('is all-or-nothing for a scalar question', () => {
    expect(answerCompleteness('ShortText', 'hi')).toBe(1);
    expect(answerCompleteness('ShortText', '')).toBe(0);
    expect(answerCompleteness('ShortText', undefined)).toBe(0);
  });

  it('gives an unticked consent box no credit, matching what required demands of it', () => {
    expect(answerCompleteness('Legal', false)).toBe(0);
    expect(answerCompleteness('Legal', true)).toBe(1);
  });

  it('still credits a legitimate falsy answer', () => {
    expect(answerCompleteness('YesNo', false)).toBe(1);
    expect(answerCompleteness('NPS', 0)).toBe(1);
  });
});

describe('validateAnswerFormat — answers checked against the authored options', () => {
  // A value is only a valid answer if the author actually offered it. Checking the SHAPE alone
  // ("is it a string?", "is it an array of strings?") let a caller posting straight at the
  // GraphQL mutation store a `PictureChoice` of "banana", a `Ranking` that repeats one option
  // five times, a `Matrix` keyed on rows that do not exist, and an `OpinionScale` of 4000. Each
  // then flows into the reporting aggregations as a real answer, so the chart shows a bucket
  // nobody could have picked.
  const choices = [
    { value: 'red', displayOrder: 0 },
    { value: 'green', displayOrder: 1 },
  ];

  it('rejects a PictureChoice value the author never offered', () => {
    expect(validateAnswerFormat({ type: 'PictureChoice', options: choices }, 'banana')).toBe(
      'Choose one of the offered options.',
    );
  });

  it('accepts a PictureChoice value that was offered', () => {
    expect(validateAnswerFormat({ type: 'PictureChoice', options: choices }, 'red')).toBeUndefined();
  });

  it('rejects a SingleChoice / Dropdown value the author never offered', () => {
    expect(validateAnswerFormat({ type: 'SingleChoice', options: choices }, 'blue')).toBe(
      'Choose one of the offered options.',
    );
    expect(validateAnswerFormat({ type: 'Dropdown', options: choices }, 'blue')).toBe(
      'Choose one of the offered options.',
    );
  });

  it('rejects a MultiChoice selection containing an option the author never offered', () => {
    expect(validateAnswerFormat({ type: 'MultiChoice', options: choices }, ['red', 'blue'])).toBe(
      'Choose only from the offered options.',
    );
  });

  it('rejects a MultiChoice selection that repeats an option', () => {
    expect(validateAnswerFormat({ type: 'MultiChoice', options: choices }, ['red', 'red'])).toBe(
      'Each option may be chosen only once.',
    );
  });

  it('rejects a Ranking containing an unknown option', () => {
    expect(validateAnswerFormat({ type: 'Ranking', options: choices }, ['red', 'purple'])).toBe(
      'Rank only the offered options.',
    );
  });

  it('rejects a Ranking that lists the same option twice', () => {
    // A duplicate makes the ordering meaningless — position 1 and position 2 are the same thing.
    expect(validateAnswerFormat({ type: 'Ranking', options: choices }, ['red', 'red'])).toBe(
      'Each option may be ranked only once.',
    );
  });

  it('accepts a Ranking of the offered options', () => {
    expect(
      validateAnswerFormat({ type: 'Ranking', options: choices }, ['green', 'red']),
    ).toBeUndefined();
  });

  it('rejects a Matrix keyed on a row the author never authored', () => {
    const matrix = {
      type: 'Matrix' as const,
      options: [
        { value: 'speed', matrixAxis: 'Row' as const, displayOrder: 0 },
        { value: 'good', matrixAxis: 'Column' as const, displayOrder: 1 },
      ],
    };
    expect(validateAnswerFormat(matrix, { price: 'good' })).toBe('Answer only the rows shown.');
  });

  it('rejects a Matrix cell that is not one of the authored columns', () => {
    const matrix = {
      type: 'Matrix' as const,
      options: [
        { value: 'speed', matrixAxis: 'Row' as const, displayOrder: 0 },
        { value: 'good', matrixAxis: 'Column' as const, displayOrder: 1 },
      ],
    };
    expect(validateAnswerFormat(matrix, { speed: 'excellent' })).toBe(
      'Choose one of the offered answers for each row.',
    );
  });

  it('accepts a Matrix answered within its authored rows and columns', () => {
    const matrix = {
      type: 'Matrix' as const,
      options: [
        { value: 'speed', matrixAxis: 'Row' as const, displayOrder: 0 },
        { value: 'good', matrixAxis: 'Column' as const, displayOrder: 1 },
      ],
    };
    expect(validateAnswerFormat(matrix, { speed: 'good' })).toBeUndefined();
  });

  it('rejects an OpinionScale outside its authored bounds', () => {
    const q = { type: 'OpinionScale' as const, settings: { min: 0, max: 5 } };
    expect(validateAnswerFormat(q, 9)).toBe('Choose a value between 0 and 5.');
    expect(validateAnswerFormat(q, -1)).toBe('Choose a value between 0 and 5.');
  });

  it('rejects a fractional OpinionScale value', () => {
    // The scale renders as discrete points; 3.5 is not one of them.
    const q = { type: 'OpinionScale' as const, settings: { min: 1, max: 10 } };
    expect(validateAnswerFormat(q, 3.5)).toBe('Choose a value between 1 and 10.');
  });

  it('accepts an OpinionScale inside its authored bounds', () => {
    const q = { type: 'OpinionScale' as const, settings: { min: 0, max: 5 } };
    expect(validateAnswerFormat(q, 0)).toBeUndefined();
    expect(validateAnswerFormat(q, 5)).toBeUndefined();
  });

  it('applies the same default bounds the widget renders when settings are absent', () => {
    // 1..10, matching `opinionScaleBounds`. A server that defaulted differently from the widget
    // would reject answers the respondent was shown and allowed to click.
    expect(validateAnswerFormat({ type: 'OpinionScale' }, 10)).toBeUndefined();
    expect(validateAnswerFormat({ type: 'OpinionScale' }, 11)).toBe('Choose a value between 1 and 10.');
  });

  it('does not invent constraints for a question authored with no options', () => {
    // An importer, or a question mid-authoring, can legitimately have none yet. There is nothing
    // to check membership against, so the shape check is all that is left.
    expect(validateAnswerFormat({ type: 'SingleChoice', options: [] }, 'anything')).toBeUndefined();
    expect(validateAnswerFormat({ type: 'Ranking', options: [] }, ['a', 'b'])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The answer set a type IMPLIES — see `impliedAnswerValues`.
// ---------------------------------------------------------------------------

describe('ratingScaleMax', () => {
  describe('happy', () => {
    it('reads the authored star count', () => {
      expect(ratingScaleMax({ max: 7 })).toBe(7);
    });
  });

  describe('edge', () => {
    it('falls back to five when the author set none — what the widget has always rendered', () => {
      expect(ratingScaleMax(undefined)).toBe(5);
      expect(ratingScaleMax({})).toBe(5);
      expect(ratingScaleMax({ max: 'seven' })).toBe(5);
    });

    it('refuses a scale with nothing to click', () => {
      expect(ratingScaleMax({ max: 0 })).toBe(5);
      expect(ratingScaleMax({ max: -3 })).toBe(5);
    });
  });

  describe('worst', () => {
    // A rating is rendered as one clickable star per point, and a condition editor as one
    // <option> per point. Neither has any business building a million of them from a number
    // that reached Settings through an API, a paste, or a typo.
    it('clamps an absurd scale rather than rendering it', () => {
      expect(ratingScaleMax({ max: 1_000_000 })).toBe(MAX_IMPLIED_SCALE_POINTS);
    });
  });
});

describe('numericScalePoints', () => {
  describe('happy', () => {
    it('gives a rating its stars, one per point', () => {
      expect(numericScalePoints('Rating', { max: 5 })).toEqual([1, 2, 3, 4, 5]);
    });

    it('gives NPS its fixed 0-10, which is not a setting', () => {
      expect(numericScalePoints('NPS')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(numericScalePoints('NPS', { min: 3, max: 4 })).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('gives an opinion scale exactly the points the widget renders', () => {
      expect(numericScalePoints('OpinionScale', { min: 0, max: 4 })).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('edge', () => {
    it('a plain Number question has no implied set — any number is an answer', () => {
      expect(numericScalePoints('Number')).toBeUndefined();
    });

    it('is undefined for every type that does not answer on a scale', () => {
      expect(numericScalePoints('ShortText')).toBeUndefined();
      expect(numericScalePoints('YesNo')).toBeUndefined();
      expect(numericScalePoints('SingleChoice')).toBeUndefined();
    });
  });

  describe('worst', () => {
    it('never builds more points than the widget would render', () => {
      const points = numericScalePoints('OpinionScale', { min: 1, max: 5_000_000 });
      expect(points?.length).toBeLessThanOrEqual(MAX_IMPLIED_SCALE_POINTS);
    });
  });
});

describe('impliedAnswerValues', () => {
  describe('happy', () => {
    it('a boolean question answers true or false, and nothing else', () => {
      expect(impliedAnswerValues('YesNo')).toEqual([true, false]);
      expect(impliedAnswerValues('Checkbox')).toEqual([true, false]);
      expect(impliedAnswerValues('Legal')).toEqual([true, false]);
    });

    it('a scale question answers with one of its points', () => {
      expect(impliedAnswerValues('Rating', { max: 3 })).toEqual([1, 2, 3]);
    });
  });

  describe('edge', () => {
    // The distinction the condition editor turns on: an implied set means the value is PICKED.
    it('is undefined for free-input and option-driven types alike', () => {
      expect(impliedAnswerValues('ShortText')).toBeUndefined();
      expect(impliedAnswerValues('Number')).toBeUndefined();
      expect(impliedAnswerValues('Date')).toBeUndefined();
      expect(impliedAnswerValues('SingleChoice')).toBeUndefined();
      expect(impliedAnswerValues('FileUpload')).toBeUndefined();
    });
  });

  describe('worst', () => {
    // The set is what a condition may compare against, so a value outside it can never match.
    // Typed values, not their spellings: `5`, not `'5'`; `true`, not `'true'`.
    it('carries the values in the type the answer is stored as', () => {
      for (const value of impliedAnswerValues('Rating') ?? []) {
        expect(typeof value).toBe('number');
      }
      for (const value of impliedAnswerValues('YesNo') ?? []) {
        expect(typeof value).toBe('boolean');
      }
    });

    it('every type either implies a set or does not — none throws', () => {
      for (const type of FORM_QUESTION_TYPES) {
        expect(() => impliedAnswerValues(type, { max: 4 })).not.toThrow();
      }
    });
  });
});
