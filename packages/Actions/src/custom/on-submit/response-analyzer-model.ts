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
 *
 * NOTE: the template/example were trimmed to request only `{score, rationale}` (dropping
 * the unused `sentiment`/`theme`) so more answers fit under the model's output-token cap
 * before truncation. That trim only takes effect in the running DB after `mj sync push`.
 * The truncation SALVAGE in {@link coerceAnalyzedAnswers}, by contrast, is pure code and
 * works immediately without any push.
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
 * model text.
 *
 * Happy path: a valid parsed object is returned unchanged. When the strict parse fails
 * (e.g. the model's output was truncated mid-array by an output-token cap on the shared
 * `MJ: AI Model Vendors` row — which is core metadata we don't own), we SALVAGE the
 * complete leading `{score, rationale}` entries from the truncated `answers` array and
 * discard the trailing incomplete one. The action maps results back to inputs BY INDEX
 * and best-effort persists, so returning `answers[0..k]` is strictly correct and far
 * better than dropping every score. Only throw if ZERO answers can be salvaged.
 */
export function coerceAnalyzedAnswers(
  parsed: AnalyzerResult | undefined,
  rawResult: string | undefined,
): AnalyzedAnswer[] {
  const obj: unknown = parsed ?? tryParse(rawResult);
  if (isAnalyzerResult(obj)) {
    return obj.answers;
  }
  const salvaged = rawResult ? salvageAnswers(rawResult) : [];
  if (salvaged.length === 0) {
    throw new Error(`AI Prompt "${RESPONSE_ANALYZER_PROMPT_NAME}" returned output without a valid "answers" array.`);
  }
  console.warn(
    `[forms] AI Prompt "${RESPONSE_ANALYZER_PROMPT_NAME}" output was invalid/truncated; ` +
      `salvaged ${salvaged.length} complete answer(s) from the raw text.`,
  );
  return salvaged;
}

/** Parse raw text tolerantly; a hard-truncated payload throws, so swallow to null. */
function tryParse(rawResult: string | undefined): unknown {
  if (!rawResult) {
    return undefined;
  }
  try {
    return JSON.parse(rawResult);
  } catch {
    return undefined;
  }
}

/**
 * Salvage complete leading answer objects from a (possibly truncated) raw payload.
 * Locates the `"answers"` array, walks it extracting balanced `{...}` objects with a
 * brace-depth scanner that respects string literals + escapes, JSON.parses each in
 * isolation, and keeps those passing {@link isAnalyzedAnswer}. Stops at the first object
 * that fails to parse (the truncated tail). No eval.
 */
function salvageAnswers(rawResult: string): AnalyzedAnswer[] {
  const start = arrayStartIndex(rawResult);
  if (start < 0) {
    return [];
  }
  const salvaged: AnalyzedAnswer[] = [];
  let i = start;
  while (i < rawResult.length) {
    const open = rawResult.indexOf('{', i);
    if (open < 0) {
      break;
    }
    const end = objectEndIndex(rawResult, open);
    if (end < 0) {
      break; // trailing object is incomplete (truncated); stop.
    }
    const candidate = tryParse(rawResult.slice(open, end + 1));
    if (isAnalyzedAnswer(candidate)) {
      salvaged.push(candidate);
    }
    i = end + 1;
  }
  return salvaged;
}

/** Index just past the `[` opening the `"answers"` array, or -1 if not found. */
function arrayStartIndex(raw: string): number {
  const key = raw.indexOf('"answers"');
  if (key < 0) {
    return -1;
  }
  const bracket = raw.indexOf('[', key);
  return bracket < 0 ? -1 : bracket + 1;
}

/**
 * Given the index of a `{`, return the index of its matching `}` (respecting nested
 * braces and skipping over string literals + escapes), or -1 if the object never closes
 * (truncated). A pure lexical scan — no JSON semantics, no eval.
 */
function objectEndIndex(raw: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  for (let i = openIndex; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === '\\') {
        i++; // skip the escaped char
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
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
