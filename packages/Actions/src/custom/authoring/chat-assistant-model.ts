/**
 * The production {@link ChatAssistantModel}: the `Forms: Chat Assistant` AI Prompt.
 *
 * Model selection is metadata-driven like every other stage — no vendor or model name here. This
 * one is the most likely to want a DIFFERENT model from the authoring stages, because it is
 * conversational rather than structural, and pinning it separately costs an operator one row.
 */
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { UserInfo } from '@memberjunction/core';
import { describeFormForChat, type FormChatContext, type FormChatTurn } from '@mj-biz-apps/forms-entities';
import { STAGE_TIMEOUT_MS } from './limits';
import { THEME_TOKEN_NAMES } from './theme-tokens';
import type { ChatAssistantModel } from './chat-assistant';

/** The AI Prompt behind the authoring chat. */
export const CHAT_ASSISTANT_PROMPT_NAME = 'Forms: Chat Assistant';

/** Runs the chat prompt. Fails loudly; the caller turns a failure into an in-thread message. */
export class AIPromptChatAssistantModel implements ChatAssistantModel {
  async respond(
    input: {
      message: string;
      history: readonly FormChatTurn[];
      context?: FormChatContext;
      forms?: string;
    },
    contextUser: UserInfo,
  ): Promise<string> {
    const engine = AIEngine.Instance;
    await engine.Config(false, contextUser);

    const prompt = engine.Prompts.find((p) => p.Name === CHAT_ASSISTANT_PROMPT_NAME);
    if (!prompt) {
      throw new Error(
        `AI Prompt "${CHAT_ASSISTANT_PROMPT_NAME}" was not found in this MemberJunction instance. ` +
          'Ensure the Forms AI-authoring metadata has been pushed.',
      );
    }

    const params = new AIPromptParams();
    params.prompt = prompt;
    params.contextUser = contextUser;
    params.data = {
      Message: input.message,
      // Rendered as a transcript rather than JSON: the model reads this as a conversation, and a
      // JSON array of role/message objects makes it reason about a data structure instead.
      History: renderHistory(input.history),
      FormContext: describeFormForChat(input.context),
      HasOpenForm: input.context ? 'yes' : 'no',
      Tokens: THEME_TOKEN_NAMES.join('\n'),
      FormList: input.forms ?? 'They have no forms yet.',
    };
    params.attemptJSONRepair = true;
    params.cancellationToken = AbortSignal.timeout(STAGE_TIMEOUT_MS);

    const result = await new AIPromptRunner().ExecutePrompt(params);
    if (!result.success) {
      throw new Error(
        `AI Prompt "${CHAT_ASSISTANT_PROMPT_NAME}" failed to run: ${result.errorMessage ?? 'unknown error'}`,
      );
    }
    const raw =
      result.result !== undefined && result.result !== null
        ? JSON.stringify(result.result)
        : (result.rawResult ?? '').trim();
    if (!raw) {
      throw new Error(`AI Prompt "${CHAT_ASSISTANT_PROMPT_NAME}" returned no output.`);
    }
    return raw;
  }
}

/** The prior turns as a plain transcript. Errors are shown as errors, not as the assistant's voice. */
function renderHistory(history: readonly FormChatTurn[]): string {
  if (history.length === 0) {
    return '(this is the first message)';
  }
  return history
    .map((t) => {
      const who = t.role === 'User' ? 'Author' : t.role === 'AI' ? 'You' : 'You (failed)';
      return `${who}: ${t.message}`;
    })
    .join('\n\n');
}
