/**
 * The responses surface's reads, through the REAL generated operation classes and `runOperation`;
 * only the provider the operations route through is faked (`installFakeOperations`).
 *
 * These replaced `responses-data.filter.spec.ts` and `responses-data.all-rows.spec.ts`, which held
 * `ResponsesDataService`'s view filters and its uncapped reads of every row (DW16). What they pinned —
 * scope by form across every version, Complete-only, every row reachable — is now the operation's
 * input here (every row reachable by paging) and the server's behaviour in `FormReportingEngine.spec.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RESPONSE_PAGE_SIZE,
  type FormsGetResponseDetailOutput,
  type FormsListResponsesInput,
  type FormsListResponsesOutput,
  type FormsResponseListRow,
} from '@mj-biz-apps/forms-entities';
import { installFakeOperations, refused, succeeded, type FakeOperations } from '../shared/testing/fake-operations';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: vi.fn() };
});

const { MAX_EXPORT_PAGES, RESPONSES_CHANGED_MESSAGE, readResponseDetail, readResponsePage, readResponsesForExport } = await import('./response-reads');

let operations: FakeOperations | null = null;
afterEach(() => {
  operations?.restore();
  operations = null;
});

function listRow(n: number): FormsResponseListRow {
  return {
    ResponseID: `r-${n}`,
    Status: 'Complete',
    FormVersionID: 'v1',
    StartedAt: null,
    SubmittedAt: `2026-09-01T10:${String(n % 60).padStart(2, '0')}:00.000Z`,
    RespondentPersonID: null,
    Respondent: `Person ${n}`,
    AnsweredCount: 2,
  };
}

function page(rows: FormsResponseListRow[], total: number, extra: Partial<FormsListResponsesOutput> = {}): FormsListResponsesOutput {
  return { Rows: rows, TotalRowCount: total, LabelVersionID: 'v1', ...extra };
}

const rows = (from: number, count: number): FormsResponseListRow[] => Array.from({ length: count }, (_, i) => listRow(from + i));

describe('readResponsePage', () => {
  it('asks for one page of Complete responses of the form, without answers, at the shared page size', async () => {
    operations = installFakeOperations(() => succeeded(page([listRow(1)], 41)));

    const result = await readResponsePage('form-1', 200);

    expect(operations.calls).toEqual([
      {
        key: 'Forms.ListResponses',
        input: { FormID: 'form-1', Status: 'Complete', StartRow: 200, MaxRows: MAX_RESPONSE_PAGE_SIZE, IncludeAnswers: false },
      },
    ]);
    expect(result).toMatchObject({ total: 41, labelVersionId: 'v1', rows: [{ responseId: 'r-1', respondent: 'Person 1' }] });
  });

  it('never asks for every row of a form at once (DW16): a bounded page, and nothing but the declared input', async () => {
    operations = installFakeOperations(() => succeeded(page([], 0)));

    await readResponsePage('form-1', 0);

    const input = operations.calls[0].input as FormsListResponsesInput;
    expect(input.MaxRows).toBeLessThanOrEqual(MAX_RESPONSE_PAGE_SIZE);
    expect(Object.keys(input).sort()).toEqual(['FormID', 'IncludeAnswers', 'MaxRows', 'StartRow', 'Status']);
  });

  it("throws the server's refusal so the host can show it", async () => {
    operations = installFakeOperations(() => refused('A form id is required.'));

    await expect(readResponsePage('form-1', 0)).rejects.toThrow('A form id is required.');
  });
});

describe('readResponseDetail', () => {
  const detail: FormsGetResponseDetailOutput = {
    Response: { ID: 'resp-1', FormID: 'f', FormVersionID: 'v0', Status: 'Complete', StartedAt: null, SubmittedAt: null, RespondentPersonID: null, RespondentPerson: null },
    Answers: [],
    Uploads: [],
    AutomationRuns: [],
    BindingRecords: [],
    LabelFormVersionID: 'v1',
    DefinitionJSON: JSON.stringify({ pages: [] }),
    UnavailableSections: [],
  };

  it('labels from the version it is given — the list surfaces pass the Published one', async () => {
    operations = installFakeOperations(() => succeeded(detail));

    const result = await readResponseDetail('resp-1', 'v1');

    expect(operations.calls).toEqual([{ key: 'Forms.GetResponseDetail', input: { ResponseID: 'resp-1', LabelFormVersionID: 'v1' } }]);
    expect(result.responseId).toBe('resp-1');
  });

  it('labels from the version the response was submitted against when given none (the record view)', async () => {
    operations = installFakeOperations(() => succeeded(detail));

    await readResponseDetail('resp-1');

    expect(operations.calls[0].input).toEqual({ ResponseID: 'resp-1', LabelFormVersionID: null });
  });

  it("throws the server's refusal", async () => {
    operations = installFakeOperations(() => refused('Response not found.'));

    await expect(readResponseDetail('resp-1')).rejects.toThrow('Response not found.');
  });
});

/**
 * The export's refusal message — or, when it did NOT refuse, how many rows it read. A bare
 * `rejects.toThrow` prints the whole resolved value when it fails: 50,000 rows, 14 MB of output on
 * the page-cap case, which overflowed the guard-mutant gate's pipe and read as a crash (#306 CI).
 */
