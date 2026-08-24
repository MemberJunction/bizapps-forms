/**
 * Decide whether a submission runs the form's own automations or the legacy hook list.
 *
 * This is the one place that decision is made. It used to be an inline `automations.length > 0`
 * test inside the submit pipeline, which quietly conflated two different facts about a form —
 * "has never configured anything" and "deliberately runs nothing" — because an empty array was
 * the only way to say either. That overload had two victims: a consumer owning its own subject
 * identity could not decline `Forms: Upsert Respondent Person` and collected a duplicate `Person`
 * per submission (bizapps-forms#47), and an author who removed their last step in the builder
 * silently got all four legacy hooks back.
 *
 * Pure and framework-free on purpose: this is the decision worth testing exhaustively, and it is
 * consumed by the server (dispatch) and the builder (explaining to an author what will happen).
 */
import type { FormSettings, PublishedFormAutomation } from './form-definition';

/** The dispatch decision. `automations` is carried so the caller never re-reads the definition. */
export type OnSubmitDispatch =
  | { kind: 'configured'; automations: readonly PublishedFormAutomation[] }
  | { kind: 'legacy' };

/**
 * The parts of a published definition this decision needs.
 *
 * Structural rather than `PublishedFormDefinition`, so a caller can pass the whole definition
 * (it satisfies this) and a test does not have to build one.
 */
export interface OnSubmitDispatchInput {
  settings: Pick<FormSettings, 'onSubmitMode'>;
  automations: readonly PublishedFormAutomation[];
}

/**
 * Resolve how a completed submission's side effects should run.
 *
 * An explicit mode wins; absent falls back to the inference the server has always made. That
 * fallback is not a nicety — it is the entire backward-compatibility story, because every
 * snapshot published before this field exists carries no mode and must keep behaving identically.
 *
 * `Legacy` is honoured even when automations are present. That combination is mis-authored rather
 * than meaningful (the builder never produces it: it marks a form `Configured` the moment it
 * writes a row), and honouring the explicit declaration is the predictable reading. The submit
 * pipeline logs it, because automations that exist and never run is worth seeing in production.
 */
export function resolveOnSubmitDispatch(definition: OnSubmitDispatchInput): OnSubmitDispatch {
  switch (definition.settings.onSubmitMode) {
    case 'Configured':
      return { kind: 'configured', automations: definition.automations };
    case 'Legacy':
      return { kind: 'legacy' };
    default:
      return definition.automations.length > 0
        ? { kind: 'configured', automations: definition.automations }
        : { kind: 'legacy' };
  }
}

/**
 * True when a form carries automations that {@link resolveOnSubmitDispatch} will not run.
 *
 * Separate from the resolver so the resolver stays a total function with no diagnostic channel:
 * this is a question the caller asks when it wants to log, not a third dispatch outcome.
 */
export function hasUnreachableAutomations(definition: OnSubmitDispatchInput): boolean {
  return definition.settings.onSubmitMode === 'Legacy' && definition.automations.length > 0;
}
