/**
 * `FormsReportingService.loadReportableForms` exercised as a class over a fake RunView.
 *
 * The rail's counts used to be tallied from downloaded response rows, which the 1000-row view
 * cap truncated (#247). They now come from the shared server-side counter, for the forms the
 * rail actually lists.
 */
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import { FORMS_ENTITY } from '../../shared/entity-names';
import { ResponsesDataService } from '../../responses/responses-data.service';

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
  }
  return { ...actual, RunView };
});

const { FormsReportingService } = await import('./forms-reporting.service');

function service(): InstanceType<typeof FormsReportingService> {
  const injector = Injector.create({
    providers: [{ provide: ResponsesDataService, useValue: {} }],
  });
  return runInInjectionContext(injector, () => new FormsReportingService());
}

beforeEach(() => {
  batches.length = 0;
  countsSucceed = true;
});

describe('FormsReportingService.loadReportableForms', () => {
  it('lists published forms with their server-computed Complete count', async () => {
    const forms = await service().loadReportableForms();
    expect(forms).toEqual([
      { formId: 'f1', formVersionId: 'v2', name: 'Application', responseCount: 712 },
    ]);
  });

  it('counts only the reportable forms, without downloading response rows', async () => {
    await service().loadReportableForms();
    const responseQueries = batches.flat().filter((p) => p.EntityName === FORMS_ENTITY.FormResponse);
    expect(responseQueries.every((p) => p.ResultType === 'count_only')).toBe(true);
    expect(responseQueries.flatMap((p) => (p.Aggregates ?? []).map((a) => a.alias))).toEqual(['f1']);
  });

  it('fails the load when counting fails, rather than showing zeros', async () => {
    countsSucceed = false;
    await expect(service().loadReportableForms()).rejects.toThrow(/count query refused/);
  });
});
