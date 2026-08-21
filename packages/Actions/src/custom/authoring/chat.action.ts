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
  attachedImageUrl,
  guidOrUndefined,
  planEdits,
  describeFormSnapshot,
  describeFormList,
  isGuid,
  DEFAULT_FORM_THEME,
  type FormChatContext,
  type FormListEntry,
  type FormChatResponse,
} from '@mj-biz-apps/forms-entities';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { errorText } from '../shared/error-text';
import { runAuthoring } from './generate-form.action';
import { reasonFromDegradation, runImageStage, type ImageGenerationModel } from './image-stage';
import { CoreActionImageGenerationModel } from './generate-image-model';
import { loadFormList, loadFormSnapshot } from './load-snapshot';
import { applyEdits } from './apply-edits';
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

  // Listed on every turn: "what forms do I have" is a fair question, and `open` needs a handle to
  // name. Read-only — the scope decision is that every WRITE lands on the form on screen.
  const forms = await loadFormList(contextUser);
  const { response, alreadyRecorded } = await askAssistant(
    message,
    activeChatModel,
    history,
    context,
    conversation.ID,
    contextUser,
    describeFormList(forms),
  );

  setOutputParam(params, 'ConversationID', conversation.ID);
  setOutputParam(params, 'Action', response.action);

  const outcome = await performAction(
    response,
    params,
    formId,
    contextUser,
    conversation.ID,
    context,
    forms,
  );
  // A turn made ON THE FORMS LIST that produced a form moves the thread onto it, so the
  // conversation is where the author is taken next rather than back on the list they just left.
  //
  // ONLY on the forms list. The condition used to be "the new id differs from the open one",
  // which is always true when a form is created from inside the builder — so an author working on
  // form A who asked for a new form had A's whole conversation moved onto B, and A's panel came
  // back empty. `formId` being absent IS the forms-list case, and it is the only one the
  // re-filing rationale covers.
  //
  // Re-validated rather than reused: this reads the param bag back, and on a generation that
  // failed before persisting, `FormID` is still whatever the CLIENT sent. Passing that to
  // `refileConversationToForm` would throw past its own `assertGuid`, which sits outside its try
  // block, and lose a reply that both turns had already been persisted for.
  const created = guidOrUndefined(getStringParam(params, 'FormID'));
  if (response.action === 'create' && created && !formId) {
    await refileConversationToForm(conversation.ID, created, contextUser);
  }
  // THE REPLY THE AUTHOR ACTUALLY GETS, refusals included, is what the thread records. The model's
  // own reply is written before anything is attempted, so persisting that left a transcript
  // claiming work the form never received — and the transcript is the next turn's history.
  if (!alreadyRecorded) {
    await appendTurn(conversation.ID, { role: 'AI', message: outcome.reply }, contextUser);
  }
  setOutputParam(params, 'Reply', outcome.reply);
  return { Success: true, ResultCode: 'SUCCESS', Message: outcome.reply };
}

/**
 * What each acting action needs before it can be carried out, in the author's words.
 *
 * A table rather than a condition per branch, because the three branches used to carry the check
 * inline as `action === 'create' && response.brief` and each one FELL THROUGH silently when the
 * payload was absent. One table cannot fall through: an action either appears here and is checked,
 * or does not and carries no payload. `none` and `unsupported` are the second kind.
 *
 * Emptiness is what is checked, not truthiness — `{}` is truthy, and an empty token map used to
 * pass the restyle guard and reset the whole theme to the house default.
 */
const REQUIRED_PAYLOAD: Partial<Record<FormChatResponse['action'], string>> = {
  create: 'what the form should contain',
  open: 'which form to open',
  restyle: 'which colours to change',
  image: 'what the picture should show',
  edit: 'which changes to make',
};

/** Verb for the apology, so it names the thing the author actually asked for. */
const VERB: Partial<Record<FormChatResponse['action'], string>> = {
  create: 'build that form',
  open: 'open that form',
  restyle: 'restyle it',
  image: 'add that picture',
  edit: 'change the form',
};

