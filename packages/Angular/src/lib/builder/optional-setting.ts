/**
 * The on/off behaviour of a properties-panel row whose "on" is not stored anywhere.
 *
 * Most optional settings have no boolean column: a question either HAS a validation rule or it
 * does not, has a placeholder or does not. So the row derives its state from the value, with one
 * gap — the moment between switching the row on and typing anything, when there is still no
 * value and the row must nevertheless stay open. `requested` covers exactly that gap.
 *
 * The rule that matters is what happens on the way DOWN. Switching a row off has to clear the
 * value, or the setting keeps applying while the panel says it is off: a validation rule left
 * behind would go on rejecting respondents' answers with nothing on screen to explain why, and
 * the author would have no way to find it. A toggle that does not control the thing it names is
 * worse than no toggle.
 */

/** What a row should do next, given what it holds now. */
export interface OptionalSettingState {
  /** Whether the editor shows. */
  open: boolean;
  /** Whether the stored value should be cleared as part of this transition. */
  clear: boolean;
  /** The new `requested` flag for the host to keep. */
  requested: boolean;
}

/** Whether the row's editor is showing: it holds a value, or the author just asked for it. */
export function isOptionalOpen(hasValue: boolean, requested: boolean): boolean {
  return hasValue || requested;
}

/**
 * Flip the row. Turning it on only reveals the editor — nothing is stored until the author types.
 * Turning it off clears whatever was there, which is the whole point.
 */
export function toggleOptional(hasValue: boolean, requested: boolean): OptionalSettingState {
  if (isOptionalOpen(hasValue, requested)) {
    return { open: false, clear: hasValue, requested: false };
  }
  return { open: true, clear: false, requested: true };
}
