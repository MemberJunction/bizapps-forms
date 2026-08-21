/**
 * The authoring chat's server half: read the conversation, ask the assistant, do what it decided.
 *
 * ── THE MODEL DECIDES, DETERMINISTIC CODE ACTS. ──────────────────────────────────────────────
 * Same split as the rest of this pipeline. The assistant returns a reply plus a declared action;
 * nothing here lets it reach the database directly. `create` runs the existing generation pipeline
 * unchanged, `restyle` goes through the same token validation and contrast gate a generated theme
 * does, and `none` writes nothing at all.
 *
 * ── PERSISTENCE IS MJ'S, NOT OURS. ───────────────────────────────────────────────────────────
 * Turns live in `MJ: Conversations` / `MJ: Conversation Details`, which already model exactly this
 * — a per-user thread of `User` / `AI` / `Error` messages. A Forms-owned chat table would have
 * needed a migration, a CodeGen run and its own history semantics to arrive at the same shape.
 * `ExternalID` scopes a thread to a form, so the conversation an author left on one form is still
 * there when they come back to it and does not follow them to another.
 */
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  MJConversationDetailEntity,
  MJConversationEntity,
} from '@memberjunction/core-entities';
import {
  assertGuid,
  guidOrUndefined,
  isGuid,
  parseFormChatResponse,
  type FormChatContext,
  type FormChatResponse,
  type FormChatTurn,
} from '@mj-biz-apps/forms-entities';
import { errorText } from '../shared/error-text';
import { saveRow } from './persist';

const ENTITY = {
  Conversation: 'MJ: Conversations',
  ConversationDetail: 'MJ: Conversation Details',
} as const;

/**
 * How many prior turns the assistant is shown.
 *
 * A cap rather than the whole thread, because a conversation an author returns to for a week would
 * otherwise grow the prompt without bound — slower and more expensive every turn, until it stops
 * fitting. Ten turns is roughly the window in which "make it warmer" still refers to something.
 */
export const MAX_CHAT_HISTORY_TURNS = 10;

/** The thread this message belongs to. `formId` scopes it; absent means the forms list. */
export interface ChatScope {
  formId?: string;
  conversationId?: string;
}

/** How the assistant is called. A seam, so the whole chat is drivable from a stub. */
export interface ChatAssistantModel {
  /** Returns RAW TEXT; parsing and validation happen here, as with every other stage. */
  respond(
    input: {
      message: string;
      history: readonly FormChatTurn[];
      context?: FormChatContext;
      /** The author's other forms, rendered — what `open` names a handle from. */
      forms?: string;
    },
    contextUser: UserInfo,
  ): Promise<string>;
}

/** What one chat turn produced. */
export interface ChatTurnResult {
  reply: string;
  action: FormChatResponse['action'];
  conversationId: string;
  /** Set when the turn created a form, so the client can open it. */
  createdFormId?: string;
  /** Set when the turn restyled the open form. */
  restyledStyleId?: string;
}

/**
 * Load a thread's turns, oldest first, capped at {@link MAX_CHAT_HISTORY_TURNS}.
 *
 * Hidden turns are excluded: `HiddenToUser` is MJ's marker for a message the author was never
 * shown, and replaying one into the prompt would let the assistant refer to something that, from
 * the author's side, was never said.
 */
