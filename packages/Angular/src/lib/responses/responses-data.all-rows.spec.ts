/**
 * The per-form reads behind the Responses & Analytics report, its CSV/Excel export and the
 * builder's Responses tab must return EVERY row.
 *
 * Without `IgnoreMaxRows`, MJ caps a view at the entity's `UserViewMaxRows` (1000 for both Form
 * Responses and Form Response Answers) and says so only in `TotalRowCount`, which nothing here
 * reads. A form with 714 responses has 4,338 answers on the shared dev database; the report was
 * built from an arbitrary 1,000 of them ("First name · 176 answered · 536 skipped").
 */
import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import { FORMS_ENTITY } from '../shared/entity-names';

/** Every view the service asked for, in order. */
const requested: RunViewParams[] = [];

function ok(): RunViewResult {
  return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
}

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class RunView {
    public async RunView(params: RunViewParams): Promise<RunViewResult> {
      requested.push(params);
      return ok();
    }
    public async RunViews(params: RunViewParams[]): Promise<RunViewResult[]> {
      requested.push(...params);
      return params.map(() => ok());
    }
  }
  return { ...actual, RunView };
});

const { ResponsesDataService } = await import('./responses-data.service');

beforeEach(() => {
  requested.length = 0;
});

describe('ResponsesDataService — whole-form reads are not capped at UserViewMaxRows', () => {
  it('loadResponsesForForm asks for every response and every answer', async () => {
    await new ResponsesDataService().loadResponsesForForm('form-1');
    expect(requested.map((p) => p.EntityName)).toEqual([
      FORMS_ENTITY.FormResponse,
      FORMS_ENTITY.FormResponseAnswer,
    ]);
    expect(requested.every((p) => p.IgnoreMaxRows === true)).toBe(true);
  });

  it('loadAnswersForForm (the export) asks for every answer', async () => {
    await new ResponsesDataService().loadAnswersForForm('form-1');
    expect(requested).toHaveLength(1);
    expect(requested[0].EntityName).toBe(FORMS_ENTITY.FormResponseAnswer);
    expect(requested[0].IgnoreMaxRows).toBe(true);
  });
});
