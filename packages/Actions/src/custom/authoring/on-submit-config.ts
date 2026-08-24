/**
 * Overlay a caller's on-submit configuration onto a blueprint.
 *
 * Both authoring actions produce a blueprint from somewhere else — a template, or an LLM — and
 * neither source knows what the CALLER wants to happen on submit. This is where that is applied,
 * once, so `Forms: Generate Form` and `Forms: Create Form From Template` cannot drift in how they
 * read the same two parameters.
 *
 * It exists because a form authored programmatically had no way to decline the four legacy
 * hooks. `Forms: Upsert Respondent Person` is one of them, so a consumer that already owns subject
 * identity got a second `Person` row for the same human on every submission, with nothing logged
 * and nothing failed (bizapps-forms#47).
 *
 * Every rejection here is loud. Silently ignoring a malformed `Automations` value would hand back
 * a form that looks configured and quietly runs the legacy list instead — the same silence, one
 * layer up.
 */
import { z } from 'zod';
import { blueprintAutomationSchema, type BlueprintAutomation, type FormBlueprint } from './form-blueprint';

const ON_SUBMIT_MODES = ['Legacy', 'Configured'] as const;
const automationsSchema = z.array(blueprintAutomationSchema);

/** Raised when a caller's on-submit parameters cannot be honoured as written. */
export class OnSubmitConfigError extends Error {}

/**
 * Return a copy of `blueprint` carrying the caller's on-submit configuration.
 *
 * Both inputs are independently optional, and omitting both is the documented default: the
 * blueprint is returned unchanged, so the form keeps inferring its dispatch exactly as every form
 * authored before this did.
 *
 * `automations` accepts a JSON string (how an MJ Action param arrives) or an already-parsed value
 * (how a direct TypeScript caller supplies one).
 */
export function applyOnSubmitConfig(
  blueprint: FormBlueprint,
  mode: string | undefined,
  automations: unknown,
): FormBlueprint {
  const configured: FormBlueprint = { ...blueprint };
  if (mode !== undefined) {
    configured.onSubmitMode = parseMode(mode);
  }
  if (automations !== undefined) {
    configured.automations = parseAutomations(automations);
  }
  return configured;
}

function parseMode(mode: string): (typeof ON_SUBMIT_MODES)[number] {
  const match = ON_SUBMIT_MODES.find((m) => m.toLowerCase() === mode.trim().toLowerCase());
  if (!match) {
    throw new OnSubmitConfigError(
      `OnSubmitMode must be one of ${ON_SUBMIT_MODES.join(', ')}; received "${mode}".`,
    );
  }
  return match;
}

function parseAutomations(raw: unknown): BlueprintAutomation[] {
  const value = typeof raw === 'string' ? parseJSON(raw) : raw;
  const result = automationsSchema.safeParse(value);
  if (!result.success) {
    throw new OnSubmitConfigError(
      `Automations must be a list of steps, each naming an Action: ${result.error.issues
        .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
        .join('; ')}`,
    );
  }
  return result.data;
}

function parseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new OnSubmitConfigError(
      `Automations is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