export async function loadChatHistory(
  conversationId: string,
  contextUser: UserInfo,
): Promise<FormChatTurn[]> {
  // Interpolated into a filter. This id comes from a row we just loaded, so the guard is defence
  // in depth rather than the primary control — but it is the primary control the moment somebody
  // wires a caller-supplied conversation id straight through, which is exactly how the sibling
  // sink below got missed.
  assertGuid(conversationId, 'conversation id');
  const view = await new RunView().RunView<MJConversationDetailEntity>(
    {
      EntityName: ENTITY.ConversationDetail,
      ExtraFilter: `ConversationID='${conversationId}' AND HiddenToUser = 0`,
      OrderBy: '__mj_CreatedAt',
      ResultType: 'simple',
      Fields: ['Role', 'Message', 'Error'],
    },
    contextUser,
  );
  if (!view.Success) {
    // Degraded, not fatal: a thread whose history cannot be read still accepts a new message. The
    // assistant simply answers without context, which is worse than remembering and far better
    // than refusing to talk.
    LogError(`[Forms chat] Could not load history for ${conversationId}: ${view.ErrorMessage}`);
    return [];
  }
  const turns = (view.Results ?? []).map((row) => ({
    role: row.Role,
    message: row.Message,
    ...(row.Error ? { error: row.Error } : {}),
  }));
  return turns.slice(-MAX_CHAT_HISTORY_TURNS);
}

/**
 * The thread for this scope, creating one on first use.
 *
 * Keyed on `ExternalID` rather than on a Forms-owned column, so a form's thread is found again by
 * the same query that created it. `Type` is MJ's own discriminator; ours says these are Forms
 * authoring threads so they are distinguishable from any other conversation in the instance.
 */
export async function ensureConversation(
  scope: ChatScope,
  contextUser: UserInfo,
): Promise<MJConversationEntity> {
  const md = new Metadata();
  // BOTH ids arrive from client-supplied action params, so both are validated before either
  // reaches a filter string. A malformed one is treated as absent rather than as an error: it
  // means the same thing as an id naming something that does not exist, and the author gets a
  // fresh thread instead of a failure they cannot act on.
  const requestedConversation = guidOrUndefined(scope.conversationId);
  const formId = guidOrUndefined(scope.formId);

  if (requestedConversation) {
    const existing = await md.GetEntityObject<MJConversationEntity>(ENTITY.Conversation, contextUser);
    if (await existing.Load(requestedConversation)) {
      // OWNERSHIP IS CHECKED HERE, not assumed from the id being well-formed.
      //
      // `ConversationID` is a client-supplied action param. `guidOrUndefined` above makes a
      // foreign id injection-SAFE, which is a different property from authorized — and the
      // lookup twenty lines below has always filtered on `UserID`, which is exactly what made
      // this branch's absence of a check easy to miss: the guard beside it looked like the guard.
      //
      // Without this, passing another author's thread id read their last ten turns into the
      // prompt AND appended the caller's message to their thread. Read and write, from one
      // optional parameter. Do not rely on the host's row-level security to cover this: a clean
      // MJ install ships no RLS filter for `MJ: Conversations`, so the only check is the one here.
      if (existing.UserID === contextUser.ID) {
        return existing;
      }
      LogError(
        `[Forms chat] Refusing conversation ${requestedConversation}: it belongs to user ` +
          `${existing.UserID}, not to ${contextUser.ID}. Starting a new thread.`,
      );
    } else {
      // A conversation id that no longer resolves is not an error worth failing a message over —
      // the author's thread was deleted. Start a fresh one.
      LogError(`[Forms chat] Conversation ${requestedConversation} did not load; starting a new thread.`);
    }
  }

  const externalId = chatExternalId(formId);
  const found = await new RunView().RunView<MJConversationEntity>(
    {
      EntityName: ENTITY.Conversation,
      ExtraFilter: `UserID='${contextUser.ID}' AND ExternalID='${externalId}' AND IsArchived = 0`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object',
      MaxRows: 1,
    },
    contextUser,
  );
  if (found.Success && found.Results?.[0]) {
    return found.Results[0];
  }

  const created = await md.GetEntityObject<MJConversationEntity>(ENTITY.Conversation, contextUser);
  created.NewRecord();
  created.UserID = contextUser.ID;
  created.ExternalID = externalId;
  created.Name = formId ? 'Form authoring' : 'New form';
  created.Type = 'Forms Authoring';
  created.IsArchived = false;
  await saveRow(created, 'Conversation');
  return created;
}

