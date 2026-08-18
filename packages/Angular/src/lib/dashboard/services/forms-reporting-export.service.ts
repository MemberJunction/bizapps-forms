/**
 * CSV/Excel export for the Forms reporting dashboard (WP-F).
 *
 * Wraps MJ's `ExportService` (`@memberjunction/ng-export-service`) — no bespoke file
 * writing. The response × question matrix itself is built by the pure helpers in
 * `export-pivot.ts`; this service only chooses format and filename.
 */
import { Injectable, inject } from '@angular/core';
import { ExportService } from '@memberjunction/ng-export-service';
import type { ExportFormat } from '@memberjunction/export-engine';
import type { mjBizAppsFormsFormResponseAnswerEntityType } from '@mj-biz-apps/forms-entities';
import type { FormReportData } from '../models/reporting.model';
import { buildExportColumns, buildExportMatrix, scoredQuestionIds } from './export-pivot';

type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

@Injectable()
export class FormsReportingExportService {
  private readonly exporter = inject(ExportService);

  /**
   * Exports the response matrix for a report. The caller supplies the raw answer rows (the
   * dashboard already holds them) so we can pivot to one row per response with a column per
   * non-display question, plus a score column for each question the AI actually scored.
   */
  public async exportResponses(
    report: FormReportData,
    answers: AnswerRow[],
    format: ExportFormat,
  ): Promise<void> {
    const questions = report.questions.filter((q) => q.type !== 'Statement');
    const scored = scoredQuestionIds(answers);

    await this.exporter.exportAndDownload(
      buildExportMatrix(report.responses, questions, answers, scored),
      {
        format,
        columns: buildExportColumns(questions, scored),
        fileName: `${this.safeName(report.form.name)}-responses`,
        sheetName: 'Responses',
      },
    );
  }

  private safeName(name: string): string {
    return name.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').slice(0, 80) || 'form';
  }
}
