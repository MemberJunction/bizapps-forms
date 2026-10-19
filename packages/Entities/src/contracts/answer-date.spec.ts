/**
 * The `date` column's wire and stored formats, in both directions.
 *
 * The write side is the one that shipped broken (#116): a `Time` answer travelled as the
 * `14:30` its control emitted, persistence did `new Date('14:30')`, and the Invalid Date threw
 * `RangeError: Invalid time value` from inside `Save()` — unattributed, on every form carrying a
 * Time question. These pin the contract both sides now parse through.
 */
import { describe, expect, it } from 'vitest';
import { calendarDateOf, clockTimeOf, dateAnswerInstant, dateAnswerText, parseClockTime } from './answer-date';
import { validateAnswer, validateAnswers } from './answer-validation';

describe('parseClockTime', () => {
  it('reads what <input type="time"> emits', () => {
    expect(parseClockTime('14:30')).toEqual({ hours: 14, minutes: 30, seconds: 0 });
  });

  it('reads the seconds some browsers add', () => {
    expect(parseClockTime('14:30:15')).toEqual({ hours: 14, minutes: 30, seconds: 15 });
  });

  it('tolerates the whitespace a hand-typed value carries', () => {
    expect(parseClockTime(' 09:05 ')).toEqual({ hours: 9, minutes: 5, seconds: 0 });
  });

  it('refuses an impossible clock reading rather than guessing at it', () => {
    for (const bad of ['25:00', '14:60', '14:30:60', '9:00', '14', '14:3', '', 'noon']) {
      expect(parseClockTime(bad), bad).toBeUndefined();
    }
  });

  it('refuses an instant: a Time answer is a clock reading, not a date', () => {
    // The evaluator compares this on the DATE scale, so a rule written against `14:30` could
    // never match it. One spelling per type, or the two sides drift again.
    expect(parseClockTime('2026-09-01T14:30:00Z')).toBeUndefined();
  });
});

describe('dateAnswerInstant — Time', () => {
  it('stores the clock reading on the epoch date, in UTC', () => {
    expect(dateAnswerInstant('Time', '14:30')?.toISOString()).toBe('1970-01-01T14:30:00.000Z');
  });

  it('keeps the seconds', () => {
    expect(dateAnswerInstant('Time', '14:30:15')?.toISOString()).toBe('1970-01-01T14:30:15.000Z');
  });

  it('is the same instant for every respondent who answered the same time', () => {
    // Two 09:00 answers on different days must compare equal in reporting, which is why the
    // anchor is the epoch and not the submission date.
    expect(dateAnswerInstant('Time', '09:00')?.getTime()).toBe(dateAnswerInstant('Time', '09:00')?.getTime());
    expect(dateAnswerInstant('Time', '00:00')?.getTime()).toBe(0);
  });

  it('yields no instant for anything that is not a clock reading', () => {
    for (const bad of ['25:99', 'garbage', '', '2026-09-01T14:30:00Z']) {
      expect(dateAnswerInstant('Time', bad), bad).toBeUndefined();
    }
  });
});

