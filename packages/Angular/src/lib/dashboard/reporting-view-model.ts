/**
 * The reporting dashboard's presentation logic, kept Angular-free so it is testable.
 *
 * Everything here answers a question the READER has, not one the data has: "is this form
 * still alive?", "is that drop-off worth my attention?", "how many of the people who
 * started actually finished?". The service layer builds the numbers; this decides what
 * they mean and how they read.
 *
 * The dashboard component holds selection state and calls these; nothing here touches
 * RunView, `Date.now()` (the clock is always passed in) or the DOM.
 */
import type { DistributionBucket, FormSummaryStats, ReportableForm } from './models/reporting.model';

/** A segment of a proportional bar: a share of a whole, with the role that colours it. */
export interface ProportionSegment {
  label: string;
  count: number;
  /** Share of the whole, 0..1. */
  fraction: number;
  /** A `mjf-viz-*` role class — meaning, not a rotation position. */
  vizClass: string;
}

/** The cross-form line the dashboard header carries. */
export interface PortfolioSummary {
  formCount: number;
  responseCount: number;
}

/**
 * How loudly a funnel step's drop-off should be called out.
 *
 * Three levels rather than a number on every step, because a page that loses 4% of
 * readers is normal attrition and marking it "drop-off" in warning orange teaches the
 * reader to ignore the colour by the third step. Only `severe` gets the warning hue; the
 * rest state the figure plainly or say nothing at all.
 */
export type DropOffSeverity = 'none' | 'notable' | 'severe';

/** Below this, a step's loss is ordinary attrition and goes unremarked. */
const DROPOFF_NOTABLE = 0.15;
/** At or above this, a step is losing so many people it is the story of the funnel. */
const DROPOFF_SEVERE = 0.35;

export function dropOffSeverity(fraction: number): DropOffSeverity {
  if (!Number.isFinite(fraction) || fraction < DROPOFF_NOTABLE) return 'none';
  return fraction >= DROPOFF_SEVERE ? 'severe' : 'notable';
}

/**
 * "2 hours ago" for a timestamp, falling back to a date once relative time stops being
 * the more useful reading.
 *
 * Recency is the single fact that tells a form owner whether a form is still collecting,
 * and a bare `3/14/2026` makes them do the subtraction. Past about a week the relative
 * form loses to the absolute one ("47 days ago" is worse than the date), so it switches.
 *
 * `now` is a parameter, not `Date.now()`, so the boundaries are testable and so a caller
 * that renders a list of these can hold one clock for all of them rather than letting
 * rows disagree about what "now" was.
 */
