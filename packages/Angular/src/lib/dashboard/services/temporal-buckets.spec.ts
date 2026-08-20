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
  it('stays in chronological order even when a later month is the biggest', () => {
    const buckets = temporalBuckets('Date', [
      on('2026-01-15T00:00:00'),
      on('2026-03-02T00:00:00'),
      on('2026-03-09T00:00:00'),
      on('2026-03-20T00:00:00'),
    ]);
    expect(buckets.map((b) => b.count)).toEqual([1, 3]);
    expect(buckets[0].label).toMatch(/Jan/);
    expect(buckets[1].label).toMatch(/Mar/);
  });

  it('spans a year boundary in the right direction', () => {
    const buckets = temporalBuckets('Date', [on('2027-01-05T00:00:00'), on('2026-12-05T00:00:00')]);
    expect(buckets.map((b) => b.label)).toEqual([
      expect.stringMatching(/Dec 2026/),
      expect.stringMatching(/Jan 2027/),
    ]);
  });

  it('makes fractions add up across the answers that had a date', () => {
    const buckets = temporalBuckets('Date', [on('2026-01-15T00:00:00'), on('2026-02-15T00:00:00')]);
    expect(buckets.map((b) => b.fraction)).toEqual([0.5, 0.5]);
  });
});

describe('Time questions group into parts of the day', () => {
  it('bands the clock rather than counting distinct times', () => {
    // Per-minute buckets on a form with forty answers is a list of ones, which is why the
    // raw values were never analysable.
    const buckets = temporalBuckets('Time', [
      on('2026-01-01T09:30:00'),
      on('2026-01-01T10:15:00'),
      on('2026-01-01T19:00:00'),
    ]);
    expect(buckets.map((b) => [b.label, b.count])).toEqual([
      ['Morning (6am–12pm)', 2],
      ['Evening (5–9pm)', 1],
    ]);
  });

  it('puts midnight in the early band, not past the end of the day', () => {
    expect(temporalBuckets('Time', [on('2026-01-01T00:10:00')])[0].label).toMatch(/Early/);
  });
});

describe('answers without a usable date', () => {
  it('are left out rather than inventing a bucket', () => {
    const buckets = temporalBuckets('Date', [
      answer('r', 'q', { DateValue: null }),
      on('2026-01-15T00:00:00'),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(1);
  });

  it('produce nothing at all when none of them parse', () => {
    expect(temporalBuckets('Date', [answer('r', 'q', { DateValue: null })])).toEqual([]);
  });
});
