/**
 * When a `ValidationRule`'s two bounds contradict each other (issue #80).
 *
 * A rule carries its constraints as independent fields and both validators — the widget's
 * `validateRule` and the server's `validation.service` — apply them one after another, lower
 * bound first. That is right for every pair an author means: nothing checks that the pair as a
 * whole is satisfiable, because nothing needed to. Set a minimum above the maximum and every
 * possible answer fails one of the two, in sequence: `100` is told "Must be at least 500." and
 * `500` is told "Must be at most 120." The respondent is handed two mutually exclusive
 * instructions with nothing anywhere saying the form itself is broken, and if the question is
 * also required the form cannot be submitted at all.
 *
 * So the pair is a single decision and is checked as one, at the only moment anybody can still
 * do something about it: while it is being authored.
 *
 * Pure, and about the RULE rather than about the editor — it names no control and reads no
 * question type — so anything else that needs to know (a publish-time preflight, say) can consult
 * it rather than growing a second opinion about the same two numbers.
 */
import type { ValidationRule } from '@mj-biz-apps/forms-entities';

/**
 * The bounded pairs a {@link ValidationRule} can carry.
 *
 * Two of them, and the failure is identical in both: `minLength`/`maxLength` on a text answer
 * traps a respondent exactly as `min`/`max` does on a number, through the same sequential
 * validators. Issue #80 reports the number pair because that is the one that was tried; treating
 * the invariant as belonging to "a bounded question" rather than to "a number question" is what
 * keeps the other half of the same defect from being left behind.
 */
export type BoundedRange = 'length' | 'value';

/** The two fields each pair is made of. */
const BOUNDS = {
  length: { lower: 'minLength', upper: 'maxLength' },
  value: { lower: 'min', upper: 'max' },
} as const;

/**
 * Why one pair of bounds on `rule` can never both be satisfied, in a sentence naming both
 * numbers — or `null` when the pair is fine.
 *
 * Deliberately says "minimum" and "maximum" rather than repeating the labels above the two boxes
 * ("Minimum value", "Min length"). The sentence is read directly beneath the pair it is about, so
 * the labels add nothing on screen — and a copy of them here is a copy nothing keeps in step: the
 * day one is reworded, the message names a box that is no longer there.
 *
 * Equal bounds are fine: `min` 5 with `max` 5 means "exactly 5", which is a rule authors write
 * on purpose. So is a pair with only one side set — an open-ended range is the normal case, and
 * clearing either box has to remain a way out of a contradiction.
 *
 * A bound that is not a finite number is ignored rather than reported. `ValidationRule` is
 * parsed out of an `nvarchar(MAX)` column with no schema enforcement behind it, so a `null` or a
 * string can arrive here; the validators compare with `<` and `>`, which every such value fails,
 * making the bound inert rather than contradictory. Calling it a conflict would send an author
 * looking for a number that is not on screen.
 */
export function rangeConflict(rule: ValidationRule, range: BoundedRange): string | null {
  const { lower, upper } = BOUNDS[range];
  const low = rule[lower];
  const high = rule[upper];
  if (typeof low !== 'number' || typeof high !== 'number') {
    return null;
  }
  if (Number.isNaN(low) || Number.isNaN(high) || low <= high) {
    return null;
  }
  return `Minimum (${low}) is above maximum (${high}), so no answer can satisfy this range.`;
}
