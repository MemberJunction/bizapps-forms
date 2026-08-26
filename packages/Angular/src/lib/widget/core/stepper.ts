/**
 * Pure, framework-free cursor math, shared by both stepped render modes.
 *
 * OneQuestion steps by visible QUESTION; Scroll steps by visible SECTION. Both face the same
 * hazard, because both lists change live as conditional rules fire: the cursor must never point
 * past the end — and, critically, must be *written back* when the path shrinks, so it does not
 * "jump ahead" once the path grows again. Each component owns its reactive cursor (an Angular
 * signal) and routes every write through {@link clampCursor}; keeping the clamp here (one tested
 * function, one source of truth) is what makes that guarantee testable without Angular.
 *
 * What each cursor is COUNTING is the other half, and differs per mode — see
 * `section-stepper.ts` for Scroll's.
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
