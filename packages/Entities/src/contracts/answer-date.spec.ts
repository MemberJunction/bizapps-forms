/**
 * The `date` column's wire and stored formats, in both directions.
 *
 * The write side is the one that shipped broken (#116): a `Time` answer travelled as the
 * `14:30` its control emitted, persistence did `new Date('14:30')`, and the Invalid Date threw
 * `RangeError: Invalid time value` from inside `Save()` — unattributed, on every form carrying a
 * Time question. These pin the contract both sides now parse through.
 */
import { describe, expect, it } from 'vitest';
import { clockTimeOf, dateAnswerInstant, parseClockTime } from './answer-date';

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
