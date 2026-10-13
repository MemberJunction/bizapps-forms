/**
 * The Designer's boundary: turn raw LLM output into a validated {@link FormBlueprint}.
 *
 * The blueprint SCHEMA is a contract (`@mj-biz-apps/forms-entities`, `contracts/form-blueprint.ts`)
 * because the Builder that persists it is a server engine; what stays here is the part only the
 * LLM path needs — reading a model's reply, which may wrap the JSON in prose or a code fence.
 */
import { formBlueprintSchema, type FormBlueprint } from '@mj-biz-apps/forms-entities';

/**
 * Parse + validate a blueprint from raw LLM output (a JSON string or already-parsed
 * object). Throws a `ZodError` (or `SyntaxError`) on malformed input — the caller
 * treats a parse failure as a retryable Designer error, never as `any`.
 */
export function parseFormBlueprint(input: string | object): FormBlueprint {
  const raw: unknown = typeof input === 'string' ? JSON.parse(extractJSON(input)) : input;
  return formBlueprintSchema.parse(raw);
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
