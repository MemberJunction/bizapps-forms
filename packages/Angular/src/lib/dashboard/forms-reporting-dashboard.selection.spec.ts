/**
 * `FormsReportingDashboardComponent` exercised as a class: which selection's report wins (#252).
 *
 * The rail used to lock itself for the length of a report load, and that lock was the only thing
 * standing between a reader and a stale report: two loads in flight resolve in network order, not
 * click order, so the slower one landed last and put the wrong form's numbers under the newer
 * form's name. These tests drive the loads by hand (one deferred per `loadReport` call) so the
 * resolution order is the test's choice, not the network's.
 *
 * Field `inject()` needs an injection context, not a TestBed — the same
 * `runInInjectionContext(Injector.create(...))` construction as
 * `builder/distribution-manager.behaviour.spec.ts`. Every provider is a narrow fake.
 */
import '@angular/compiler';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { NavigationService } from '@memberjunction/ng-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FormsReportingDashboardComponent } from './forms-reporting-dashboard.component';
import { FormsReportingService } from './services/forms-reporting.service';
import { FormsReportingExportService } from './services/forms-reporting-export.service';
import { mockReport, mockResponseDetail } from './services/forms-reporting-mock';
import type { FormReportData, ReportableForm } from './models/reporting.model';
import { ResponsesDataService } from '../responses/responses-data.service';
import type { ResponseDetail } from '../responses/response-models';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: Error) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const FORM_A: ReportableForm = { formId: 'form-a', formVersionId: 'ver-a', name: 'Form A', responseCount: 11 };
const FORM_B: ReportableForm = { formId: 'form-b', formVersionId: 'ver-b', name: 'Form B', responseCount: 22 };

/** A real report shape, told apart from the others by its response total. */
function reportWithTotal(totalResponses: number): FormReportData {
  const report = mockReport();
  return { ...report, summary: { ...report.summary, totalResponses } };
}

type ReportingSurface = Pick<FormsReportingService, 'loadReport'>;
type ResponsesSurface = Pick<ResponsesDataService, 'loadResponseDetail'>;

/** Every `loadReport` call, in call order, each with the deferred the test settles by hand. */
interface ReportCall {
  form: ReportableForm;
  load: Deferred<FormReportData>;
}

interface Harness {
  c: FormsReportingDashboardComponent;
  reportCalls: ReportCall[];
  detailLoads: Deferred<ResponseDetail>[];
  errors: Error[];
}

