/**
 * Persist a validated submission as one `FormResponse` row plus one
 * `FormResponseAnswer` per visible answer, attach any uploaded files to the response record so
 * MJ's attachments panel shows them, then (for a completed submission) increment the
 * distribution's `ResponseCount`.
 *
 * Three modes (all funnel through {@link persistSubmission}):
 *   - CREATE   — first save for a session (Partial autosave or one-shot Complete).
 *   - UPDATE   — a Partial autosave re-hits the SAME session row: update it in place and
 *                REPLACE its answers (idempotent — no duplicate Partial rows). (Task 4)
 *   - PROMOTE  — a final submit finds the session's existing Partial row: flip it to its
 *                terminal status, replace answers, and — for a COMPLETION — set SubmittedAt and
 *                increment the count. No second row is created. (Task 4)
 *
 * "Terminal status" is two things now, and the difference is the whole point of the second one:
 * a `Disqualified` promotion is still terminal and still replaces answers, but it never stamps
 * `SubmittedAt` and never counts toward a quota — the respondent was screened out, not finished.
 * See {@link statusFor} / {@link countsCompletion}.
 *
 * All entity objects are created via `provider.GetEntityObject<T>(name, contextUser)`
 * (never `new`), passing the anonymous `contextUser`. Every `Save()`/`Delete()` boolean is
 * checked; on failure we read `LatestResult.CompleteMessage` (per CLAUDE.md). The answer
 * typed columns mirror the `FormAnswerInput` transport exactly.
 */
