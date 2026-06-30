/**
 * Forms reporting data service (WP-F).
 *
 * Pure RunView/RunViews + snapshot-parsing — NO new infra (FORMS_BUILD_PLAN §8.1).
 * Loads the reportable forms, then for a selected form version: the published
 * snapshot (for question labels/options), the responses, and the answers, and
 * folds them into the `FormReportData` read-model. Stateless and injectable; the
 * dashboard owns selection state.
 */
import { Injectable } from '@angular/core';
import { RunView, RunViewResult } from '@memberjunction/core';
import type {
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
  mjBizAppsFormsFormVersionEntityType,
  mjBizAppsFormsFormEntityType,
  PublishedFormDefinition,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import type {
  FormReportData,
  ReportableForm,
  ResponseDetail,
} from '../models/reporting.model';
import {
  flattenQuestions,
  buildSummary,
  buildBreakdowns,
  buildFunnel,
  buildResponseRows,
  buildResponseDetail,
} from './reporting-aggregations';

/** Entity names (PHASE1_DECOMPOSITION entity-name table). */
const ENTITY = {
  forms: 'MJ_BizApps_Forms: Forms',
  versions: 'MJ_BizApps_Forms: Form Versions',
  responses: 'MJ_BizApps_Forms: Form Responses',
  answers: 'MJ_BizApps_Forms: Form Response Answers',
} as const;

@Injectable()
export class FormsReportingService {
  private readonly rv = new RunView();

  /**
   * Lists forms that have at least one published version, with their latest
   * published version id and total response count, for the form picker.
   */
  public async loadReportableForms(): Promise<ReportableForm[]> {
    const [formsRes, versionsRes, responsesRes] = await this.rv.RunViews([
      {
        EntityName: ENTITY.forms,
        ResultType: 'simple',
        Fields: ['ID', 'Name'],
        OrderBy: 'Name',
      },
      {
        EntityName: ENTITY.versions,
        ExtraFilter: `Status='Published'`,
        ResultType: 'simple',
        Fields: ['ID', 'FormID', 'VersionNumber'],
        OrderBy: 'VersionNumber DESC',
      },
      {
        EntityName: ENTITY.responses,
        ResultType: 'simple',
        Fields: ['ID', 'FormID'],
      },
    ]) as [
      RunViewResult<mjBizAppsFormsFormEntityType>,
      RunViewResult<mjBizAppsFormsFormVersionEntityType>,
      RunViewResult<mjBizAppsFormsFormResponseEntityType>,
    ];

    if (!formsRes.Success || !versionsRes.Success || !responsesRes.Success) {
      throw new Error(
        formsRes.ErrorMessage ||
          versionsRes.ErrorMessage ||
          responsesRes.ErrorMessage ||
          'Failed to load reportable forms.',
      );
    }

    const latestVersionByForm = new Map<string, string>();
    for (const v of versionsRes.Results) {
      // Versions are ordered DESC, so the first seen per form is the latest.
      if (!latestVersionByForm.has(v.FormID)) {
        latestVersionByForm.set(v.FormID, v.ID);
      }
    }

    const responseCountByForm = new Map<string, number>();
    for (const r of responsesRes.Results) {
      responseCountByForm.set(r.FormID, (responseCountByForm.get(r.FormID) ?? 0) + 1);
    }

    const out: ReportableForm[] = [];
    for (const f of formsRes.Results) {
      const formVersionId = latestVersionByForm.get(f.ID);
      if (!formVersionId) {
        continue; // skip forms with no published version
      }
      out.push({
        formId: f.ID,
        formVersionId,
        name: f.Name,
        responseCount: responseCountByForm.get(f.ID) ?? 0,
      });
    }
    return out;
  }

  /**
   * Loads the full report bundle for one published form version.
   */
  public async loadReport(form: ReportableForm): Promise<FormReportData> {
    const definition = await this.loadDefinition(form.formVersionId);
    const questions = flattenQuestions(definition);

    const [responsesRes, answersRes] = await this.rv.RunViews([
      {
        EntityName: ENTITY.responses,
        ExtraFilter: `FormVersionID='${form.formVersionId}'`,
        ResultType: 'simple',
        Fields: [
          'ID',
          'Status',
          'StartedAt',
          'SubmittedAt',
          'RespondentPerson',
          'AnonymousSessionID',
        ],
        OrderBy: 'SubmittedAt DESC',
      },
      {
        EntityName: ENTITY.answers,
        ExtraFilter: `ResponseID IN (SELECT ID FROM ${this.responsesViewName()} WHERE FormVersionID='${form.formVersionId}')`,
        ResultType: 'simple',
        Fields: [
          'ID',
          'ResponseID',
          'QuestionID',
          'TextValue',
          'NumericValue',
          'DateValue',
          'BooleanValue',
          'JSONValue',
          'FileID',
        ],
      },
    ]) as [
      RunViewResult<mjBizAppsFormsFormResponseEntityType>,
      RunViewResult<mjBizAppsFormsFormResponseAnswerEntityType>,
    ];

    if (!responsesRes.Success || !answersRes.Success) {
      throw new Error(
        responsesRes.ErrorMessage ||
          answersRes.ErrorMessage ||
          'Failed to load responses.',
      );
    }

    const responses = responsesRes.Results;
    const answers = answersRes.Results;

    return {
      form,
      questions,
      summary: buildSummary(responses),
      breakdowns: buildBreakdowns(questions, answers),
      funnel: buildFunnel(definition, answers),
      responses: buildResponseRows(responses, answers),
    };
  }

  /**
   * Loads one response's labelled answers for the detail view.
   */
  public async loadResponseDetail(
    responseId: string,
    questions: PublishedFormQuestion[],
  ): Promise<ResponseDetail> {
    const [responseRes, answersRes] = await this.rv.RunViews([
      {
        EntityName: ENTITY.responses,
        ExtraFilter: `ID='${responseId}'`,
        ResultType: 'simple',
        Fields: ['ID', 'Status', 'StartedAt', 'SubmittedAt', 'RespondentPerson', 'AnonymousSessionID'],
      },
      {
        EntityName: ENTITY.answers,
        ExtraFilter: `ResponseID='${responseId}'`,
        ResultType: 'simple',
        Fields: ['ID', 'ResponseID', 'QuestionID', 'TextValue', 'NumericValue', 'DateValue', 'BooleanValue', 'JSONValue', 'FileID'],
      },
    ]) as [
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
   * Loads all answer rows for a form version (across its responses). Used by the
   * export service to pivot responses into a wide matrix.
   */
  public async loadAnswersForVersion(
    formVersionId: string,
  ): Promise<mjBizAppsFormsFormResponseAnswerEntityType[]> {
    const res = (await this.rv.RunView({
      EntityName: ENTITY.answers,
      ExtraFilter: `ResponseID IN (SELECT ID FROM ${this.responsesViewName()} WHERE FormVersionID='${formVersionId}')`,
      ResultType: 'simple',
      Fields: [
        'ID',
        'ResponseID',
        'QuestionID',
        'TextValue',
        'NumericValue',
        'DateValue',
        'BooleanValue',
        'JSONValue',
        'FileID',
      ],
    })) as RunViewResult<mjBizAppsFormsFormResponseAnswerEntityType>;
    if (!res.Success) {
      throw new Error(res.ErrorMessage || 'Failed to load answers.');
    }
    return res.Results;
  }

  /** Loads + parses the published `DefinitionSnapshot` for a version. */
  private async loadDefinition(formVersionId: string): Promise<PublishedFormDefinition> {
    const res = (await this.rv.RunView({
      EntityName: ENTITY.versions,
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

  /** The DB view name backing the responses entity (for the IN subquery). */
  private responsesViewName(): string {
    return 'vwFormResponses';
  }
}
