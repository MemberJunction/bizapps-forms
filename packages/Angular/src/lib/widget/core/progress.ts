/**
 * How full the progress bar is: the fraction of the visible form that is FILLED IN.
 *
 * THE INVARIANT: the bar reads 100% if and only if every visible answerable question is answered.
 * Nothing else may reach the top of the track.
 *
 * That invariant is the whole point, because the bar had the opposite one and it lied. It used to
 * short-circuit to full the moment every REQUIRED question was satisfied — "you can submit, so you
 * are done" — which on a nine-question form with one required email painted a completely full bar
 * above eight visibly blank questions (#88). Respondents act on a full bar; the goal-gradient
 * effect this file was written around is exactly why they stop at one. Optional questions the
 * author deliberately asked got skipped because the UI had signalled completion.
 *
 * It also made 100% non-terminal. Reachable early, it could be followed by more work — or by the
 * bar FALLING, to 50%, when changing an answer revealed a required follow-up. A control that goes
 * backwards from a claimed finish has taught the respondent it cannot be trusted, which is the
 * failure this file set out to avoid.
 *
 * Two earlier models each failed in an instructive way, and the weighting is shaped by both.
 *
 * Counting only REQUIRED questions broke the feel: on a form with five required fields each one is
 * worth 20%, so the bar lurched a fifth of the way, then sat dead through the two or three optional
 * questions between them, then lurched again. A control that does not respond for three consecutive
 * actions has taught the respondent that their input does not register — the opposite of what a
 * progress bar is for, and measurably worse for completion.
 *
 * Counting every question EQUALLY put the required path — the only part that gates a submit — on
 * the same footing as the optional asides beside it.
 *
 * So: WEIGHTED, and run all the way to the end. Required questions are worth several optional ones,
 * so the bar leans toward the path that actually gates the submit; optional ones are worth
 * something, so every single answer moves it. Neither can finish it alone.
 *
 * "You can submit now" is a separate signal — the ready line on `FormProgressComponent`, driven by
 * `FormRuntime.isFormValid` — precisely so the bar does not have to overload its own top end to
 * say it. Submittable and complete are different facts, and each now has its own control.
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

/**
 * Fraction complete, 0..1.
 *
 * A form with nothing to answer is complete — vacuously, there is no unanswered question left —
 * which keeps the invariant above total and the function free of a null case. The renderers do not
 * lean on that number: they suppress the bar entirely when there is nothing answerable, because a
 * progress bar over an empty form is a control with no subject either way.
 */
export function computeProgress(questions: readonly ProgressQuestion[]): number {
  if (questions.length === 0) {
    return 1;
  }
  let earned = 0;
  let total = 0;
  for (const q of questions) {
    const weight = q.required ? REQUIRED_WEIGHT : OPTIONAL_WEIGHT;
    total += weight;
    earned += weight * clamp01(q.completeness);
  }
  // `total` cannot be zero here: both weights are positive and the list is non-empty.
  return clamp01(earned / total);
}

/**
 * The whole-number percentage the bar is painted and announced from.
 *
 * FLOOR, not round, and it lives here rather than in the component because the painted layer has
 * to keep the same promise the number does. `Math.round` reports 100 for anything from 99.5% up,
 * so a long form — or one with a partly filled composite among many optionals — could paint a full
 * bar, glow `is-complete` and publish `aria-valuenow="100"` with questions still blank. That is the
 * same defect one layer down, and `aria-valuenow` is the yardstick #88 was measured with.
 *
 * Flooring makes 100 reachable only from a value of exactly 1. {@link computeProgress} returns
 * exactly 1 only when every question is answered: the weights are then summed identically on both
 * sides of the division, so the quotient is 1 with no floating-point slack to lose.
 */
export function progressPercent(fraction: number): number {
  return Math.floor(clamp01(fraction) * 100);
}

/** Guard against a caller handing us a fraction outside the range the bar is drawn from. */
function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
