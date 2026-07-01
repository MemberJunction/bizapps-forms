/**
 * CSV/Excel export for the Forms reporting dashboard (WP-F).
 *
 * Wraps MJ's `ExportService` (`@memberjunction/ng-export-service`) — no bespoke
 * file writing. Builds a flat response x question matrix (one row per response,
 * one column per question) so the export is analysis-ready in Excel/CSV.
 */
import { Injectable, inject } from '@angular/core';
import { ExportService } from '@memberjunction/ng-export-service';
import type { ExportData, ExportColumn, ExportFormat } from '@memberjunction/export-engine';
import type {
  mjBizAppsFormsFormResponseAnswerEntityType,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import type { FormReportData } from '../models/reporting.model';
import { renderAnswer } from './reporting-aggregations';

type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

@Injectable()
export class FormsReportingExportService {
  private readonly exporter = inject(ExportService);

  /**
   * Exports the response matrix for a report. The caller supplies the raw
   * answer rows (the dashboard already holds them) so we can pivot to one row
   * per response with a column per non-display question.
   */
  public async exportResponses(
    report: FormReportData,
    answers: AnswerRow[],
    format: ExportFormat,
  ): Promise<void> {
    const questions = report.questions.filter((q) => q.type !== 'Statement');
    const columns = this.buildColumns(questions);
    const data = this.buildMatrix(report, questions, answers);
    const fileName = `${this.safeName(report.form.name)}-responses`;

    await this.exporter.exportAndDownload(data, {
      format,
      columns,
      fileName,
      sheetName: 'Responses',
    });
  }

  private buildColumns(questions: PublishedFormQuestion[]): ExportColumn[] {
    const cols: ExportColumn[] = [
      { name: 'responseId', displayName: 'Response ID', dataType: 'string' },
      { name: 'status', displayName: 'Status', dataType: 'string' },
      { name: 'startedAt', displayName: 'Started At', dataType: 'date' },
      { name: 'submittedAt', displayName: 'Submitted At', dataType: 'date' },
      { name: 'respondent', displayName: 'Respondent', dataType: 'string' },
    ];
    for (const q of questions) {
      cols.push({ name: q.id, displayName: q.prompt, dataType: 'string' });
    }
    return cols;
  }

  private buildMatrix(
    report: FormReportData,
    questions: PublishedFormQuestion[],
    answers: AnswerRow[],
  ): ExportData {
    const answersByResponse = new Map<string, AnswerRow[]>();
    for (const a of answers) {
      const arr = answersByResponse.get(a.ResponseID);
      if (arr) arr.push(a);
      else answersByResponse.set(a.ResponseID, [a]);
    }

    const rows: ExportData = [];
    for (const r of report.responses) {
      const row: Record<string, unknown> = {
        responseId: r.responseId,
        status: r.status,
        startedAt: r.startedAt,
        submittedAt: r.submittedAt,
        respondent: r.respondent,
      };
      const answerByQuestion = new Map<string, AnswerRow>();
      for (const a of answersByResponse.get(r.responseId) ?? []) {
        answerByQuestion.set(a.QuestionID, a);
      }
      for (const q of questions) {
        const a = answerByQuestion.get(q.id);
        row[q.id] = a ? renderAnswer(q, a) : '';
      }
      rows.push(row);
    }
    return rows;
  }

  private safeName(name: string): string {
    return name.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').slice(0, 80) || 'form';
  }
}
