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
