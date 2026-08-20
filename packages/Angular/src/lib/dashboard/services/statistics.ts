/**
 * The one statistic this dashboard reaches for often enough to share.
 *
 * Two copies of `median` had grown independently — one in `reporting-aggregations.ts` for
 * completion times, one in `open-text-insights.ts` for answer lengths — and they had already
 * diverged: the second rounded its result, the first did not. That is accidental
 * duplication of the kind that turns into a bug report about one surface disagreeing with
 * another, so it is one function now and rounding is the caller's decision.
 */

/**
 * The middle value of a sample, or null when there is no sample.
 *
 * The median rather than the mean everywhere it is used here, for the same reason each time:
 * both of the things this dashboard averages — how long a form takes, how much people write
 * — are heavily right-skewed. Most respondents take two minutes and one leaves the tab open
 * over lunch; most write a sentence and one writes an essay. A mean answers a question
 * nobody asked, and a single absurd outlier defines it (a response with an epoch
 * `StartedAt` once reported a form's typical completion time as twenty-four years).
 *
 * Does not mutate the input.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
