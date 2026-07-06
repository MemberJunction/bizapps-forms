/**
 * Pure, framework-free cursor math for the OneQuestion (Typeform-style) render mode.
 *
 * The OneQuestion component shows one visible answerable question at a time. The list of
 * visible questions changes live as conditional rules fire, so the cursor must never point
 * past the last visible question — and, critically, must be *written back* when the path
 * shrinks, so it does not "jump ahead" once the path grows again. The component owns the
 * reactive cursor (an Angular signal) and routes every write through {@link clampCursor};
 * keeping the clamp here (one tested function, one source of truth) is what makes that
 * guarantee testable without Angular.
 */

/**
 * Clamp a cursor to the valid `[0, max(0, total-1)]` range.
 *
 * @param value the desired cursor position (may be out of range / negative)
 * @param total the number of visible steps
 * @returns the in-range cursor; `0` when there are no steps
 */
export function clampCursor(value: number, total: number): number {
  const max = Math.max(0, total - 1);
  return Math.min(Math.max(0, value), max);
}
