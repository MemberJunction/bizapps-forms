/**
 * AI authoring action: **Forms: Chat**.
 *
 * One message in, one reply out, plus whatever the assistant decided to do about it. This is the
 * surface behind the "Chat to create" box; `Forms: Generate Form From Brief` remains the one-shot
 * API entry point and is what this calls when the author asks for a form.
 *
 * Input params:
 *   - `Message` (string, required) — what the author typed.
 *   - `FormID` (string, optional) — the form they are looking at. Scopes the thread AND gives the
 *      assistant something to answer questions about.
 *   - `ConversationID` (string, optional) — continue a specific thread. Omit and the thread for
 *      this user + form is found or started.
 *   - `SessionID` (string, optional) — progress channel, used when the turn generates a form.
 * Output params:
 *   - `Reply` (markdown for the author), `Action`, `ConversationID`
 *   - `FormID` when the turn created one, `StyleID` when it restyled one
 *
 * Result codes: `SUCCESS`, `MISSING_PARAMETERS`, `FAILED`.
 *
 * A failure inside the turn is reported IN the reply rather than as a failed action wherever the
 * author could act on it — the message is still recorded, the thread is still usable, and a chat
 * that throws away your question because generation failed is one you stop using.
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormStyleEntity,
  themeWithOverrides,
  type FormChatContext,
  type FormChatResponse,
} from '@mj-biz-apps/forms-entities';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { errorText } from '../shared/error-text';
import { runAuthoring } from './generate-form.action';
import { applyThemeTokens } from './form-blueprint-builder';
import { validateTheme } from './theme-tokens';
import {
  appendTurn,
  askAssistant,
  ensureConversation,
  loadChatHistory,
  type ChatAssistantModel,
} from './chat-assistant';
import { AIPromptChatAssistantModel } from './chat-assistant-model';

let activeChatModel: ChatAssistantModel = new AIPromptChatAssistantModel();

/** Override the chat assistant's model (e.g. a deterministic stub in tests). */
export function setChatAssistantModel(model: ChatAssistantModel): void {
  activeChatModel = model;
}

@RegisterClass(BaseAction, 'Forms: Chat')
export class FormsChatAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const message = getStringParam(params, 'Message');
    if (!message) {
      return { Success: false, ResultCode: 'MISSING_PARAMETERS', Message: 'Message is required.' };
    }
    try {
      return await runChatTurn(message, params, params.ContextUser);
    } catch (error) {
      // Only reached when the thread itself could not be written — the assistant's own failures
      // are already handled inside `askAssistant` and come back as a reply.
      const detail = errorText(error);
      LogError(`[Forms chat] Turn failed outright: ${detail}`);
      return { Success: false, ResultCode: 'FAILED', Message: `The chat could not respond: ${detail}` };
    }
  }
}

/** One full turn: gather context, ask, act, report. Exported so tests can drive it directly. */
export async function runChatTurn(
  message: string,
  params: RunActionParams,
  contextUser: UserInfo,
): Promise<ActionResultSimple> {
  const formId = getStringParam(params, 'FormID');
  const conversation = await ensureConversation(
    { formId, conversationId: getStringParam(params, 'ConversationID') },
    contextUser,
  );
  const history = await loadChatHistory(conversation.ID, contextUser);
  const context = await describeOpenForm(formId, contextUser);

  const response = await askAssistant(
    message,
    activeChatModel,
    history,
    context,
    conversation.ID,
    contextUser,
  );

  setOutputParam(params, 'ConversationID', conversation.ID);
  setOutputParam(params, 'Action', response.action);

  const outcome = await performAction(response, params, formId, contextUser, conversation.ID);
  setOutputParam(params, 'Reply', outcome.reply);
  return { Success: true, ResultCode: 'SUCCESS', Message: outcome.reply };
}

/** Carry out whatever the assistant declared. Never throws — a failure becomes part of the reply. */
async function performAction(
  response: FormChatResponse,
  params: RunActionParams,
  formId: string | undefined,
  contextUser: UserInfo,
  conversationId: string,
): Promise<{ reply: string }> {
  try {
    if (response.action === 'create' && response.brief) {
      return { reply: await createForm(response, params, contextUser) };
    }
    if (response.action === 'restyle' && response.cssVariables) {
      return { reply: await restyleForm(response, params, formId, contextUser) };
    }
    return { reply: response.reply };
  } catch (error) {
    // The author asked for something real and it did not happen. Say so in the thread, with the
    // reason, rather than returning the assistant's optimistic reply as if it had worked.
    const detail = errorText(error);
    LogError(`[Forms chat] Could not carry out "${response.action}": ${detail}`);
    const reply = `${response.reply}\n\n**That didn't work:** ${detail}`;
    await appendTurn(conversationId, { role: 'Error', message: reply, error: detail }, contextUser);
    return { reply };
  }
}

