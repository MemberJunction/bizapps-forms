/**
 * CSV/Excel export for the Forms reporting dashboard (WP-F).
 *
 * Reads every Complete response of the form with its answers through `Forms.ListResponses`, page by
 * page (`readResponsesForExport`, bounded), pivots them response × question (`export-pivot.ts`) and
 * hands the sheet to MJ's `ExportService` (`@memberjunction/ng-export-service`) — no bespoke file
 * writing. Columns come from the form's Published definition, the version the list labels with.
 */
import { Injectable, inject } from '@angular/core';
import { ExportService } from '@memberjunction/ng-export-service';
import type { ExportFormat } from '@memberjunction/export-engine';
import { readResponsesForExport, MAX_EXPORT_PAGES } from '../../responses/response-reads';
import { parseDefinitionQuestions } from '../../responses/response-aggregations';
import { MAX_RESPONSE_PAGE_SIZE } from '@mj-biz-apps/forms-entities';
import type { ReportableForm } from '../models/reporting.model';
import { buildExportColumns, buildExportMatrix } from './export-pivot';

/** What an export wrote. `notice` is set when the reader must be told the file is not the whole form. */
export interface ExportOutcome {
  exported: number;
  total: number;
  notice: string | null;
}

@Injectable()
export class FormsReportingExportService {
  private readonly exporter = inject(ExportService);

  /**
   * Export the form's Complete responses, newest first, with a column per non-display question.
   *
   * A form with more responses than one export reads still exports — its earliest responses, since
   * the pages are read oldest first — and the outcome says so in a sentence the dashboard shows; a
   * file that silently held part of the form would be worse than none.
   */
  public async exportResponses(form: ReportableForm, format: ExportFormat): Promise<ExportOutcome> {
    const read = await readResponsesForExport(form.formId);
    const questions = parseDefinitionQuestions(read.definitionJSON, `the export of form ${form.formId}`);
    if (questions === null) {
      throw new Error('This form has no published definition to take the export’s columns from.');
    }
    const answerable = questions.filter((q) => q.type !== 'Statement');

    await this.exporter.exportAndDownload(buildExportMatrix(read.rows, answerable), {
      format,
      columns: buildExportColumns(answerable),
      fileName: `${this.safeName(form.name)}-responses`,
      sheetName: 'Responses',
    });
    return { exported: read.rows.length, total: read.total, notice: read.capped ? cappedNotice(read.rows.length, read.total) : null };
  }

  private safeName(name: string): string {
    return name.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').slice(0, 80) || 'form';
  }
}

/** The sentence a capped export ends with. */
export function cappedNotice(exported: number, total: number): string {
  const limit = (MAX_RESPONSE_PAGE_SIZE * MAX_EXPORT_PAGES).toLocaleString();
  return (
    `The file holds the earliest ${exported.toLocaleString()} of this form’s ${total.toLocaleString()} responses: ` +
    `one export reads at most ${limit}.`
  );
}