import type { BaseEntity, DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import type {
  FormAnswerInput,
  JSONValue,
  mjBizAppsFormsFormDistributionEntity,
  mjBizAppsFormsFormResponseAnswerEntity,
  mjBizAppsFormsFormResponseAnswerEntityType,
  mjBizAppsFormsFormResponseEntity,
} from '@mj-biz-apps/forms-entities';
import { syncFileLinks } from '../file-links/file-links.service';
import { MJFileLinkGateway } from '../file-links/mj-file-link-gateway';
import {
  FORM_DISTRIBUTION_ENTITY,
  FORM_RESPONSE_ANSWER_ENTITY,
  FORM_RESPONSE_ENTITY,
} from './entity-names';
import { isTerminalResponseStatus } from './response-status';
import type { ValidatedAnswer } from './validation.service';

/** Everything the persistence step needs from the resolved/validated submission. */
export interface PersistenceInputs {
  formId: string;
  formVersionId: string;
  distributionId: string;
  complete: boolean;
  /**
   * C3: this save is a DISQUALIFICATION — a knockout rule matched. Terminal like Complete,
   * but never quota-counted, never SubmittedAt-stamped, and it wins over `complete`: a final
   * submit whose answers disqualify persists as `Disqualified`, whatever the client claimed.
   */
  disqualified?: boolean;
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
  status?: mjBizAppsFormsFormResponseEntity['Status'];
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
   * True when this row still has to be given its real status — every path except the idempotent
   * no-op against a row a concurrent request already sealed.
   *
   * This was `replacedExisting`, meaning "clear its answers before re-inserting". Both the flag
   * and the wholesale clear are gone: answers are reconciled in place (see `reconcileAnswers`),
   * and what is deferred now is the SEAL rather than the delete.
   */
  pendingSeal?: boolean;
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

/** The status this save writes. Disqualification wins over everything else. */
function statusFor(inputs: PersistenceInputs): mjBizAppsFormsFormResponseEntity['Status'] {
  if (inputs.disqualified) {
    return 'Disqualified';
  }
  return inputs.complete ? 'Complete' : 'Partial';
}

/** Terminal statuses: rows nothing may downgrade or rewrite. One definition, three callers. */
const isTerminalStatus = isTerminalResponseStatus;

/** Whether this save counts toward completion quotas — a disqualification never does. */
function countsCompletion(inputs: PersistenceInputs): boolean {
  return inputs.complete && !inputs.disqualified;
}

/**
 * The columns that describe the response whether or not it is finished.
 *
 * Split from {@link applyResponseOutcome} so the row can exist, and hold everything true about
 * it, before anything claims it was submitted.
 */
function applyResponseIdentity(response: mjBizAppsFormsFormResponseEntity, inputs: PersistenceInputs): void {
  response.FormID = inputs.formId;
  response.FormVersionID = inputs.formVersionId;
  response.AnonymousSessionID = inputs.sessionId;
  if (inputs.startedAt) {
    response.StartedAt = new Date(inputs.startedAt);
  }
  response.SourceMetadata = JSON.stringify(inputs.sourceMetadata);
}

/**
 * The columns that CLAIM a finished submission — written only once the answers are stored.
 *
 * These two used to be set in the same pass as the identity columns, before the answers were
 * touched at all, so a response was sealed and then had its answers rewritten underneath it. A
 * failure in between left a row saying `Complete`, carrying a `SubmittedAt` and counted against
 * the quota, whose answers had been deleted and not replaced — and the dedupe gate then refused
 * the retry, because the row it was retrying against was already terminal.
 *
 * `SubmittedAt` is stamped only on a completion: a re-saved Partial must never claim it was
 * submitted, and a disqualified respondent never submitted at all.
 */
function applyResponseOutcome(response: mjBizAppsFormsFormResponseEntity, inputs: PersistenceInputs): void {
  response.Status = statusFor(inputs);
  if (inputs.complete && !inputs.disqualified) {
    response.SubmittedAt = new Date();
  }
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
  applyResponseIdentity(response, inputs);
  // Deliberately NOT the submission's real status: a row must exist before its answers can name
  // it, so it starts as a draft and is sealed once they are stored. See `applyResponseOutcome`.
  response.Status = 'Partial';
  if (await response.Save()) {
    return { ok: true, entity: response, pendingSeal: true, countable: countsCompletion(inputs) };
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
  if (isTerminalStatus(response.Status)) {
    // Terminal (Complete or Disqualified): a concurrent request already sealed this response —
    // never downgrade it, never rewrite its answers. Return it as-is.
    return { ok: true, entity: response, pendingSeal: false, countable: false, skipAnswers: true };
  }
  // The existing row is Partial: update it in place, or promote it to Complete. It was never
  // counted as a Partial, so a promotion counts once here. The identity columns are applied now
  // and the row is SEALED later, once its answers are stored.
  applyResponseIdentity(response, inputs);
  return { ok: true, entity: response, pendingSeal: true, countable: countsCompletion(inputs) };
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
  // Sealed since the caller looked it up: leave it exactly as it is. The lookups that produce
  // `existingResponseId` all filter on `RESUMABLE_RESPONSE_STATUSES`, so arriving here means the row WAS a
  // partial a moment ago — a knockout flush, a second tab or a retry landing in between is the
  // whole window. Without this the row was downgraded, its answers deleted and rewritten, and
  // the quota counted it again, because the promotion check below asks only about `Complete`.
  // `reconcileDuplicate` has always made this check; this is the path that never learned it.
  if (isTerminalStatus(response.Status)) {
    return { ok: true, entity: response, pendingSeal: false, countable: false, skipAnswers: true };
  }
  // The row is `Partial` — the guard above is exhaustive over every other status — so this write
  // can only ever be an update in place or a promotion, and a promotion counts once. The old
  // `!wasComplete` term was unreachable the moment that guard landed; leaving it would have read
  // like a live safeguard.
  applyResponseIdentity(response, inputs);
  return { ok: true, entity: response, pendingSeal: true, countable: countsCompletion(inputs) };
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
 * Bring a response's stored answers in line with the submission — WRITE FIRST, DELETE LAST.
 *
 * This used to delete every stored answer and re-insert the whole set. Two things were wrong
 * with that, and the second is the serious one.
 *
 * It rewrote everything on every save. An autosave carrying one changed answer performed N
 * deletes and N inserts against a form of N questions, on a debounce, per respondent.
 *
 * And it opened a window in which the response held NEITHER its old answers nor its new ones.
 * There is no transaction here: the deletes commit, then the inserts run one at a time and abort
 * on the first failure. A failure anywhere in between left a response — already sealed by the
 * caller, `SubmittedAt` stamped and quota counted — with the answers it had destroyed and
 * nothing to replace them. Nothing retried, because the submit returned an error and the dedupe
 * gate refuses a resubmit against a row that is already terminal.
 *
 * The order here is the fix. Every incoming answer is written first, reusing the row that
 * already holds that question, so a failure leaves the previous value in place rather than a
 * hole. Only once every one of them is safely stored are the rows the submission no longer
 * carries removed — and those are the only rows that are ever deleted, which is also what makes
 * an unchanged autosave cost nothing.
 */
async function reconcileAnswers(
  provider: DatabaseProviderBase,
  responseId: string,
  answers: ValidatedAnswer[],
  contextUser: UserInfo,
): Promise<SaveAnswerResult> {
  const existing = await provider.RunView<mjBizAppsFormsFormResponseAnswerEntityType>(
    {
      EntityName: FORM_RESPONSE_ANSWER_ENTITY,
      ExtraFilter: `ResponseID=${quoteSqlString(responseId)}`,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!existing.Success) {
    return { ok: false, message: 'Failed to load existing answers for replacement.' };
  }

  const stale = new Map<string, mjBizAppsFormsFormResponseAnswerEntity>();
  for (const row of existing.Results) {
    const answer = row as unknown as mjBizAppsFormsFormResponseAnswerEntity;
    // Last one wins on a duplicate: the row store should hold at most one answer per question,
    // and if it somehow holds two, keeping one and deleting the other is the repair.
    stale.set(answer.QuestionID, answer);
  }

  for (const validated of answers) {
    const held = stale.get(validated.question.id);
    stale.delete(validated.question.id);
    const result = held
      ? await rewriteAnswer(held, validated)
      : await saveAnswer(provider, responseId, validated, contextUser);
    if (!result.ok) {
      return result;
    }
  }

  // LAST, and only what the submission no longer carries — a question hidden by a rule, or an
  // answer cleared. Everything the respondent still has an answer for is already stored.
  for (const orphan of stale.values()) {
    if (!(await orphan.Delete())) {
      return { ok: false, message: saveError(orphan, 'Failed to clear a prior answer.') };
    }
  }
  return { ok: true };
}

/**
 * Overwrite the answer already stored for this question.
 *
 * Every typed column is cleared first. `applyAnswerValue` only writes the columns the input
 * populates, which is correct on a fresh row where the rest are null — on a REUSED row it would
 * leave the previous answer's column behind, so a question whose answer changed from text to a
 * number would end up holding both, and `answerValueOf`'s precedence would read back the stale
 * one.
 */
async function rewriteAnswer(
  answer: mjBizAppsFormsFormResponseAnswerEntity,
  validated: ValidatedAnswer,
): Promise<SaveAnswerResult> {
  answer.TextValue = null;
  answer.NumericValue = null;
  answer.DateValue = null;
  answer.BooleanValue = null;
  answer.JSONValue = null;
  answer.FileID = null;
  applyAnswerValue(answer, validated.input);
  if (!(await answer.Save())) {
    return { ok: false, message: saveError(answer, 'Failed to save form response answer.') };
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
 * The file ids among a submission's answers, in answer order.
 *
 * Named apart from `dispatch-automation.ts`'s `fileAnswerIds` on purpose: same idea, different
 * input entirely (validated submission input here, collapsed `CanonicalAnswers` there), so they
 * cannot share an implementation and one name across both would suggest they could.
 */
function submittedFileIds(answers: ValidatedAnswer[]): string[] {
  return (answers || []).map((a) => a.input.fileId).filter((id): id is string => Boolean(id));
}

/**
 * Make the response record's ATTACHMENTS match its file answers (best-effort; logs, never fails).
 *
 * A file answer already stores its `MJ: Files` id on the answer row, but MJ's attachments panel
 * does not read answer rows — it reads `FileEntityRecordLink` for (EntityID, RecordID). Without
 * this write a respondent's résumé is stored, downloadable, and invisible on the response.
 *
 * Same posture as {@link incrementResponseCount} and for the same reason: the response and its
 * answers are already saved by the time this runs, so reporting a failure here would tell the
 * respondent their submission failed when it did not. The reconciler returns its failures rather
 * than throwing, so there is nothing to catch — only something to log.
 */
async function attachResponseFiles(
  provider: DatabaseProviderBase,
  inputs: PersistenceInputs,
  responseId: string,
  contextUser: UserInfo,
): Promise<void> {
  const entity = provider.EntityByName(FORM_RESPONSE_ENTITY);
  if (!entity) {
    console.warn(`[forms] Cannot attach files to response ${responseId}: "${FORM_RESPONSE_ENTITY}" is not in metadata.`);
    return;
  }
  const result = await syncFileLinks(new MJFileLinkGateway(provider, contextUser), {
    // The link table keys on the entity's ROW ID, not its name — which is also what the panel
    // filters on, so the two have to agree exactly.
    target: { entityId: entity.ID, recordId: responseId },
    fileIds: submittedFileIds(inputs.answers),
    responseId,
  });
  for (const failure of result.failures) {
    console.warn(`[forms] Response ${responseId}: ${failure}`);
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
    return { ok: true, responseId, status: saved.entity.Status, deduped: true };
  }

  // One pass for both paths. A fresh CREATE has nothing stored, so this inserts; an upsert or a
  // duplicate-key recovery reuses the rows already there. The `replacedExisting` branch that used
  // to gate a wholesale clear is gone with it — see `reconcileAnswers` for why nothing is deleted
  // until every incoming answer is safely written.
  const written = await reconcileAnswers(provider, responseId, inputs.answers, contextUser);
  if (!written.ok) {
    return { ok: false, message: written.message };
  }

  // SEALED LAST. Until this line the row is a draft: whatever went wrong above, it never claimed
  // to be a submission it does not have the answers for, and it stays resumable so the retry the
  // respondent makes lands on it instead of being turned away by the dedupe gate.
  if (saved.pendingSeal) {
    applyResponseOutcome(saved.entity, inputs);
    if (!(await saved.entity.Save())) {
      return { ok: false, message: saveError(saved.entity, 'Failed to save form response.') };
    }
  }

  // Runs on partial saves too: a respondent who uploaded on page one should see the file on the
  // response before they finish. Reconciling from the CURRENT answers is what makes the upsert
  // and promotion paths need no special casing here — a replaced or removed upload is an answer
  // change, and the attachments follow the answers.
  await attachResponseFiles(provider, inputs, responseId, contextUser);

  // Count once, only when this write newly transitioned the row to Complete (fresh Complete or
  // Partial→Complete promotion) — never when re-completing an already-counted row.
  if (saved.countable) {
    await incrementResponseCount(provider, inputs.distributionId, contextUser);
  }
  return { ok: true, responseId, status: statusFor(inputs) };
}