/** Generate a form through the existing pipeline, unchanged. */
async function createForm(
  response: FormChatResponse,
  params: RunActionParams,
  contextUser: UserInfo,
): Promise<string> {
  const channel = getStringParam(params, 'SessionID');
  // A nested param bag: `runAuthoring` writes its own outputs, and letting it write onto the chat
  // action's params would put PageCount and Blueprint on a chat reply. Built by cloning the real
  // run params rather than by casting a two-field literal — `RunActionParams` carries Action and
  // Filters that the engine populated, and a cast that pretends otherwise is a lie the compiler
  // would have to be told to accept.
  const inner: RunActionParams = { ...params, Params: [], ContextUser: contextUser };
  const result = await runAuthoring(response.brief as string, contextUser.ID, inner, contextUser, {
    inputMode: 'brief',
    channel: channel ? { sessionId: channel, ownerUserId: contextUser.ID } : undefined,
  });
  const created = inner.Params.find((p) => p.Name === 'FormID')?.Value;
  if (typeof created === 'string' && created) {
    setOutputParam(params, 'FormID', created);
  }
  return result.Success
    ? `${response.reply}\n\n${result.Message ?? ''}`.trim()
    : `${response.reply}\n\n**That didn't work:** ${result.Message}`;
}

/** Apply the assistant's palette to the open form, through the same gate a generated theme takes. */
async function restyleForm(
  response: FormChatResponse,
  params: RunActionParams,
  formId: string | undefined,
  contextUser: UserInfo,
): Promise<string> {
  if (!formId) {
    return `${response.reply}\n\n**I could not apply that:** open a form first and I will restyle it.`;
  }
  const md = new Metadata();
  const form = await md.GetEntityObject<mjBizAppsFormsFormEntity>('MJ_BizApps_Forms: Forms', contextUser);
  if (!(await form.Load(formId)) || !form.StyleID) {
    return `${response.reply}\n\n**I could not apply that:** this form has no style to edit yet.`;
  }
  // Same validation and contrast gate a generated theme goes through: unknown tokens stripped,
  // unreadable ink corrected, layout tokens left alone. A colour arriving by chat is no more
  // trustworthy than one arriving from the theme prompt.
  const outcome = validateTheme({ cssVariables: response.cssVariables ?? {} });
  await applyThemeTokens(formId, form.StyleID, themeWithOverrides(outcome.cssVariables), contextUser);
  setOutputParam(params, 'StyleID', form.StyleID);

  const notes = outcome.unreadablePairs.length
    ? `\n\nOne thing to know: ${outcome.unreadablePairs.join('; ')} — the text there will be hard to read.`
    : '';
  return `${response.reply}${notes}`;
}

/**
 * Summarise the open form for the assistant, or `undefined` when none is open.
 *
 * Best-effort throughout: a form that cannot be read is answered about in general terms rather than
 * failing the turn, because "what colour goes with navy" needs no form at all and the author should
 * still get an answer.
 */
async function describeOpenForm(
  formId: string | undefined,
  contextUser: UserInfo,
): Promise<FormChatContext | undefined> {
  if (!formId) {
    return undefined;
  }
  try {
    const md = new Metadata();
    const form = await md.GetEntityObject<mjBizAppsFormsFormEntity>('MJ_BizApps_Forms: Forms', contextUser);
    if (!(await form.Load(formId))) {
      return undefined;
    }
    const rv = new RunView();
    const questions = await rv.RunView<mjBizAppsFormsFormQuestionEntity>(
      {
        EntityName: 'MJ_BizApps_Forms: Form Questions',
        ExtraFilter: `FormID='${formId}'`,
        OrderBy: 'DisplayOrder',
        ResultType: 'simple',
        Fields: ['QuestionType', 'Prompt'],
      },
      contextUser,
    );

    let cssVariables: Record<string, string> = {};
    if (form.StyleID) {
      const style = await md.GetEntityObject<mjBizAppsFormsFormStyleEntity>(
        'MJ_BizApps_Forms: Form Styles',
        contextUser,
      );
      if (await style.Load(form.StyleID)) {
        cssVariables = readTokens(style.CSSVariables);
      }
    }
    return {
      formId,
      name: form.Name,
      questions: (questions.Results ?? []).map((q) => `[${q.QuestionType}] ${q.Prompt}`),
      cssVariables,
    };
  } catch (error) {
    LogError(`[Forms chat] Could not describe form ${formId}; answering without it. ${errorText(error)}`);
    return undefined;
  }
}

/** Parse a stored token map, treating anything unreadable as "no tokens" rather than throwing. */
function readTokens(raw: string | null): Record<string, string> {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}
