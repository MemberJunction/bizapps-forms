/**
 * `FormsReportingService` exercised as a class.
 *
 * `loadReportableForms` (#247): the rail's counts used to be tallied from downloaded response
 * rows, which the 1000-row view cap truncated. They now come from the shared server-side counter,
 * for the forms the rail actually lists. It runs over a fake RunView.
 *
 * `loadReport` (#246): the dashboard used to read a form's answers twice per selection: once
 * inside `loadReport` (through `loadResponsesForForm`) and again through a separate answers-only
 * query, only so the export had the raw rows. These specs pin the fix: the report carries the rows
 * it was built from, the answers are read exactly once, and the definition and responses reads run
 * together. `ResponsesDataService` is replaced by a fake whose reads are deferred promises, so a
 * test can hold both open and observe that both STARTED before either resolved.
 */
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../../shared/entity-names';
import { ResponsesDataService, type FormResponseRows } from '../../responses/responses-data.service';
import { mockDefinition } from './forms-reporting-mock';
import type { ReportableForm } from '../models/reporting.model';
import { response, answer } from '../../shared/testing/entity-row-fixtures';

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

function answerRunView(params: RunViewParams): RunViewResult {
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
      return params.map(answerRunView);
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Records every read it is asked for; the test decides when (and how) each one settles. */
class FakeResponses {
  public readonly calls: string[] = [];
  public readonly def = deferred<PublishedFormDefinition>();
  public readonly rows = deferred<FormResponseRows>();

  public loadDefinition(formVersionId: string): Promise<PublishedFormDefinition> {
    this.calls.push(`definition:${formVersionId}`);
    return this.def.promise;
  }

  public loadResponsesForForm(formId: string): Promise<FormResponseRows> {
    this.calls.push(`responses:${formId}`);
    return this.rows.promise;
  }
}

const FORM: ReportableForm = {
  formId: 'form-1',
  formVersionId: 'version-1',
  name: 'Feedback',
  responseCount: 1,
};

/** One complete and one partial response, each answering questions from the mock definition. */
function rowsWithAPartial(): FormResponseRows {
  const started = new Date('2026-09-01T10:00:00Z');
  const submitted = new Date('2026-09-01T10:02:00Z');
  return {
    responses: [
      response('r-complete', 'Complete', started, submitted),
      response('r-partial', 'Partial', started, null),
    ],
    answers: [
      answer('r-complete', 'q-channel', { TextValue: 'search' }),
      answer('r-complete', 'q-rating', { NumericValue: 4 }),
      answer('r-partial', 'q-channel', { TextValue: 'social' }),
    ],
  };
}

function make(): { fake: FakeResponses; svc: InstanceType<typeof FormsReportingService> } {
  const fake = new FakeResponses();
  const injector = Injector.create({
    providers: [{ provide: ResponsesDataService, useValue: fake }],
  });
  return { fake, svc: runInInjectionContext(injector, () => new FormsReportingService()) };
}

describe('FormsReportingService.loadReport', () => {
  it('reads the answers once, through loadResponsesForForm, and hands the raw rows to the report', async () => {
    const { fake, svc } = make();
    const rows = rowsWithAPartial();
    fake.def.resolve(mockDefinition());
    fake.rows.resolve(rows);

    const report = await svc.loadReport(FORM);

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls).toContain('definition:version-1');
    expect(fake.calls).toContain('responses:form-1');
    // The UNFILTERED rows, partials included: the export must match what it produced before,
    // and a report built from `completeAnswers` would silently drop the partial's cells.
    expect(report.answers).toEqual(rows.answers);
    expect(report.answers).toHaveLength(3);
    expect(report.answers.some((a) => a.ResponseID === 'r-partial')).toBe(true);
  });

  it('starts the definition and the responses reads together', async () => {
    const { fake, svc } = make();

    const pending = svc.loadReport(FORM);
    await Promise.resolve();

    // Neither read has settled, yet both have been asked for: they are concurrent, not serial.
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls).toContain('definition:version-1');
    expect(fake.calls).toContain('responses:form-1');

    fake.def.resolve(mockDefinition());
    fake.rows.resolve(rowsWithAPartial());
    await pending;
  });

  it('rejects when the responses read fails', async () => {
    const { fake, svc } = make();
    fake.def.resolve(mockDefinition());
    fake.rows.reject(new Error('boom'));

    await expect(svc.loadReport(FORM)).rejects.toThrow('boom');
  });

  it('rejects when the definition read fails', async () => {
    const { fake, svc } = make();
    fake.def.reject(new Error('no snapshot'));
    fake.rows.resolve(rowsWithAPartial());

    await expect(svc.loadReport(FORM)).rejects.toThrow('no snapshot');
  });
});
