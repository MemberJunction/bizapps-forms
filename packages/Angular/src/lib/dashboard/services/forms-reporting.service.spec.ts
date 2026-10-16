/**
 * `FormsReportingService` exercised as a class.
 *
 * `loadReportableForms` (#247): the rail's counts used to be tallied from downloaded response
 * rows, which the 1000-row view cap truncated. They come from the shared server-side counter, for
 * the forms the rail actually lists — the same counter the Forms home grid uses
 * (`form-catalog.spec.ts`), so the two surfaces cannot disagree about what "a response" is. This is
 * the executing replacement for the reporting half of `home/response-count-scope.spec.ts`, which
 * only matched the service's source text (DW18 of #303). Exercised over a fake RunView.
 *
 * `loadReport` (#303): ONE operation, `Forms.GetResponseSummary`, run through the REAL generated
 * class and `runOperation` with only the provider faked. The report is computed on the server; the
 * browser reads no response or answer row to draw it.
 */
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import { FORMS_ENTITY } from '../../shared/entity-names';
import { installFakeOperations, refused, succeeded, type FakeOperations } from '../../shared/testing/fake-operations';
import { summaryOutput } from '../testing/summary-fixture';
import type { ReportableForm } from '../models/reporting.model';

const batches: RunViewParams[][] = [];
let countsSucceed = true;

function ok(results: object[], aggregates?: RunViewResult['AggregateResults']): RunViewResult {
  return {
    Success: true,
    Results: results,
    RowCount: results.length,
    TotalRowCount: results.length,
    ExecutionTime: 0,
    ErrorMessage: '',
    AggregateResults: aggregates,
  };
}

function answer(params: RunViewParams): RunViewResult {
  if (params.EntityName === FORMS_ENTITY.Form) {
    return ok([
      { ID: 'f1', Name: 'Application' },
      { ID: 'draft-only', Name: 'Never published' },
    ]);
  }
  if (params.EntityName === FORMS_ENTITY.FormVersion) {
    return ok([
      { ID: 'v2', FormID: 'f1', VersionNumber: 2 },
      { ID: 'v1', FormID: 'f1', VersionNumber: 1 },
    ]);
  }
  if (!countsSucceed) {
    return { ...ok([]), Success: false, ErrorMessage: 'count query refused' };
  }
  return ok(
    [],
    (params.Aggregates ?? []).map((a) => ({ expression: a.expression, alias: a.alias ?? '', value: '712' })),
  );
}

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class RunView {
    public async RunViews(params: RunViewParams[]): Promise<RunViewResult[]> {
      batches.push(params);
      return params.map(answer);
    }
    public async RunView(params: RunViewParams): Promise<RunViewResult> {
      batches.push([params]);
      return answer(params);
    }
  }
  return { ...actual, RunView, LogError: vi.fn() };
});

const { FormsReportingService, SUMMARY_UNAVAILABLE_TO_YOU } = await import('./forms-reporting.service');

function service(): InstanceType<typeof FormsReportingService> {
  return runInInjectionContext(Injector.create({ providers: [] }), () => new FormsReportingService());
}

const FORM: ReportableForm = { formId: 'form-1', formVersionId: 'ver-1', name: 'Feedback', responseCount: 12 };

let operations: FakeOperations | null = null;

beforeEach(() => {
  batches.length = 0;
  countsSucceed = true;
});

afterEach(() => {
  operations?.restore();
  operations = null;
});

describe('FormsReportingService.loadReportableForms', () => {
  it('lists published forms with their server-computed Complete count', async () => {
    const forms = await service().loadReportableForms();
    expect(forms).toEqual([{ formId: 'f1', formVersionId: 'v2', name: 'Application', responseCount: 712 }]);
  });

  it('counts only the reportable forms, through the shared Complete-only counter, without downloading response rows', async () => {
    await service().loadReportableForms();
    const responseQueries = batches.flat().filter((p) => p.EntityName === FORMS_ENTITY.FormResponse);
    expect(responseQueries.length).toBeGreaterThan(0);
    expect(responseQueries.every((p) => p.ResultType === 'count_only' && p.ExtraFilter === `Status='Complete'`)).toBe(true);
    expect(responseQueries.flatMap((p) => (p.Aggregates ?? []).map((a) => a.alias))).toEqual(['f1']);
  });

  it('fails the load when counting fails, rather than showing zeros', async () => {
    countsSucceed = false;
    await expect(service().loadReportableForms()).rejects.toThrow(/count query refused/);
  });
});

describe('FormsReportingService.loadReport', () => {
  it('asks the server for the summary of the form — one operation, no response or answer row read', async () => {
    operations = installFakeOperations(() => succeeded(summaryOutput()));

    const load = await service().loadReport(FORM);

    expect(operations.calls).toEqual([{ key: 'Forms.GetResponseSummary', input: { FormID: 'form-1' } }]);
    expect(batches).toEqual([]);
    expect(load.status).toBe('ready');
  });

  it('reports Partial and Disqualified apart, and carries the capped flag', async () => {
    operations = installFakeOperations(() => succeeded(summaryOutput({ InsightAnswersCapped: true })));

    const load = await service().loadReport(FORM);

    expect(load.status === 'ready' && load.report.summary).toMatchObject({ partialResponses: 3, disqualifiedResponses: 2, completeResponses: 12 });
    expect(load.status === 'ready' && load.report.insightAnswersCapped).toBe(true);
  });

  it('reads FORBIDDEN — the operation refusing this reader, row-restricted or without read access — as "not available to you"', async () => {
    operations = installFakeOperations(() => refused('Not allowed.', 'FORBIDDEN'));

    await expect(service().loadReport(FORM)).resolves.toEqual({ status: 'unavailable', message: SUMMARY_UNAVAILABLE_TO_YOU });
    // FORBIDDEN covers a reader with no read access at all, so the sentence promises no list.
    expect(SUMMARY_UNAVAILABLE_TO_YOU).not.toMatch(/Responses|can read|listed/);
  });

  it('classifies by result code only: an execution error is a failure whatever its text says', async () => {
    operations = installFakeOperations(() => refused('The response summary is not available to this user.', 'EXECUTION_ERROR'));

    await expect(service().loadReport(FORM)).rejects.toThrow('not available to this user');
  });

  it("throws any other refusal with the server's message", async () => {
    operations = installFakeOperations(() => refused('The response summary failed on the server; the server log has the detail.'));

    await expect(service().loadReport(FORM)).rejects.toThrow('failed on the server');
  });
});