export function relativeTime(when: Date | null, now: Date): string {
  if (!when) return '—';
  const seconds = (now.getTime() - when.getTime()) / 1000;
  // A timestamp in the future is clock skew between the browser and the server, not a
  // prediction. Reading it as "in 3 minutes" would be a bug report; "just now" is true
  // enough and is what the reader means by it.
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return plural(minutes, 'minute') + ' ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, 'hour') + ' ago';
  const days = Math.floor(hours / 24);
  if (days < 7) return plural(days, 'day') + ' ago';
  return when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * A duration as the coarsest unit that still says something — "45s", "2m 30s", "1h 12m".
 *
 * Two units, never three: the reader is judging whether a form is quick or a slog, and
 * the seconds on a 71-minute average are noise dressed as precision.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) {
    const rest = Math.round(seconds % 60);
    return rest > 0 ? `${totalMinutes}m ${rest}s` : `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const restMinutes = totalMinutes % 60;
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

/** A fraction as a whole-number percent. */
export function percent(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—';
  return `${Math.round(fraction * 100)}%`;
}

/**
 * The completion bar's segments: how many of the people who started this form finished it.
 *
 * A percentage tells you the ratio; the bar tells you the size of the group it is a ratio
 * OF, which is the part that decides whether 60% is a problem or a rounding error on five
 * responses. Zero-count segments are dropped so a form nobody abandoned renders as one
 * unbroken bar rather than a bar with an invisible sliver claiming a category.
 */
export function completionSegments(stats: FormSummaryStats): ProportionSegment[] {
  const started = stats.completeResponses + stats.partialResponses;
  if (started === 0) return [];
  const segments: ProportionSegment[] = [
    {
      label: 'Completed',
      count: stats.completeResponses,
      fraction: stats.completeResponses / started,
      vizClass: 'mjf-viz-positive',
    },
    {
      label: 'Started, not finished',
      count: stats.partialResponses,
      fraction: stats.partialResponses / started,
      vizClass: 'mjf-viz-caution',
    },
  ];
  return segments.filter((s) => s.count > 0);
}

/**
 * NPS segments in promoter → passive → detractor order.
 *
 * Deliberately not sorted by size: NPS is a SCALE, and reordering its three bands by
 * count destroys the only thing the bar is for — seeing where the mass sits along it.
 */
export function npsSegments(segments: {
  promoters: number;
  passives: number;
  detractors: number;
}): ProportionSegment[] {
  const total = segments.promoters + segments.passives + segments.detractors;
  if (total === 0) return [];
  return [
    { label: 'Promoters', count: segments.promoters, fraction: segments.promoters / total, vizClass: 'mjf-viz-positive' },
    { label: 'Passives', count: segments.passives, fraction: segments.passives / total, vizClass: 'mjf-viz-neutral' },
    { label: 'Detractors', count: segments.detractors, fraction: segments.detractors / total, vizClass: 'mjf-viz-negative' },
  ].filter((s) => s.count > 0);
}

/**
 * A Yes/No split as a two-part bar.
 *
 * Yes/No is not a categorical distribution and must not be coloured like one: the two
 * answers MEAN something, so they take the positive and neutral roles rather than the
 * first two hues of the rotation. Colouring "No" a cheerful green because it happened to
 * sort first is the failure this exists to prevent.
 *
 * "No" is neutral, not negative. Declining a question is an answer, not a fault, and the
 * warning hue is reserved for the funnel losses that actually need acting on.
 */
export function booleanSegments(buckets: readonly DistributionBucket[]): ProportionSegment[] {
  const roleFor = (label: string): string =>
    label.trim().toLowerCase() === 'yes' ? 'mjf-viz-positive' : 'mjf-viz-neutral';
  return buckets
    .filter((b) => b.count > 0)
    .map((b) => ({ label: b.label, count: b.count, fraction: b.fraction, vizClass: roleFor(b.label) }));
}

/**
 * A consent question read as an acceptance RATE, not as an opinion split.
 *
 * Checkbox and Legal store the same boolean YesNo does, and the previous view rendered all
 * three identically. Nobody reads a terms box as a fifty-fifty preference: the question is
 * "did they agree", the answer is a percentage, and on a legal question it is usually the
 * only number on the page anyone has to act on. Returns null when nobody answered, so the
 * card says so rather than reporting 0% agreement.
 */
export function consentRate(buckets: readonly DistributionBucket[]): number | null {
  let accepted = 0;
  let total = 0;
  for (const b of buckets) {
    total += b.count;
    if (b.label.trim().toLowerCase() === 'yes') accepted += b.count;
  }
  return total > 0 ? accepted / total : null;
}

/**
 * A consent split, coloured by whether agreement was given.
 *
 * Declining is `negative` here where a plain "No" is `neutral` elsewhere — on a consent
 * question a decline genuinely is the adverse outcome, and it is usually the row someone
 * needs to find.
 */
export function consentSegments(buckets: readonly DistributionBucket[]): ProportionSegment[] {
  return buckets
    .filter((b) => b.count > 0)
    .map((b) => {
      const accepted = b.label.trim().toLowerCase() === 'yes';
      return {
        label: accepted ? 'Accepted' : 'Declined',
        count: b.count,
        fraction: b.fraction,
        vizClass: accepted ? 'mjf-viz-positive' : 'mjf-viz-negative',
      };
    });
}

/**
 * How many of the form's responses answered a given question, 0..1.
 *
 * The question-level signal the dashboard never had: a distribution can look healthy while
 * two thirds of respondents skipped the question entirely, and the bars — which are
 * fractions of the people who DID answer — cannot show that. Null when there is nothing to
 * divide by, so the card omits the line rather than printing a confident 0%.
 */
export function answerRate(answeredCount: number, totalResponses: number): number | null {
  if (totalResponses <= 0) return null;
  return Math.min(1, answeredCount / totalResponses);
}

/**
 * The order forms appear in the rail, and therefore which one opens by default.
 *
 * Busiest first, ties broken by name. The picker this replaced was alphabetical, so the
 * dashboard opened on whatever form happened to start with an "A" — usually one with no
 * responses, which made the first thing anyone saw an empty report. The form with the most
 * responses is the one a responses dashboard is most likely to be about, and the rail's
 * search covers the case where the reader already knows which form they want.
 *
 * Sorts a copy: the service's result is shared with the picker's own state.
 */
export function sortFormsForRail(forms: readonly ReportableForm[]): ReportableForm[] {
  return [...forms].sort(
    (a, b) => b.responseCount - a.responseCount || a.name.localeCompare(b.name),
  );
}

/** Totals across every reportable form — the header's one-line state of the world. */
export function portfolioSummary(forms: readonly ReportableForm[]): PortfolioSummary {
  return {
    formCount: forms.length,
    responseCount: forms.reduce((sum, f) => sum + f.responseCount, 0),
  };
}

/**
 * The rail's search. Matches on name only — the rail shows nothing else to match against,
 * and a hit the reader cannot see the reason for is worse than a miss.
 */
export function filterForms(forms: readonly ReportableForm[], query: string): ReportableForm[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...forms];
  return forms.filter((f) => f.name.toLowerCase().includes(needle));
}

/** "1 response" / "12 responses". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
