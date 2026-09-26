/**
 * `FormsHomeService.loadForms` exercised as a class over a fake RunView.
 *
 * The counts are enrichment: the grid must still load when they fail, but the failure must be
 * logged rather than read as "every form has zero responses" (#247).
 */
import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import { FORMS_ENTITY } from '../shared/entity-names';

/** Every RunViews batch the service sent, in order. */
const batches: RunViewParams[][] = [];
const logged: string[] = [];
let countsSucceed = true;
/** When set, the Forms view fails with this ErrorMessage (possibly empty). */
let formsViewError: string | null = null;

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
    if (formsViewError !== null) {
      return { ...ok([]), Success: false, ErrorMessage: formsViewError };
    }
    return ok([
      { ID: 'f1', Name: 'Alpha', Status: 'Published', CategoryID: null, __mj_UpdatedAt: null },
      { ID: 'f2', Name: 'Beta', Status: 'Draft', CategoryID: null, __mj_UpdatedAt: null },
    ]);
  }
  if (params.EntityName === FORMS_ENTITY.FormCategory) {
    return ok([]);
  }
  if (!countsSucceed) {
    return { ...ok([]), Success: false, ErrorMessage: 'count query refused' };
  }
  const values: Record<string, string> = { f1: '712', f2: '0' };
  return ok(
    [],
    (params.Aggregates ?? []).map((a) => ({
      expression: a.expression,
      alias: a.alias ?? '',
      value: values[a.alias ?? ''],
    })),
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
  return { ...actual, RunView, LogError: (message: string) => logged.push(message) };
});

const { FormsHomeService } = await import('./forms-home.service');

beforeEach(() => {
  batches.length = 0;
  logged.length = 0;
  countsSucceed = true;
  formsViewError = null;
});

describe('FormsHomeService.loadForms', () => {
  it('shows the server-computed Complete count for each form', async () => {
    const rows = await new FormsHomeService().loadForms();
    expect(rows.find((r) => r.id === 'f1')?.responseCount).toBe(712);
    expect(rows.find((r) => r.id === 'f2')?.responseCount).toBe(0);
  });

  it('never downloads response rows to count them', async () => {
    await new FormsHomeService().loadForms();
    const responseQueries = batches.flat().filter((p) => p.EntityName === FORMS_ENTITY.FormResponse);
    expect(responseQueries.length).toBeGreaterThan(0);
    expect(responseQueries.every((p) => p.ResultType === 'count_only')).toBe(true);
  });

  it('counts only the forms it listed', async () => {
    await new FormsHomeService().loadForms();
    const counted = batches
      .flat()
      .filter((p) => p.EntityName === FORMS_ENTITY.FormResponse)
      .flatMap((p) => (p.Aggregates ?? []).map((a) => a.alias));
    expect(counted).toEqual(['f1', 'f2']);
  });

  it('still lists the forms when counting fails, logs why, and shows no count rather than a false zero', async () => {
    countsSucceed = false;
    const rows = await new FormsHomeService().loadForms();
    expect(rows.map((r) => r.id).sort()).toEqual(['f1', 'f2']);
    // "0 Responses" would be a claim about the data; a failed count makes no claim.
    expect(rows.every((r) => r.responseCount === null)).toBe(true);
    expect(logged.join('\n')).toMatch(/2 forms on Forms home[\s\S]*count query refused/);
  });
});

describe('FormsHomeService.loadForms when the Forms view itself fails (#253)', () => {
  it("rejects with the view's own error message", async () => {
    formsViewError = 'Invalid column name IsTemplate';
    await expect(new FormsHomeService().loadForms()).rejects.toThrow('Invalid column name IsTemplate');
  });

  it('gives a reason, not a second "Failed to load forms" headline, when the view says nothing', async () => {
    // The component prefixes this with "Failed to load forms: ", so a fallback that repeated the
    // headline would render "Failed to load forms: Failed to load forms."
    formsViewError = '';
    const failure = new FormsHomeService().loadForms();
    await expect(failure).rejects.toThrow('the Forms view reported a failure with no error message');
    await expect(failure).rejects.not.toThrow(/^Failed to load forms/);
  });
});
