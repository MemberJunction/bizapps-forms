/**
 * Forms reporting data service (WP-F).
 *
 * Pure RunView/RunViews + snapshot-parsing — NO new infra (FORMS_BUILD_PLAN §8.1).
 * Loads the reportable forms, then for a selected form: the published snapshot (for
 * question labels/options), the responses, and the answers, and folds them into the
 * `FormReportData` read-model. Stateless and injectable; the dashboard owns selection
 * state.
 *
 * Everything response-shaped — the response/answer reads, the single-response detail, the
 * export pivot's answer rows — is delegated to {@link ResponsesDataService}, which the
 * builder's Responses tab and the Form Response entity-form override consume directly.
 * This service adds the dashboard-only concerns on top: the form picker and the
 * summary/breakdown/funnel aggregations.
 */
import { Injectable, inject } from '@angular/core';
import { RunView, RunViewResult } from '@memberjunction/core';
import type {
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
  mjBizAppsFormsFormVersionEntityType,
  mjBizAppsFormsFormEntityType,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../../shared/entity-names';
import { flattenQuestions } from '../../shared/published-questions';
import type { ResponseDetail } from '../../responses/response-models';
import { buildResponseRows } from '../../responses/response-aggregations';
import { ResponsesDataService } from '../../responses/responses-data.service';
import type { FormReportData, ReportableForm } from '../models/reporting.model';
import {
  buildSummary,
  buildBreakdowns,
  buildFunnel,
} from './reporting-aggregations';

@Injectable()
export class FormsReportingService {
  private readonly rv = new RunView();
  private readonly responses = inject(ResponsesDataService);

  /**
   * Lists forms that have at least one published version, with their latest
   * published version id and COMPLETE response count, for the form picker. Partial
   * (in-progress) autosaves are excluded from the count.
   */
  public async loadReportableForms(): Promise<ReportableForm[]> {
    const [formsRes, versionsRes, responsesRes] = await this.rv.RunViews([
      {
        EntityName: FORMS_ENTITY.Form,
        ResultType: 'simple',
        Fields: ['ID', 'Name'],
        OrderBy: 'Name',
      },
      {
        EntityName: FORMS_ENTITY.FormVersion,
        ExtraFilter: `Status='Published'`,
        ResultType: 'simple',
        Fields: ['ID', 'FormID', 'VersionNumber'],
        OrderBy: 'VersionNumber DESC',
      },
      {
        EntityName: FORMS_ENTITY.FormResponse,
        // Headline response count is COMPLETE-only: in-progress Partial autosaves are not
        // "responses". (Partials still feed the drop-off funnel in loadReport, which reads
        // its own rows.)
        ExtraFilter: `Status='Complete'`,
        ResultType: 'simple',
        Fields: ['ID', 'FormID', 'Status'],
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
   * Loads the full report bundle for a form — across ALL its versions.
   *
   * Responses are scoped by `FormID`, NOT by a single `FormVersionID`. Every response
   * pins the form version that was live at submission, so a form with multiple
   * published versions has responses spread across them; filtering to only the latest
   * version silently hides every response submitted against an earlier one (the "I
   * submitted a response but the dashboard shows nothing" bug). Question labels/options
   * come from the latest published definition; answers map back by `QuestionID`.
   */
  public async loadReport(form: ReportableForm): Promise<FormReportData> {
    const definition = await this.responses.loadDefinition(form.formVersionId);
    const questions = flattenQuestions(definition);
    const { responses, answers } = await this.responses.loadResponsesForForm(form.formId);

    return {
      form,
      questions,
      summary: buildSummary(responses),
      breakdowns: buildBreakdowns(questions, answers),
      funnel: buildFunnel(definition, answers),
      responses: buildResponseRows(responses, answers),
    };
  }

  /** Loads one response's labelled answers for the detail view. */
  public async loadResponseDetail(
    responseId: string,
    questions: PublishedFormQuestion[],
  ): Promise<ResponseDetail> {
    return this.responses.loadResponseDetail(responseId, questions);
  }

  /**
   * Loads all answer rows for a form (across ALL its versions' responses). Used by the
   * export service to pivot responses into a wide matrix.
   */
  public async loadAnswersForForm(
    formId: string,
  ): Promise<mjBizAppsFormsFormResponseAnswerEntityType[]> {
    return this.responses.loadAnswersForForm(formId);
  }
}
