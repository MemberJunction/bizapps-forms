/**
 * LLM Designer step — turns a natural-language brief into a validated
 * {@link FormBlueprint}. This is the *only* place an LLM is involved in AI authoring;
 * everything downstream (the Builder) is deterministic.
 *
 * Framework-correct model selection: the model/vendor/key is resolved by MemberJunction
 * from metadata — this code does **not** name a vendor or model. We run a named MJ
 * **AI Prompt** (`{@link FORM_DESIGNER_PROMPT_NAME}`) via {@link AIPromptRunner}; the
 * prompt's `SelectionStrategy='Specific'` + its related `AI Prompt Model` row pin the
 * model (currently a Gemini), so an installer swaps the model in metadata, never here.
 *
 * The prompt run is behind a small {@link FormDesignerModel} seam so the deterministic
 * blueprint→persistence path stays unit-testable with a stub (no network, no API key,
 * no AIEngine config). Tests inject a stub that returns canned JSON; production uses
 * {@link AIPromptFormDesignerModel}.
 */
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { UserInfo } from '@memberjunction/core';
import { parseFormBlueprint, type FormBlueprint } from './form-blueprint';
import { MAX_DESIGNER_ATTEMPTS, STAGE_TIMEOUT_MS } from './limits';

/**
 * What the author gave us, which changes what the Designer is allowed to do with it.
 *
 * `brief` describes a form to design; `questions` is a list the author has ALREADY WRITTEN, whose
 * wording the Designer must preserve verbatim while inferring only types, options, order and
 * grouping. The distinction matters because the same text produces very different output: an
 * author who pasted twenty questions and got twenty reworded ones back has lost the work they
 * came here with.
 */
export type FormDesignerInputMode = 'brief' | 'questions';

/**
 * Data passed to the Form Designer AI Prompt's template. `Brief` is the user's request (or their
 * pasted questions, per `InputMode`); the last two are populated only on a retry so the prompt can
 * show the model its prior invalid output and the validation error.
 */
export interface FormDesignerPromptData {
  Brief: string;
  InputMode: FormDesignerInputMode;
  PreviousAttempt?: string;
  ValidationError?: string;
}

/**
 * Minimal seam over "given prompt data, return the model's raw text". The default
 * ({@link AIPromptFormDesignerModel}) runs the named MJ AI Prompt; tests inject a stub
 * that returns canned JSON so the Designer→Builder pipeline is exercised offline.
 */
export interface FormDesignerModel {
  design(data: FormDesignerPromptData, contextUser: UserInfo): Promise<string>;
}

/** Name of the MJ AI Prompt that drives AI form authoring (resolved from metadata). */
export const FORM_DESIGNER_PROMPT_NAME = 'Forms: Form Designer';

/**
 * Default model: runs the `{@link FORM_DESIGNER_PROMPT_NAME}` AI Prompt through MJ's
 * {@link AIPromptRunner}. MemberJunction resolves the model, vendor, and API key from
 * the prompt's metadata (`SelectionStrategy='Specific'` → its `AI Prompt Model` row) —
 * there is deliberately no model or vendor name in this file.
 *
 * Fails loudly if the prompt can't be found in the AIEngine cache or the run fails
 * (e.g. no active model configured); we never silently fall back to a default client.
 */
export class AIPromptFormDesignerModel implements FormDesignerModel {
  async design(data: FormDesignerPromptData, contextUser: UserInfo): Promise<string> {
    const engine = AIEngine.Instance;
    await engine.Config(false, contextUser);

    const prompt = engine.Prompts.find((p) => p.Name === FORM_DESIGNER_PROMPT_NAME);
    if (!prompt) {
      throw new Error(
        `AI Prompt "${FORM_DESIGNER_PROMPT_NAME}" was not found in this MemberJunction instance. ` +
          `Ensure the Forms AI-authoring metadata (prompt + template + AI Prompt Model) has been pushed.`,
      );
    }

    const params = new AIPromptParams();
    params.prompt = prompt;
    params.contextUser = contextUser;
    params.data = { ...data };
    // The prompt is authored with OutputType='object' + ResponseFormat='JSON', so the
    // runner parses/validates the model's JSON for us; this lets it also repair
    // slightly-malformed JSON (trailing commas, stray fences) before giving up.
    params.attemptJSONRepair = true;
    // The same bound the staged path and the chat put on a model call. Without it this path had
    // none at all, and `MAX_DESIGNER_ATTEMPTS` retries it — so a hung call was three hung calls.
    // This is the documented fallback for a caller with no SessionID, which is exactly the caller
    // with nobody watching a progress bar to notice.
    params.cancellationToken = AbortSignal.timeout(STAGE_TIMEOUT_MS);

    const result = await new AIPromptRunner().ExecutePrompt<FormBlueprint>(params);
    if (!result.success) {
      throw new Error(
        `AI Prompt "${FORM_DESIGNER_PROMPT_NAME}" failed to run: ${result.errorMessage ?? 'unknown error'}`,
      );
    }

    const raw = designerOutputText(result.rawResult, result.result);
    if (!raw) {
      throw new Error(
        `AI Prompt "${FORM_DESIGNER_PROMPT_NAME}" returned no output to parse into a form blueprint.`,
      );
    }
    return raw;
  }
}

/**
 * Coerce the prompt run's output into the JSON text the Designer parses. With
 * `ResponseFormat='JSON'` the runner may surface a parsed object in `result`; we
 * re-stringify it so the single {@link parseFormBlueprint} validation path applies.
 * Otherwise we use the raw model text.
 */
function designerOutputText(rawResult: string | undefined, parsed: FormBlueprint | undefined): string {
  if (parsed !== undefined && parsed !== null) {
    return JSON.stringify(parsed);
  }
  return rawResult?.trim() ?? '';
}

/**
 * Number of Designer attempts before giving up. Defined in `limits.ts` with every other cap and
 * re-exported here so this file's long-standing import path keeps working.
 */
export { MAX_DESIGNER_ATTEMPTS } from './limits';

/**
 * Run the Designer: run the AI Prompt, validate the result against the §5.3 taxonomy,
 * and retry (feeding the validation error back to the model via prompt data) up to
 * {@link MAX_DESIGNER_ATTEMPTS}. Throws the last error if it never produces a valid
 * blueprint — the caller maps that to a failed action result.
 */
export async function designFormFromBrief(
  brief: string,
  model: FormDesignerModel,
  contextUser: UserInfo,
  inputMode: FormDesignerInputMode = 'brief',
): Promise<FormBlueprint> {
  let lastError: unknown;
  let promptData: FormDesignerPromptData = { Brief: brief, InputMode: inputMode };

  for (let attempt = 1; attempt <= MAX_DESIGNER_ATTEMPTS; attempt++) {
    const raw = await model.design(promptData, contextUser);
    try {
      return parseFormBlueprint(raw);
    } catch (error) {
      lastError = error;
      promptData = { Brief: brief, InputMode: inputMode, PreviousAttempt: raw, ValidationError: errorText(error) };
    }
  }
  throw new Error(
    `Designer failed to produce a valid form blueprint after ${MAX_DESIGNER_ATTEMPTS} attempts: ${errorText(lastError)}`,
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
