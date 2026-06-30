/**
 * Persist a validated submission: one `FormResponse` row plus one
 * `FormResponseAnswer` per visible answer, then increment the distribution's
 * `ResponseCount`.
 *
 * All entity objects are created via `provider.GetEntityObject<T>(name, contextUser)`
 * (never `new`), passing the anonymous `contextUser`. Every `Save()` boolean is
 * checked; on failure we read `LatestResult.CompleteMessage` (per CLAUDE.md). The
 * answer typed columns mirror the `FormAnswerInput` transport exactly.
 */
import type { BaseEntity, DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type {
  FormAnswerInput,
  JSONValue,
  mjBizAppsFormsFormDistributionEntity,
  mjBizAppsFormsFormResponseAnswerEntity,
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
}

/** Internal result of saving the parent response row. */
interface SaveResponseResult {
  ok: boolean;
  entity?: mjBizAppsFormsFormResponseEntity;
  message?: string;
}

/** Internal result of saving a single answer row. */
interface SaveAnswerResult {
  ok: boolean;
  message?: string;
}

/** Read a failed Save's detail message in the MJ-prescribed way. */
function saveError(entity: BaseEntity, fallback: string): string {
  return entity.LatestResult?.CompleteMessage ?? fallback;
}

/** Create + Save the parent FormResponse row; returns it or a failure. */
async function saveResponse(
  provider: DatabaseProviderBase,
  inputs: PersistenceInputs,
  contextUser: UserInfo,
): Promise<SaveResponseResult> {
  const response = await provider.GetEntityObject<mjBizAppsFormsFormResponseEntity>(
    FORM_RESPONSE_ENTITY,
    contextUser,
  );
  response.NewRecord();
  response.FormID = inputs.formId;
  response.FormVersionID = inputs.formVersionId;
  response.Status = inputs.complete ? 'Complete' : 'Partial';
  response.AnonymousSessionID = inputs.sessionId;
  if (inputs.startedAt) {
    response.StartedAt = new Date(inputs.startedAt);
  }
  if (inputs.complete) {
    response.SubmittedAt = new Date();
  }
  response.SourceMetadata = JSON.stringify(inputs.sourceMetadata);

  if (!(await response.Save())) {
    return { ok: false, message: saveError(response, 'Failed to save form response.') };
  }
  return { ok: true, entity: response };
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
 * Save the response and all its answers. On any answer failure the response id is
 * still returned (the parent row exists); callers decide how strict to be. We keep
 * it simple here: a failed answer aborts with a message so the client can retry.
 */
export async function persistSubmission(
  provider: DatabaseProviderBase,
  inputs: PersistenceInputs,
  contextUser: UserInfo,
): Promise<PersistenceResult> {
  const saved = await saveResponse(provider, inputs, contextUser);
  if (!saved.ok || !saved.entity) {
    return { ok: false, message: saved.message };
  }
  const responseId = saved.entity.ID;

  for (const validated of inputs.answers) {
    const result = await saveAnswer(provider, responseId, validated, contextUser);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
  }

  if (inputs.complete) {
    await incrementResponseCount(provider, inputs.distributionId, contextUser);
  }
  return { ok: true, responseId, status: inputs.complete ? 'Complete' : 'Partial' };
}
