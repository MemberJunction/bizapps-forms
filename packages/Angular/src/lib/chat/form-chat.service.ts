import { Injectable, signal } from '@angular/core';
import { Metadata, RunView, LogError } from '@memberjunction/core';
import type { MJConversationEntity } from '@memberjunction/core-entities';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { ActionParam } from '@memberjunction/actions-base';
import {
  guidOrUndefined,
  isGuid,
  type FormChatTurn,
  type GenerationProgress,
} from '@mj-biz-apps/forms-entities';
import { readActionOutputString } from '../shared/action-output';
import { watchGenerationProgress } from '../shared/generation-progress-stream';

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
  /** `none` | `create` | `restyle` | `image` | `edit` | `open` | `unsupported`. */
  action: string;
  /** Set when the turn created a form, so the host can open it. */
  createdFormId: string | null;
  /**
   * The style row this turn wrote, so the host can reload it.
   *
   * Set by a `restyle` and, since `setLayout` writes the same `CSSVariables` field on the same
   * row, by a layout edit as well — in which case `changedFormId` is set too and both fire.
   */
  restyledStyleId: string | null;
  /** Set when the turn put a picture on a screen, so the host can reload what it is showing. */
  imagedScreenId: string | null;
  /** Set when the turn changed the form's structure, so the host reloads its tree. */
  changedFormId: string | null;
  /** Set when the turn asked to navigate to another form. Navigation only — nothing was written. */
  openFormId: string | null;
  ok: boolean;
}

const CHAT_ACTION = 'Forms: Chat';
/** What the author sees when they stop waiting; the work itself is already with the server. */
const STOPPED_WAITING =
  'Stopped waiting. The server may still finish this — the reply will appear here if it does.';
