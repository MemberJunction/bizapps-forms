/**
 * The median, shared by the open-text section (answer lengths); the headline's typical completion
 * time is a median too, computed in SQL (`PERCENTILE_CONT(0.5)`, which interpolates the two middle
 * values of an even sample exactly as this does).
 *
 * The median rather than the mean because both things the report averages are right-skewed: one
 * essay, one tab left open over lunch, and a mean describes nobody. Rounding is the caller's call.
 */

/** The middle value of a sample, or `null` when there is none. Does not mutate the input. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
