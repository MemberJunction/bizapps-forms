/**
 * Dates and times, grouped into periods.
 *
 * The contract marks `Date` and `Time` as unanalysable, and by value they are — no two people
 * pick the same instant, so a distribution over raw values is a list of ones. By PERIOD they
 * are among the more useful questions a form asks: "which month would you start", "what time
 * suits you" are asked precisely so the answers can be counted, and the previous view printed
 * them as a column of formatted dates that answered neither.
 *
 * ORDERED, NEVER SORTED BY COUNT. These buckets are a sequence. Reordering them so the
 * biggest comes first — which is right for a choice question and is what every other
 * distribution here does — destroys the only structure they have. It is the same mistake as
 * sorting an NPS bar by band size, and the chart is told to leave them alone.
 */
import type {
  FormQuestionType,
  mjBizAppsFormsFormResponseAnswerEntityType,
} from '@mj-biz-apps/forms-entities';
import type { DistributionBucket } from '../models/reporting.model';
import { toDate } from '../../shared/runview-dates';

type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

/** Hour-of-day bands for `Time`. Finer than this and a form with 40 answers is all ones. */
const TIME_BANDS: { label: string; untilHour: number }[] = [
  { label: 'Early (before 6am)', untilHour: 6 },
  { label: 'Morning (6am–12pm)', untilHour: 12 },
  { label: 'Afternoon (12–5pm)', untilHour: 17 },
  { label: 'Evening (5–9pm)', untilHour: 21 },
  { label: 'Night (9pm–midnight)', untilHour: 24 },
];

/** "Mar 2026" — the month a date falls in, sortable by the key beside it. */
function monthOf(date: Date): { key: string; label: string } {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const label = date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return { key, label };
}

function bandOf(date: Date): { key: string; label: string } {
  const hour = date.getHours();
  for (const [index, band] of TIME_BANDS.entries()) {
    if (hour < band.untilHour) return { key: String(index), label: band.label };
  }
  const last = TIME_BANDS.length - 1;
  return { key: String(last), label: TIME_BANDS[last].label };
}

/**
 * Groups a temporal question's answers into periods, in chronological order.
 *
 * `Date` groups by month; `Time` groups into five parts of the day. Both read the `date`
 * answer column, which is where the contract puts them.
 */
export function temporalBuckets(type: FormQuestionType, answers: AnswerRow[]): DistributionBucket[] {
  const counts = new Map<string, { label: string; count: number }>();
  let total = 0;

  for (const a of answers) {
    const value = toDate(a.DateValue);
    // An unparseable or absent date is not a period. Counting it as one would invent a
    // bucket; leaving it out means the fractions describe the answers that had a date, and
    // the card's answered count still reports the rest.
    if (!value || Number.isNaN(value.getTime())) continue;
    const { key, label } = type === 'Time' ? bandOf(value) : monthOf(value);
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { label, count: 1 });
    total++;
  }

  if (total === 0) return [];

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, { label, count }]) => ({ label, count, fraction: count / total }));
}
