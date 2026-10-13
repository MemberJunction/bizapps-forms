/**
 * Dates and times, grouped into periods (moved from forms-ng `temporal-buckets.ts`).
 *
 * By value no two answers to "which day suits you" match; by period they are the point of asking.
 * `Date` groups by month, `Time` into five parts of the day. Both read the UTC fields, because that
 * is what the stored value IS: a Date answer is UTC midnight of the day picked, a Time answer is
 * `1970-01-01T<clock>Z` (`answer-date.ts`). Local fields filed a 1 September answer under August for
 * every reader west of Greenwich.
 *
 * ORDERED, NEVER SORTED BY COUNT: the buckets are a sequence, and re-sorting them by size destroys
 * the only structure they have.
 *
 * Month labels are English (`en-US`, "Sep 2026"): the dashboard formatted them in the viewer's locale,
 * and a server has no viewer. The periods themselves do not change.
 */
import type { FormQuestionType, FormsAnswerBucket } from '@mj-biz-apps/forms-entities';

/** Hour-of-day bands for `Time`. Finer than this and a form with 40 answers is all ones. */
const TIME_BANDS: { label: string; untilHour: number }[] = [
  { label: 'Early (before 6am)', untilHour: 6 },
  { label: 'Morning (6am–12pm)', untilHour: 12 },
  { label: 'Afternoon (12–5pm)', untilHour: 17 },
  { label: 'Evening (5–9pm)', untilHour: 21 },
  { label: 'Night (9pm–midnight)', untilHour: 24 },
];

/** One stored instant and how many answers held it. */
export interface CountedInstant {
  instant: Date;
  count: number;
}

function monthOf(date: Date): { key: string; label: string } {
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return { key, label };
}

function bandOf(date: Date): { key: string; label: string } {
  const hour = date.getUTCHours();
  const index = TIME_BANDS.findIndex((band) => hour < band.untilHour);
  const at = index === -1 ? TIME_BANDS.length - 1 : index;
  return { key: String(at), label: TIME_BANDS[at].label };
}

/** A temporal question's answers as periods, in chronological order; empty when none had a date. */
export function temporalBuckets(type: FormQuestionType, values: readonly CountedInstant[]): FormsAnswerBucket[] {
  const counts = new Map<string, { label: string; count: number }>();
  let total = 0;
  for (const { instant, count } of values) {
    // An unreadable instant is not a period; the card's answered count still reports it.
    if (Number.isNaN(instant.getTime())) {
      continue;
    }
    const { key, label } = type === 'Time' ? bandOf(instant) : monthOf(instant);
    const entry = counts.get(key);
    if (entry) {
      entry.count += count;
    } else {
      counts.set(key, { label, count });
    }
    total += count;
  }
  if (total === 0) {
    return [];
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, { label, count }]) => ({ Label: label, Count: count, Fraction: count / total }));
}