/**
 * The `ExternalID` a thread is filed under. One per form, plus one for the forms list.
 *
 * A non-GUID `formId` collapses to the forms-list thread rather than being embedded. This function
 * is the one that builds the string that lands in a filter, so it refuses to build a dangerous one
 * even if a caller forgot to validate — the guard is here as well as at the call site because this
 * is the last place that can hold the line.
 */
export function chatExternalId(formId: string | undefined): string {
  return isGuid(formId) ? `mj-forms:form:${formId}` : 'mj-forms:home';
}

/**
 * Re-file a thread under the form it just created.
 *
 * THE CONVERSATION FOLLOWS THE FORM. An author on the forms list types "create a form that collects
 * name, email and address", the form is made, and they are taken to it — at which point the builder
 * looks for that form's thread and finds nothing, because the exchange that produced the form was
 * filed under the forms-list key. The conversation they were just having appeared to vanish, and
 * came back only when they returned to the list.
 *
 * Moving the thread is the right fix rather than copying it: there is one conversation, it is about
 * this form now, and the forms list should be clear for the next thing they want to make.
 *
 * Best-effort. A thread that cannot be re-filed still holds every turn — it is just findable from
 * the list rather than the form — so this never fails a message that already succeeded.
 */
export async function refileConversationToForm(
  conversationId: string,
  formId: string,
  contextUser: UserInfo,
): Promise<void> {
  assertGuid(conversationId, 'conversation id');
  assertGuid(formId, 'form id');
  try {
    const md = new Metadata();
    const conversation = await md.GetEntityObject<MJConversationEntity>(ENTITY.Conversation, contextUser);
    if (!(await conversation.Load(conversationId))) {
      return;
    }
    conversation.ExternalID = chatExternalId(formId);
    conversation.Name = 'Form authoring';
    await saveRow(conversation, 'Conversation (re-filed to its form)');
  } catch (error) {
    LogError(
      `[Forms chat] Could not re-file thread ${conversationId} to form ${formId}; it stays on the ` +
        `forms list. ${errorText(error)}`,
    );
  }
}

/** Append one turn to a thread. */
export async function appendTurn(
  conversationId: string,
  turn: FormChatTurn,
  contextUser: UserInfo,
): Promise<void> {
  const md = new Metadata();
  const detail = await md.GetEntityObject<MJConversationDetailEntity>(
    ENTITY.ConversationDetail,
    contextUser,
  );
  detail.NewRecord();
  detail.ConversationID = conversationId;
  detail.Role = turn.role;
  detail.Message = turn.message;
  if (turn.error) {
    detail.Error = turn.error;
  }
  detail.HiddenToUser = false;
  await saveRow(detail, 'ConversationDetail');
}

/**
 * Ask the assistant, and record both sides of the exchange.
 *
 * The author's message is written BEFORE the model is called, so a turn that fails still leaves the
 * thread showing what was asked. A chat that loses your question when the answer errors is one you
 * stop trusting.
 */
export async function askAssistant(
  message: string,
  model: ChatAssistantModel,
  history: readonly FormChatTurn[],
  context: FormChatContext | undefined,
  conversationId: string,
  contextUser: UserInfo,
  forms?: string,
): Promise<FormChatResponse> {
  await appendTurn(conversationId, { role: 'User', message }, contextUser);
  try {
    const raw = await model.respond({ message, history, context, forms }, contextUser);
    const response = parseFormChatResponse(raw);
    await appendTurn(conversationId, { role: 'AI', message: response.reply }, contextUser);
    return response;
  } catch (error) {
    const detail = errorText(error);
    LogError(`[Forms chat] Assistant failed on "${message.slice(0, 80)}": ${detail}`);
    const reply = 'Sorry — I could not answer that just now. Try again in a moment.';
    await appendTurn(conversationId, { role: 'Error', message: reply, error: detail }, contextUser);
    return { reply, action: 'none' };
  }
}

/** Re-exported so the action and the prompt model share one renderer for the context block. */
