/**
 * The submit path's half of the automation outbox (#303): one `FormAutomationEvent` row per run a
 * save owes, written on the SAVE'S provider — inside its open transaction — so the response and the
 * work it owes commit together or not at all. That is what ended the detached promise a killed
 * process could lose.
 *
 * Every failure THROWS: the caller's transaction must roll back, or a response would stand whose
 * automations are owed but were never queued. A duplicate OnComplete event is not special-cased —
 * `messageFor` emits one only for the write that newly completed the row, under the response's row
 * lock, so the table's unique index firing means that invariant broke, and refusing the save is the
 * honest outcome.
 */
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { quoteSqlString, type mjBizAppsFormsFormAutomationEventEntity } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../../shared/entity-names.js';
import { procedureCallInSchema } from '../../shared/forms-procedure.js';
import { responseSubmittedPayloadRefusal, type ResponseSubmittedPayload } from './response-submitted-event.js';

/** The one call the submit path makes on the outbox — a seam, so the engine's specs need no table. */
export interface ResponseSubmittedQueue {
  /** Queue one event on `provider` (inside its open transaction); throws on any failure. */
  Publish(payload: ResponseSubmittedPayload, provider: DatabaseProviderBase, contextUser: UserInfo): Promise<void>;
}

/** The real outbox: the `FormAutomationEvent` table. */
export const OUTBOX_RESPONSE_SUBMITTED: ResponseSubmittedQueue = {
  Publish: enqueueResponseSubmitted,
};

async function enqueueResponseSubmitted(payload: ResponseSubmittedPayload, provider: DatabaseProviderBase, contextUser: UserInfo): Promise<void> {
  const refusal = responseSubmittedPayloadRefusal(payload);
  if (refusal) {
    throw new Error(`Response ${payload.ResponseID}'s ${payload.Trigger} automations were not queued: ${refusal}.`);
  }
  if (payload.Trigger === 'OnPartial' && (await latestPartialKey(payload.ResponseID, provider, contextUser)) === payload.PartialSaveKey) {
    return;
  }
  const event = await provider.GetEntityObject<mjBizAppsFormsFormAutomationEventEntity>(FORMS_ENTITY.FormAutomationEvent, contextUser);
  event.NewRecord();
  event.FormResponseID = payload.ResponseID;
  event.Trigger = payload.Trigger;
  event.PartialSaveKey = payload.PartialSaveKey;
  event.Status = 'Pending';
  if (!(await event.Save())) {
    throw new Error(
      `Response ${payload.ResponseID}'s ${payload.Trigger} automations could not be queued: ${event.LatestResult?.CompleteMessage ?? 'no message'}`,
    );
  }
  if (payload.Trigger === 'OnComplete') {
    await bringWaitingPartialsForward(payload.ResponseID, provider, contextUser);
  }
}

/**
 * A response's events run in queue order (claim.ts), so a partial-save event waiting out a retry
 * backoff would hold the final behind it — for good on a host whose scheduler is off, since the
 * post-commit drain claims nothing while an older event is waiting. Once the response completes,
 * that partial is stale (the drain settles it Complete without running anything), so making it due
 * NOW lets the post-commit drain clear it and run the final in the same call.
 *
 * On SQL Server the UPDATE is `spFormAutomationEventBringPartialsForward` (#338): MJ's runtime roles
 * may EXECUTE it but hold no rights on the base table. It runs on the save's provider, so inside the
 * save's transaction. PostgreSQL keeps the raw UPDATE.
 */
async function bringWaitingPartialsForward(responseId: string, provider: DatabaseProviderBase, contextUser: UserInfo): Promise<void> {
  const entity = provider.EntityByName(FORMS_ENTITY.FormAutomationEvent);
  if (!entity) {
    throw new Error(`"${FORMS_ENTITY.FormAutomationEvent}" is not in this host's metadata, so response ${responseId}'s automations cannot be queued.`);
  }
  if (provider.PlatformKey !== 'postgresql') {
    const call = procedureCallInSchema(provider, entity.SchemaName, 'spFormAutomationEventBringPartialsForward', { FormResponseID: responseId });
    await provider.ExecuteSQL(call, undefined, undefined, contextUser);
    return;
  }
  const q = (name: string): string => provider.QuoteIdentifier(name);
  await provider.ExecuteSQL(
    `UPDATE ${provider.QuoteSchemaAndView(entity.SchemaName, entity.BaseTable)} SET ${q('NextAttemptAt')} = now() ` +
      `WHERE ${q('FormResponseID')} = ${quoteSqlString(responseId)} AND ${q('Trigger')} = 'OnPartial' AND ${q('Status')} = 'Pending' AND ${q('NextAttemptAt')} > now()`,
    undefined,
    undefined,
    contextUser,
  );
}

/**
 * The `PartialSaveKey` of the response's most recent OnPartial event, or `null` when it has none.
 * Only the most recent: saving A, then B, then A again re-runs the OnPartial steps for the third
 * save, because the answers did change since the last run.
 */
async function latestPartialKey(responseId: string, provider: DatabaseProviderBase, contextUser: UserInfo): Promise<string | null> {
  const result = await provider.RunView<{ PartialSaveKey: string | null }>(
    {
      EntityName: FORMS_ENTITY.FormAutomationEvent,
      ExtraFilter: `FormResponseID=${quoteSqlString(responseId)} AND [Trigger]='OnPartial'`,
      OrderBy: '__mj_CreatedAt DESC, ID DESC',
      MaxRows: 1,
      Fields: ['PartialSaveKey'],
      ResultType: 'simple',
      // The drain writes this table with raw SQL (claim.ts), which fires no entity event.
      BypassCache: true,
    },
    contextUser,
  );
  if (!result.Success) {
    throw new Error(`Response ${responseId}'s previous partial-save event could not be read: ${result.ErrorMessage ?? 'no message'}`);
  }
  return result.Results[0]?.PartialSaveKey ?? null;
}
