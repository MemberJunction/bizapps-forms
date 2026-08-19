import { describe, expect, it } from 'vitest';

import { fromLocalInputValue, toLocalInputValue } from './local-datetime';

describe('toLocalInputValue', () => {
  it('formats an instant as the local wall clock the control displays', () => {
    // Built from local parts so the assertion holds in any timezone the suite runs in —
    // which is the whole point of the function under test.
    const date = new Date(2026, 7, 19, 17, 30);
    expect(toLocalInputValue(date)).toBe('2026-08-19T17:30');
  });

  it('pads every component to the width the control requires', () => {
    // '2026-1-2T3:4' is silently rejected by the input, which then renders blank — a
    // schedule that looks unset while a real value sits in the database behind it.
    expect(toLocalInputValue(new Date(2026, 0, 2, 3, 4))).toBe('2026-01-02T03:04');
  });

  it('shows the local hour, not the UTC one', () => {
    // The bug this replaced: slicing toISOString() renders the author's 5pm as whatever
    // 5pm is in UTC, then saves that back as their intended time on the next edit.
    const date = new Date(2026, 7, 19, 17, 30);
    const local = toLocalInputValue(date);
    expect(local.slice(11)).toBe(`${String(date.getHours()).padStart(2, '0')}:30`);
  });

  it('treats absent and unreadable values as an empty field', () => {
    expect(toLocalInputValue(null)).toBe('');
    expect(toLocalInputValue(undefined)).toBe('');
    expect(toLocalInputValue('not a date')).toBe('');
  });

  it('reads a datetime that arrived over the wire as a string', () => {
    const iso = new Date(2026, 7, 19, 17, 30).toISOString();
    expect(toLocalInputValue(iso)).toBe('2026-08-19T17:30');
  });
});

describe('fromLocalInputValue', () => {
  it('reads the control value as local time', () => {
    const parsed = fromLocalInputValue('2026-08-19T17:30');
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(7);
    expect(parsed?.getDate()).toBe(19);
    expect(parsed?.getHours()).toBe(17);
    expect(parsed?.getMinutes()).toBe(30);
  });

  it('reports a cleared field as no schedule at all', () => {
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('   ')).toBeNull();
  });

  it('refuses a value it cannot read rather than inventing an instant', () => {
    expect(fromLocalInputValue('tomorrow-ish')).toBeNull();
  });
});

describe('the pair', () => {
  it('round-trips an instant to the minute', () => {
    // Seconds are the known and accepted loss: the control has no seconds field, so a
    // schedule is minute-resolution by construction.
    const original = new Date(2026, 11, 31, 23, 59);
    const returned = fromLocalInputValue(toLocalInputValue(original));
    expect(returned?.getTime()).toBe(original.getTime());
  });

  it('round-trips across a date boundary without slipping a day', () => {
    // Slicing a UTC ISO string moves midnight-adjacent times to the wrong DATE, not just
    // the wrong hour, which is the version of this bug people actually notice.
    const original = new Date(2026, 0, 1, 0, 15);
    expect(fromLocalInputValue(toLocalInputValue(original))?.getTime()).toBe(original.getTime());
  });
});
