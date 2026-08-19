/**
 * Reading the response-limit box.
 *
 * Separated from the component because the interesting part is a decision, not a write: a
 * number typed into a box can mean "cap it here", "no cap at all", or nothing at all, and
 * getting that wrong writes a destructive value from a typo. All three shipped defects
 * this replaces were in the mapping, not in the saving:
 *
 *  - `Number('')` is 0, so an empty box read as "accept nothing" rather than "no limit"
 *  - a negative fell through to null, which the UI renders as "no limit" — the opposite
 *    of the restriction a negative number was reaching for
 *  - anything past a SQL INT reached the server, was refused, and left the box displaying
 *    a number that had never been stored
 */

/** What a typed response-limit should do to the stored cap. */
export type LimitEdit =
  | { action: 'set'; value: number }
  | { action: 'clear' }
  | { action: 'ignore'; reason: string };

/** The largest value `FormDistribution.MaxResponses` (a SQL INT) can hold. */
const MAX_INT = 2147483647;

/**
 * Interpret what the author typed into the response-limit box.
 *
 * `ignore` rather than a best guess for anything nonsensical: the two available guesses
 * are "cap at zero" and "no cap", and both are drastic, opposite, and irreversible-looking
 * to someone who just fat-fingered a minus sign. Doing nothing and saying why is the only
 * reading that cannot be wrong.
 */
export function readResponseLimit(raw: string, badInput = false): LimitEdit {
  // `badInput` comes from the input element's own validity state. A number field reports
  // unparseable typing as an EMPTY value, so without this flag "abc" is indistinguishable
  // from a deliberately cleared box — and clearing the box is what removes the cap.
  if (badInput) {
    return { action: 'ignore', reason: 'That is not a number.' };
  }
  const text = raw.trim();
  if (text.length === 0) {
    return { action: 'clear' };
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return { action: 'ignore', reason: 'That is not a number.' };
  }
  if (parsed < 0) {
    return { action: 'ignore', reason: 'A response limit cannot be negative.' };
  }
  // Floor, not round: rounding up would let through one more response than the number
  // the author typed, and a cap that overshoots is not a cap.
  return { action: 'set', value: Math.min(Math.floor(parsed), MAX_INT) };
}
