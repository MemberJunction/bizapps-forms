/**
 * `FormsReportingExportService.exportResponses` exercised as a class (#246).
 *
 * The export pivots the answer rows the REPORT carries. It used to take them as a separate
 * argument, which is what made the dashboard re-read every answer of the form just to hold them
 * for this call. MJ's `ExportService` is replaced by a fake that records what it was handed.
 */
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, it, expect } from 'vitest';
import { ExportService } from '@memberjunction/ng-export-service';
import type { ExportData, ExportOptions, ExportResult } from '@memberjunction/export-engine';
import { FormsReportingExportService } from './forms-reporting-export.service';
import { buildExportMatrix } from './export-pivot';
import { mockReport } from './forms-reporting-mock';

class FakeExporter {
  public readonly calls: { data: ExportData; options?: Partial<ExportOptions> }[] = [];

  public async exportAndDownload(
    data: ExportData,
    options?: Partial<ExportOptions>,
  ): Promise<ExportResult> {
    this.calls.push({ data, options });
    return { success: true };
  }
}

function make(): { fake: FakeExporter; svc: FormsReportingExportService } {
  const fake = new FakeExporter();
  const injector = Injector.create({ providers: [{ provide: ExportService, useValue: fake }] });
  return { fake, svc: runInInjectionContext(injector, () => new FormsReportingExportService()) };
}

describe('FormsReportingExportService.exportResponses', () => {
  it('pivots the answer rows the report carries, with no separate answers argument', async () => {
    const { fake, svc } = make();
    const report = mockReport();
    const questions = report.questions.filter((q) => q.type !== 'Statement');

    await svc.exportResponses(report, 'csv');

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].options?.format).toBe('csv');
    expect(fake.calls[0].data).toEqual(buildExportMatrix(report.responses, questions, report.answers));
  });

  it('exports real answer cells in mock mode, not a sheet of blanks', async () => {
    const { fake, svc } = make();
    const report = mockReport();
    const questionIds = report.questions.filter((q) => q.type !== 'Statement').map((q) => q.id);

    await svc.exportResponses(report, 'csv');

    // Only the question columns count: the fixed response columns are never blank, so a sheet
    // whose every answer cell is empty would still pass a check over the whole row.
    const answerCells = fake.calls[0].data.flatMap((row) =>
      Array.isArray(row) ? [] : questionIds.map((id) => row[id]),
    );
    expect(answerCells.some((cell) => cell !== '' && cell != null)).toBe(true);
  });
});
