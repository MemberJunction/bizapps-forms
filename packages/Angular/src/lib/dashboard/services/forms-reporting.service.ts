/**
 * Forms reporting data service (WP-F).
 *
 * Two reads, the dashboard owning selection state:
 *  - the form picker: the reportable forms (a published version each) and their Complete counts,
 *    counted on the server through the shared counter (`loadCompleteResponseCounts`), so the rail and
 *    the Forms home grid can never disagree about what "a response" is;
 *  - the selected form's report: ONE operation, `Forms.GetResponseSummary` (#303), which computes
 *    every section on the server from every response and returns aggregates only. The dashboard no
 *    longer downloads a single response or answer row to draw a chart.
 *
 * Individual responses (the Responses view, the export) are read through `response-reads.ts`.
 */
import { Injectable } from '@angular/core';
import { RunView, RunViewResult } from '@memberjunction/core';
import {
  FormsGetResponseSummaryOperation,
  type mjBizAppsFormsFormEntityType,
  type mjBizAppsFormsFormVersionEntityType,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../../shared/entity-names';
import { loadCompleteResponseCounts } from '../../shared/complete-response-counts';
import { runOperation } from '../../shared/remote-operation';
import type { FormReportData, ReportableForm } from '../models/reporting.model';
import { toFormReport } from './report-view';

/**
 * The selected form's report, or the reason it is not this reader's to see.
 *
 * `unavailable` is not a failure. The operation refuses the summary, as `FORBIDDEN`, to a caller it
 * may not compute it for — one without read access to responses, or one whose access is
 * row-restricted (the summary would otherwise count rows they cannot read) — and the dashboard says
 * "not available to you" rather than putting an error banner over a form that is working. The two
 * cases are not told apart, so the wording promises nothing about what else the reader can see.
 */
export type ReportLoad =
  | { status: 'ready'; report: FormReportData }
  | { status: 'unavailable'; message: string };

/** What the dashboard tells a reader the summary is refused to. */
export const SUMMARY_UNAVAILABLE_TO_YOU = 'A summary of this form’s responses is not available to you.';

@Injectable()
export class FormsReportingService {
  private readonly rv = new RunView();

  /**
   * Lists forms that have at least one published version, with their latest
   * published version id and COMPLETE response count, for the form picker. The count
   * is computed server-side, for the listed forms only.
   */
  public async loadReportableForms(): Promise<ReportableForm[]> {
    const [formsRes, versionsRes] = await this.rv.RunViews([
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
    ]) as [
      RunViewResult<mjBizAppsFormsFormEntityType>,
      RunViewResult<mjBizAppsFormsFormVersionEntityType>,
    ];

    if (!formsRes.Success || !versionsRes.Success) {
      throw new Error(
        formsRes.ErrorMessage || versionsRes.ErrorMessage || 'Failed to load reportable forms.',
      );
    }

    const latestVersionByForm = new Map<string, string>();
    for (const v of versionsRes.Results) {
      // Versions are ordered DESC, so the first seen per form is the latest.
      if (!latestVersionByForm.has(v.FormID)) {
        latestVersionByForm.set(v.FormID, v.ID);
      }
    }

    const reportable: Omit<ReportableForm, 'responseCount'>[] = [];
    for (const f of formsRes.Results) {
      const formVersionId = latestVersionByForm.get(f.ID);
      if (formVersionId) {
        reportable.push({ formId: f.ID, formVersionId, name: f.Name });
      }
    }

    const counts = await loadCompleteResponseCounts(
      this.rv,
      reportable.map((f) => f.formId),
    );
    return reportable.map((f) => {
      // The counter already guarantees an entry per id; this re-check only narrows the type,
      // and refuses to show an invented zero if that guarantee ever breaks.
      const responseCount = counts.get(f.formId);
      if (responseCount === undefined) {
        throw new Error(`No Complete-response count came back for form ${f.formId}.`);
      }
      return { ...f, responseCount };
    });
  }

  /**
   * The report for a form — across ALL its versions, labelled from its Published one — computed on
   * the server. Any refusal other than "not yours to see" THROWS with the server's message.
   */
  public async loadReport(form: ReportableForm): Promise<ReportLoad> {
    const outcome = await runOperation(
      new FormsGetResponseSummaryOperation(),
      { FormID: form.formId },
      `reading the response summary of form ${form.formId}`,
    );
    if (outcome.ok) {
      return { status: 'ready', report: toFormReport(form, outcome.output) };
    }
    // By result code alone: FORBIDDEN is the operation refusing this reader. Any other refusal is a
    // failure, whatever its text says.
    if (outcome.resultCode === 'FORBIDDEN') {
      return { status: 'unavailable', message: SUMMARY_UNAVAILABLE_TO_YOU };
    }
    throw new Error(outcome.error);
  }
}
