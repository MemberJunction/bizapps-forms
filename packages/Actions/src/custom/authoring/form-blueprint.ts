/**
 * The Designer's boundary: turn raw LLM output into a validated {@link DesignerBlueprint}.
 *
 * The blueprint SCHEMAS are contracts (`@mj-biz-apps/forms-entities`, `contracts/form-blueprint.ts`)
 * because the Builder that persists them is a server engine; what stays here is the part only the
 * LLM path needs — reading a model's reply, which may wrap the JSON in prose or a code fence.
 *
 * The reply is parsed with `designerBlueprintSchema`, NOT the full `formBlueprintSchema`: the model
 * authors the form, never what runs on submit (#303 security). A reply carrying `automations` or
 * `onSubmitMode` is refused with a {@link DesignerSideEffectError}.
 */
import { designerBlueprintSchema, designerSideEffectKeys, type DesignerBlueprint } from '@mj-biz-apps/forms-entities';

/** A Designer reply that tried to author on-submit side effects — refused, and worth a log line. */
export class DesignerSideEffectError extends Error {
  /** Which side-effect keys the reply carried. */
  public readonly keys: readonly string[];

  constructor(keys: readonly string[]) {
    super(
      `The Designer must not author on-submit side effects (it emitted ${keys.join(', ')}). ` +
        'Return only the form: name, description, renderMode, confirmationMessage and pages. ' +
        'What runs on submit is set by the caller, never by the model.',
    );
    this.name = 'DesignerSideEffectError';
    this.keys = keys;
  }
}

/**
 * Parse + validate a blueprint from raw LLM output (a JSON string or already-parsed object).
 * Throws {@link DesignerSideEffectError} when the reply carries side effects, a `ZodError` (or
 * `SyntaxError`) on any other malformed input — the Designer treats each as a retryable error and
 * feeds the message back to the model, never `any`.
 */
export function parseDesignerBlueprint(input: string | object): DesignerBlueprint {
  const raw: unknown = typeof input === 'string' ? JSON.parse(extractJSON(input)) : input;
  // The schema refuses these too; asking first turns that refusal into a typed error the Designer
  // can log, using the contract's own test of which keys are side effects.
  const sideEffects = designerSideEffectKeys(raw);
  if (sideEffects.length > 0) {
    throw new DesignerSideEffectError(sideEffects);
  }
  return designerBlueprintSchema.parse(raw);
}

/**
 * LLMs frequently wrap JSON in prose or ```json fences. Pull out the first balanced
 * top-level object so `JSON.parse` sees clean input.
 */
export function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return candidate;
  }
  return candidate.slice(start, end + 1);
}
