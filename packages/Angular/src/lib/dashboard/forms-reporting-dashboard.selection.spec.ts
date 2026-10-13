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
import { FormsReportingService, type ReportLoad } from './services/forms-reporting.service';
import { FormsReportingExportService, type ExportOutcome } from './services/forms-reporting-export.service';
import { toFormReport } from './services/report-view';
import { summaryOutput } from './testing/summary-fixture';
import type { FormReportData, ReportableForm } from './models/reporting.model';

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

/** A real report shape, told apart from the others by its response total (and, optionally, its form). */
function reportWithTotal(totalResponses: number, form: ReportableForm = FORM_A): ReportLoad {
  const report: FormReportData = toFormReport(form, summaryOutput());
  return { status: 'ready', report: { ...report, summary: { ...report.summary, totalResponses } } };
}

/** The report a `ReportLoad` carries, for asserting which one is on screen. */
function reportOf(load: ReportLoad): FormReportData | null {
  return load.status === 'ready' ? load.report : null;
}

type ReportingSurface = Pick<FormsReportingService, 'loadReport' | 'loadReportableForms'>;
type ExportSurface = Pick<FormsReportingExportService, 'exportResponses'>;

/** Every `loadReport` call, in call order, each with the deferred the test settles by hand. */
interface ReportCall {
  form: ReportableForm;
  load: Deferred<ReportLoad>;
}

interface Harness {
  c: FormsReportingDashboardComponent;
  formLists: Deferred<ReportableForm[]>[];
  reportCalls: ReportCall[];
  exports: Deferred<ExportOutcome>[];
  errors: Error[];
}

function construct(): Harness {
  const formLists: Deferred<ReportableForm[]>[] = [];
  const reportCalls: ReportCall[] = [];
  const reporting: ReportingSurface = {
    loadReportableForms: () => {
      const load = deferred<ReportableForm[]>();
      formLists.push(load);
      return load.promise;
    },
    loadReport: (form) => {
      const load = deferred<ReportLoad>();
      reportCalls.push({ form, load });
      return load.promise;
    },
  };
  const exports: Deferred<ExportOutcome>[] = [];
  const exporter: ExportSurface = {
    exportResponses: () => {
      const run = deferred<ExportOutcome>();
      exports.push(run);
      return run.promise;
    },
  };
  const injector = Injector.create({
    providers: [
      { provide: FormsReportingService, useValue: reporting },
      { provide: FormsReportingExportService, useValue: exporter },
      { provide: NavigationService, useValue: {} },
      { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
    ],
  });
  const c = runInInjectionContext(injector, () => new FormsReportingDashboardComponent());
  const errors: Error[] = [];
  c.Error.subscribe((e: Error) => errors.push(e));
  return { c, formLists, reportCalls, exports, errors };
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
    expect(c.report).toBe(reportOf(reportB));
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
    expect(c.report).toBe(reportOf(reportB));
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

    expect(c.report).toBe(reportOf(reportB));
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
    expect(c.report).toBe(reportOf(latest));
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

  it('does not put a failed export of the previous form on the newer form\'s screen', async () => {
    const { c, reportCalls, exports, errors } = construct();
    const a = c.selectForm(FORM_A);
    reportCalls[0].load.resolve(reportWithTotal(111, FORM_A));
    await a;

    const run = c.export('csv');
    const b = c.selectForm(FORM_B);
    reportCalls[1].load.resolve(reportWithTotal(222));
    await b;
    exports[0].reject(new Error('A export timed out'));
    await run;

    expect(c.errorMessage).toBeNull();
    expect(errors).toEqual([]);
    expect(c.busy).toBe(false);
    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('form-a');
    expect(logged).toContain('A export timed out');
  });

  it('still surfaces a failed export of the form on screen', async () => {
    // Control: the guard must not hide the failure the reader is looking at.
    const { c, reportCalls, exports, errors } = construct();
    const a = c.selectForm(FORM_A);
    reportCalls[0].load.resolve(reportWithTotal(111));
    await a;

    const run = c.export('csv');
    exports[0].reject(new Error('disk full'));
    await run;

    expect(c.errorMessage).toContain('disk full');
    expect(errors).toHaveLength(1);
  });

  it('still surfaces a failed export once the reader is back on the form it was for', async () => {
    // Leaving a form and returning starts two selections, but the export's form is on screen
    // again: its failure is the reader's to see, not a superseded one to log away.
    const { c, reportCalls, exports, errors } = construct();
    const a = c.selectForm(FORM_A);
    reportCalls[0].load.resolve(reportWithTotal(111, FORM_A));
    await a;

    const run = c.export('csv');
    const b = c.selectForm(FORM_B);
    reportCalls[1].load.resolve(reportWithTotal(222, FORM_B));
    await b;
    const back = c.selectForm(FORM_A);
    reportCalls[2].load.resolve(reportWithTotal(111, FORM_A));
    await back;
    exports[0].reject(new Error('A export timed out'));
    await run;

    expect(c.selectedForm).toBe(FORM_A);
    expect(c.errorMessage).toContain('A export timed out');
    expect(errors).toHaveLength(1);
  });

  it('ends the forms-loading state once the list is known, not when the first report settles', async () => {
    // The rail is clickable as soon as it renders, so the reader can pick another form while the
    // first form's report is still loading. The page-wide "Loading forms…" state must not wait on
    // that superseded first load and sit over the report the reader picked.
    const { c, formLists, reportCalls } = construct();
    c.retryLoadForms();
    formLists[0].resolve([FORM_A, FORM_B]);
    await vi.waitFor(() => expect(reportCalls).toHaveLength(1));
    const first = reportCalls[0].form;
    const picked = first === FORM_A ? FORM_B : FORM_A;

    const pick = c.selectForm(picked);
    const pickedReport = reportWithTotal(333, picked);
    reportCalls[1].load.resolve(pickedReport);
    await pick;

    expect(c.report).toBe(reportOf(pickedReport));
    expect(c.loadingForms).toBe(false);
    expect(c.railState).toBe('ready');

    reportCalls[0].load.resolve(reportWithTotal(999, first));
    await vi.waitFor(() => expect(c.loadingForms).toBe(false));
    expect(c.report).toBe(reportOf(pickedReport));
  });
});

