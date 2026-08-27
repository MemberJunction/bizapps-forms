/**
 * Which ending screen catches everyone the rules missed, and what it takes to change it.
 *
 * WHY THIS IS NOT A TOGGLE. `IsDefault` was authored as an independent switch on each ending
 * screen, under a label promising "every form needs exactly one" that nothing anywhere kept.
 * A form could carry two defaults, or none, and still look correct in the builder — at runtime
 * `resolveEndingScreen` simply takes the first one in display order, so the second was a setting
 * the author had turned on that did nothing.
 *
 * Making the choice EXCLUSIVE needs one place that knows how to move it, because moving it is
 * two writes to two records and their order matters: the old default must be cleared before the
 * new one is set, or a form momentarily holds two and the unique index refuses the write.
 *
 * Structural, so specs need no `BaseEntity` — the generated screen entity satisfies
 * {@link DefaultEndingCandidate} by shape, and the caller keeps its real entities to save.
 */
import type { mjBizAppsFormsFormScreenEntity } from '@mj-biz-apps/forms-entities';

/**
 * What this module needs to know about a screen. The generated entity satisfies it.
 *
 * `ScreenType` is INDEXED off the generated entity rather than written out as
 * `'Ending' | 'Welcome'`. That union is CodeGen's projection of the column's CHECK constraint, so
 * a copy of it is frozen at the moment it was typed: add a screen type in a migration, re-run
 * CodeGen, and a hand-written union goes on compiling while silently describing the old schema —
 * `orderedEndings` would keep filtering on a value list that no longer matches the database. The
 * import is `import type`, erased at build time, so this stays structural and specs still pass
 * plain object literals.
 */
export interface DefaultEndingCandidate {
  readonly ID: string;
  readonly ScreenType: mjBizAppsFormsFormScreenEntity['ScreenType'];
  readonly DisplayOrder: number;
  readonly IsDefault: boolean;
  readonly IsDisqualification: boolean;
}

/**
 * The ending a respondent lands on when no rule and no condition picked another, or null.
 *
 * Sorted rather than taken in the order handed in, and the tie broken the way
 * `resolveEndingScreen` breaks it: a form carrying two defaults already resolves to a specific
 * screen at submit time, and the builder naming a different one would make repairing the form
 * move the ending respondents were already getting.
 */
export function defaultEndingId(screens: readonly DefaultEndingCandidate[]): string | null {
  return orderedEndings(screens).find((s) => s.IsDefault)?.ID ?? null;
}

/**
 * The screens that can hold the default, in the order the runtime reads them.
 *
 * Welcome screens are not endings. Screened-out endings are excluded for the same reason
 * `resolveEndingScreen` excludes them: they take no part in resolution at all, so one flagged as
 * the default holds a setting that does nothing, and reporting it would tell an author their
 * form is configured when it is not.
 */
function orderedEndings<T extends DefaultEndingCandidate>(screens: readonly T[]): T[] {
  return screens
    .filter((s) => s.ScreenType === 'Ending' && !s.IsDisqualification)
    .sort((a, b) => a.DisplayOrder - b.DisplayOrder);
}

/** The two writes that move the default, in the order they must happen. */
export interface DefaultEndingChanges<T extends DefaultEndingCandidate> {
  /** Every screen that must stop being the default. Usually one, occasionally more. */
  readonly clear: readonly T[];
  /** The screen that becomes the default, or null when it already is. */
  readonly set: T | null;
}

/**
 * Work out the two writes that move a form's default ending to `nextId`.
 *
 * `clear` is emptied first and `set` second, always. A filtered unique index permits one default
 * per form, so setting the new one before clearing the old leaves the form momentarily holding
 * two and the database refuses the write — which an author experiences as a switch that flipped
 * itself back. Returning the ORDER rather than performing the writes keeps that decision in a
 * module a test can reach; see `BuilderStateService.setDefaultEnding` for the awaiting, and for
 * what happens when the second write is refused.
 *
 * @param screens every screen on the form, in any order.
 * @param nextId the ending that should become the catch-all.
 * @returns the screens to clear, and the one to set — `set` is null when it already holds it.
 * @throws if `nextId` names no eligible ending on this form. Guarded rather than tolerated:
 *   falling through would clear the default the form HAS and set nothing in its place.
 */
export function defaultEndingChanges<T extends DefaultEndingCandidate>(
  screens: readonly T[],
  nextId: string,
): DefaultEndingChanges<T> {
  const endings = orderedEndings(screens);
  const next = endings.find((s) => s.ID === nextId);
  if (next === undefined) {
    // Guarded rather than tolerated. Falling through would clear the default the form HAS and
    // set nothing in its place, leaving no catch-all at all — a silent downgrade from a stale id
    // or a screened-out screen, which the picker should never have offered in the first place.
    throw new Error(
      `Cannot make screen '${nextId}' the default ending: it is not an ending on this form, or it is screened out.`,
    );
  }
  return {
    clear: endings.filter((s) => s.IsDefault && s.ID !== nextId),
    set: next.IsDefault ? null : next,
  };
}

/**
 * The ending that should take over as the catch-all, or null when nothing should change.
 *
 * The invariant this module exists for has two halves and only one of them is a unique index. The
 * index refuses a SECOND default; nothing at the database level notices a form that has none, and
 * "none" is what deleting the default ending used to leave behind. The survivor then read
 * "Never shown — add a condition" on a form where it was the only place anyone could land — and
 * `resolveEndingScreen` would in fact have shown it, so the warning was wrong in both directions
 * at once.
 *
 * Null when the form already has a default (nothing to fill) or has no eligible ending (nothing
 * to fill it with — `endingMessage` falls back to the form-wide confirmation message, which is
 * what every form published before ending screens existed relies on).
 */
export function vacantDefaultEnding<T extends DefaultEndingCandidate>(
  screens: readonly T[],
): T | null {
  const endings = orderedEndings(screens);
  return endings.some((s) => s.IsDefault) ? null : endings[0] ?? null;
}