async function exportRefusal(): Promise<string> {
  try {
    const read = await readResponsesForExport('form-1');
    return `resolved with ${read.rows.length} rows`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe('readResponsesForExport', () => {
  /** Serves a form of `total` Complete responses, oldest first, a page at a time. */
  function serve(total: number, overrides: (input: FormsListResponsesInput) => Partial<FormsListResponsesOutput> = () => ({})) {
    return installFakeOperations((_key, raw) => {
      const input = raw as FormsListResponsesInput;
      const count = Math.max(0, Math.min(input.MaxRows, total - input.StartRow));
      return succeeded(page(rows(input.StartRow, count), total, { DefinitionJSON: '{"pages":[]}', ...overrides(input) }));
    });
  }

  it('pages oldest first with answers until a short page, and returns the rows newest first', async () => {
    operations = serve(MAX_RESPONSE_PAGE_SIZE + 3);

    const result = await readResponsesForExport('form-1');

    const inputs = operations.calls.map((c) => c.input as FormsListResponsesInput);
    expect(inputs.map((i) => i.StartRow)).toEqual([0, MAX_RESPONSE_PAGE_SIZE]);
    expect(inputs.every((i) => i.IncludeAnswers && i.Status === 'Complete' && i.OrderBy === 'SubmittedAt ASC')).toBe(true);
    expect(result.rows).toHaveLength(MAX_RESPONSE_PAGE_SIZE + 3);
    expect(result.rows[0].ResponseID).toBe(`r-${MAX_RESPONSE_PAGE_SIZE + 2}`);
    expect(result).toMatchObject({ capped: false, total: MAX_RESPONSE_PAGE_SIZE + 3, definitionJSON: '{"pages":[]}' });
  });

  it('stops at the page cap and says it did, rather than reading without end', async () => {
    operations = serve(MAX_RESPONSE_PAGE_SIZE * MAX_EXPORT_PAGES + 1);

    const result = await readResponsesForExport('form-1');

    expect(operations.calls).toHaveLength(MAX_EXPORT_PAGES);
    expect(result).toMatchObject({ capped: true, total: MAX_RESPONSE_PAGE_SIZE * MAX_EXPORT_PAGES + 1 });
    expect(result.rows).toHaveLength(MAX_RESPONSE_PAGE_SIZE * MAX_EXPORT_PAGES);
  });

  it('is not capped when the last full page was the end of the list', async () => {
    operations = serve(MAX_RESPONSE_PAGE_SIZE * 2);

    const result = await readResponsesForExport('form-1');

    expect(result.capped).toBe(false);
    expect(result.rows).toHaveLength(MAX_RESPONSE_PAGE_SIZE * 2);
  });

  it('refuses, writing nothing, when a response is deleted between pages — offset paging would skip a row', async () => {
    operations = installFakeOperations((_key, raw) => {
      const input = raw as FormsListResponsesInput;
      // r-3 is deleted after the first page: every later row moves up one, so the second page
      // starts one row LATE and r-200 (the first row it should have returned) is never read.
      return succeeded(input.StartRow === 0 ? page(rows(0, MAX_RESPONSE_PAGE_SIZE), 250) : page(rows(MAX_RESPONSE_PAGE_SIZE + 1, 49), 249));
    });

    expect(await exportRefusal()).toBe(RESPONSES_CHANGED_MESSAGE);
  });

  it('refuses when a response arrives between pages', async () => {
    operations = installFakeOperations((_key, raw) => {
      const input = raw as FormsListResponsesInput;
      return succeeded(input.StartRow === 0 ? page(rows(0, MAX_RESPONSE_PAGE_SIZE), 250) : page(rows(MAX_RESPONSE_PAGE_SIZE, 51), 251));
    });

    expect(await exportRefusal()).toBe(RESPONSES_CHANGED_MESSAGE);
  });

  it('refuses when a page hands back a row it already read, even with the count unchanged (one arrival, one deletion)', async () => {
    operations = installFakeOperations((_key, raw) => {
      const input = raw as FormsListResponsesInput;
      return succeeded(input.StartRow === 0 ? page(rows(0, MAX_RESPONSE_PAGE_SIZE), 250) : page(rows(MAX_RESPONSE_PAGE_SIZE - 1, 50), 250));
    });

    expect(await exportRefusal()).toBe(RESPONSES_CHANGED_MESSAGE);
  });

  it('refuses a count that changes between FULL pages — the only guard left when the page cap, not a short page, ends the read', async () => {
    // Every page is full and no row repeats, so neither the short-page check nor the seen-set fires:
    // only comparing each page's count with the first page's notices the list moved under the read.
    const total = MAX_RESPONSE_PAGE_SIZE * MAX_EXPORT_PAGES + 1;
    operations = serve(total, (input) => (input.StartRow > 0 ? { TotalRowCount: total + 1 } : {}));

    expect(await exportRefusal()).toBe(RESPONSES_CHANGED_MESSAGE);
  });

  it('refuses when the pages end short of the count they reported', async () => {
    operations = installFakeOperations(() => succeeded(page(rows(0, 3), 4)));

    expect(await exportRefusal()).toBe(RESPONSES_CHANGED_MESSAGE);
  });

  it('refuses a form published again mid-export rather than writing answers under the wrong columns', async () => {
    operations = serve(MAX_RESPONSE_PAGE_SIZE + 1, (input) => (input.StartRow > 0 ? { LabelVersionID: 'v2' } : {}));

    await expect(readResponsesForExport('form-1')).rejects.toThrow(/published again/);
  });
});
