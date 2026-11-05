/**
 * `FormsReportingExportService.exportResponses` exercised as a class (#303): it pages the form's
 * responses in through `Forms.ListResponses` (REAL generated class, provider faked) and hands MJ's
 * `ExportService` (faked, recording what it was given) one sheet. It used to pivot the answer rows
 * the report carried — every answer of the form, downloaded on every selection (#246); now nothing
 * is read until the reader asks for a file.
 */
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { ExportService } from '@memberjunction/ng-export-service';
import type { ExportData, ExportOptions, ExportResult } from '@memberjunction/export-engine';
import {
  MAX_RESPONSE_PAGE_SIZE,
  type FormsListResponsesInput,
  type FormsListResponsesOutput,
  type FormsResponseListRow,
} from '@mj-biz-apps/forms-entities';
import { installFakeOperations, succeeded, type FakeOperations } from '../../shared/testing/fake-operations';
import { q } from '../../shared/testing/entity-row-fixtures';
import type { ReportableForm } from '../models/reporting.model';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: vi.fn() };
});

const { FormsReportingExportService, cappedNotice } = await import('./forms-reporting-export.service');
const { MAX_EXPORT_PAGES } = await import('../../responses/response-reads');

class FakeExporter {
  public readonly calls: { data: ExportData; options?: Partial<ExportOptions> }[] = [];

  public async exportAndDownload(data: ExportData, options?: Partial<ExportOptions>): Promise<ExportResult> {
    this.calls.push({ data, options });
    return { success: true };
  }
}

function make(): { fake: FakeExporter; svc: InstanceType<typeof FormsReportingExportService> } {
  const fake = new FakeExporter();
  const injector = Injector.create({ providers: [{ provide: ExportService, useValue: fake }] });
  return { fake, svc: runInInjectionContext(injector, () => new FormsReportingExportService()) };
}

const FORM: ReportableForm = { formId: 'form-1', formVersionId: 'ver-1', name: 'Event feedback / 2026', responseCount: 2 };
const DEFINITION = JSON.stringify({
  pages: [{ id: 'p1', displayOrder: 0, questions: [q('q-intro', 'Statement', 0), q('q-text', 'LongText', 1)] }],
});

function row(n: number): FormsResponseListRow {
  return {
    ResponseID: `r-${n}`,
    Status: 'Complete',
    FormVersionID: 'ver-1',
    StartedAt: null,
    SubmittedAt: null,
    RespondentPersonID: null,
    Respondent: `P${n}`,
    AnsweredCount: 1,
    Answers: [{ ID: `a-${n}`, QuestionID: 'q-text', TextValue: `answer ${n}`, NumericValue: null, DateValue: null, BooleanValue: null, JSONValue: null, FileID: null }],
  };
}

let operations: FakeOperations | null = null;
afterEach(() => {
  operations?.restore();
  operations = null;
});

/** `definitionJSON: null` serves pages with no definition, as for a form with no Published version. */
function serve(total: number, definitionJSON: string | null = DEFINITION): FakeOperations {
  return installFakeOperations((_key, raw) => {
    const input = raw as FormsListResponsesInput;
    const count = Math.max(0, Math.min(input.MaxRows, total - input.StartRow));
    const output: FormsListResponsesOutput = {
      Rows: Array.from({ length: count }, (_, i) => row(input.StartRow + i)),
      TotalRowCount: total,
      LabelVersionID: 'ver-1',
      ...(definitionJSON === null ? {} : { DefinitionJSON: definitionJSON }),
    };
    return succeeded(output);
  });
}

describe('FormsReportingExportService.exportResponses', () => {
  it('pages the responses in with their answers and exports one row each, columns from the Published definition', async () => {
    operations = serve(2);
    const { fake, svc } = make();

    const outcome = await svc.exportResponses(FORM, 'csv');

    expect(operations.calls.every((c) => c.key === 'Forms.ListResponses' && (c.input as FormsListResponsesInput).IncludeAnswers)).toBe(true);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].options).toMatchObject({ format: 'csv', fileName: 'Event-feedback-2026-responses', sheetName: 'Responses' });
    // Statements are display-only, so they get no column.
    expect(fake.calls[0].options?.columns?.map((c) => c.name)).toEqual(['responseId', 'status', 'startedAt', 'submittedAt', 'respondent', 'q-text']);
    expect(fake.calls[0].data).toEqual([
      expect.objectContaining({ responseId: 'r-1', 'q-text': 'answer 1' }),
      expect.objectContaining({ responseId: 'r-0', 'q-text': 'answer 0' }),
    ]);
    expect(outcome).toEqual({ exported: 2, total: 2, notice: null });
  });

  it('says so when the form holds more responses than one export reads', async () => {
    const total = MAX_RESPONSE_PAGE_SIZE * MAX_EXPORT_PAGES + 5;
    operations = serve(total);
    const { fake, svc } = make();

    const outcome = await svc.exportResponses(FORM, 'excel');

    expect(fake.calls[0].data).toHaveLength(MAX_RESPONSE_PAGE_SIZE * MAX_EXPORT_PAGES);
    expect(outcome.notice).toBe(cappedNotice(MAX_RESPONSE_PAGE_SIZE * MAX_EXPORT_PAGES, total));
    expect(outcome.notice).toMatch(/earliest 50,000 of this form’s 50,005 responses/);
  });

  it('refuses rather than writing a file with no question columns when the form has no definition', async () => {
    operations = serve(1, null);
    const { fake, svc } = make();

    await expect(svc.exportResponses(FORM, 'csv')).rejects.toThrow(/no published definition/);
    expect(fake.calls).toEqual([]);
  });

  it('writes no file when responses change between pages', async () => {
    operations = installFakeOperations((_key, raw) => {
      const input = raw as FormsListResponsesInput;
      const total = input.StartRow === 0 ? MAX_RESPONSE_PAGE_SIZE + 5 : MAX_RESPONSE_PAGE_SIZE + 4;
      const count = input.StartRow === 0 ? MAX_RESPONSE_PAGE_SIZE : 4;
      return succeeded({ Rows: Array.from({ length: count }, (_, i) => row(input.StartRow + i + 1)), TotalRowCount: total, LabelVersionID: 'ver-1', DefinitionJSON: DEFINITION });
    });
    const { fake, svc } = make();

    await expect(svc.exportResponses(FORM, 'csv')).rejects.toThrow('Responses changed while exporting — try again.');
    expect(fake.calls).toEqual([]);
  });
});
