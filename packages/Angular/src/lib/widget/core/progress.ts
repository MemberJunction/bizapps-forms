/**
 * How full the progress bar is.
 *
 * Two earlier models each failed in an instructive way, and this one is shaped by both.
 *
 * Counting EVERY question meant a form you could legitimately submit still read 60% — the bar
 * said "not done" when the respondent was done.
 *
 * Counting only REQUIRED questions fixed the meaning and broke the feel: on a form with five
 * required fields each one is worth 20%, so the bar lurched a fifth of the way, then sat dead
 * through the two or three optional questions in between, then lurched again. A control that
 * does not respond for three consecutive actions has taught the respondent that their input
 * does not register — which is the opposite of what a progress bar is for, and measurably
 * worse for completion.
 *
 * So: WEIGHTED. Required questions are worth several optional ones, so the bar tracks readiness;
 * optional ones are worth something, so every single answer moves it. And once the required set
 * is complete the bar reads full, because at that point the respondent IS done and a bar that
 * still says 80% is lying to them about what is left.
 *
 * The goal-gradient effect is the reason the last property matters most: people accelerate as a
 * goal comes into view, and they only accelerate toward a finish line they can believe.
 */

/** One visible, answerable question, reduced to the two facts progress depends on. */
export interface ProgressQuestion {
  required: boolean;
  /**
   * How much of this question is filled in, 0..1.
   *
   * Fractional rather than a boolean because of composites. A ContactInfo block is five fields
   * behind one question id, and treating it as answered-or-not meant the bar moved on the first
   * of those fields and then sat dead through the other four — three consecutive actions with
   * no feedback, on the very question that asks the most of a respondent.
   */
  completeness: number;
}

/**
 * Relative worth of a required question against an optional one.
 *
 * Three is deliberate rather than tuned: high enough that the bar clearly tracks the required
 * path, low enough that an optional answer produces visible movement rather than a nudge the
 * respondent cannot see. Much higher and the optional steps become the dead zone again.
 */
const REQUIRED_WEIGHT = 3;
const OPTIONAL_WEIGHT = 1;

/** Fraction complete, 0..1. */
export function computeProgress(questions: readonly ProgressQuestion[]): number {
  if (questions.length === 0) {
    return 1;
  }
  const required = questions.filter((q) => q.required);
  // Satisfied, not complete: a composite counts as answered on any one part, which is exactly
  // what validation lets a respondent submit on. The bar must agree with the submit button.
  if (required.length > 0 && required.every((q) => q.completeness > 0)) {
    return 1;
  }
  let earned = 0;
  let total = 0;
  for (const q of questions) {
    const weight = q.required ? REQUIRED_WEIGHT : OPTIONAL_WEIGHT;
    total += weight;
    earned += weight * clamp01(q.completeness);
  }
  return total === 0 ? 1 : clamp01(earned / total);
}

/** Guard against a caller handing us a fraction outside the range the bar is drawn from. */
function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
