import { Injectable, signal } from '@angular/core';
import { Metadata, RunView, LogError } from '@memberjunction/core';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { ActionParam } from '@memberjunction/actions-base';
import { guidOrUndefined, isGuid, type FormChatTurn } from '@mj-biz-apps/forms-entities';
import { readActionOutputString } from '../shared/action-output';

/**
 * The authoring chat's client half: load a thread, send a message, surface what came back.
 *
 * ── THE THREAD IS READ FROM THE DATABASE, NOT KEPT IN MEMORY. ────────────────────────────────
 * An author who closes the tab and comes back tomorrow finds the conversation they left, because
 * it was never anywhere else. `MJ: Conversations` scopes a thread by `ExternalID`, so the one on a
 * form is that form's and the one on the forms list is separate — which is what makes "what about
 * buttons?" mean something when you return to it.
 *
 * ── ONE ACTION, WHATEVER THE TURN DOES. ──────────────────────────────────────────────────────
 * Creating a form, restyling one and answering a question all go through `Forms: Chat`. The client
 * does not decide which is happening; it reads `Action` off the result and reacts — opening a form
 * when one was created, refreshing when one was restyled.
 */

/** What one send produced. */
export interface ChatSendResult {
  reply: string;
  /** `none` | `create` | `restyle` | `unsupported` — what the server actually did. */
  action: string;
  /** Set when the turn created a form, so the host can open it. */
  createdFormId: string | null;
  /** Set when the turn restyled the open form, so the host can reload its style. */
  restyledStyleId: string | null;
  ok: boolean;
}

const CHAT_ACTION = 'Forms: Chat';
const ENTITY = {
  conversation: 'MJ: Conversations',
  detail: 'MJ: Conversation Details',
  action: 'MJ: Actions',
} as const;

/**
 * Mirrors the server's `chatExternalId`, INCLUDING its guard.
 *
 * This string is interpolated into a `RunView` filter, so a non-GUID collapses to the forms-list
 * thread rather than being embedded. The two implementations have to agree on this or the client
 * would look for a thread under a key the server never files one under.
 */
export function chatExternalId(formId: string | undefined | null): string {
  return isGuid(formId) ? `mj-forms:form:${formId}` : 'mj-forms:home';
}

@Injectable()
export class FormChatService {
  private readonly rv = new RunView();

  private readonly _turns = signal<readonly FormChatTurn[]>([]);
  /** The thread, oldest first. Rendered directly by the chat panel. */
  public readonly turns = this._turns.asReadonly();

  private readonly _busy = signal(false);
  /** True while a message is in flight, so the input can disable and show a pending state. */
  public readonly busy = this._busy.asReadonly();

  /**
   * Load the thread for this scope.
   *
   * A failure here leaves the thread EMPTY rather than erroring: an author who cannot see their
   * history can still ask a question, and the server keeps appending to the same conversation
   * regardless of whether the client managed to display it.
   */
  public async load(formId: string | null): Promise<void> {
    try {
      const conversationId = guidOrUndefined(await this.findConversation(formId));
      if (!conversationId) {
        this._turns.set([]);
        return;
      }
      const details = await this.rv.RunView<{ Role: FormChatTurn['role']; Message: string }>({
        EntityName: ENTITY.detail,
        ExtraFilter: `ConversationID='${conversationId}' AND HiddenToUser = 0`,
        OrderBy: '__mj_CreatedAt',
        ResultType: 'simple',
        Fields: ['Role', 'Message'],
      });
      if (!details.Success) {
        LogError(`[Forms chat] Could not load the thread: ${details.ErrorMessage}`);
        this._turns.set([]);
        return;
      }
      this._turns.set((details.Results ?? []).map((d) => ({ role: d.Role, message: d.Message })));
    } catch (error) {
      LogError(`[Forms chat] Could not load the thread: ${asText(error)}`);
      this._turns.set([]);
    }
  }

  /**
   * Send a message and append both sides.
   *
   * The author's own message is shown IMMEDIATELY, before the round trip, because a chat that
   * swallows what you typed until the answer arrives feels broken on any connection worse than a
   * desk. The server records it too; this is the optimistic half of the same fact.
   */
  public async send(message: string, formId: string | null): Promise<ChatSendResult> {
    const trimmed = message.trim();
    if (!trimmed || this._busy()) {
      return { reply: '', action: 'none', createdFormId: null, restyledStyleId: null, ok: false };
    }
    this._turns.update((t) => [...t, { role: 'User', message: trimmed }]);
    this._busy.set(true);
    try {
      const result = await this.runChatAction(trimmed, formId);
      this._turns.update((t) => [...t, { role: result.ok ? 'AI' : 'Error', message: result.reply }]);
      return result;
    } finally {
      this._busy.set(false);
    }
  }

  /** Drop the in-memory thread. The stored one is untouched — this is a view reset, not a delete. */
  public reset(): void {
    this._turns.set([]);
  }

  private async runChatAction(message: string, formId: string | null): Promise<ChatSendResult> {
    const failure = (reply: string): ChatSendResult => ({
      reply,
      action: 'none',
      createdFormId: null,
      restyledStyleId: null,
      ok: false,
    });
    try {
      const actionId = await this.resolveActionId(CHAT_ACTION);
      if (!actionId) {
        return failure(`The "${CHAT_ACTION}" action is not installed on this MemberJunction instance.`);
      }
      const provider = GraphQLDataProvider.Instance;
      const inputs: ActionParam[] = [
        { Name: 'Message', Value: message, Type: 'Input' },
        // Supplying the session lets a turn that generates a form stream its progress.
        { Name: 'SessionID', Value: provider.sessionId, Type: 'Input' },
      ];
      if (formId) {
        inputs.push({ Name: 'FormID', Value: formId, Type: 'Input' });
      }
      const result = await new GraphQLActionClient(provider).RunAction(actionId, inputs);
      if (!result.Success) {
        return failure(result.Message || 'The chat could not respond.');
      }
      return {
        // `Reply` is the authoritative text; `Message` is the same string and the fallback for a
        // provider that did not surface output params.
        reply: readActionOutputString(result, 'Reply') ?? result.Message ?? '',
        action: readActionOutputString(result, 'Action') ?? 'none',
        createdFormId: readActionOutputString(result, 'FormID'),
        restyledStyleId: readActionOutputString(result, 'StyleID'),
        ok: true,
      };
    } catch (error) {
      LogError(`[Forms chat] Send failed: ${asText(error)}`);
      return failure('Something went wrong sending that. Try again in a moment.');
    }
  }

  /** The thread id for this scope, or null when the author has never chatted here. */
  private async findConversation(formId: string | null): Promise<string | null> {
    const md = new Metadata();
    const userId = md.CurrentUser?.ID;
    if (!userId) {
      return null;
    }
    const view = await this.rv.RunView<{ ID: string }>({
      EntityName: ENTITY.conversation,
      ExtraFilter: `UserID='${userId}' AND ExternalID='${chatExternalId(formId)}' AND IsArchived = 0`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'simple',
      Fields: ['ID'],
      MaxRows: 1,
    });
    return view.Success ? (view.Results?.[0]?.ID ?? null) : null;
  }

  /** Look up the Action record id by its registered name. */
  private async resolveActionId(name: string): Promise<string | null> {
    const view = await this.rv.RunView<{ ID: string }>({
      EntityName: ENTITY.action,
      ExtraFilter: `Name='${name.replace(/'/g, "''")}'`,
      ResultType: 'simple',
      Fields: ['ID'],
      MaxRows: 1,
    });
    return view.Success ? (view.Results?.[0]?.ID ?? null) : null;
  }
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
