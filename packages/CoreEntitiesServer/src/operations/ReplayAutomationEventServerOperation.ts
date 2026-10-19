/**
 * `Forms.ReplayAutomationEvent` — the server body of the CodeGen-emitted
 * `FormsReplayAutomationEventOperation`. Runs a dead-lettered automation event again: the event goes
 * back to `Pending` with a fresh attempt budget (one fenced UPDATE, `replayDeadLetteredEvent`), then
 * its response is drained once so the author sees the outcome without waiting for the sweep.
 * Shape: see `ArchiveFormServerOperation`.
 *
 * `Authorize` is the authoring rule, not the response-reading one: a replay re-runs steps that
 * write records and send mail, so it is a write.
 */
import { BaseRemotableOperation, LogError, type DatabaseProviderBase, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsReplayAutomationEventOperation,
  quoteSqlString,
  type FormsReplayAutomationEventInput,
  type FormsReplayAutomationEventOutput,
} from '@mj-biz-apps/forms-entities';
import { replayDeadLetteredEvent } from '../automation/outbox/claim.js';
import { drainAutomationOutbox } from '../automation/outbox/drain.js';
import { FormAutomationError } from '../engines/automation-errors.js';
import { runEngineCall } from '../engines/engine-guards.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { authorizeFormAuthoring } from './form-authoring-authorization.js';
import { requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.ReplayAutomationEvent')
export class ReplayAutomationEventServerOperation extends FormsReplayAutomationEventOperation {
  protected override async Authorize(_input: FormsReplayAutomationEventInput, user: UserInfo): Promise<boolean> {
    return authorizeFormAuthoring(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsReplayAutomationEventInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsReplayAutomationEventOutput> {
    const eventId = requireTextInput(input?.FormAutomationEventID, 'FormAutomationEventID', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    // runEngineCall logs a refusal as a status and a fault as an error, once, with who asked.
    return runEngineCall(database, `[Forms] automation event ${eventId} was not replayed (user ${user.ID})`, async () => {
      const event = await readEvent(database, eventId, user);
      if (!(await replayDeadLetteredEvent(database, eventId, user))) {
        throw new FormAutomationError(`Automation event ${eventId} is not dead-lettered (it is ${event.Status}), so it was not replayed.`);
      }
      await drainReplayedResponse(eventId, event.FormResponseID, user);
      return { FormAutomationEventID: eventId, Status: 'Pending' };
    });
  }
}

interface EventRow {
  ID: string;
  FormResponseID: string;
  Status: string;
}

/** The event's response and status, or a refusal when there is no such event. */
async function readEvent(database: DatabaseProviderBase, eventId: string, user: UserInfo): Promise<EventRow> {
  const result = await database.RunView<EventRow>(
    {
      EntityName: FORMS_ENTITY.FormAutomationEvent,
      ExtraFilter: `ID=${quoteSqlString(eventId)}`,
      Fields: ['ID', 'FormResponseID', 'Status'],
      ResultType: 'simple',
      // The drain writes events with raw SQL, so a cached copy would show a stale status.
      BypassCache: true,
    },
    user,
  );
  if (!result.Success) {
    throw new FormAutomationError('The automation event could not be read, so it was not replayed; the server log has the detail.', {
      fault: true,
      logDetail: `reading event ${eventId}: ${result.ErrorMessage}`,
    });
  }
  const row = result.Results[0];
  if (!row) {
    throw new FormAutomationError(`Automation event ${eventId} was not found.`);
  }
  return row;
}

/**
 * Run the replayed event's response now. The replay already committed, so a drain failure is logged
 * and swallowed on purpose: the event is `Pending`, the scheduled sweep runs it, and telling the
 * author "not replayed" would be false.
 */
async function drainReplayedResponse(eventId: string, responseId: string, user: UserInfo): Promise<void> {
  try {
    await drainAutomationOutbox({ reason: 'replay', responseId }, user);
  } catch (err) {
    LogError(
      `[Forms] event ${eventId} of response ${responseId} was re-queued but its drain failed (the sweep will run it): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadReplayAutomationEventOperation(): void {
  // intentionally empty
}