describe('FormsReportingDashboardComponent — a summary refused to this reader, and a partial export', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows "not available to you" rather than an error, keeping the mode switch and the export', async () => {
    const { c, reportCalls, errors } = construct();
    const a = c.selectForm(FORM_A);
    reportCalls[0].load.resolve({ status: 'unavailable', message: 'Not yours to see.' });
    await a;

    expect(c.report).toBeNull();
    expect(c.summaryUnavailable).toBe('Not yours to see.');
    expect(c.errorMessage).toBeNull();
    expect(errors).toEqual([]);
    expect(c.hasSelection).toBe(true);

    c.setMode('responses');
    expect(c.mode).toBe('responses');
  });

  it('clears the refusal when the reader moves to a form they can see', async () => {
    const { c, reportCalls } = construct();
    const a = c.selectForm(FORM_A);
    reportCalls[0].load.resolve({ status: 'unavailable', message: 'Not yours to see.' });
    await a;

    const b = c.selectForm(FORM_B);
    expect(c.summaryUnavailable).toBeNull();
    const reportB = reportWithTotal(5, FORM_B);
    reportCalls[1].load.resolve(reportB);
    await b;

    expect(c.report).toBe(reportOf(reportB));
    expect(c.summaryUnavailable).toBeNull();
  });

  it('tells the reader an export holds only part of the form', async () => {
    const { c, reportCalls, exports } = construct();
    const a = c.selectForm(FORM_A);
    reportCalls[0].load.resolve(reportWithTotal(11));
    await a;

    const run = c.export('csv');
    exports[0].resolve({ exported: 50_000, total: 50_005, notice: 'The file holds the earliest 50,000.' });
    await run;

    expect(c.exportNotice).toBe('The file holds the earliest 50,000.');
    expect(c.errorMessage).toBeNull();
  });

  it('does not put one form\'s export notice on another form\'s screen', async () => {
    const { c, reportCalls, exports } = construct();
    const a = c.selectForm(FORM_A);
    reportCalls[0].load.resolve(reportWithTotal(11));
    await a;

    const run = c.export('csv');
    const b = c.selectForm(FORM_B);
    reportCalls[1].load.resolve(reportWithTotal(22, FORM_B));
    await b;
    exports[0].resolve({ exported: 50_000, total: 50_005, notice: 'The file holds the earliest 50,000.' });
    await run;

    expect(c.exportNotice).toBeNull();
  });

  it('keeps the Responses view mounted across mode switches, and drops it when another form is selected', async () => {
    const { c, reportCalls } = construct();
    const a = c.selectForm(FORM_A);
    reportCalls[0].load.resolve(reportWithTotal(11));
    await a;
    expect(c.showResponsesView).toBe(false);

    c.setMode('responses');
    c.setMode('insights');
    // Hidden under Insights, not destroyed: going back shows the same list without a re-read.
    expect(c.showResponsesView).toBe(true);

    const b = c.selectForm(FORM_B);
    expect(c.responsesMounted).toBe(false);
    reportCalls[1].load.resolve(reportWithTotal(22, FORM_B));
    await b;
    expect(c.showResponsesView).toBe(false);
  });

  it('holds its own refresh and export while the Responses view opens a response, and drops the hold on a new form', async () => {
    const { c, reportCalls } = construct();
    const a = c.selectForm(FORM_A);
    reportCalls[0].load.resolve(reportWithTotal(11));
    await a;

    c.setResponsesBusy(true);
    expect(c.responsesBusy).toBe(true);
    c.setResponsesBusy(false);
    expect(c.responsesBusy).toBe(false);

    c.setResponsesBusy(true);
    const b = c.selectForm(FORM_B);
    expect(c.responsesBusy).toBe(false);
    reportCalls[1].load.resolve(reportWithTotal(22, FORM_B));
    await b;
  });
});
