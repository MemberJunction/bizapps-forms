/**
 * `FormsReportingService.loadReport` exercised as a class (#246).
 *
 * The dashboard used to read a form's answers twice per selection: once inside `loadReport`
 * (through `loadResponsesForForm`) and again through a separate answers-only query, only so the
 * export had the raw rows. These specs pin the fix: the report carries the rows it was built
 * from, the answers are read exactly once, and the definition and responses reads run together.
 *
 * `ResponsesDataService` is replaced by a fake whose reads are deferred promises, so a test can
 * hold both open and observe that both STARTED before either resolved.
 */
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, it, expect } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { FormsReportingService } from './forms-reporting.service';
import { ResponsesDataService, type FormResponseRows } from '../../responses/responses-data.service';
import { mockDefinition } from './forms-reporting-mock';
import type { ReportableForm } from '../models/reporting.model';
import { response, answer } from '../../shared/testing/entity-row-fixtures';

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

function make(): { fake: FakeResponses; svc: FormsReportingService } {
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
