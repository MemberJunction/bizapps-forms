/**
 * Reads for the individual-response surface (list + detail).
 *
 * Extracted from `FormsReportingService` so the same queries serve all three mounts — the
 * reporting dashboard's Responses tab, the builder's Responses tab, and the Form Response
 * entity-form override. Pure RunView/RunViews; the callers own selection state.
 *
 * Two invariants here were bought with production bugs — do not "simplify" either away:
 *
 *  1. The `vwFormResponses` view inside an IN-subquery filter MUST be schema-qualified. The
 *     connection's default schema is not `__mj_BizAppsForms`, so a bare name resolves
 *     against `dbo` and throws "Invalid object name 'vwFormResponses'".
 *  2. Responses are scoped by `FormID`, never by a single `FormVersionID`. Every response
 *     pins the version that was live at submission, so a form with several published
 *     versions has responses spread across them; filtering to the latest version silently
 *     hides every response submitted against an earlier one.
 */
import { Injectable } from '@angular/core';
import { LogError, Metadata, RunView, RunViewResult } from '@memberjunction/core';
import type { RunViewParams } from '@memberjunction/core';
import type {
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
  mjBizAppsFormsFormVersionEntityType,
  mjBizAppsFormsFormUploadEntityType,
  mjBizAppsFormsFormAutomationRunEntityType,
  mjBizAppsFormsFormEntityBindingRecordEntityType,
  PublishedFormDefinition,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { flattenQuestions } from '../shared/published-questions';
import type { ResponseDetail } from './response-models';
import { buildResponseDetail } from './response-aggregations';

/** DB schema for the Forms tables/views — the IN-subquery view must be qualified. */
const FORMS_SCHEMA = '__mj_BizAppsForms';

/** The answer columns the list/export reads select. */
const ANSWER_FIELDS = [
  'ID',
  'ResponseID',
  'QuestionID',
  'TextValue',
  'NumericValue',
  'DateValue',
  'BooleanValue',
  'JSONValue',
  'FileID',
] as const;

/** The response columns every read of this surface selects. */
const RESPONSE_FIELDS = [
  'ID',
  'Status',
  'StartedAt',
  'SubmittedAt',
  'RespondentPerson',
  'AnonymousSessionID',
] as const;

/**
 * Build the answers `ExtraFilter` that scopes to a form's responses across all versions.
 * See invariant (1) in the class doc. Exported for unit testing.
 */
export function answersForFormFilter(formId: string): string {
  return `ResponseID IN (SELECT ID FROM ${FORMS_SCHEMA}.vwFormResponses WHERE FormID='${formId}')`;
}

/**
 * Build the responses `ExtraFilter` for a form. A named function rather than an inline
 * template so invariant (2) — scope by FormID, never FormVersionID — is something a test
 * can hold onto. Exported for unit testing.
 */
export function responsesForFormFilter(formId: string): string {
  return `FormID='${formId}'`;
}

/**
 * Build the uploads `ExtraFilter` for a set of answer `FileID`s. De-duplicates, because
 * two answers can legitimately reference the same stored file. Returns null for an empty
 * set — the caller must skip the query rather than emit `IN ()`, which is a syntax error.
 * Exported for unit testing.
 */
export function uploadsForFileIdsFilter(fileIds: readonly string[]): string | null {
  const unique = [...new Set(fileIds)];
  if (unique.length === 0) {
    return null;
  }
  return `FileID IN (${unique.map((id) => `'${id}'`).join(',')})`;
}

/**
 * The read that turns a response's pinned `FormVersionID` into the definition its answers are
 * labelled from — BY ID, never by status.
 *
 * That distinction became load-bearing with #82: publishing now retires the version it replaces,
 * so most versions carrying responses are `Retired`, and a `Status='Published'` predicate added
 * here would blank the labels on every response older than the current version. Exported so a test
 * can hold the predicate to exactly the id.
 */
export function definitionForVersionQuery(formVersionId: string): RunViewParams {
  return {
    EntityName: FORMS_ENTITY.FormVersion,
    ExtraFilter: `ID='${formVersionId}'`,
    ResultType: 'simple',
    Fields: ['ID', 'DefinitionSnapshot'],
  };
}

/**
 * The four reads that make up a response's detail, batched into one `RunViews` call.
 *
 * A pure function returning the params rather than an inline literal, so a test can assert
 * WHICH entities are read and WHICH columns are asked for — a silently-missing column is a
 * class of bug nothing else here would catch. Exported for unit testing.
 */
export function responseDetailQueries(responseId: string): RunViewParams[] {
  return [
    {
      EntityName: FORMS_ENTITY.FormResponse,
      ExtraFilter: `ID='${responseId}'`,
      ResultType: 'simple',
      Fields: [...RESPONSE_FIELDS],
    },
    {
      EntityName: FORMS_ENTITY.FormResponseAnswer,
      ExtraFilter: `ResponseID='${responseId}'`,
      ResultType: 'simple',
      Fields: [...ANSWER_FIELDS],
    },
    {
      EntityName: FORMS_ENTITY.FormAutomationRun,
      ExtraFilter: `FormResponseID='${responseId}'`,
      ResultType: 'simple',
      // FormAutomation is the base view's denormalised automation name — no second read.
      Fields: [
        'ID',
        'FormAutomationID',
        'FormAutomation',
        'Status',
        'AttemptCount',
        'StartedAt',
        'CompletedAt',
        'ErrorMessage',
        'OutputSummary',
        'ActionExecutionLogID',
        'AIAgentRunID',
      ],
      OrderBy: '__mj_CreatedAt',
    },
    {
      EntityName: FORMS_ENTITY.FormEntityBindingRecord,
      ExtraFilter: `FormResponseID='${responseId}'`,
      ResultType: 'simple',
      Fields: [
        'ID',
        'BindingID',
        'Binding',
        'TargetEntityID',
        'TargetRecordID',
        'Outcome',
        'WrittenFields',
      ],
      OrderBy: '__mj_CreatedAt',
    },
  ];
}

/** The responses + answers of one form, as fetched (aggregation happens in pure builders). */
export interface FormResponseRows {
  responses: mjBizAppsFormsFormResponseEntityType[];
  answers: mjBizAppsFormsFormResponseAnswerEntityType[];
}

@Injectable()
export class ResponsesDataService {
  private readonly rv = new RunView();

  /**
   * Loads every response of a form (across ALL its versions) together with their answers.
   * Batched into one round trip — see invariant (2) for why the scope is `FormID`.
   */
  public async loadResponsesForForm(formId: string): Promise<FormResponseRows> {
    const [responsesRes, answersRes] = (await this.rv.RunViews([
      {
        EntityName: FORMS_ENTITY.FormResponse,
        ExtraFilter: responsesForFormFilter(formId),
        ResultType: 'simple',
        Fields: [...RESPONSE_FIELDS],
        OrderBy: 'SubmittedAt DESC',
      },
      {
        EntityName: FORMS_ENTITY.FormResponseAnswer,
        ExtraFilter: answersForFormFilter(formId),
        ResultType: 'simple',
        Fields: [...ANSWER_FIELDS],
      },
    ])) as [
      RunViewResult<mjBizAppsFormsFormResponseEntityType>,
      RunViewResult<mjBizAppsFormsFormResponseAnswerEntityType>,
    ];

    if (!responsesRes.Success || !answersRes.Success) {
      throw new Error(
        responsesRes.ErrorMessage || answersRes.ErrorMessage || 'Failed to load responses.',
      );
    }
    return { responses: responsesRes.Results, answers: answersRes.Results };
  }

  /**
   * Loads one response's full detail: its labelled answers (with AI scores and the files
   * behind file answers) plus what the submission triggered — automation attempts and the
   * business records they wrote.
   *
   * Two round trips, not five. The first batches everything keyed on the response id; the
   * uploads join needs the answers' `FileID`s, so it can only run once they are back — and
   * is skipped entirely when no answer references a file, which is the common case.
   */
  public async loadResponseDetail(
    responseId: string,
    questions: PublishedFormQuestion[],
  ): Promise<ResponseDetail> {
    const [responseRes, answersRes, runsRes, bindingRes] = (await this.rv.RunViews(
      responseDetailQueries(responseId),
    )) as [
      RunViewResult<mjBizAppsFormsFormResponseEntityType>,
      RunViewResult<mjBizAppsFormsFormResponseAnswerEntityType>,
      RunViewResult<mjBizAppsFormsFormAutomationRunEntityType>,
      RunViewResult<mjBizAppsFormsFormEntityBindingRecordEntityType>,
    ];

    if (!responseRes.Success || !answersRes.Success || responseRes.Results.length === 0) {
      throw new Error(
        responseRes.ErrorMessage || answersRes.ErrorMessage || 'Response not found.',
      );
    }
    // The response and its answers are the page. The satellite sections are context, so a
    // failure there (typically a role without Read on that entity) degrades to "this
    // section is unavailable" rather than costing the user every answer they came to read.
    // Nothing is swallowed: each failure is logged with the response id and named in the UI.
    const unavailableSections: string[] = [];
    const runs = this.resultsOrDegrade(runsRes, 'automation runs', responseId, unavailableSections);
    const bindings = this.resultsOrDegrade(
      bindingRes,
      'created records',
      responseId,
      unavailableSections,
    );

    const answers = answersRes.Results;
    return buildResponseDetail({
      response: responseRes.Results[0],
      answers,
      questions,
      uploads: await this.loadUploadsForAnswers(answers, responseId, unavailableSections),
      automationRuns: runs,
      bindingRecords: bindings,
      entityNameById: this.resolveEntityNames(bindings),
      unavailableSections,
    });
  }

  /**
   * A satellite section's rows, or `[]` with the section recorded as unavailable.
   *
   * Logged, never silent — `.Success === false` here is nearly always a missing Read grant,
   * and an admin debugging "why is this section empty" needs the entity name and the reason.
   */
  private resultsOrDegrade<T>(
    result: RunViewResult<T>,
    sectionName: string,
    responseId: string,
    unavailableSections: string[],
  ): T[] {
    if (result.Success) {
      return result.Results;
    }
    unavailableSections.push(sectionName);
    LogError(
      `ResponsesDataService: could not read ${sectionName} for response ${responseId} — ` +
        `${result.ErrorMessage || 'no error message'}. Rendering the response without them.`,
    );
    return [];
  }

  /**
   * Provenance rows for the files these answers reference. Returns `[]` without querying
   * when no answer holds a `FileID` — the overwhelmingly common case for a form with no
   * upload question.
   */
  private async loadUploadsForAnswers(
    answers: mjBizAppsFormsFormResponseAnswerEntityType[],
    responseId: string,
    unavailableSections: string[],
  ): Promise<mjBizAppsFormsFormUploadEntityType[]> {
    const filter = uploadsForFileIdsFilter(
      answers.map((a) => a.FileID).filter((id): id is string => !!id),
    );
    if (filter === null) {
      return [];
    }
    const res = (await this.rv.RunView({
      EntityName: FORMS_ENTITY.FormUpload,
      ExtraFilter: filter,
      ResultType: 'simple',
      Fields: ['ID', 'FileID', 'FileName', 'ContentType', 'SizeBytes', 'Status'],
    })) as RunViewResult<mjBizAppsFormsFormUploadEntityType>;
    // Degrades rather than throws, which is also what makes `ResponseFileView.isResolved`
    // reachable: an unreadable provenance row now renders as a named-but-unresolved file
    // instead of failing the whole response, which is what that flag always claimed.
    return this.resultsOrDegrade(res, 'file details', responseId, unavailableSections);
  }

  /**
   * `TargetEntityID` → canonical entity name for the binding ledger.
   *
   * The column is deliberately NOT a foreign key (the ledger points at arbitrary entities),
   * so the view carries no denormalised name and there is nothing to join. Metadata is
   * already loaded client-side, so this is an in-memory O(1) lookup per row, not a query.
   *
   * `Name`, not `DisplayName`: this value is also what a deep link navigates by, and
   * `OpenEntityRecord` / `Navigate` resolve entities by their canonical name. An id
   * metadata cannot name is left out, and the row renders without a link.
   */
  private resolveEntityNames(
    records: mjBizAppsFormsFormEntityBindingRecordEntityType[],
  ): ReadonlyMap<string, string> {
    const md = new Metadata();
    const names = new Map<string, string>();
    for (const r of records) {
      if (names.has(r.TargetEntityID)) {
        continue;
      }
      const entity = md.EntityByID(r.TargetEntityID);
      if (entity) {
        names.set(r.TargetEntityID, entity.Name);
      }
    }
    return names;
  }

  /**
   * Loads all answer rows for a form (across ALL its versions' responses). Used by the
   * export service to pivot responses into a wide matrix.
   */
  public async loadAnswersForForm(
    formId: string,
  ): Promise<mjBizAppsFormsFormResponseAnswerEntityType[]> {
    const res = (await this.rv.RunView({
      EntityName: FORMS_ENTITY.FormResponseAnswer,
      ExtraFilter: answersForFormFilter(formId),
      ResultType: 'simple',
      Fields: [...ANSWER_FIELDS],
    })) as RunViewResult<mjBizAppsFormsFormResponseAnswerEntityType>;
    if (!res.Success) {
      throw new Error(res.ErrorMessage || 'Failed to load answers.');
    }
    return res.Results;
  }

  /** Loads + parses the published `DefinitionSnapshot` for a version. */
  public async loadDefinition(formVersionId: string): Promise<PublishedFormDefinition> {
    const res = (await this.rv.RunView(
      definitionForVersionQuery(formVersionId),
    )) as RunViewResult<mjBizAppsFormsFormVersionEntityType>;

    if (!res.Success || res.Results.length === 0) {
      throw new Error(res.ErrorMessage || 'Form version not found.');
    }
    const snapshot = res.Results[0].DefinitionSnapshot;
    if (!snapshot) {
      throw new Error('This form version has no published definition snapshot.');
    }
    return JSON.parse(snapshot) as PublishedFormDefinition;
  }

  /** Question labels/options from a published version, flattened in page order. */
  public async loadQuestionsForVersion(
    formVersionId: string,
  ): Promise<PublishedFormQuestion[]> {
    return flattenQuestions(await this.loadDefinition(formVersionId));
  }

  /**
   * Question labels/options from a form's LATEST published version, or `null` when the form
   * has never been published.
   *
   * Null is the answer, not an error: a form with no published version cannot have
   * responses either, and the caller renders "publish this form first" rather than a
   * failure. Answers submitted against an earlier version still map back by `QuestionID`;
   * a question deleted since simply has no label and is skipped, which is the same
   * behaviour the reporting dashboard has always had.
   */
  public async loadLatestPublishedQuestions(
    formId: string,
  ): Promise<PublishedFormQuestion[] | null> {
    const res = (await this.rv.RunView({
      EntityName: FORMS_ENTITY.FormVersion,
      ExtraFilter: `FormID='${formId}' AND Status='Published'`,
      ResultType: 'simple',
      Fields: ['ID', 'VersionNumber'],
      OrderBy: 'VersionNumber DESC',
    })) as RunViewResult<mjBizAppsFormsFormVersionEntityType>;

    if (!res.Success) {
      throw new Error(res.ErrorMessage || 'Failed to load the published form version.');
    }
    if (res.Results.length === 0) {
      return null;
    }
    return this.loadQuestionsForVersion(res.Results[0].ID);
  }
}