/** The missing payload's description, or undefined when this turn has everything it needs. */
function missingPayloadFor(response: FormChatResponse): string | undefined {
  const needed = REQUIRED_PAYLOAD[response.action];
  if (!needed) {
    return undefined;
  }
  const present =
    response.action === 'create'
      ? Boolean(response.brief?.trim())
      : response.action === 'image'
        ? Boolean(response.imagePrompt?.trim())
        : response.action === 'open'
        ? Boolean(response.openFormId?.trim())
        : response.action === 'edit'
          ? (response.operations ?? []).length > 0
          : Object.keys(response.cssVariables ?? {}).length > 0;
  return present ? undefined : needed;
}

/** Carry out whatever the assistant declared. Never throws — a failure becomes part of the reply. */
async function performAction(
  response: FormChatResponse,
  params: RunActionParams,
  formId: string | undefined,
  contextUser: UserInfo,
  conversationId: string,
  context: FormChatContext | undefined,
  forms: readonly FormListEntry[],
): Promise<{ reply: string }> {
  try {
    const missing = missingPayloadFor(response);
    if (missing) {
      // The assistant declared a change and did not send what performing it needs. Say so, rather
      // than falling through to its own optimistic reply — which used to leave the author reading
      // "Done — I've built your RSVP form." about a form that was never created.
      return {
        reply:
          `${response.reply}\n\n**I could not do that:** I meant to ${VERB[response.action]} but ` +
          `did not manage to say ${missing}. Ask me again and I will.`,
      };
    }
    if (response.action === 'create') {
      return { reply: await createForm(response, params, contextUser) };
    }
    if (response.action === 'restyle') {
      return { reply: await restyleForm(response, params, formId, contextUser) };
    }
    if (response.action === 'image') {
      return { reply: await addScreenImage(response, params, formId, contextUser) };
    }
    if (response.action === 'edit') {
      return { reply: await editForm(response, params, formId, context, contextUser) };
    }
    if (response.action === 'open') {
      return { reply: openForm(response, params, forms) };
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
  // unreadable ink corrected. A colour arriving by chat is no more trustworthy than one arriving
  // from the theme prompt.
  //
  // THE BASE IS THE FORM'S OWN PALETTE, not the house one. Merging over the house defaults meant a
  // model correctly answering "make the buttons darker" with a single token reset every other
  // colour the author had tuned in the Design tab — a full replace dressed up as a small change,
  // confirmed cheerfully and with no warning.
  //
  // A PLAIN MERGE, and it has to stay one. This used to run the author's tokens through a helper
  // that dropped every name in `THEME_LAYOUT_TOKENS` — which reset their squared-off buttons to
  // pill and their left-aligned title to centred on every "make it warmer", while the reply spoke
  // only of colours. (That helper is deleted; this was its last caller.) Nothing here needs to
  // filter the author's own values, and the MODEL still cannot smuggle a layout token in:
  // `validateTheme` strips everything outside `THEME_TOKEN_NAMES`, which carries none of them.
  const base = { ...DEFAULT_FORM_THEME, ...(await currentThemeTokens(form.StyleID, contextUser)) };
  const outcome = validateTheme({ cssVariables: response.cssVariables ?? {} }, base);
  await applyThemeTokens(formId, form.StyleID, outcome.cssVariables, contextUser);
  setOutputParam(params, 'StyleID', form.StyleID);

  const notes = outcome.unreadablePairs.length
    ? `\n\nOne thing to know: ${outcome.unreadablePairs.join('; ')} — that pairing is below the ` +
      'contrast bar and will be hard to read.'
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

  // The author supplied the picture themselves. Use it and generate nothing: they have already
  // chosen, and a model's idea of "a photo of a conference hall" is not an improvement on the
  // photograph of their own conference hall. It reaches storage the same way any other upload
  // does — the picker put it there before the message was sent — so this only writes the URL.
  const attached = attachedImageUrl(getStringParam(params, 'Message'));
  if (attached) {
    await applyGeneratedImage(formId, { kind: 'screen', screenId: screen.ID }, attached, contextUser);
    setOutputParam(params, 'ScreenID', screen.ID);
    setOutputParam(params, 'ImageURL', attached);
    return response.reply;
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

/**
 * Take the author to another of their forms.
 *
 * NAVIGATION ONLY, and that is the design decision rather than an omission: every write lands on
 * whatever is on screen, so nothing changes that the author cannot watch changing. This resolves a
 * handle to an id and hands it to the client; the client moves, and the next turn's snapshot is
 * the form they arrived at.
 */
function openForm(
  response: FormChatResponse,
  params: RunActionParams,
  forms: readonly FormListEntry[],
): string {
  const wanted = forms.find((f) => f.handle === response.openFormId);
  if (!wanted) {
    return `${response.reply}\n\n**I could not open that:** I do not have a form called ${response.openFormId}.`;
  }
  setOutputParam(params, 'OpenFormID', wanted.id);
  return response.reply;
}

/**
 * Change the structure of the form on screen.
 *
 * Two steps, and deliberately two objects: `planEdits` DECIDES — resolving handles against the
 * snapshot the model was actually shown, refusing what would strand answers — and `applyEdits`
 * writes what survived. Nothing here re-decides anything, which is why a refusal reaches the reply
 * in the words the plan chose rather than in a second, subtly different wording.
 *
 * The snapshot is the one the assistant was given THIS turn. Re-reading the form here would open a
 * window in which the handles it named and the rows they resolve to came from different reads.
 */
async function editForm(
  response: FormChatResponse,
  params: RunActionParams,
  formId: string | undefined,
  context: FormChatContext | undefined,
  contextUser: UserInfo,
): Promise<string> {
  if (!isGuid(formId) || !context) {
    return `${response.reply}\n\n**I could not change that:** open a form first and I will edit it.`;
  }
  const plan = planEdits(context.snapshot, response.operations ?? []);
  const outcome = await applyEdits(formId, plan, contextUser);

  setOutputParam(params, 'ChangedFormID', formId);
  if (outcome.styleId) {
    // A `setLayout` writes the same `CSSVariables` field on the same row a restyle replaces, so it
    // is exactly as undoable — and the client's undo keys on the STYLE, not the form. Without this
    // "make the questions smaller" was the one theme change that offered no way back.
    setOutputParam(params, 'StyleID', outcome.styleId);
  }
  const parts = [response.reply];
  if (outcome.applied.length > 0) {
    parts.push(outcome.applied.map((line) => `- ${line}`).join('\n'));
  }
  if (outcome.refused.length > 0) {
    parts.push(
      `**${outcome.applied.length > 0 ? 'What I could not do' : 'I could not do that'}:** ` +
        outcome.refused.join('; '),
    );
  }
  return parts.join('\n\n');
}

/**
 * The form's welcome or first ending screen, or undefined when it has none of that kind.
 *
 * A FAILED read and an ABSENT screen are different answers and used to collapse into the same
 * `undefined`, so a transient failure told the author "this form has no welcome screen yet" about
 * a screen plainly on their canvas, with nothing in the log to contradict it. The failure is
 * logged now; the reply is still the gentle one, because there is nothing the author can do about
 * either case in the moment.
 */
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
  if (!view.Success) {
    LogError(
      `[Forms chat] Could not read the ${kind} screen for form ${formId}: ${view.ErrorMessage}`,
    );
    return undefined;
  }
  return view.Results?.[0];
}

/**
 * The tokens a style currently carries, or an empty map when it has none or cannot be read.
 *
 * Degraded rather than fatal: a style whose JSON is unreadable should not block a restyle, and the
 * house palette underneath is a sound floor. It IS logged, because a style row that stopped
 * parsing is a real problem somebody should see.
 */
async function currentThemeTokens(
  styleId: string,
  contextUser: UserInfo,
): Promise<Record<string, string>> {
  const md = new Metadata();
  const style = await md.GetEntityObject<mjBizAppsFormsFormStyleEntity>(
    'MJ_BizApps_Forms: Form Styles',
    contextUser,
  );
  if (!(await style.Load(styleId)) || !style.CSSVariables) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(style.CSSVariables);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, string>)
      : {};
  } catch (error) {
    LogError(
      `[Forms chat] Style ${styleId} has unreadable CSSVariables; restyling from the house ` +
        `palette instead. ${errorText(error)}`,
    );
    return {};
  }
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
  // Belt and braces: the caller already validated, and `loadFormSnapshot` validates again — this
  // is the function that decides whether a form is addressable at all.
  if (!isGuid(formId)) {
    return undefined;
  }
  const snapshot = await loadFormSnapshot(formId, contextUser);
  if (!snapshot) {
    return undefined;
  }
  return {
    formId,
    name: snapshot.name,
    description: describeFormSnapshot(snapshot),
    snapshot,
  };
}

