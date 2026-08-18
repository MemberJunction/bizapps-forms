/**
 * Hand-rolled entity-row fixtures for unit tests.
 *
 * The pure aggregation functions take already-fetched rows, so every spec that exercises
 * them needs the same builders. They live in one file so that a CodeGen schema change is
 * one edit rather than one per spec.
 *
 * Excluded from the package build (`tsconfig.json` → `exclude`) — test-only, never
 * shipped. NOTE what that costs: like the `.spec.ts` files themselves (also excluded), and
 * like every spec in this repo, nothing type-checks this file — `ngc` skips it and Vitest
 * transpiles without checking. The `Partial<…EntityType>` annotations below are therefore
 * documentation, not enforcement: if CodeGen changes a row shape, these fixtures go stale
 * SILENTLY and the specs keep passing against a schema the app no longer has. Re-check them
 * by hand after any migration + CodeGen run that touches these five entities.
 */
import type {
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
  mjBizAppsFormsFormUploadEntityType,
  mjBizAppsFormsFormAutomationRunEntityType,
  mjBizAppsFormsFormEntityBindingRecordEntityType,
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
  status: mjBizAppsFormsFormResponseEntityType['Status'],
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

/** A `FormUpload` provenance row for a stored file. */
export function upload(
  fileId: string,
  overrides: Partial<mjBizAppsFormsFormUploadEntityType> = {},
): mjBizAppsFormsFormUploadEntityType {
  const now = new Date();
  return {
    ID: `up-${fileId}`,
    FileID: fileId,
    DistributionID: 'd1',
    FormID: 'f1',
    QuestionID: null,
    ResponseDraftID: null,
    AnonymousSessionID: null,
    UploadedByUserID: null,
    ProviderKey: null,
    FileName: `${fileId}.pdf`,
    ContentType: 'application/pdf',
    SizeBytes: 2048,
    Status: 'Active',
    __mj_CreatedAt: now,
    __mj_UpdatedAt: now,
    File: `${fileId}.pdf`,
    Distribution: 'Public link',
    Form: 'Test Form',
    UploadedByUser: null,
    ...overrides,
  };
}

/** A `FormAutomationRun` row — one attempt of one on-submit automation. */
export function automationRun(
  id: string,
  status: mjBizAppsFormsFormAutomationRunEntityType['Status'],
  overrides: Partial<mjBizAppsFormsFormAutomationRunEntityType> = {},
): mjBizAppsFormsFormAutomationRunEntityType {
  const now = new Date();
  return {
    ID: id,
    FormAutomationID: `auto-${id}`,
    FormResponseID: 'r1',
    Status: status,
    AttemptCount: 1,
    StartedAt: null,
    CompletedAt: null,
    ActionExecutionLogID: null,
    AIAgentRunID: null,
    ErrorMessage: null,
    OutputSummary: null,
    __mj_CreatedAt: now,
    __mj_UpdatedAt: now,
    FormAutomation: `Automation ${id}`,
    ActionExecutionLog: null,
    AIAgentRun: null,
    ...overrides,
  };
}

/** A `FormEntityBindingRecord` ledger row — the business record a submission wrote. */
export function bindingRecord(
  id: string,
  outcome: mjBizAppsFormsFormEntityBindingRecordEntityType['Outcome'],
  overrides: Partial<mjBizAppsFormsFormEntityBindingRecordEntityType> = {},
): mjBizAppsFormsFormEntityBindingRecordEntityType {
  const now = new Date();
  return {
    ID: id,
    BindingID: `bind-${id}`,
    FormResponseID: 'r1',
    TargetEntityID: 'entity-1',
    TargetRecordID: 'rec-1',
    Outcome: outcome,
    WrittenFields: null,
    __mj_CreatedAt: now,
    __mj_UpdatedAt: now,
    Binding: `Binding ${id}`,
    ...overrides,
  };
}
