/**
 * Persist a validated submission as one `FormResponse` row plus one
 * `FormResponseAnswer` per visible answer, then (for a completed submission)
 * increment the distribution's `ResponseCount`.
 *
 * Three modes (all funnel through {@link persistSubmission}):
 *   - CREATE   — first save for a session (Partial autosave or one-shot Complete).
 *   - UPDATE   — a Partial autosave re-hits the SAME session row: update it in place and
 *                REPLACE its answers (idempotent — no duplicate Partial rows). (Task 4)
 *   - PROMOTE  — a final submit finds the session's existing Partial row: flip it to
 *                Complete + set SubmittedAt, replace answers, and increment the count.
 *                No second row is created. (Task 4)
 *
 * All entity objects are created via `provider.GetEntityObject<T>(name, contextUser)`
 * (never `new`), passing the anonymous `contextUser`. Every `Save()`/`Delete()` boolean is
 * checked; on failure we read `LatestResult.CompleteMessage` (per CLAUDE.md). The answer
 * typed columns mirror the `FormAnswerInput` transport exactly.
 */
import type { BaseEntity, DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type {
  FormAnswerInput,
  JSONValue,
  mjBizAppsFormsFormDistributionEntity,
  mjBizAppsFormsFormResponseAnswerEntity,
  mjBizAppsFormsFormResponseAnswerEntityType,
  mjBizAppsFormsFormResponseEntity,
} from '@mj-biz-apps/forms-entities';
import {
  FORM_DISTRIBUTION_ENTITY,
  FORM_RESPONSE_ANSWER_ENTITY,
  FORM_RESPONSE_ENTITY,
} from './entity-names';
import type { ValidatedAnswer } from './validation.service';

/** Everything the persistence step needs from the resolved/validated submission. */
export interface PersistenceInputs {
  formId: string;
  formVersionId: string;
  distributionId: string;
  complete: boolean;
  startedAt?: string;
  sessionId: string;
  sourceMetadata: JSONValue;
  answers: ValidatedAnswer[];
  /**
   * When set, the persistence updates/promotes THIS existing row instead of creating a new
   * one (Task 4). Its answers are replaced with `answers`. Used for Partial autosave re-hits
   * and for promoting a Partial to Complete on final submit.
   */
  existingResponseId?: string;
  /**
   * The widget's stable, client-generated response id (a v4 UUID). On CREATE it becomes the
   * FormResponse primary key, so every subsequent autosave/submit carrying the same id
   * upserts THIS row — the correctness key that works even when the anonymous session id is
   * blank. Absent only for callers that predate the client-id contract (then the DB default
   * PK is used).
   */
  clientResponseId?: string;
}

/**
 * Outcome of persistence. A flat (non-discriminated) shape is used deliberately:
 * this package compiles without `strictNullChecks`, where discriminated-union
 * narrowing via `!result.ok` does not work — a flat shape keeps field access safe.
 */
export interface PersistenceResult {
  ok: boolean;
  responseId?: string;
  status?: 'Complete' | 'Partial';
  message?: string;
  /**
   * True when this submission was an idempotent no-op against a row a CONCURRENT request had
   * already Completed (duplicate-key recovery hit a terminal row). The caller must NOT re-fire
   * on-submit hooks — the winning request already did — so double-firing is avoided on the race.
   */
  deduped?: boolean;
}

/** Internal result of saving the parent response row. */
interface SaveResponseResult {
  ok: boolean;
  entity?: mjBizAppsFormsFormResponseEntity;
  message?: string;
  /**
   * True when this write targeted a PRE-EXISTING row (a normal upsert, or a duplicate-key
   * recovery) — its answers must be cleared before re-inserting so the persisted set mirrors
   * the latest submission. A fresh CREATE leaves this false (nothing to clear).
   */
  replacedExisting?: boolean;
  /**
   * True when this write TRANSITIONED the row to Complete for the first time (fresh Complete
   * create, or Partial→Complete promotion) and the distribution ResponseCount should be
   * incremented exactly once. Re-completing an already-Complete row is not countable.
   */
  countable?: boolean;
  /**
   * True when the row is already terminal (Complete) and this write left it untouched — the
   * caller must NOT clear/re-insert answers or count. Used by the duplicate-key recovery when a
   * concurrent request already Completed the row (idempotent no-op).
   */
  skipAnswers?: boolean;
}

/** Internal result of saving a single answer row. */
interface SaveAnswerResult {
  ok: boolean;
  message?: string;
}

/** Read a failed Save/Delete's detail message in the MJ-prescribed way. */
function saveError(entity: BaseEntity, fallback: string): string {
  return entity.LatestResult?.CompleteMessage ?? fallback;
}

/**
 * True when a failed Save was rejected by the database for a duplicate PRIMARY KEY / UNIQUE
 * constraint — i.e. a row with our adopted `clientResponseId` already exists. This is the
 * signal that a CONCURRENT submit (double-click, autosave+submit overlap, or a network retry)
 * won the race to create the row; the loser recovers by reconciling with it rather than
 * surfacing a hard PK error. Matched on the SQL Server error text since the provider surfaces
 * the raw message on `LatestResult.CompleteMessage`.
 */
function isDuplicateKeyError(entity: BaseEntity): boolean {
  const message = entity.LatestResult?.CompleteMessage ?? '';
  return /duplicate key|primary key constraint|unique (?:key )?constraint/i.test(message);
}

/** Canonical v4/v-agnostic UUID shape — a malformed client id is never used as a PK. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True iff `value` is a syntactically valid uniqueidentifier string. */
export function isValidUuid(value: string | undefined | null): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Apply the (non-answer) column values common to create + update onto the response row. */
function applyResponseFields(response: mjBizAppsFormsFormResponseEntity, inputs: PersistenceInputs): void {
  response.FormID = inputs.formId;
  response.FormVersionID = inputs.formVersionId;
  response.Status = inputs.complete ? 'Complete' : 'Partial';
  response.AnonymousSessionID = inputs.sessionId;
  if (inputs.startedAt) {
    response.StartedAt = new Date(inputs.startedAt);
  }
  // Set SubmittedAt only on completion; a re-saved Partial must never claim it was submitted.
  if (inputs.complete) {
    response.SubmittedAt = new Date();
  }
  response.SourceMetadata = JSON.stringify(inputs.sourceMetadata);
}

/** CREATE a new parent FormResponse row; returns it or a failure. */
async function createResponse(
  provider: DatabaseProviderBase,
  inputs: PersistenceInputs,
  contextUser: UserInfo,
): Promise<SaveResponseResult> {
  const response = await provider.GetEntityObject<mjBizAppsFormsFormResponseEntity>(
    FORM_RESPONSE_ENTITY,
    contextUser,
  );
  response.NewRecord();
  // Adopt the client-generated id as the primary key so every later autosave/submit carrying
  // the same id upserts THIS row (works even with a blank session — see PersistenceInputs).
  const adoptedId = isValidUuid(inputs.clientResponseId) ? (inputs.clientResponseId as string) : undefined;
  if (adoptedId) {
    response.ID = adoptedId;
  }
  applyResponseFields(response, inputs);
  if (await response.Save()) {
    return { ok: true, entity: response, replacedExisting: false, countable: inputs.complete };
  }
  // Save failed. If a CONCURRENT request already created the row at our adopted client id, the
  // dedupe/adopt SELECTs missed it (they ran before that insert committed) and we collided on
  // the PK. Recover by reconciling with the existing row — an idempotent upsert under the race
  // that the DB primary key, not the pre-write lookups, is what actually serializes.
  if (adoptedId && isDuplicateKeyError(response)) {
    return reconcileDuplicate(provider, inputs, adoptedId, contextUser);
  }
  return { ok: false, message: saveError(response, 'Failed to save form response.') };
}

/**
 * Reconcile with a row that a concurrent request created at our adopted client id (recovering
 * from the duplicate-key collision in {@link createResponse}). Loads the existing row and:
 *   - if it is already Complete, leaves it untouched (terminal — never downgrade to Partial, and
 *     never double-count/re-write answers): the concurrent final submit already won;
 *   - otherwise applies this submission's fields (updating a Partial in place, or promoting it to
 *     Complete) and counts once only when it newly transitions to Complete.
 */
async function reconcileDuplicate(
  provider: DatabaseProviderBase,
  inputs: PersistenceInputs,
  existingResponseId: string,
  contextUser: UserInfo,
): Promise<SaveResponseResult> {
  const response = await provider.GetEntityObject<mjBizAppsFormsFormResponseEntity>(
    FORM_RESPONSE_ENTITY,
    contextUser,
  );
  if (!(await response.Load(existingResponseId))) {
    // The colliding row could not be loaded (vanished again) — surface the original failure.
    return { ok: false, message: 'Failed to save form response (duplicate id could not be reconciled).' };
  }
  if (response.Status === 'Complete') {
    // Terminal: a concurrent final submit already recorded this response. Return it as-is.
    return { ok: true, entity: response, replacedExisting: false, countable: false, skipAnswers: true };
  }
  // The existing row is Partial: update it in place, or promote it to Complete. It was never
  // counted as a Partial, so a promotion counts once here.
  applyResponseFields(response, inputs);
  if (!(await response.Save())) {
    return { ok: false, message: saveError(response, 'Failed to reconcile form response.') };
  }
  return { ok: true, entity: response, replacedExisting: true, countable: inputs.complete };
}

/** UPDATE/PROMOTE an existing parent FormResponse row in place; returns it or a failure. */
async function updateResponse(
  provider: DatabaseProviderBase,
  inputs: PersistenceInputs,
  existingResponseId: string,
  contextUser: UserInfo,
): Promise<SaveResponseResult> {
  const response = await provider.GetEntityObject<mjBizAppsFormsFormResponseEntity>(
    FORM_RESPONSE_ENTITY,
    contextUser,
  );
  if (!(await response.Load(existingResponseId))) {
    // The row vanished between lookup and save — fall back to creating a fresh one.
    return createResponse(provider, inputs, contextUser);
  }
  // Count a promotion once: only when this write flips a not-yet-Complete row to Complete.
  const wasComplete = response.Status === 'Complete';
  applyResponseFields(response, inputs);
  if (!(await response.Save())) {
    return { ok: false, message: saveError(response, 'Failed to update form response.') };
  }
  return { ok: true, entity: response, replacedExisting: true, countable: inputs.complete && !wasComplete };
}

/** Map one validated answer onto the FormResponseAnswer typed columns and Save it. */
async function saveAnswer(
  provider: DatabaseProviderBase,
  responseId: string,
  validated: ValidatedAnswer,
  contextUser: UserInfo,
): Promise<SaveAnswerResult> {
  const answer = await provider.GetEntityObject<mjBizAppsFormsFormResponseAnswerEntity>(
    FORM_RESPONSE_ANSWER_ENTITY,
    contextUser,
  );
  answer.NewRecord();
  answer.ResponseID = responseId;
  answer.QuestionID = validated.question.id;
  applyAnswerValue(answer, validated.input);

  if (!(await answer.Save())) {
    return { ok: false, message: saveError(answer, 'Failed to save form response answer.') };
  }
  return { ok: true };
}

/** Copy the populated typed value(s) from the input onto the answer entity. */
function applyAnswerValue(answer: mjBizAppsFormsFormResponseAnswerEntity, input: FormAnswerInput): void {
  if (input.textValue !== undefined) {
    answer.TextValue = input.textValue;
  }
  if (input.numericValue !== undefined) {
    answer.NumericValue = input.numericValue;
  }
  if (input.dateValue !== undefined) {
    answer.DateValue = new Date(input.dateValue);
  }
  if (input.booleanValue !== undefined) {
    answer.BooleanValue = input.booleanValue;
  }
  if (input.jsonValue !== undefined) {
    answer.JSONValue = JSON.stringify(input.jsonValue);
  }
  if (input.fileId !== undefined) {
    answer.FileID = input.fileId;
  }
}

/**
 * Delete every existing answer for a response (used before re-inserting on an UPDATE/PROMOTE
 * so the row's answers exactly mirror the latest submission — idempotent). Loads the answers
 * as entity objects so each `.Delete()` return is checked. On any failure returns a message.
 */
async function replaceAnswersClear(
  provider: DatabaseProviderBase,
  responseId: string,
  contextUser: UserInfo,
): Promise<SaveAnswerResult> {
  const existing = await provider.RunView<mjBizAppsFormsFormResponseAnswerEntityType>(
    {
      EntityName: FORM_RESPONSE_ANSWER_ENTITY,
      ExtraFilter: `ResponseID='${responseId.replace(/'/g, "''")}'`,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!existing.Success) {
    return { ok: false, message: 'Failed to load existing answers for replacement.' };
  }
  for (const row of existing.Results) {
    const answer = row as unknown as mjBizAppsFormsFormResponseAnswerEntity;
    if (!(await answer.Delete())) {
      return { ok: false, message: saveError(answer, 'Failed to clear a prior answer.') };
    }
  }
  return { ok: true };
}

/** Insert all validated answers for a response; aborts with a message on first failure. */
async function insertAnswers(
  provider: DatabaseProviderBase,
  responseId: string,
  answers: ValidatedAnswer[],
  contextUser: UserInfo,
): Promise<SaveAnswerResult> {
  for (const validated of answers) {
    const result = await saveAnswer(provider, responseId, validated, contextUser);
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true };
}

/** Increment the distribution's ResponseCount (best-effort; logs but never fails the submit). */
async function incrementResponseCount(
  provider: DatabaseProviderBase,
  distributionId: string,
  contextUser: UserInfo,
): Promise<void> {
  const dist = await provider.GetEntityObject<mjBizAppsFormsFormDistributionEntity>(
    FORM_DISTRIBUTION_ENTITY,
    contextUser,
  );
  if (!(await dist.Load(distributionId))) {
    return;
  }
  dist.ResponseCount = dist.ResponseCount + 1;
  if (!(await dist.Save())) {
    // Non-fatal: the response is already saved. Surface for observability only.
    console.warn(
      `[forms] Failed to increment ResponseCount for distribution ${distributionId}: ` +
        saveError(dist, 'unknown error'),
    );
  }
}

/**
 * Save the response and all its answers. CREATE (default), or UPDATE/PROMOTE when
 * `existingResponseId` is set — in which case the existing row's answers are REPLACED so
 * repeated Partial autosaves stay idempotent (Task 4). `ResponseCount` is incremented only
 * when the resulting row is Complete AND this is not merely re-completing an already-counted
 * row — promotion counts once because the Partial was never counted.
 */
export async function persistSubmission(
  provider: DatabaseProviderBase,
  inputs: PersistenceInputs,
  contextUser: UserInfo,
): Promise<PersistenceResult> {
  const isUpsert = Boolean(inputs.existingResponseId);
  const saved = isUpsert
    ? await updateResponse(provider, inputs, inputs.existingResponseId as string, contextUser)
    : await createResponse(provider, inputs, contextUser);
  if (!saved.ok || !saved.entity) {
    return { ok: false, message: saved.message };
  }
  const responseId = saved.entity.ID;

  // A concurrent request already Completed this row (duplicate-key recovery): it is terminal, so
  // its answers and count are already recorded — return the existing id/status untouched.
  if (saved.skipAnswers) {
    return { ok: true, responseId, status: saved.entity.Status as 'Complete' | 'Partial', deduped: true };
  }

  // When this write targeted a pre-existing row (upsert or duplicate-key recovery), clear its
  // prior answers first so the persisted set mirrors the latest submission (no stale/duplicate
  // answers across autosaves or promotion).
  if (saved.replacedExisting) {
    const cleared = await replaceAnswersClear(provider, responseId, contextUser);
    if (!cleared.ok) {
      return { ok: false, message: cleared.message };
    }
  }

  const inserted = await insertAnswers(provider, responseId, inputs.answers, contextUser);
  if (!inserted.ok) {
    return { ok: false, message: inserted.message };
  }

  // Count once, only when this write newly transitioned the row to Complete (fresh Complete or
  // Partial→Complete promotion) — never when re-completing an already-counted row.
  if (saved.countable) {
    await incrementResponseCount(provider, inputs.distributionId, contextUser);
  }
  return { ok: true, responseId, status: inputs.complete ? 'Complete' : 'Partial' };
}
