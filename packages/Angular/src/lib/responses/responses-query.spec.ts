import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESPONSE_QUERY,
  pageCount,
  queryFromParams,
  queryToParams,
  toListInput,
  type ResponseQuery,
} from './responses-query';

describe('the Responses table query', () => {
  it('starts on the newest 25, unsearched', () => {
    expect(DEFAULT_RESPONSE_QUERY).toEqual({ search: '', sort: 'newest', page: 1, pageSize: 25 });
  });

  it('asks the server for exactly one page of Complete responses', () => {
    const q: ResponseQuery = { search: ' ann ', sort: 'oldest', page: 3, pageSize: 50 };
    expect(toListInput('f1', q)).toEqual({
      FormID: 'f1',
      Status: 'Complete',
      StartRow: 100,
      MaxRows: 50,
      OrderBy: 'SubmittedAt ASC',
      IncludeAnswers: false,
      Search: 'ann',
    });
  });

  it('sends no search when the box is blank', () => {
    expect(toListInput('f1', DEFAULT_RESPONSE_QUERY)).toMatchObject({ StartRow: 0, MaxRows: 25, OrderBy: 'SubmittedAt DESC', Search: null });
  });

  it('round-trips through URL params, leaving defaults out', () => {
    const q: ResponseQuery = { search: 'ann lee', sort: 'oldest', page: 2, pageSize: 100 };
    expect(queryToParams(q)).toEqual({ q: 'ann lee', sort: 'oldest', page: '2', size: '100' });
    expect(queryFromParams(queryToParams(q) as Record<string, string>)).toEqual(q);
    expect(queryToParams(DEFAULT_RESPONSE_QUERY)).toEqual({ q: null, sort: null, page: null, size: null });
  });

  it.each([
    [{ page: '-3' }, {}],
    [{ page: '2.5' }, {}],
    [{ page: 'abc' }, {}],
    [{ size: '37' }, {}],
    [{ sort: 'random' }, {}],
    [{ q: 'x'.repeat(150) }, { search: 'x'.repeat(100) }],
  ])('ignores a bad param %j rather than throwing', (params, expected) => {
    expect(queryFromParams(params)).toEqual({ ...DEFAULT_RESPONSE_QUERY, ...expected });
  });

  it('counts pages, with at least one', () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(217, 50)).toBe(5);
  });
});
