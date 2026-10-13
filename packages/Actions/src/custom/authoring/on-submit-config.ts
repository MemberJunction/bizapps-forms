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
import { blueprintAutomationSchema, type BlueprintAutomation, type FormBlueprint } from '@mj-biz-apps/forms-entities';

const ON_SUBMIT_MODES = ['Legacy', 'Configured'] as const;
const automationsSchema = z.array(blueprintAutomationSchema);

/** Raised when a caller's on-submit parameters cannot be honoured as written. */
export class OnSubmitConfigError extends Error {}

/** The caller's on-submit params, read and validated — what {@link withOnSubmitConfig} overlays. */
export interface OnSubmitConfig {
  mode?: (typeof ON_SUBMIT_MODES)[number];
  automations?: BlueprintAutomation[];
}

/**
 * Read and validate the two params ON THEIR OWN, with no blueprint — so an action refuses a
 * malformed value before it does any expensive work (the Designer's LLM call, #303).
 *
 * `automations` accepts a JSON string (how an MJ Action param arrives) or an already-parsed value
 * (how a direct TypeScript caller supplies one).
 */
export function readOnSubmitConfig(mode: string | null | undefined, automations: unknown): OnSubmitConfig {
  const config: OnSubmitConfig = {};
  // NULL IS ABSENT, not a value. MJ materialises a declared-but-unsupplied Action param as `null`
  // — and the migration declares both of these with `@DefaultValue = NULL` — so treating null as
  // supplied would make every caller that simply omits `Automations` fail with
  // INVALID_ON_SUBMIT_CONFIG. Blank is absent for the same reason: `getStringParam`, which every
  // other param in this package goes through, already collapses blank to undefined.
  const suppliedMode = textOrAbsent(mode);
  if (suppliedMode !== undefined) {
    config.mode = parseMode(suppliedMode);
  }
  if (!isAbsent(automations)) {
    config.automations = parseAutomations(automations);
  }
  refuseLegacyWithSteps(config.mode, config.automations);
  return config;
}

/**
 * Return a copy of `blueprint` carrying the caller's on-submit configuration. An empty config — the
 * documented default — returns the blueprint unchanged, so the form keeps inferring its dispatch
 * exactly as every form authored before this did.
 *
 * The pair is checked again on the RESULT: a `Legacy` mode can come from the blueprint itself (the
 * Designer's output) while the steps come from the caller.
 */
export function withOnSubmitConfig(blueprint: FormBlueprint, config: OnSubmitConfig): FormBlueprint {
  const configured: FormBlueprint = { ...blueprint };
  if (config.mode !== undefined) {
    configured.onSubmitMode = config.mode;
  }
  if (config.automations !== undefined) {
    configured.automations = config.automations;
  }
  refuseLegacyWithSteps(configured.onSubmitMode, configured.automations);
  return configured;
}

/** {@link readOnSubmitConfig} then {@link withOnSubmitConfig}, for a caller that holds the blueprint already. */
export function applyOnSubmitConfig(
  blueprint: FormBlueprint,
  mode: string | null | undefined,
  automations: unknown,
): FormBlueprint {
  return withOnSubmitConfig(blueprint, readOnSubmitConfig(mode, automations));
}

/**
 * The PAIR, not either half. Each is individually valid, and the combination is the one shape that
 * fails silently: `Legacy` wins the dispatch, the authored steps are written anyway, and the caller
 * sees Success plus a non-zero AutomationCount while at runtime the legacy four fire and their step
 * never does. Nothing downstream can distinguish it from a form that meant it.
 */
function refuseLegacyWithSteps(mode: string | undefined, automations: readonly BlueprintAutomation[] | undefined): void {
  if (mode === 'Legacy' && (automations?.length ?? 0) > 0) {
    throw new OnSubmitConfigError(
      "OnSubmitMode 'Legacy' runs the built-in on-submit steps, so the Automations supplied here " +
        "would be written and never run. Use 'Configured' to run them, or omit them to keep the built-ins.",
    );
  }
}

/**
 * Whether a caller supplied this parameter at all.
 *
 * `null` because MJ materialises a declared-but-unsupplied Action param as null — the migration
 * declares both of these with `@DefaultValue = NULL` — and blank because `getStringParam`, which
 * every other param in this package goes through, already collapses blank to undefined. Treating
 * either as supplied makes a caller that simply omitted the parameter fail.
 *
 * One predicate for both parameters, because they diverged once: `mode` collapsed blank and
 * `automations` did not, so an empty string threw `Automations is not valid JSON`.
 */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/**
 * The same rule as {@link isAbsent}, in the form that narrows.
 *
 * A boolean predicate cannot tell the compiler that `mode` is a string afterwards, and the honest
 * way to get that is to return the value rather than assert it — the alternative is a cast, which
 * this repo's typing rules rule out and which would silently survive the parameter type widening.
 */
function textOrAbsent(value: string | null | undefined): string | undefined {
  return isAbsent(value) || value === null || value === undefined ? undefined : value;
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
