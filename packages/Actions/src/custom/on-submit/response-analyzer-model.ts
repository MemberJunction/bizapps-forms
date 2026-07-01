/**
 * Model seam for **Forms: Analyze Written Responses**.
 *
 * Framework-correct model selection: the model/vendor/key is resolved by MemberJunction
 * from metadata — this file does **not** name a vendor or model. We run the named MJ
 * **AI Prompt** ({@link RESPONSE_ANALYZER_PROMPT_NAME}) via {@link AIPromptRunner}; the
 * prompt's `SelectionStrategy='Specific'` + its related AI Prompt Model row pin the
 * model, so an installer swaps it in metadata, never here.
 *
 * The default ({@link AIPromptResponseAnalyzerModel}) makes ONE prompt call for the
 * whole response: it sends an `Answers` array and expects a parallel `answers` array
 * back (same order). Tests inject a stub returning canned analysis, so the action's
 * map-back + persistence path runs offline (no network, no API key, no AIEngine config).
 */
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { UserInfo } from '@memberjunction/core';

/** Name of the MJ AI Prompt that scores free-text answers (resolved from metadata). */
export const RESPONSE_ANALYZER_PROMPT_NAME = 'Forms: Response Analyzer';

/** One free-text answer sent to the analyzer prompt. */
export interface AnalyzerInputAnswer {
  questionPrompt: string;
  text: string;
}

/** One analyzed answer returned by the prompt (order matches the input array). */
export interface AnalyzedAnswer {
  score: number;
  rationale: string;
  sentiment?: string;
  theme?: string;
}

/** Raw shape the prompt returns: a parallel `answers` array. */
interface AnalyzerResult {
  answers: AnalyzedAnswer[];
}

/**
 * Minimal seam over "given the free-text answers, return per-answer analysis". The
 * default runs the named MJ AI Prompt; tests inject a stub.
 */
export interface ResponseAnalyzerModel {
  analyze(
    answers: AnalyzerInputAnswer[],
    formContext: string,
    contextUser: UserInfo,
  ): Promise<AnalyzedAnswer[]>;
}

/**
 * Default model: runs the {@link RESPONSE_ANALYZER_PROMPT_NAME} AI Prompt through MJ's
 * {@link AIPromptRunner} in a SINGLE call. MemberJunction resolves the model, vendor,
 * and API key from the prompt's metadata — there is deliberately no model or vendor
 * name here. Fails loudly if the prompt is missing or the run fails; never falls back
 * to a default client.
 */
export class AIPromptResponseAnalyzerModel implements ResponseAnalyzerModel {
  async analyze(
    answers: AnalyzerInputAnswer[],
    formContext: string,
    contextUser: UserInfo,
  ): Promise<AnalyzedAnswer[]> {
    const engine = AIEngine.Instance;
    await engine.Config(false, contextUser);

    const prompt = engine.Prompts.find((p) => p.Name === RESPONSE_ANALYZER_PROMPT_NAME);
    if (!prompt) {
      throw new Error(
        `AI Prompt "${RESPONSE_ANALYZER_PROMPT_NAME}" was not found in this MemberJunction instance. ` +
          `Ensure the Forms response-analyzer metadata (prompt + template + AI Prompt Model) has been pushed.`,
      );
    }

    const params = new AIPromptParams();
    params.prompt = prompt;
    params.contextUser = contextUser;
    params.data = { Answers: answers, FormContext: formContext };
    params.attemptJSONRepair = true;

    const result = await new AIPromptRunner().ExecutePrompt<AnalyzerResult>(params);
    if (!result.success) {
      throw new Error(
        `AI Prompt "${RESPONSE_ANALYZER_PROMPT_NAME}" failed to run: ${result.errorMessage ?? 'unknown error'}`,
      );
    }
    return coerceAnalyzedAnswers(result.result, result.rawResult);
  }
}

/**
 * Coerce the run's output into the analyzed-answers array. With `ResponseFormat='JSON'`
 * the runner usually surfaces a parsed object in `result`; otherwise we parse the raw
 * model text. Either way we validate the `answers` array shape before returning.
 */
function coerceAnalyzedAnswers(parsed: AnalyzerResult | undefined, rawResult: string | undefined): AnalyzedAnswer[] {
  const obj: unknown = parsed ?? (rawResult ? JSON.parse(rawResult) : undefined);
  if (!isAnalyzerResult(obj)) {
    throw new Error(`AI Prompt "${RESPONSE_ANALYZER_PROMPT_NAME}" returned output without a valid "answers" array.`);
  }
  return obj.answers;
}

/** Runtime shape guard so no `any` leaks out of the JSON boundary. */
function isAnalyzerResult(value: unknown): value is AnalyzerResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const answers = (value as { answers?: unknown }).answers;
  return Array.isArray(answers) && answers.every(isAnalyzedAnswer);
}

function isAnalyzedAnswer(value: unknown): value is AnalyzedAnswer {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as { score?: unknown; rationale?: unknown };
  return typeof v.score === 'number' && typeof v.rationale === 'string';
}
