/**
 * The production {@link StagedAuthoringModel}: two named MJ AI Prompts, run through
 * {@link AIPromptRunner}.
 *
 * Model selection stays 100% metadata, exactly as the single-shot Designer's does — no vendor and
 * no model name appears here. An installer pins each stage's model through its prompt's
 * `SelectionStrategy='Specific'` + `AI Prompt Model` row, which is also how the two stages can be
 * pointed at DIFFERENT models: the outline wants fast, the detail wants careful, and that is an
 * operator's call to make in metadata rather than ours to make in code.
 *
 * The shared plumbing lives in {@link runNamedPrompt} rather than in two near-identical methods,
 * because the only thing that differs between the stages is the prompt name and the data.
 */
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { UserInfo } from '@memberjunction/core';
import { STAGE_TIMEOUT_MS } from './limits';
import { THEME_TOKEN_NAMES } from './theme-tokens';
import type {
  OutlineInput,
  PageDetailInput,
  StagedAuthoringModel,
  ThemeInput,
} from './staged-authoring';

/** The AI Prompt that sketches the whole form. Small and fast — it gates time-to-first-paint. */
export const FORM_OUTLINE_PROMPT_NAME = 'Forms: Form Outline';

/** The AI Prompt that writes one page's questions in full. */
export const PAGE_DETAIL_PROMPT_NAME = 'Forms: Page Detail';

/** The AI Prompt that picks the form's `--mjf-*` colours and type from the brand adjectives. */
export const THEME_DESIGNER_PROMPT_NAME = 'Forms: Theme Designer';

/** Runs the two staged prompts. Fails loudly; never silently falls back to a default client. */
export class AIPromptStagedAuthoringModel implements StagedAuthoringModel {
  async outline(input: OutlineInput, contextUser: UserInfo): Promise<string> {
    return runNamedPrompt(FORM_OUTLINE_PROMPT_NAME, promptDataFor(input), contextUser);
  }

  async pageDetail(input: PageDetailInput, contextUser: UserInfo): Promise<string> {
    const page = input.outline.pages[input.pageIndex];
    return runNamedPrompt(
      PAGE_DETAIL_PROMPT_NAME,
      {
        ...promptDataFor(input),
        // Serialized here rather than left as objects: a template renders `{{ Outline }}` as text,
        // and `[object Object]` is what an un-stringified blueprint becomes in a prompt.
        Outline: JSON.stringify(input.outline),
        PageIndex: String(input.pageIndex),
        PageTitle: page?.title ?? `Page ${input.pageIndex + 1}`,
        PageStubs: JSON.stringify(page?.questions ?? []),
      },
      contextUser,
    );
  }

  async theme(input: ThemeInput, contextUser: UserInfo): Promise<string> {
    return runNamedPrompt(
      THEME_DESIGNER_PROMPT_NAME,
      {
        Brief: input.brief,
        FormName: input.formName,
        // Joined here rather than passed as an array: a template renders `{{ BrandAdjectives }}`
        // as text, and a bare array becomes a comma-jammed string anyway — doing it explicitly
        // means the prompt sees "warm, welcoming" instead of relying on JavaScript's default.
        BrandAdjectives: (input.brandAdjectives ?? []).join(', '),
        Tokens: THEME_TOKEN_NAMES.join('\n'),
        ...retryData(input),
      },
      contextUser,
    );
  }
}

/** The prior-attempt fields, present only on a retry. */
function retryData(input: { previousAttempt?: string; validationError?: string }): Record<string, string> {
  const data: Record<string, string> = {};
  if (input.previousAttempt !== undefined) {
    data.PreviousAttempt = input.previousAttempt;
  }
  if (input.validationError !== undefined) {
    data.ValidationError = input.validationError;
  }
  return data;
}

/** The fields the two blueprint stages share, including the retry feedback. */
function promptDataFor(input: OutlineInput | PageDetailInput): Record<string, string> {
  return { Brief: input.brief, InputMode: input.inputMode, ...retryData(input) };
}

/**
 * Run one named prompt and return its raw output text.
 *
 * The timeout goes through the runner's OWN cancellation support rather than a `Promise.race`.
 * A race resolves the caller and leaves the model call running — still streaming, still billing,
 * still holding a connection — so a pipeline that timed out three pages would leak three in-flight
 * requests. `AbortSignal.timeout` reaches the provider and actually stops it.
 */
async function runNamedPrompt(
  promptName: string,
  data: Record<string, string>,
  contextUser: UserInfo,
): Promise<string> {
  const engine = AIEngine.Instance;
  await engine.Config(false, contextUser);

  const prompt = engine.Prompts.find((p) => p.Name === promptName);
  if (!prompt) {
    throw new Error(
      `AI Prompt "${promptName}" was not found in this MemberJunction instance. ` +
        'Ensure the Forms AI-authoring metadata (prompts + templates + AI Prompt Model rows) has been pushed.',
    );
  }

  const params = new AIPromptParams();
  params.prompt = prompt;
  params.contextUser = contextUser;
  params.data = { ...data };
  params.attemptJSONRepair = true;
  params.cancellationToken = AbortSignal.timeout(STAGE_TIMEOUT_MS);

  // No type argument: this returns RAW TEXT and each of the three stages parses it against its own
  // zod schema afterwards, so naming a shape here would be a claim this function cannot make.
  // `ExecutePrompt`'s own parameter already defaults to `unknown` — spelling it out added nothing
  // but a banned keyword.
  const result = await new AIPromptRunner().ExecutePrompt(params);
  if (!result.success) {
    throw new Error(`AI Prompt "${promptName}" failed to run: ${result.errorMessage ?? 'unknown error'}`);
  }

  const raw = outputText(result.rawResult, result.result);
  if (!raw) {
    throw new Error(`AI Prompt "${promptName}" returned no output to parse.`);
  }
  return raw;
}

/**
 * Coerce a run's output to the JSON text the callers parse.
 *
 * With `ResponseFormat='JSON'` the runner may hand back a parsed object; re-stringifying it means
 * there is ONE validation path (the zod parse) rather than two shapes to handle downstream.
 */
function outputText(rawResult: string | undefined, parsed: unknown): string {
  if (parsed !== undefined && parsed !== null) {
    return JSON.stringify(parsed);
  }
  return rawResult?.trim() ?? '';
}
