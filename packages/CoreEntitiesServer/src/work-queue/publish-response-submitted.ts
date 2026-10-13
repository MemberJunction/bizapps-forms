/**
 * Publishing a `forms.response-submitted` message INSIDE the caller's transaction (#303 Task 8,
 * spec §5) — the outbox half of the submit path.
 *
 * `WorkQueueEngine.PublishAs` with `Provider` set to a transactional database provider enlists the
 * publish in that provider's open transaction: the message row, its deduplication reservation and
 * the response it announces commit together or not at all. So a `Rejected` publish is THROWN, never
 * reported and skipped: the caller's transaction must roll back, or a response would stand whose
 * automations are owed but were never queued — the detached-promise loss the queue exists to end.
 *
 * A `Duplicate` is success: the deduplication key already names this save (`responseSubmittedRequest`
 * builds it), so the work is queued already — a re-sent final, or an identical partial re-save.
 */
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { WorkQueueEngine } from '@memberjunction/work-queue-engine';
import { configureFormsWorkQueue } from './forms-work-queue.js';
import { RESPONSE_SUBMITTED_TOPIC, responseSubmittedRequest, type ResponseSubmittedPayload } from './response-submitted.js';

/** The two calls the submit path makes on the queue — a seam, so the engine's specs need no queue. */
export interface ResponseSubmittedQueue {
  /** Make sure the queue can take a publish; false (already logged) when this host cannot. */
  Ready(contextUser: UserInfo): Promise<boolean>;
  /** Publish one message inside `provider`'s open transaction; throws on anything but Accepted/Duplicate. */
  Publish(payload: ResponseSubmittedPayload, provider: DatabaseProviderBase, contextUser: UserInfo): Promise<void>;
}

/**
 * Whether this process has already found the queue ready. Remembered only once it IS ready: the
 * check loads the engine and logs "ready" on success, which is right once per process and noise on
 * every save. A host that is not ready is asked again on the next save, so fixing the host (pushing
 * the metadata, running the core migration) needs no restart.
 */
let queueReady = false;

/** The real queue: MJ's Work Queue engine. */
export const WORK_QUEUE_RESPONSE_SUBMITTED: ResponseSubmittedQueue = {
  Ready: async (contextUser) => {
    if (!queueReady) {
      queueReady = await configureFormsWorkQueue(contextUser);
    }
    return queueReady;
  },
  Publish: async (payload, provider, contextUser) => {
    const [result] = await WorkQueueEngine.Instance.PublishAs(RESPONSE_SUBMITTED_TOPIC, [responseSubmittedRequest(payload)], {
      ContextUser: contextUser,
      Provider: provider,
    });
    if (!result) {
      throw new Error(`The work queue returned no result for response ${payload.ResponseID}'s ${payload.Trigger} message.`);
    }
    if (result.Status === 'Rejected') {
      throw new Error(
        `The work queue rejected response ${payload.ResponseID}'s ${payload.Trigger} message ` +
          `(${result.Error?.Code ?? 'no code'}: ${result.Error?.Message ?? 'no message'}).`,
      );
    }
  },
};
