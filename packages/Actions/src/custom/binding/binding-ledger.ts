/**
 * The (binding, response) identity ledger — one definition, used by every path that binds.
 *
 * A binding must produce the same target record however it was triggered: by the submit pipeline,
 * by an approval hook in bizapps-tasks, or by an admin re-driving it manually. That guarantee
 * lives here rather than in each caller, because it was already broken once by exactly that
 * split — the submit path read and wrote this ledger while the Action path did neither, so
 * invoking the Action twice for one response created two records under an `AlwaysCreate` rule,
 * with nothing recorded to show it had happened.
 *
 * The unique index on (BindingID, FormResponseID) is the real guard against a double execution;
 * this read-then-write is the cooperative half.
 */
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { sqlLiteral } from '@mj-biz-apps/forms-entities';
import type { mjBizAppsFormsFormEntityBindingRecordEntity } from '@mj-biz-apps/forms-entities';
import type { BindingOutcome, BindingOutcomeKind, PriorBindingOutcome } from './binding-executor';

const BINDING_RECORD_ENTITY = 'MJ_BizApps_Forms: Form Entity Binding Records';

/** One ledger row as the reader needs it. */
interface LedgerRow {
  Outcome: string;
  TargetRecordID: string | null;
  WrittenFields: string | null;
}

/**
 * What this binding already did for this response, or null if it has not run.
 *
 * Throws when the READ fails, rather than reporting "has not run" — the two mean opposite things,
 * and confusing them turns a transient database error into a duplicate business record. The
 * executor catches this and proceeds, which is the correct call there: the write path converges
 * on the same record without the ledger, it just costs a lookup.
 */
export async function readPriorBindingOutcome(
  bindingId: string,
  responseId: string,
  contextUser: UserInfo,
): Promise<PriorBindingOutcome | null> {
  const result = await new RunView().RunView<LedgerRow>(
    {
      EntityName: BINDING_RECORD_ENTITY,
      // Both are GUIDs minted by this system, but escaped anyway, so the safety of this query does
      // not rest on a fact established three modules away.
      ExtraFilter: `BindingID=${sqlLiteral(bindingId)} AND FormResponseID=${sqlLiteral(responseId)}`,
      Fields: ['Outcome', 'TargetRecordID', 'WrittenFields'],
      ResultType: 'simple',
      MaxRows: 1,
    },
    contextUser,
  );
  if (!result.Success) {
    throw new Error(result.ErrorMessage ?? 'ledger read failed');
  }
  const [row] = result.Results ?? [];
  if (!row) {
    return null;
  }
  return {
    kind: row.Outcome as BindingOutcomeKind,
    targetRecordId: row.TargetRecordID,
    writtenFields: parseWrittenFields(row.WrittenFields, bindingId),
  };
}

/**
 * Upsert the (binding, response) ledger row.
 *
 * Written on every outcome including a skip, so "this submission was considered and produced
 * nothing" is a recorded fact rather than an absence indistinguishable from "never ran". A failure
 * here is logged, never thrown: the business record is already written, and reporting a write that
 * actually succeeded as a failure invites a retry that duplicates it.
 */
export async function recordBindingLedgerRow(
  bindingId: string,
  targetEntityId: string,
  responseId: string,
  outcome: BindingOutcome,
  contextUser: UserInfo,
): Promise<void> {
  const existing = await new RunView().RunView<{ ID: string }>(
    {
      EntityName: BINDING_RECORD_ENTITY,
      ExtraFilter: `BindingID=${sqlLiteral(bindingId)} AND FormResponseID=${sqlLiteral(responseId)}`,
      Fields: ['ID'],
      ResultType: 'simple',
      MaxRows: 1,
    },
    contextUser,
  );

  const row = await new Metadata().GetEntityObject<mjBizAppsFormsFormEntityBindingRecordEntity>(
    BINDING_RECORD_ENTITY,
    contextUser,
  );
  if (!row) {
    LogError('Forms binding: could not create a ledger row object; the bound record was still written.');
    return;
  }
  if (existing.Success && (existing.Results?.length ?? 0) > 0) {
    if (!(await row.Load(existing.Results[0].ID))) {
      LogError(`Forms binding: could not load ledger row ${existing.Results[0].ID} to update it.`);
      return;
    }
  } else {
    row.NewRecord();
    row.BindingID = bindingId;
    row.FormResponseID = responseId;
  }
  row.TargetEntityID = targetEntityId;
  row.TargetRecordID = outcome.targetRecordId;
  row.Outcome = outcome.kind;
  row.WrittenFields = JSON.stringify(outcome.writtenFields);
  if (!(await row.Save())) {
    LogError(`Forms binding: ledger row save failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
  }
}

/**
 * Read the ledger's `WrittenFields` column, degrading to "nothing known" rather than crashing.
 *
 * A malformed value here is data corruption — this column is only ever written by
 * `JSON.stringify` a few lines above — so it is logged rather than absorbed. Returning `[]` is
 * still the right answer for the caller, but a silent `[]` makes the corruption unobservable.
 */
function parseWrittenFields(raw: string | null, bindingId: string): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      LogError(`Forms binding: ledger WrittenFields for binding ${bindingId} is not an array; treating as unknown.`);
      return [];
    }
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch (error) {
    LogError(
      `Forms binding: ledger WrittenFields for binding ${bindingId} is not valid JSON; ` +
        `treating as unknown: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}
