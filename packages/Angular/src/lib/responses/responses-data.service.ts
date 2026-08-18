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
import { RunView, RunViewResult } from '@memberjunction/core';
import type {
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
  mjBizAppsFormsFormVersionEntityType,
  PublishedFormDefinition,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { flattenQuestions } from '../shared/published-questions';
import type { ResponseDetail } from './response-models';
import { buildResponseDetail } from './response-aggregations';

/** DB schema for the Forms tables/views — the IN-subquery view must be qualified. */
const FORMS_SCHEMA = '__mj_BizAppsForms';

/** The answer columns every read of this surface selects. */
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
        ExtraFilter: `FormID='${formId}'`,
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

  /** Loads one response's labelled answers for the detail view. */
  public async loadResponseDetail(
    responseId: string,
    questions: PublishedFormQuestion[],
  ): Promise<ResponseDetail> {
    const [responseRes, answersRes] = (await this.rv.RunViews([
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
    ])) as [
      RunViewResult<mjBizAppsFormsFormResponseEntityType>,
      RunViewResult<mjBizAppsFormsFormResponseAnswerEntityType>,
    ];

    if (!responseRes.Success || !answersRes.Success || responseRes.Results.length === 0) {
      throw new Error(
        responseRes.ErrorMessage || answersRes.ErrorMessage || 'Response not found.',
      );
    }

    return buildResponseDetail(responseRes.Results[0], answersRes.Results, questions);
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
    const res = (await this.rv.RunView({
      EntityName: FORMS_ENTITY.FormVersion,
      ExtraFilter: `ID='${formVersionId}'`,
      ResultType: 'simple',
      Fields: ['ID', 'DefinitionSnapshot'],
    })) as RunViewResult<mjBizAppsFormsFormVersionEntityType>;

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
