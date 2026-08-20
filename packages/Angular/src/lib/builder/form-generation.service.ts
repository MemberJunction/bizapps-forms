import { Injectable, signal } from '@angular/core';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { LogError, LogStatus } from '@memberjunction/core';
import {
  foldProgress,
  parseGenerationProgress,
  type GenerationProgress,
} from '@mj-biz-apps/forms-entities';
import { readActionOutputString, readActionOutputStrings } from '../shared/action-output';

/**
 * Drives one AI form generation and reports what the server is doing while it does it.
 *
 * ── THE AWAITED RESULT IS THE TRUTH; THE STREAM IS THE SHOW. ─────────────────────────────────
 * Everything here is arranged so a build succeeds identically whether or not a single progress
 * event ever arrives. The websocket can be stripped by a proxy, connect after the outline has
 * already gone out, or drop halfway — in every case the awaited `RunAction` still returns the form
 * id and the caller still lands in the builder on a finished form. What is lost is the animation.
 *
 * That is why the events carry no state the client could not re-derive: the server persists each
 * stage as it completes, so the database is already correct at every instant and the client's job
 * is to reload, not to reconstruct.
 *
 * WHERE THE RECONCILE ACTUALLY HAPPENS, since it is deliberately not in here: the caller opens the
 * form record once the action returns, and opening it loads the tree from the database. So the
 * author always lands on the persisted truth rather than on anything assembled from events — this
 * service never needs to hold, patch or reconcile a form. A caller that instead kept a form open
 * across a generation WOULD have to reload it itself; nothing here does that for them.
 *
 * ── SUBSCRIBE BEFORE MUTATING. ───────────────────────────────────────────────────────────────
 * The outline event fires seconds into the run, so a subscription opened after the mutation misses
 * the one event that supplies the form id and the total. Subscribing first is the pattern MJ's own
 * `CreateLabelProgress` client uses, and the ordering is the whole reason it exists.
 */

/** What the caller gets back once the action returns. */
export interface GenerationOutcome {
  success: boolean;
  /** Set on success, and ALSO on a `PARTIAL` result — a half-built draft is still openable. */
  formId: string | null;
  /** True when the server reported `PARTIAL`: a reviewable draft, not a finished form. */
  partial: boolean;
  message: string;
  /** Parts the build could not complete, named. Empty on a clean run. */
  degraded: readonly string[];
}

/** Which kind of text the author supplied. Mirrors the action's `InputMode` param. */
export type GenerationInputMode = 'brief' | 'questions';

const GENERATE_ACTION = 'Forms: Generate Form From Brief';

@Injectable()
export class FormGenerationService {
  /**
   * Live progress, or null when nothing is being generated.
   *
   * A signal rather than an Observable because every consumer is a template: the builder's bar and
   * the dashboard's button both just read it, and an `async` pipe over a stream that has to be
   * shared between two components is more machinery than the one value needs.
   */
  private readonly _progress = signal<GenerationProgress | null>(null);
  public readonly progress = this._progress.asReadonly();

  /**
   * Generate a form, streaming progress until the action returns.
   *
   * Resolves when the SERVER is done, not when the last event arrives — the two are different, and
   * waiting for an event that may never come is how a working build hangs forever.
   */
  public async generate(
    brief: string,
    inputMode: GenerationInputMode,
    resolveActionId: (name: string) => Promise<string | null>,
  ): Promise<GenerationOutcome> {
    const actionId = await resolveActionId(GENERATE_ACTION);
    if (!actionId) {
      return failure(`Action '${GENERATE_ACTION}' is not installed on this MemberJunction instance.`);
    }

    const provider = GraphQLDataProvider.Instance;
    const sessionId = provider.sessionId;
    this._progress.set(null);

    // Subscribed BEFORE the mutation — see the class header.
    const subscription = this.watch(sessionId);
    try {
      const result = await new GraphQLActionClient(provider).RunAction(actionId, [
        { Name: 'Brief', Value: brief, Type: 'Input' },
        { Name: 'InputMode', Value: inputMode, Type: 'Input' },
        // Supplying the session is what switches the server to the staged, streaming route.
        { Name: 'SessionID', Value: sessionId, Type: 'Input' },
      ] as ActionParam[]);
      return this.outcomeOf(result);
    } finally {
      // Unsubscribed on every path. A subscription left open outlives the panel that started it
      // and keeps a websocket handler pointed at a signal nobody reads.
      subscription?.unsubscribe();
    }
  }

  /** Clear the progress state — call when the generating UI closes. */
  public reset(): void {
    this._progress.set(null);
  }

  /**
   * Subscribe to this session's pushes and fold ours into {@link progress}.
   *
   * Returns undefined when the subscription cannot be opened at all. That is logged and otherwise
   * ignored: a build with no progress channel is the documented degraded case, not a failure.
   */
  private watch(sessionId: string): { unsubscribe: () => void } | undefined {
    try {
      return GraphQLDataProvider.Instance.PushStatusUpdates(sessionId).subscribe({
        next: (message: string) => {
          const event = parseGenerationProgress(message);
          if (!event) {
            // Not ours. The channel is shared with every other resolver, so this is the normal
            // case for most messages and deliberately silent.
            return;
          }
          this._progress.set(foldProgress(this._progress() ?? undefined, event));
        },
        error: (error: unknown) => {
          // Never rethrown into the build: the action is still running and will still return.
          LogError(
            `[Forms] Progress stream for session ${sessionId} failed; the form is still being ` +
              `generated and will appear when it is done. ${asText(error)}`,
          );
        },
      });
    } catch (error) {
      LogStatus(
        `[Forms] Could not open a progress stream (${asText(error)}); generating without live progress.`,
      );
      return undefined;
    }
  }

  /**
   * Read the action's result, including the half-built case.
   *
   * PARTIAL IS DETECTED FROM THE OUTPUTS, NOT FROM A RESULT CODE, because there is no result code
   * to read: `GraphQLActionClient` selects `ResultCode` in its mutation and then drops it on the
   * floor when building the object it returns. What survives is `Success` and the output params —
   * and the action sets `FormID` on a failure in exactly one place, the half-built case. So
   * "failed, but there is a form id" IS the partial signal, precisely and without a server change.
   *
   * Reported as its own state rather than collapsed either way: collapsing it into failure loses a
   * draft the author could finish, and collapsing it into success claims a form is complete when
   * it is not.
   */
  private outcomeOf(result: ActionResult): GenerationOutcome {
    const formId = readActionOutputString(result, 'FormID');
    const partial = !result.Success && formId !== null;
    if (!result.Success && !partial) {
      return failure(result.Message || 'The form could not be generated.');
    }
    return {
      success: !partial,
      formId,
      partial,
      message: result.Message || 'Form created.',
      // The action's own list beats the stream's: it is authoritative and always present, whereas
      // the terminal event may never have arrived.
      degraded: readActionOutputStrings(result, 'Degraded') ?? this._progress()?.degraded ?? [],
    };
  }
}

function failure(message: string): GenerationOutcome {
  return { success: false, formId: null, partial: false, message, degraded: [] };
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
