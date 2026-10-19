/**
 * Drive `FormSubmissionEngine.SaveResponse` from the specs that used to drive forms-server's
 * `runSubmitPipeline` (#303 Task 8).
 *
 * Those specs built a `PipelineContext` (provider, anonymous user, elevated user, session id, address
 * hash, origin, scope claim, injected seams) and a `PipelineSubmission`. This maps that shape onto the
 * engine's real call so the specs EXECUTE the engine and keep their assertions — the result fields
 * they read (`success`, `responseId`, `status`, `errors`, `confirmationMessage`, `redirectUrl`) are
 * the engine's own. The scope claim travels where production carries it, on
 * `UserInfo.MagicLinkScope`; the outbox defaults to a recording one, so a spec that does not care about
 * automations needs no `FormAutomationEvent` table.
 */
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { ClientMeta, FormAnswerInput } from '@mj-biz-apps/forms-entities';
import { FormSubmissionEngine } from '../../FormSubmissionEngine.js';
import type { RespondentSaveResult } from '../../../submission/save-request.js';
import type { ResponseSubmittedQueue } from '../../../automation/outbox/enqueue.js';
import type { ResponseSubmittedPayload } from '../../../automation/outbox/response-submitted-event.js';

/** The request context a save runs in — the old `PipelineContext`, minus the deleted hook seam. */
export interface EngineSaveContext {
  provider: DatabaseProviderBase;
  /** The anonymous respondent. */
  contextUser: UserInfo;
  /** The elevated reader/writer (production: MJ's system user). */
  elevatedUser: UserInfo;
  sessionId: string;
  clientIpHash?: string;
  /** The transport-screened peer address Turnstile receives as `remoteip`. */
  forwardableIp?: string;
  requestOrigin?: string;
  /** The verified scope claim; set on the respondent's `MagicLinkScope.ResourceID`. */
  scopeResourceId?: string;
  fetchImpl?: typeof fetch;
  revokeInvites?: (args: { responseId: string; deviceOnly: boolean }) => Promise<void>;
  /**
   * Run the engine's OWN resume-link revocation (isolated provider + minter) instead of a no-op.
   * Off by default: the default path needs a provider that can mint independent instances.
   */
  defaultRevoke?: boolean;
  queue?: ResponseSubmittedQueue;
  /** The post-commit drain; defaults to a no-op so a spec never starts a real drain. */
  kick?: (responseId: string) => void;
}

/** One save — the old `PipelineSubmission`: `partial: true` is an autosave, absent is the final submit. */
export interface EngineSaveSubmission {
  distributionSlug: string;
  formVersionId: string;
  partial?: boolean;
  startedAt?: string;
  turnstileToken?: string;
  clientMeta?: ClientMeta;
  answers: FormAnswerInput[];
  clientResponseId?: string;
}

/** Run one save through the engine. */
export function saveThroughEngine(ctx: EngineSaveContext, submission: EngineSaveSubmission): Promise<RespondentSaveResult> {
  const respondent = ctx.scopeResourceId
    ? ({ ...ctx.contextUser, MagicLinkScope: { ResourceID: ctx.scopeResourceId } } as unknown as UserInfo)
    : ctx.contextUser;
  return FormSubmissionEngine.Instance.SaveResponse(
    {
      distributionSlug: submission.distributionSlug,
      formVersionId: submission.formVersionId,
      mode: submission.partial === true ? 'partial' : 'final',
      clientResponseId: submission.clientResponseId,
      startedAt: submission.startedAt,
      turnstileToken: submission.turnstileToken,
      clientMeta: submission.clientMeta,
      answers: submission.answers,
      caller: { sessionId: ctx.sessionId, ipHash: ctx.clientIpHash, forwardableIp: ctx.forwardableIp, origin: ctx.requestOrigin },
    },
    ctx.provider,
    respondent,
    {
      systemUser: ctx.elevatedUser,
      fetchImpl: ctx.fetchImpl,
      revokeInvites: ctx.defaultRevoke ? undefined : (ctx.revokeInvites ?? (async () => undefined)),
      queue: ctx.queue ?? recordingQueue(),
      kick: ctx.kick ?? (() => undefined),
    },
  );
}

/** A queue that records what it was asked to publish, and whether the publish ran in a transaction. */
export interface RecordingQueue extends ResponseSubmittedQueue {
  readonly published: ResponseSubmittedPayload[];
  /** `TransactionDepth` of the provider at each publish — proof it was inside the save's transaction. */
  readonly depths: number[];
  /** Make the NEXT publish throw this message, as a rejected publish does. */
  failNextWith?: string;
}

export function recordingQueue(): RecordingQueue {
  const queue: RecordingQueue = {
    published: [],
    depths: [],
    Publish: async (payload, provider) => {
      if (queue.failNextWith) {
        const message = queue.failNextWith;
        queue.failNextWith = undefined;
        throw new Error(message);
      }
      queue.published.push(payload);
      queue.depths.push(provider.TransactionDepth ?? 0);
    },
  };
  return queue;
}
