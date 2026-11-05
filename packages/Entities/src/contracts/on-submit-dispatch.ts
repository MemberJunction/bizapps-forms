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
import { readStoredFormSettings } from './stored-columns';

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
 * than meaningful, and honouring the explicit declaration is the predictable reading. The submit
 * pipeline logs it, because automations that exist and never run is worth seeing in production.
 *
 * Neither supported authoring path produces it: the builder marks a form `Configured` whenever it
 * adds or removes a step, and the Actions layer rejects the pair outright. It remains reachable by
 * a hand-written snapshot, or by a caller going directly to `buildFormFromBlueprint`.
 */
export function resolveOnSubmitDispatch(definition: OnSubmitDispatchInput): OnSubmitDispatch {
  return dispatchesLegacy(definition.settings, definition.automations.length)
    ? { kind: 'legacy' }
    : { kind: 'configured', automations: definition.automations };
}

/**
 * Whether a form with these settings and this many automations runs the four legacy hooks rather
 * than its own steps — the decision {@link resolveOnSubmitDispatch} makes, asked of the LIVE form by
 * the server's automation editor, which must seed the built-ins at exactly the moment an edit turns
 * this from true to false.
 */
export function dispatchesLegacy(settings: Pick<FormSettings, 'onSubmitMode'>, automationCount: number): boolean {
  switch (settings.onSubmitMode) {
    case 'Configured':
      return false;
    case 'Legacy':
      return true;
    default:
      return automationCount === 0;
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

/**
 * The `Form.Settings` JSON that marks a form's automations authoritative — its own steps are what run
 * on submit, INCLUDING when it has none — or `null` when it already is. Throws when the stored
 * settings cannot be read.
 *
 * Dispatch used to be inferred from whether the automation list was empty, which made "this form
 * has never configured anything" and "this form deliberately runs nothing" the same state: an author
 * who removed their last step got all four legacy hooks back, silently (bizapps-forms#47).
 *
 * `null` means "no write needed", not "failed". There is deliberately NO inverse: once a form runs
 * its own steps, removing all of them means "run nothing", not "run the four I never asked for".
 *
 * Throws rather than overwriting: this replaces the whole blob, so carrying on would mean writing
 * back either the unreadable value or the defaults in its place — both lose the author's settings.
 * The PARSED settings are spread, not the raw JSON, so an author's quota or close date survives.
 *
 * One implementation for the server's `FormAutomationEngine` and the builder's Automate tab.
 */
export function settingsUpdateToMarkAuthoritative(raw: string | null | undefined): string | null {
  const read = readStoredFormSettings(raw);
  if (!read.ok) {
    throw new Error(`This form's settings cannot be read (${read.reason}), so they were not changed.`);
  }
  if (read.value.onSubmitMode === 'Configured') {
    return null;
  }
  return JSON.stringify({ ...read.value, onSubmitMode: 'Configured' });
}