function construct(): Harness {
  const reportCalls: ReportCall[] = [];
  const detailLoads: Deferred<ResponseDetail>[] = [];
  const reporting: ReportingSurface = {
    loadReport: (form) => {
      const load = deferred<FormReportData>();
      reportCalls.push({ form, load });
      return load.promise;
    },
  };
  const responses: ResponsesSurface = {
    loadResponseDetail: () => {
      const load = deferred<ResponseDetail>();
      detailLoads.push(load);
      return load.promise;
    },
  };
  const injector = Injector.create({
    providers: [
      { provide: FormsReportingService, useValue: reporting },
      { provide: FormsReportingExportService, useValue: {} },
      { provide: ResponsesDataService, useValue: responses },
      { provide: NavigationService, useValue: {} },
      { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
    ],
  });
  const c = runInInjectionContext(injector, () => new FormsReportingDashboardComponent());
  const errors: Error[] = [];
  c.Error.subscribe((e: Error) => errors.push(e));
  return { c, reportCalls, detailLoads, errors };
}

describe('FormsReportingDashboardComponent — only the latest selection applies its report (#252)', () => {
  beforeEach(() => {
    // LogError writes to console.error; a superseded failure is logged on purpose.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the newer form when the older load resolves last', async () => {
    const { c, reportCalls } = construct();
    const a = c.selectForm(FORM_A);
    const b = c.selectForm(FORM_B);
    const reportB = reportWithTotal(222);
    reportCalls[1].load.resolve(reportB);
    await b;
    reportCalls[0].load.resolve(reportWithTotal(111));
    await a;

    expect(c.selectedForm).toBe(FORM_B);
    expect(c.report).toBe(reportB);
    expect(c.loadingReport).toBe(false);
  });

  it('does not apply the older form, or end the loading state, when the older load resolves first', async () => {
    const { c, reportCalls } = construct();
    const a = c.selectForm(FORM_A);
    const b = c.selectForm(FORM_B);
    reportCalls[0].load.resolve(reportWithTotal(111));
    await a;

    expect(c.report).toBeNull();
    expect(c.loadingReport).toBe(true);

    const reportB = reportWithTotal(222);
    reportCalls[1].load.resolve(reportB);
    await b;
    expect(c.report).toBe(reportB);
    expect(c.loadingReport).toBe(false);
  });

  it('does not surface a superseded failure over the newer report', async () => {
    const { c, reportCalls, errors } = construct();
    const a = c.selectForm(FORM_A);
    const b = c.selectForm(FORM_B);
    const reportB = reportWithTotal(222);
    reportCalls[1].load.resolve(reportB);
    await b;
    reportCalls[0].load.reject(new Error('A timed out'));
    await a;

    expect(c.report).toBe(reportB);
    expect(c.errorMessage).toBeNull();
    expect(errors).toEqual([]);
    // Not shown, but never swallowed: the failure is still logged against the form it belongs to.
    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('form-a');
    expect(logged).toContain('A timed out');
  });

  it('still surfaces a failure of the latest selection', async () => {
    // Control: passes before the fix too. Latest-wins must not swallow the failure that matters.
    const { c, reportCalls, errors } = construct();
    const a = c.selectForm(FORM_A);
    const b = c.selectForm(FORM_B);
    reportCalls[1].load.reject(new Error('B timed out'));
    await b;

    expect(c.selectedForm).toBe(FORM_B);
    expect(c.report).toBeNull();
    expect(c.errorMessage).toContain('B timed out');
    expect(errors).toHaveLength(1);
    expect(c.loadingReport).toBe(false);

    reportCalls[0].load.resolve(reportWithTotal(111));
    await a;
  });

  it('applies the latest refresh, not the one that resolves last', async () => {
    const { c, reportCalls } = construct();
    const first = c.selectForm(FORM_A);
    reportCalls[0].load.resolve(reportWithTotal(100));
    await first;

    const refresh1 = c.refresh();
    const refresh2 = c.refresh();
    const latest = reportWithTotal(300);
    reportCalls[2].load.resolve(latest);
    await refresh2;
    reportCalls[1].load.resolve(reportWithTotal(200));
    await refresh1;

    expect(reportCalls.map((call) => call.form)).toEqual([FORM_A, FORM_A, FORM_A]);
    expect(c.report).toBe(latest);
    expect(c.loadingReport).toBe(false);
  });

  it('clears the previous form\'s report the moment a new selection starts', async () => {
    const { c, reportCalls } = construct();
    const a = c.selectForm(FORM_A);
    reportCalls[0].load.resolve(reportWithTotal(111));
    await a;
    expect(c.report).not.toBeNull();

    const b = c.selectForm(FORM_B);
    // Synchronously, before B's load settles: the header line and the Export buttons read
    // `report`, so A's must not sit under B's name while B loads.
    expect(c.report).toBeNull();

    reportCalls[1].load.resolve(reportWithTotal(222));
    await b;
  });

  it('drops a response detail that arrives after the reader moved to another form', async () => {
    const { c, reportCalls, detailLoads } = construct();
    const a = c.selectForm(FORM_A);
    const reportA = reportWithTotal(111);
    reportCalls[0].load.resolve(reportA);
    await a;

    const open = c.openResponse('resp-1');
    const b = c.selectForm(FORM_B);
    detailLoads[0].resolve(mockResponseDetail('resp-1', reportA.questions));
    await open;

    expect(c.responseDetail).toBeNull();
    expect(c.busy).toBe(false);

    reportCalls[1].load.resolve(reportWithTotal(222));
    await b;
  });
});