/** Marks a reply that arrived after the author stopped waiting for it. */
const STOPPED_PREFIX = '(finished after you stopped waiting)\n\n';
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

  /**
   * Which load is the current one.
   *
   * A load that started before a newer one must not write its result — and a load must never
   * clobber a message already in flight. Both happened: the service is provided on the builder, so
   * it outlives the component across a tab switch, and switching to Design and back while a reply
   * was in the air remounted the component, re-ran `load()`, and overwrote the optimistic user turn
   * with database rows that did not include it yet. The reply then landed under no question.
   */
  private loadToken = 0;

  /**
   * Which send is the current one. Bumped by {@link stop}, so a reply that arrives after the
   * author gave up can tell that it did.
   */
  private sendToken = 0;

  /**
   * Where the "stopped waiting" notice sits, while one is showing.
   *
   * Null whenever there is nothing to replace — which includes after a reload, since the indices
   * of a thread read back from the database have nothing to do with the ones in memory.
   */
  private stoppedNoticeIndex: number | null = null;

  private readonly _busy = signal(false);
  /** True while a message is in flight, so the input can disable and show a pending state. */
  public readonly busy = this._busy.asReadonly();

  private readonly _progress = signal<GenerationProgress | null>(null);
  /**
   * What the server is doing right now, or null when it is not building a form.
   *
   * A turn that creates a form runs for the better part of a minute. Three pulsing dots for that
   * long do not read as "working", they read as "stuck" — long enough that an author cancels and
   * tries again, which starts a second build. The stages are already published for the forms
   * list's progress bar; the chat listens to the same stream and says what is happening.
   */
  public readonly progress = this._progress.asReadonly();

  /**
   * Load the thread for this scope.
   *
   * A failure here leaves the thread EMPTY rather than erroring: an author who cannot see their
   * history can still ask a question, and the server keeps appending to the same conversation
   * regardless of whether the client managed to display it.
   */
  public async load(formId: string | null): Promise<void> {
    const token = ++this.loadToken;
    this.stoppedNoticeIndex = null;
    /** True while this load is still the newest one AND nothing is mid-send. */
    const mayWrite = (): boolean => token === this.loadToken && !this._busy();
    try {
      const conversationId = guidOrUndefined(await this.findConversation(formId));
      if (!conversationId) {
        if (mayWrite()) {
          this._turns.set([]);
        }
        return;
      }
      const details = await this.rv.RunView<{
        Role: FormChatTurn['role'];
        Message: string;
        __mj_CreatedAt: string | Date;
      }>({
        EntityName: ENTITY.detail,
        ExtraFilter: `ConversationID='${conversationId}' AND HiddenToUser = 0`,
        OrderBy: '__mj_CreatedAt',
        ResultType: 'simple',
        Fields: ['Role', 'Message', '__mj_CreatedAt'],
      });
      if (!details.Success) {
        LogError(`[Forms chat] Could not load the thread: ${details.ErrorMessage}`);
        if (mayWrite()) {
          this._turns.set([]);
        }
        return;
      }
      if (!mayWrite()) {
        return;
      }
      this._turns.set(
        (details.Results ?? []).map((d) => ({
          role: d.Role,
          message: d.Message,
          at: new Date(d.__mj_CreatedAt),
        })),
      );
    } catch (error) {
      LogError(`[Forms chat] Could not load the thread: ${asText(error)}`);
      if (mayWrite()) {
        this._turns.set([]);
      }
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
      return {
        reply: '',
        action: 'none',
        createdFormId: null,
        restyledStyleId: null,
        imagedScreenId: null,
        changedFormId: null,
        openFormId: null,
        ok: false,
      };
    }
    this._turns.update((t) => [...t, { role: 'User', message: trimmed, at: new Date() }]);
    const sendToken = ++this.sendToken;
    // A new message is not the reply to an older stop; whatever notice is showing stays showing.
    this.stoppedNoticeIndex = null;
    this._busy.set(true);
    this._progress.set(null);
    try {
      const result = await this.runChatAction(trimmed, formId);
      // A stopped turn is not a silent one. The reply still lands — the server finished the work
      // whatever the author's patience did — but it is marked so the thread does not read as if
      // the wait had simply been shorter than it was.
      const stopped = sendToken !== this.sendToken;
      const turn: FormChatTurn = {
        role: result.ok ? 'AI' : 'Error',
        message: stopped ? `${STOPPED_PREFIX}${result.reply}` : result.reply,
        at: new Date(),
        // Only a failure carries its own retry; a reply has nothing to retry.
        ...(result.ok ? {} : { retryOf: trimmed }),
      };
      // A stopped turn REPLACES its own notice rather than adding to it. Most turns answer in a
      // second or two, so pressing Stop on one produced "Stopped waiting" and then the reply
      // immediately under it — two messages about one exchange, and the thread reading as though
      // something had gone wrong when nothing had. The notice exists for the case where the reply
      // never comes; the moment it does come, it is the better version of the same fact.
      const noticeAt = stopped ? this.stoppedNoticeIndex : null;
      this.stoppedNoticeIndex = null;
      this._turns.update((t) =>
        noticeAt !== null && noticeAt < t.length
          ? t.map((existing, i) => (i === noticeAt ? turn : existing))
          : [...t, turn],
      );
      return result;
    } finally {
      if (sendToken === this.sendToken) {
        this._busy.set(false);
        this._progress.set(null);
      }
    }
  }

  /**
   * Stop waiting for the turn in flight.
   *
   * It stops the WAIT, not the work: `GraphQLActionClient.RunAction` takes no abort signal, so the
   * request is already with the server and the server will finish it. Pretending otherwise would
   * be the worse lie — the form would change under an author who believed they had cancelled. So
   * the composer is handed back immediately, and when the reply does arrive it is appended with
   * {@link STOPPED_PREFIX} in front of it and the host still refreshes, which keeps what is on
   * screen equal to what is in the database.
   */
  public stop(): void {
    if (!this._busy()) {
      return;
    }
    this.sendToken++;
    this._busy.set(false);
    this._progress.set(null);
    this._turns.update((t) => {
      // Remembered so the reply can take this turn's place instead of piling up beneath it.
      this.stoppedNoticeIndex = t.length;
      return [...t, { role: 'AI', message: STOPPED_WAITING, at: new Date() }];
    });
  }

  /**
   * Put this thread away and start an empty one.
   *
   * Archived rather than deleted, and archived server-side rather than only cleared here: the
   * thread is loaded back out of `MJ: Conversations` on every mount, so a purely local clear would
   * reappear in full the next time the panel opened. `IsArchived` is already what the load filter
   * excludes, which is why nothing else has to change for this to work.
   */
  public async startNewThread(formId: string | null): Promise<boolean> {
    const conversationId = guidOrUndefined(await this.findConversation(formId));
    if (!conversationId) {
      this._turns.set([]);
      return true;
    }
    try {
      const md = new Metadata();
      const conversation = await md.GetEntityObject<MJConversationEntity>(ENTITY.conversation);
      if (!(await conversation.Load(conversationId))) {
        LogError(`[Forms chat] Could not load conversation ${conversationId} to archive it.`);
        return false;
      }
      conversation.IsArchived = true;
      if (!(await conversation.Save())) {
        LogError(`[Forms chat] Could not archive the thread: ${conversation.LatestResult?.CompleteMessage}`);
        return false;
      }
      this._turns.set([]);
      return true;
    } catch (error) {
      LogError(`[Forms chat] Could not archive the thread: ${asText(error)}`);
      return false;
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
      imagedScreenId: null,
      changedFormId: null,
      openFormId: null,
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
      // Subscribed BEFORE the mutation: a create turn's outline event fires seconds in, and a
      // subscription opened afterwards misses the one event that supplies the total.
      const stream = watchGenerationProgress(
        provider.sessionId,
        () => this._progress(),
        (p) => this._progress.set(p),
      );
      let result;
      try {
        result = await new GraphQLActionClient(provider).RunAction(actionId, inputs);
      } finally {
        stream?.unsubscribe();
      }
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
        imagedScreenId: readActionOutputString(result, 'ScreenID'),
        changedFormId: readActionOutputString(result, 'ChangedFormID'),
        openFormId: readActionOutputString(result, 'OpenFormID'),
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
