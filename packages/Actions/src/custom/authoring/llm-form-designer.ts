/**
 * LLM Designer step — turns a natural-language brief into a validated
 * {@link FormBlueprint}. This is the *only* place an LLM is involved in AI authoring;
 * everything downstream (the Builder) is deterministic.
 *
 * The actual model call is behind a small {@link FormDesignerModel} seam so the
 * deterministic blueprint→persistence path stays unit-testable with a stub model
 * (no network, no API key). The default implementation uses MJ's `AIEngine`
 * (`SimpleLLMCompletion`) against the highest-power LLM of a configurable AI Vendor,
 * defaulting to **Google** (Gemini). The vendor is read from the
 * `FORMS_AI_AUTHORING_VENDOR` env var so this Open App stays provider-agnostic.
 */
import { AIEngine } from '@memberjunction/aiengine';
import type { UserInfo } from '@memberjunction/core';
import { parseFormBlueprint, type FormBlueprint } from './form-blueprint';

/**
 * Minimal seam over "given a system + user prompt, return the model's text". The
 * default routes to the configured vendor's highest-power LLM via `AIEngine`; tests
 * inject a stub that returns canned JSON so the Designer→Builder pipeline is
 * exercised without a live model.
 */
export interface FormDesignerModel {
  complete(systemPrompt: string, userPrompt: string, contextUser: UserInfo): Promise<string>;
}

/** AI Vendor (by `AIVendor.Name`) used for AI authoring when the env var is unset. */
export const DEFAULT_AI_AUTHORING_VENDOR = 'Google';

/**
 * Narrow ambient declaration for the single env var we read. This package's tsconfig
 * sets `types: []` (no `@types/node`), so we type just what we use rather than pulling
 * in the whole Node typings for one lookup.
 */
declare const process: { env: Record<string, string | undefined> };

/** Resolve the AI Vendor name for authoring, defaulting to {@link DEFAULT_AI_AUTHORING_VENDOR}. */
function resolveAuthoringVendor(): string {
  const configured = process.env.FORMS_AI_AUTHORING_VENDOR?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_AI_AUTHORING_VENDOR;
}

/**
 * Default model: highest-power LLM of the configured AI Vendor via MJ's AIEngine
 * (vendor name from `FORMS_AI_AUTHORING_VENDOR`, default `Google` → Gemini). We
 * deliberately select by vendor + "highest power" rather than pinning a model id, so
 * the app always rides the latest configured model (e.g. Gemini 3.1 Pro) without code
 * changes.
 *
 * If the vendor has no active LLM configured, `GetHighestPowerLLM` returns `undefined`;
 * we fail loudly here rather than passing `undefined` to `SimpleLLMCompletion`, which
 * would silently fall back to a default (OpenAI) client and surface a confusing
 * `OPENAI_API_KEY` error instead of the real cause.
 */
export class AIEngineFormDesignerModel implements FormDesignerModel {
  async complete(systemPrompt: string, userPrompt: string, contextUser: UserInfo): Promise<string> {
    const engine = AIEngine.Instance;
    await engine.Config(false, contextUser);
    const vendor = resolveAuthoringVendor();
    const model = await engine.GetHighestPowerLLM(vendor, contextUser);
    if (!model) {
      throw new Error(
        `AI authoring vendor "${vendor}" has no active LLM configured in this MemberJunction instance. ` +
          `Configure an active model for that vendor, or set FORMS_AI_AUTHORING_VENDOR to a vendor that has one.`,
      );
    }
    return engine.SimpleLLMCompletion(userPrompt, contextUser, systemPrompt, model);
  }
}

/** Number of Designer attempts before giving up (matches the Form Builder agent's cap). */
export const MAX_DESIGNER_ATTEMPTS = 3;

/**
 * Run the Designer: prompt the model, validate the result against the §5.3 taxonomy,
 * and retry (feeding the validation error back to the model) up to
 * {@link MAX_DESIGNER_ATTEMPTS}. Throws the last error if it never produces a valid
 * blueprint — the caller maps that to a failed action result.
 */
export async function designFormFromBrief(
  brief: string,
  model: FormDesignerModel,
  contextUser: UserInfo,
): Promise<FormBlueprint> {
  let lastError: unknown;
  let userPrompt = buildUserPrompt(brief);

  for (let attempt = 1; attempt <= MAX_DESIGNER_ATTEMPTS; attempt++) {
    const raw = await model.complete(DESIGNER_SYSTEM_PROMPT, userPrompt, contextUser);
    try {
      return parseFormBlueprint(raw);
    } catch (error) {
      lastError = error;
      userPrompt = buildRetryPrompt(brief, raw, error);
    }
  }
  throw new Error(
    `Designer failed to produce a valid form blueprint after ${MAX_DESIGNER_ATTEMPTS} attempts: ${errorText(lastError)}`,
  );
}

function buildUserPrompt(brief: string): string {
  return `Design a form for this request:\n\n"""${brief}"""\n\nReturn ONLY the JSON blueprint.`;
}

function buildRetryPrompt(brief: string, lastOutput: string, error: unknown): string {
  return [
    buildUserPrompt(brief),
    '',
    'Your previous response was invalid:',
    lastOutput,
    '',
    `Validation error: ${errorText(error)}`,
    'Fix it and return ONLY the corrected JSON blueprint.',
  ].join('\n');
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The Designer system prompt. Pins the output contract (the {@link FormBlueprint}
 * shape) and the Phase-1 question taxonomy so the model emits structured, parseable
 * JSON the deterministic Builder can persist without interpretation.
 */
export const DESIGNER_SYSTEM_PROMPT = `You are a form-design assistant for MJ Forms. Given a natural-language brief, design a clear, friendly, mobile-first form and return it as a single JSON object — no prose, no markdown fences, JSON only.

The JSON MUST match this shape exactly:
{
  "name": string,                       // short form title
  "description"?: string,               // one-sentence intro shown to respondents
  "renderMode"?: "Scroll" | "OneQuestion",
  "confirmationMessage"?: string,       // shown after successful submit
  "pages": [                            // at least one page
    {
      "title"?: string,
      "description"?: string,
      "questions": [                    // at least one question per page
        {
          "type": <QuestionType>,       // see allowed types below
          "prompt": string,             // the question label
          "helpText"?: string,
          "isRequired"?: boolean,
          "options"?: [ { "label": string, "value"?: string, "isDefault"?: boolean } ],
          "settings"?: object           // per-type config, e.g. { "max": 5 } for Rating
        }
      ]
    }
  ]
}

Allowed "type" values (Phase 1 ONLY):
ShortText, LongText, Email, Phone, Number, SingleChoice, MultiChoice, Dropdown, Rating, NPS, YesNo, Date, Time, FileUpload, Statement.

Rules:
- "options" are REQUIRED for SingleChoice, MultiChoice, and Dropdown; provide at least two. Do NOT add options to any other type.
- Use Email for email addresses, Phone for phone numbers, Number for numeric inputs (e.g. a "+1 count" or quantity).
- Rating settings may include { "min": number, "max": number }. NPS is a fixed 0-10 scale (no options needed).
- Statement is display-only (a section header / instructional text); it is never required and has no options.
- Keep prompts concise. Mark only genuinely-required fields as required.
- Return valid JSON parseable by JSON.parse. Output the JSON object and nothing else.`;
