import { describe, it, expect, vi } from 'vitest';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import { FORMS_ENTITY } from './entity-names';
import {
  MAX_FORMS_PER_COUNT_QUERY,
  completeResponseCountQueries,
  loadCompleteResponseCounts,
  readCompleteResponseCounts,
} from './complete-response-counts';

/** A count_only result carrying one aggregate value per id, in request order. */
function countResult(values: ReadonlyArray<number | string>, ids: readonly string[]): RunViewResult {
  return {
    Success: true,
    Results: [],
    RowCount: 0,
    TotalRowCount: 0,
    ExecutionTime: 0,
    ErrorMessage: '',
    AggregateResults: values.map((value, i) => ({
      expression: `COUNT(CASE WHEN FormID='${ids[i]}' THEN 1 END)`,
      alias: ids[i],
      value,
    })),
  };
}

function idRange(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `form-${i}`);
}

describe('completeResponseCountQueries', () => {
  it('counts Complete responses only, server-side, returning no rows', () => {
    const [query] = completeResponseCountQueries(['f1']);
    expect(query.EntityName).toBe(FORMS_ENTITY.FormResponse);
    expect(query.ExtraFilter).toBe(`Status='Complete'`);
    expect(query.ResultType).toBe('count_only');
  });

  it('asks for one conditional COUNT per form, aliased by the form id', () => {
    const [query] = completeResponseCountQueries(['f1', 'f2']);
    expect(query.Aggregates).toEqual([
      { expression: "COUNT(CASE WHEN FormID='f1' THEN 1 END)", alias: 'f1' },
      { expression: "COUNT(CASE WHEN FormID='f2' THEN 1 END)", alias: 'f2' },
    ]);
  });

  it('quotes an id containing a quote rather than splicing it raw', () => {
    const [query] = completeResponseCountQueries(["o'brien"]);
    expect(query.Aggregates?.[0].expression).toContain("'o''brien'");
  });

  it('asks once for an id requested twice', () => {
    const [query] = completeResponseCountQueries(['f1', 'f1', 'f2']);
    expect(query.Aggregates?.map((a) => a.alias)).toEqual(['f1', 'f2']);
  });

  it('splits more than the cap into several queries for one batch', () => {
    const queries = completeResponseCountQueries(idRange(MAX_FORMS_PER_COUNT_QUERY + 1));
    expect(queries).toHaveLength(2);
    expect(queries[0].Aggregates).toHaveLength(MAX_FORMS_PER_COUNT_QUERY);
    expect(queries[1].Aggregates?.map((a) => a.alias)).toEqual([`form-${MAX_FORMS_PER_COUNT_QUERY}`]);
  });

  it('builds no query for no forms', () => {
    expect(completeResponseCountQueries([])).toEqual([]);
  });
});

describe('readCompleteResponseCounts', () => {
  it('maps every requested form to its count, keeping a real zero', () => {
    const counts = readCompleteResponseCounts(['f1', 'f2'], [countResult([712, 0], ['f1', 'f2'])]);
    expect([...counts]).toEqual([
      ['f1', 712],
      ['f2', 0],
    ]);
  });

  it('accepts the numeric strings GraphQL delivers', () => {
    const counts = readCompleteResponseCounts(['f1'], [countResult(['19'], ['f1'])]);
    expect(counts.get('f1')).toBe(19);
  });

  it('reads counts across chunks, beyond the 1000-row view cap', () => {
    const ids = idRange(MAX_FORMS_PER_COUNT_QUERY + 1);
    const first = ids.slice(0, MAX_FORMS_PER_COUNT_QUERY);
    const counts = readCompleteResponseCounts(ids, [
      countResult(first.map(() => 3), first),
      countResult([1309], [ids[MAX_FORMS_PER_COUNT_QUERY]]),
    ]);
    expect(counts.size).toBe(ids.length);
    expect(counts.get(`form-${MAX_FORMS_PER_COUNT_QUERY}`)).toBe(1309);
  });

  it('throws with the server error when a count query failed', () => {
    const failed = { ...countResult([1], ['f1']), Success: false, ErrorMessage: 'boom' };
    expect(() => readCompleteResponseCounts(['f1'], [failed])).toThrow(/boom/);
  });

  it('throws when a chunk has no result at all', () => {
    expect(() => readCompleteResponseCounts(['f1'], [])).toThrow(/chunk 1/);
  });

  it('throws when the aggregates are missing', () => {
    const bare = { ...countResult([], []), AggregateResults: undefined };
    expect(() => readCompleteResponseCounts(['f1'], [bare])).toThrow(/expected 1 aggregate/);
  });

  it('throws when the aggregate count does not match the forms asked about', () => {
    expect(() => readCompleteResponseCounts(['f1', 'f2'], [countResult([1], ['f1'])])).toThrow(
      /expected 2 aggregate/,
    );
  });

  it('throws naming the form whose aggregate errored', () => {
    const result = countResult([1], ['f1']);
    result.AggregateResults![0].error = 'invalid expression';
    expect(() => readCompleteResponseCounts(['f1'], [result])).toThrow(/f1.*invalid expression/);
  });

  it.each([['abc'], [-1], [1.5], [null]])('throws naming the form on a non-count value %s', (value) => {
    const result = countResult([0], ['f1']);
    result.AggregateResults![0].value = value;
    expect(() => readCompleteResponseCounts(['f1'], [result])).toThrow(/f1/);
  });
});

describe('loadCompleteResponseCounts', () => {
  it('makes no request when there are no forms to count', async () => {
    const RunViews = vi.fn<(params: RunViewParams[]) => Promise<RunViewResult[]>>();
    const counts = await loadCompleteResponseCounts({ RunViews }, []);
    expect(counts.size).toBe(0);
    expect(RunViews).not.toHaveBeenCalled();
  });

  it('sends every chunk in one batch and reads the counts back', async () => {
    const ids = idRange(MAX_FORMS_PER_COUNT_QUERY + 1);
    const RunViews = vi.fn(async (params: RunViewParams[]) =>
      params.map((p) => {
        const aliases = (p.Aggregates ?? []).map((a) => a.alias ?? '');
        return countResult(aliases.map(() => '2'), aliases);
      }),
    );
    const counts = await loadCompleteResponseCounts({ RunViews }, ids);
    expect(RunViews).toHaveBeenCalledTimes(1);
    expect(RunViews.mock.calls[0][0]).toHaveLength(2);
    expect(counts.get('form-0')).toBe(2);
    expect(counts.size).toBe(ids.length);
  });
});
