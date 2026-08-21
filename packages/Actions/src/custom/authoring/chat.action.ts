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
 *   - `FormID` when the turn created one, `StyleID` when it restyled one, `ScreenID` +
 *     `ImageURL` when it put a picture on a screen
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
  mjBizAppsFormsFormScreenEntity,
  mjBizAppsFormsFormStyleEntity,
  guidOrUndefined,
  isGuid,
  themeWithOverrides,
  type FormChatContext,
  type FormChatResponse,
} from '@mj-biz-apps/forms-entities';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { errorText } from '../shared/error-text';
import { runAuthoring } from './generate-form.action';
import { reasonFromDegradation, runImageStage, type ImageGenerationModel } from './image-stage';
import { CoreActionImageGenerationModel } from './generate-image-model';
import { applyGeneratedImage, applyThemeTokens } from './form-blueprint-builder';
import { validateTheme } from './theme-tokens';
import {
  appendTurn,
  askAssistant,
  ensureConversation,
  loadChatHistory,
  refileConversationToForm,
  type ChatAssistantModel,
} from './chat-assistant';
import { AIPromptChatAssistantModel } from './chat-assistant-model';

let activeChatModel: ChatAssistantModel = new AIPromptChatAssistantModel();
let activeImageModel: ImageGenerationModel = new CoreActionImageGenerationModel();

/** Override the chat assistant's model (e.g. a deterministic stub in tests). */
export function setChatAssistantModel(model: ChatAssistantModel): void {
  activeChatModel = model;
}

/** Override the image generator the chat uses (e.g. a deterministic stub in tests). */
export function setChatImageModel(model: ImageGenerationModel): void {
  activeImageModel = model;
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
  // Validated ONCE, here, and the validated value is what every downstream call receives. Both of
  // these are client-supplied and both reach `ExtraFilter` strings; a malformed one is treated as
  // absent, which means the same thing as an id naming a form that does not exist.
  const formId = guidOrUndefined(getStringParam(params, 'FormID'));
  const conversation = await ensureConversation(
    { formId, conversationId: guidOrUndefined(getStringParam(params, 'ConversationID')) },
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
  // A turn that made a form moves the thread onto it, so the conversation is where the author is
  // taken next rather than back on the list they just left.
  const created = getStringParam(params, 'FormID');
  if (response.action === 'create' && created && created !== formId) {
    await refileConversationToForm(conversation.ID, created, contextUser);
  }
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
    if (response.action === 'image' && response.imagePrompt) {
      return { reply: await addScreenImage(response, params, formId, contextUser) };
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
 * Generate a picture and put it on one of the form's screens.
 *
 * Reuses the image stage the streamed build already uses, so a picture asked for in chat takes
 * exactly the path a picture asked for in a brief takes: the same metadata-resolved model, the same
 * per-run cap, and the same asset pipeline with its size limit, raster allowlist and public prefix.
 * There is one way bytes get into storage and this is not a second one.
 */
async function addScreenImage(
  response: FormChatResponse,
  params: RunActionParams,
  formId: string | undefined,
  contextUser: UserInfo,
): Promise<string> {
  if (!isGuid(formId)) {
    return `${response.reply}\n\n**I could not add that:** open a form first and I will put a picture on it.`;
  }
  const wanted = response.imageTarget ?? 'welcome';
  const screen = await findScreen(formId, wanted, contextUser);
  if (!screen) {
    return (
      `${response.reply}\n\n**I could not add that:** this form has no ${wanted} screen yet. ` +
      'Add one in the builder and ask me again.'
    );
  }

  const outcome = await runImageStage(
    formId,
    [
      {
        prompt: response.imagePrompt as string,
        target: { kind: 'screen', screenId: screen.ID },
        describedAs: `the ${wanted} screen`,
      },
    ],
    activeImageModel,
    contextUser,
  );

  if (outcome.stored.length === 0) {
    // Named, not swallowed: "no image model is active on this instance" and "the model refused the
    // prompt" are different problems and only one of them is the author's to solve.
    const why = outcome.degraded[0]
      ? reasonFromDegradation(outcome.degraded[0])
      : 'the image could not be made';
    return `${response.reply}\n\n**I could not add that:** ${why}`;
  }

  await applyGeneratedImage(formId, outcome.stored[0].target, outcome.stored[0].url, contextUser);
  setOutputParam(params, 'ScreenID', screen.ID);
  setOutputParam(params, 'ImageURL', outcome.stored[0].url);
  return response.reply;
}

/** The form's welcome or first ending screen, or undefined when it has none of that kind. */
async function findScreen(
  formId: string,
  kind: 'welcome' | 'ending',
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormScreenEntity | undefined> {
  const view = await new RunView().RunView<mjBizAppsFormsFormScreenEntity>(
    {
      EntityName: 'MJ_BizApps_Forms: Form Screens',
      ExtraFilter: `FormID='${formId}' AND ScreenType='${kind === 'welcome' ? 'Welcome' : 'Ending'}'`,
      OrderBy: 'DisplayOrder',
      ResultType: 'entity_object',
      MaxRows: 1,
    },
    contextUser,
  );
  return view.Success ? view.Results?.[0] : undefined;
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
  // Belt and braces: the caller already validated, and this is the function that interpolates.
  // `isGuid` is a type predicate, so this narrows `formId` too — the guard and the narrowing are
  // the same statement, which is what stops a later edit from using the unvalidated value.
  if (!isGuid(formId)) {
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