describe('dateAnswerInstant — Date, and every other type that lands in the column', () => {
  it('reads a calendar date exactly as it always did: UTC midnight', () => {
    expect(dateAnswerInstant('Date', '2026-09-01')?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('still accepts a full instant on a Date question', () => {
    expect(dateAnswerInstant('Date', '2026-09-01T12:30:00.000Z')?.toISOString()).toBe('2026-09-01T12:30:00.000Z');
  });

  it('yields no instant for text JS cannot parse, instead of an Invalid Date', () => {
    expect(dateAnswerInstant('Date', 'sometime next week')).toBeUndefined();
    // Not a temporal type at all — but a caller can still post `dateValue` on it, and the column
    // is the same column. The parse must not depend on the type being one of the two.
    expect(dateAnswerInstant('ShortText', 'garbage')).toBeUndefined();
  });
});

describe('clockTimeOf — reading a stored Time back', () => {
  it('round-trips what the respondent entered', () => {
    for (const entered of ['14:30', '00:00', '23:59', '09:05']) {
      const stored = dateAnswerInstant('Time', entered);
      expect(stored).toBeDefined();
      expect(clockTimeOf(stored as Date)).toBe(entered);
    }
  });

  it('shows seconds only when the answer carried them', () => {
    expect(clockTimeOf(dateAnswerInstant('Time', '14:30:15') as Date)).toBe('14:30:15');
    expect(clockTimeOf(dateAnswerInstant('Time', '14:30:00') as Date)).toBe('14:30');
  });

  it('reads the UTC clock, never the viewer’s local one', () => {
    // The stored instant is 14:30Z. In America/Chicago (this machine) local hours would be 08.
    expect(clockTimeOf(new Date('1970-01-01T14:30:00.000Z'))).toBe('14:30');
  });
});

describe('calendarDateOf — reading a stored Date back', () => {
  it('gives the calendar day the respondent picked', () => {
    expect(calendarDateOf(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01');
  });

  it('reads UTC fields, so the day does not shift for a viewer west of UTC', () => {
    // The stored instant IS UTC midnight. `toLocaleDateString()` on it renders the PREVIOUS day
    // anywhere west of Greenwich — the same skew `bandOf` was fixed for, and the reason this
    // reader exists rather than a locale formatter.
    const stored = new Date('2026-09-01T00:00:00Z');
    expect(calendarDateOf(stored)).toBe('2026-09-01');
    expect(calendarDateOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });

  it('pads single-digit months and days, so the value sorts as text', () => {
    expect(calendarDateOf(new Date('2026-03-07T00:00:00Z'))).toBe('2026-03-07');
  });
});

describe('dateAnswerText — the inverse of dateAnswerInstant', () => {
  it('reads a Time back as its clock', () => {
    expect(dateAnswerText('Time', new Date(Date.UTC(1970, 0, 1, 14, 30)))).toBe('14:30');
  });

  it('reads a Date back as its calendar day', () => {
    expect(dateAnswerText('Date', new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01');
  });

  it('reads every other type that can land in the column as a calendar day', () => {
    // A caller can post `dateValue` on a question of any type; only `Time` is a clock.
    expect(dateAnswerText('ShortText', new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01');
  });

  // The property that matters: what a respondent gave, stored, and read back is what they gave.
  // This is what a future cross-session resume depends on — putting the text back into
  // `<input type="time">` or `<input type="date">`, which silently blank anything else.
  it('round-trips every shape the wire accepts', () => {
    const cases: [Parameters<typeof dateAnswerText>[0], string][] = [
      ['Time', '14:30'],
      ['Time', '00:00'],
      ['Time', '23:59'],
      ['Time', '14:30:15'],
      ['Date', '2026-09-01'],
      ['Date', '1970-01-01'],
      ['Date', '2026-03-07'],
    ];
    for (const [type, wire] of cases) {
      const stored = dateAnswerInstant(type, wire);
      expect(stored, `${type} ${wire} should be storable`).toBeInstanceOf(Date);
      expect(dateAnswerText(type, stored as Date), `${type} ${wire}`).toBe(wire);
      // ...and the text feeds straight back in to the same instant.
      expect((dateAnswerInstant(type, dateAnswerText(type, stored as Date)) as Date).toISOString())
        .toBe((stored as Date).toISOString());
    }
  });
});

describe('dateAnswerText — what it normalises, and what it must not silently drop', () => {
  // The doc used to promise the identity held "for every value the wire accepts". It does not,
  // and one of the three exceptions loses data rather than merely tidying it.
  it('normalises the spellings that mean the same instant', () => {
    // Whitespace and a zero seconds group are noise, not answer: `14:30:00` and `14:30` are the
    // same clock, and the canonical spelling is the shorter one.
    expect(dateAnswerText('Time', dateAnswerInstant('Time', ' 14:30 ') as Date)).toBe('14:30');
    expect(dateAnswerText('Time', dateAnswerInstant('Time', '14:30:00') as Date)).toBe('14:30');
  });

  it('keeps the time a Date answer was stored with, rather than truncating it away', () => {
    // The module comment permits a `Date` wire value to be "any string `Date.parse` reads as an
    // instant", so a non-widget client can store `2026-09-01T15:00:00Z` on a Date question. The
    // calendar day alone would silently discard information that IS in the column — and this is
    // the reader the detail page and the CSV export both go through.
    const stored = dateAnswerInstant('Date', '2026-09-01T15:00:00Z') as Date;
    expect(dateAnswerText('Date', stored)).toBe('2026-09-01 15:00');
  });

  it('shows a plain calendar day when there is no time to keep', () => {
    // The overwhelmingly common case: `<input type="date">` stores UTC midnight.
    expect(dateAnswerText('Date', dateAnswerInstant('Date', '2026-09-01') as Date)).toBe('2026-09-01');
  });

  it('keeps seconds on a Date answer that carries them', () => {
    const stored = dateAnswerInstant('Date', '2026-09-01T15:00:30Z') as Date;
    expect(dateAnswerText('Date', stored)).toBe('2026-09-01 15:00:30');
  });
});

/**
 * #303 Task 8 fix round 2 (controller ruling). `new Date('2026-02-30')` is not invalid in V8 — it is
 * MARCH 2, and "February 30, 2026" rolls over the same way — so an impossible calendar date used to
 * pass validation and be stored as a different day the respondent never gave. A date answer must be
 * a real calendar day (and, when it carries a time, a real clock time), or it is refused.
 */
describe('dateAnswerInstant — impossible dates and times are refused, never rolled over', () => {
  it.each(['2026-02-30', '2026-13-01', '2025-02-29', '2026-04-31', '2026-00-10', '2026-10-00'])('refuses the date %s', (text) => {
    expect(dateAnswerInstant('Date', text)).toBeUndefined();
  });

  it('accepts a leap day in a leap year', () => {
    expect(dateAnswerInstant('Date', '2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it.each(['2026-10-13T25:00:00Z', '2026-10-13T10:60:00Z', '2026-10-13T10:00:60Z', '2026-02-30T10:00:00Z', '2026-10-13T10:00:00+24:00'])(
    'refuses a date carrying an impossible time or offset: %s',
    (text) => {
      expect(dateAnswerInstant('Date', text)).toBeUndefined();
    },
  );

  it('still reads a real date-time a non-widget client sends', () => {
    expect(dateAnswerInstant('Date', '2026-10-13T10:30:00Z')?.toISOString()).toBe('2026-10-13T10:30:00.000Z');
    expect(dateAnswerInstant('Date', '2026-10-13T10:30:15.250+02:00')?.toISOString()).toBe('2026-10-13T08:30:15.250Z');
  });

  it('refuses a free-form date the legacy parser would roll over', () => {
    expect(dateAnswerInstant('Date', 'February 30, 2026')).toBeUndefined();
  });

  it.each(['24:00', '23:60', '12:30:60', '7:05'])('refuses the time %s', (text) => {
    expect(dateAnswerInstant('Time', text)).toBeUndefined();
  });
});

describe('validateAnswers refuses an impossible date in every mode, naming the question', () => {
  const definition = {
    pages: [
      {
        id: 'p',
        displayOrder: 1,
        questions: [
          { id: 'q-date', type: 'Date' as const, prompt: 'When', isRequired: false, displayOrder: 1, options: [] },
          { id: 'q-time', type: 'Time' as const, prompt: 'At', isRequired: false, displayOrder: 2, options: [] },
        ],
      },
    ],
  };
  for (const mode of ['complete', 'draft', 'screened-out'] as const) {
    it(`${mode}: 2026-02-30 and 24:00`, () => {
      const outcome = validateAnswers(
        definition,
        [
          { questionId: 'q-date', dateValue: '2026-02-30' },
          { questionId: 'q-time', dateValue: '24:00' },
        ],
        mode,
      );
      expect(outcome.errors).toEqual([
        { questionId: 'q-date', message: 'Enter a valid date.' },
        { questionId: 'q-time', message: 'Enter a valid time.' },
      ]);
      expect(outcome.answers).toEqual([]);
    });
  }
});

/**
 * Fix round 3. N4: `FormResponseAnswer.DateValue` is DATETIMEOFFSET — 0001-01-01 to 9999-12-31 — so a
 * date it cannot store (year 0000, or an offset that carries the instant past either end) is refused,
 * never left to fail at commit as a generic error. N5 (controller ruling): the ISO-8601 forms
 * non-widget clients send are accepted — up to 7 fractional digits (DATETIMEOFFSET's precision),
 * `±hhmm` and `±hh:mm` offsets, `Z`, a lowercase `t`.
 */
describe('dateAnswerInstant — what DATETIMEOFFSET can store (fix round 3)', () => {
  it.each(['0000-01-01', '0000-12-31T10:00:00Z', '9999-12-31T23:00:00-05:00', '0001-01-01T03:00:00+05:00'])(
    'refuses %s, outside 0001-01-01..9999-12-31 once its offset is applied',
    (text) => {
      expect(dateAnswerInstant('Date', text)).toBeUndefined();
    },
  );

  it('admits the edges of the range', () => {
    expect(dateAnswerInstant('Date', '0001-01-01')?.toISOString()).toBe('0001-01-01T00:00:00.000Z');
    expect(dateAnswerInstant('Date', '9999-12-31T23:00:00+05:00')?.toISOString()).toBe('9999-12-31T18:00:00.000Z');
  });

  it('reads a leap day by the Gregorian rule in every year, the first century included', () => {
    expect(dateAnswerInstant('Date', '0004-02-29')).toBeDefined();
    expect(dateAnswerInstant('Date', '0100-02-29')).toBeUndefined();
    expect(dateAnswerInstant('Date', '2000-02-29')).toBeDefined();
  });
});

describe('dateAnswerInstant — ISO-8601 as non-widget clients write it (fix round 3)', () => {
  it.each([
    // Python `datetime.isoformat()`: 6 fractional digits, `+00:00`.
    ['2026-10-13T14:30:00.123456+00:00', '2026-10-13T14:30:00.123Z'],
    // .NET round-trip `"o"`: 7 fractional digits.
    ['2026-10-13T14:30:00.1234567Z', '2026-10-13T14:30:00.123Z'],
    ['2026-10-13T14:30:00.1234567+02:00', '2026-10-13T12:30:00.123Z'],
    // The basic offset, and a lowercase separator.
    ['2026-10-13T14:30:00+0200', '2026-10-13T12:30:00.000Z'],
    ['2026-10-13t14:30:00Z', '2026-10-13T14:30:00.000Z'],
  ])('accepts %s', (text, iso) => {
    expect(dateAnswerInstant('Date', text)?.toISOString()).toBe(iso);
  });


  it('refuses more fractional digits than DATETIMEOFFSET keeps, and an impossible basic offset', () => {
    expect(dateAnswerInstant('Date', '2026-10-13T14:30:00.12345678Z')).toBeUndefined();
    expect(dateAnswerInstant('Date', '2026-10-13T14:30:00+2400')).toBeUndefined();
  });
});


/**
 * Fix round 4.
 *
 * R3-3: the stored instant is built from the components the grammar matched, never by handing the
 * text to `new Date`. V8's ISO parser rejects the space separator, and its legacy fallback reads a
 * 2-digit year as 19xx/20xx — so `0050-06-15 10:20Z` was stored as 1950, a different day than the
 * respondent gave, with the range check none the wiser because 1950 is in range.
 *
 * Controller ruling: a date-time with no offset is REFUSED in every mode. Read as server-local time,
 * the stored instant depended on which time zone the host happened to run in.
 */
describe('dateAnswerInstant — the instant is the one its components name (fix round 4)', () => {
  it.each([
    ['0050-06-15 10:20Z', '0050-06-15T10:20:00.000Z'],
    ['0050-06-15 10:00:00+0530', '0050-06-15T04:30:00.000Z'],
    ['0001-06-15 10:20Z', '0001-06-15T10:20:00.000Z'],
    ['0001-06-15T10:20Z', '0001-06-15T10:20:00.000Z'],
    ['0099-12-31t23:59:59.9999999Z', '0099-12-31T23:59:59.999Z'],
    ['2026-10-13 14:30:00.5-07:00', '2026-10-13T21:30:00.500Z'],
  ])('stores %s as the year it was typed', (text, iso) => {
    expect(dateAnswerInstant('Date', text)?.toISOString()).toBe(iso);
  });

  it('admits the real ±14:00 offset limit and refuses anything past it', () => {
    expect(dateAnswerInstant('Date', '2026-10-13T10:00:00+14:00')?.toISOString()).toBe('2026-10-12T20:00:00.000Z');
    expect(dateAnswerInstant('Date', '2026-10-13T10:00:00-14:00')?.toISOString()).toBe('2026-10-14T00:00:00.000Z');
    for (const offset of ['+14:59', '+14:01', '-1401', '-14:30']) {
      expect(dateAnswerInstant('Date', `2026-10-13T10:00:00${offset}`), offset).toBeUndefined();
    }
  });

  it.each(['2026-10-13T14:30:00', '2026-10-13 14:30', '2026-10-13T14:30:00.123456', '0050-06-15 10:20'])(
    'refuses the zone-less date-time %s, whose instant would depend on the host time zone',
    (text) => {
      expect(dateAnswerInstant('Date', text)).toBeUndefined();
    },
  );

  it('still reads a bare calendar date as UTC midnight', () => {
    expect(dateAnswerInstant('Date', '2026-10-13')?.toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });
});

describe('a zone-less date-time is refused with its own message, by both verdicts, in every mode (fix round 4)', () => {
  const question = { id: 'q-date', type: 'Date' as const, prompt: 'When', isRequired: false, displayOrder: 1, options: [] };
  const definition = { pages: [{ id: 'p', displayOrder: 1, questions: [question] }] };
  const message = 'Include a time zone with the time, such as Z or +02:00.';

  for (const mode of ['complete', 'draft', 'screened-out'] as const) {
    it(`${mode}: the payload verdict and the per-field verdict agree`, () => {
      const outcome = validateAnswers(definition, [{ questionId: 'q-date', dateValue: '2026-10-13T14:30' }], mode);
      expect(outcome.errors).toEqual([{ questionId: 'q-date', message }]);
      expect(validateAnswer(question, '2026-10-13T14:30', mode)).toEqual({ message });
    });

    it(`${mode}: an impossible date-time keeps the plain message`, () => {
      const outcome = validateAnswers(definition, [{ questionId: 'q-date', dateValue: '2026-02-30T14:30' }], mode);
      expect(outcome.errors).toEqual([{ questionId: 'q-date', message: 'Enter a valid date.' }]);
    });
  }
});
