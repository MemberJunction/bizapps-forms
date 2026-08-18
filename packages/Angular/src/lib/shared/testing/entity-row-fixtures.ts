/**
 * Hand-rolled entity-row fixtures for unit tests.
 *
 * The pure aggregation functions take already-fetched rows, so every spec that exercises
 * them needs the same three builders. They live here rather than being re-typed per spec:
 * the row shapes are CodeGen output, so a drifting hand-copy is a spec that passes against
 * a schema the app no longer has.
 *
 * Excluded from the package build (`tsconfig.json` → `exclude`) — test-only, never shipped.
 */
import type {
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';

type ResponseRow = mjBizAppsFormsFormResponseEntityType;
type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

/** A published question with the given id/type; prompt is derived so assertions read clearly. */
export function q(
  id: string,
  type: PublishedFormQuestion['type'],
  displayOrder = 0,
  options: { id: string; label: string; value: string; displayOrder: number }[] = [],
): PublishedFormQuestion {
  return { id, type, prompt: `Prompt ${id}`, isRequired: false, displayOrder, options };
}

/** A response row. Anonymous unless `overrides.RespondentPerson` says otherwise. */
export function response(
  id: string,
  status: 'Complete' | 'Partial',
  started: Date | null,
  submitted: Date | null,
  overrides: Partial<ResponseRow> = {},
): ResponseRow {
  return {
    ID: id,
    FormID: 'f1',
    FormVersionID: 'v1',
    Status: status,
    AnonymousSessionID: `s-${id}`,
    RespondentPersonID: null,
    StartedAt: started,
    SubmittedAt: submitted,
    SourceMetadata: null,
    __mj_CreatedAt: started ?? new Date(),
    __mj_UpdatedAt: submitted ?? new Date(),
    Form: 'Test Form',
    RespondentPerson: null,
    ...overrides,
  };
}

/** An answer row; `vals` sets whichever value column the question type uses. */
export function answer(
  responseId: string,
  questionId: string,
  vals: Partial<AnswerRow> = {},
): AnswerRow {
  const now = new Date();
  return {
    ID: `${responseId}-${questionId}`,
    ResponseID: responseId,
    QuestionID: questionId,
    TextValue: null,
    NumericValue: null,
    DateValue: null,
    BooleanValue: null,
    JSONValue: null,
    FileID: null,
    Score: null,
    ScoreRationale: null,
    __mj_CreatedAt: now,
    __mj_UpdatedAt: now,
    File: null,
    ...vals,
  };
}
