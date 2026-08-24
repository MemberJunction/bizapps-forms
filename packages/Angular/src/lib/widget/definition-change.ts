/**
 * Whether a `definition` input change means `<mj-form>` should load again.
 *
 * Split out of `MjFormComponent` because it is a DECISION, and the component it lived in cannot be
 * instantiated in this suite's node environment — so the only thing a test could reach was the
 * component's source text. A guard asserted as text is a guard asserted by spelling: inverting the
 * sense of `firstChange` (never reload instead of always reload) left the word in place and the
 * test green, which is the one failure mode the test existed to prevent. Numbers and booleans in,
 * boolean out; `definition-change.spec.ts` exercises every branch for real.
 *
 * WHAT WENT WRONG ORIGINALLY, so a future edit does not quietly undo it. The `definition` input was
 * read exactly once, inside `ngOnInit`. The Preview modal never showed the bug because
 * `@if (previewDef)` destroys and recreates the whole modal per open, so every open got a fresh
 * `ngOnInit`. The Design tab's stage is not gated that way — it lives as long as the tab — so an
 * author editing a question watched a preview of the form as it stood when they opened the tab.
 * Streaming generation makes this load-bearing rather than cosmetic: the point is a preview that
 * fills in while the server patches the tree, and a component that reads its input once shows an
 * empty form for the entire build.
 */

/**
 * The one field of `SimpleChange` this decision reads.
 *
 * Declared structurally rather than importing `SimpleChanges` so this module stays free of Angular
 * and can be exercised without a DOM. Any `SimpleChange` satisfies it.
 */
export interface DefinitionChange {
  firstChange: boolean;
}

/**
 * The property name `SimpleChanges` is keyed by.
 *
 * The PROPERTY, not the `definition` template alias. Reading `changes['definition']` compiles, is
 * always `undefined`, and turns the hook into one that never fires — the exact failure this was
 * added to fix, wearing a passing build.
 */
export const DEFINITION_INPUT_KEY = 'definitionInput';

/**
 * Whether to re-run the load path for this batch of changes.
 *
 * False on the FIRST change, because `ngOnChanges` fires before the first `ngOnInit`: without that
 * guard every mount loads twice, minting two client response ids for one form. False when the
 * definition is not among the changed inputs at all — a real respondent passes `slug` and never
 * `definition`, so `ngOnInit` stays their only load.
 */
export function shouldReloadOnDefinitionChange(
  changes: Readonly<Record<string, DefinitionChange | undefined>>,
): boolean {
  const change = changes[DEFINITION_INPUT_KEY];
  return change !== undefined && !change.firstChange;
}
