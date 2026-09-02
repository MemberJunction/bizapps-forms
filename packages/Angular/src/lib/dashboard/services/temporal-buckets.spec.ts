/**
 * Dates and times grouped into periods.
 *
 * The assertion that carries the module is the ordering one: these buckets are a SEQUENCE,
 * and sorting them by count — which is right for every other distribution here — destroys the
 * only structure they have.
 */
import { describe, expect, it } from 'vitest';
import { temporalBuckets } from './temporal-buckets';
import { answer } from '../../shared/testing/entity-row-fixtures';

const on = (iso: string) => answer('r', 'q', { DateValue: new Date(iso) });

describe('Date questions group by month', () => {
  // A stored Date is UTC MIDNIGHT of the day the respondent picked, so these fixtures carry the
  // `Z` — the same correction the Time block below already needed. Without it the fixture is
  // parsed as LOCAL midnight, which is a different instant in every timezone and, worse, one the
  // local and UTC readings agree about: `new Date('2026-01-15T00:00:00')` is 06:00Z in Chicago,
  // still 15 January either way. Such a fixture cannot tell a correct implementation from a
  // broken one, which is why the first-of-the-month cases below exist.
  it('stays in chronological order even when a later month is the biggest', () => {
    const buckets = temporalBuckets('Date', [
      on('2026-01-15T00:00:00Z'),
      on('2026-03-02T00:00:00Z'),
      on('2026-03-09T00:00:00Z'),
      on('2026-03-20T00:00:00Z'),
    ]);
    expect(buckets.map((b) => b.count)).toEqual([1, 3]);
    expect(buckets[0].label).toMatch(/Jan/);
    expect(buckets[1].label).toMatch(/Mar/);
  });

  it('files the first of a month under THAT month, not the one before it', () => {
    // The only day that discriminates. Every stored Date reads as the previous DAY for a viewer
    // west of Greenwich, but only the 1st crosses a month boundary — so the bug is invisible on
    // 29 days in 30 and silently wrong on the 30th. In Chicago `2026-03-01T00:00:00Z` is
    // 28 February 18:00, and the answer landed under "Feb 2026".
    const buckets = temporalBuckets('Date', [on('2026-03-01T00:00:00Z')]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].label).toMatch(/Mar 2026/);
  });

  it('keeps the sort key and the label agreeing about which month it is', () => {
    // `monthOf` derives the key and the label by two different mechanisms — `getUTCMonth()` and
    // `toLocaleDateString`. Correcting only one leaves a card that SORTS under September and is
    // CAPTIONED "Aug 2026". Two answers a fortnight apart either side of a month boundary must
    // therefore produce two buckets with two distinct labels, in order.
    const buckets = temporalBuckets('Date', [on('2026-09-01T00:00:00Z'), on('2026-08-15T00:00:00Z')]);
    expect(buckets.map((b) => [b.label, b.count])).toEqual([
      [expect.stringMatching(/Aug 2026/), 1],
      [expect.stringMatching(/Sep 2026/), 1],
    ]);
  });

  it('spans a year boundary in the right direction', () => {
    const buckets = temporalBuckets('Date', [on('2027-01-05T00:00:00Z'), on('2026-12-05T00:00:00Z')]);
    expect(buckets.map((b) => b.label)).toEqual([
      expect.stringMatching(/Dec 2026/),
      expect.stringMatching(/Jan 2027/),
    ]);
  });

  it('puts New Year\u2019s Day in the new year', () => {
    // The year-boundary form of the same bug: 1 January reads as 31 December of the year before.
    const buckets = temporalBuckets('Date', [on('2027-01-01T00:00:00Z')]);
    expect(buckets[0].label).toMatch(/Jan 2027/);
  });

  it('makes fractions add up across the answers that had a date', () => {
    const buckets = temporalBuckets('Date', [on('2026-01-15T00:00:00Z'), on('2026-02-15T00:00:00Z')]);
    expect(buckets.map((b) => b.fraction)).toEqual([0.5, 0.5]);
  });
});

describe('Time questions group into parts of the day', () => {
  // A stored Time is the clock reading on the epoch date in UTC — `14:30` is
  // `1970-01-01T14:30:00Z` — and the contract says the UTC fields ARE the answer. These fixtures
  // therefore carry the `Z`, and the assertions hold in any timezone; a band read off the
  // viewer's local clock would file a 14:30 answer under "Morning" in Chicago.
  it('bands the clock rather than counting distinct times', () => {
    // Per-minute buckets on a form with forty answers is a list of ones, which is why the
    // raw values were never analysable.
    const buckets = temporalBuckets('Time', [
      on('1970-01-01T09:30:00Z'),
      on('1970-01-01T10:15:00Z'),
      on('1970-01-01T19:00:00Z'),
    ]);
    expect(buckets.map((b) => [b.label, b.count])).toEqual([
      ['Morning (6am–12pm)', 2],
      ['Evening (5–9pm)', 1],
    ]);
  });

  it('reads the stored clock, not the viewer’s local one', () => {
    // 14:30Z is an afternoon wherever the report is opened; 23:30Z is a night, not tomorrow's
    // early morning. Any non-UTC viewer gets at least one of these wrong from local hours.
    expect(temporalBuckets('Time', [on('1970-01-01T14:30:00Z')])[0].label).toMatch(/Afternoon/);
    expect(temporalBuckets('Time', [on('1970-01-01T23:30:00Z')])[0].label).toMatch(/Night/);
  });

  it('puts midnight in the early band, not past the end of the day', () => {
    expect(temporalBuckets('Time', [on('1970-01-01T00:10:00Z')])[0].label).toMatch(/Early/);
  });
});

describe('answers without a usable date', () => {
  it('are left out rather than inventing a bucket', () => {
    const buckets = temporalBuckets('Date', [
      answer('r', 'q', { DateValue: null }),
      on('2026-01-15T00:00:00Z'),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(1);
  });

  it('produce nothing at all when none of them parse', () => {
    expect(temporalBuckets('Date', [answer('r', 'q', { DateValue: null })])).toEqual([]);
  });
});
