/**
 * What the Responses table is showing — one search, one sort, one page — as a single value.
 *
 * The table used to load 200 responses and filter them in the browser, so a search on a larger form
 * answered "nothing found" for a respondent the form did have (UI audit F08). Now the server
 * searches, sorts and pages (`Forms.ListResponses`), and this value is everything the client needs
 * to say which page it wants: the table renders it, the tab reads with it, and the URL carries it
 * (UI audit F09). One place decides the defaults, the page maths and what a bad URL value means.
 */
import { MAX_RESPONSE_SEARCH_LENGTH, type FormsListResponsesInput } from '@mj-biz-apps/forms-entities';

export type ResponseSort = 'newest' | 'oldest';
export const RESPONSE_PAGE_SIZES = [25, 50, 100] as const;
export type ResponsePageSize = (typeof RESPONSE_PAGE_SIZES)[number];

export interface ResponseQuery {
  /** As typed; trimmed when sent. */
  search: string;
  sort: ResponseSort;
  /** 1-based. */
  page: number;
  pageSize: ResponsePageSize;
}

export const DEFAULT_RESPONSE_QUERY: ResponseQuery = { search: '', sort: 'newest', page: 1, pageSize: 25 };

/** The operation input for this page. The list shows Complete responses only — a Partial is an autosave. */
export function toListInput(formId: string, query: ResponseQuery): FormsListResponsesInput {
  const search = query.search.trim();
  return {
    FormID: formId,
    Status: 'Complete',
    StartRow: (query.page - 1) * query.pageSize,
    MaxRows: query.pageSize,
    OrderBy: query.sort === 'oldest' ? 'SubmittedAt ASC' : 'SubmittedAt DESC',
    IncludeAnswers: false,
    Search: search === '' ? null : search,
  };
}

/** How many pages `total` responses make; at least one, so "page 1 of 1" is always true. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * The query a URL describes. Never throws: a value a person mistyped or an old link carries falls
 * back to the default for that part, so a bad link still opens the table.
 */
export function queryFromParams(params: Record<string, string | undefined>): ResponseQuery {
  const page = Number(params['page']);
  const size = Number(params['size']);
  return {
    search: (params['q'] ?? '').slice(0, MAX_RESPONSE_SEARCH_LENGTH),
    sort: params['sort'] === 'oldest' ? 'oldest' : 'newest',
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULT_RESPONSE_QUERY.page,
    pageSize: RESPONSE_PAGE_SIZES.find((s) => s === size) ?? DEFAULT_RESPONSE_QUERY.pageSize,
  };
}

/** The URL params for `query`; a part at its default is `null`, which removes it from the URL. */
export function queryToParams(query: ResponseQuery): Record<string, string | null> {
  const search = query.search.trim();
  return {
    q: search === '' ? null : search,
    sort: query.sort === DEFAULT_RESPONSE_QUERY.sort ? null : query.sort,
    page: query.page === DEFAULT_RESPONSE_QUERY.page ? null : String(query.page),
    size: query.pageSize === DEFAULT_RESPONSE_QUERY.pageSize ? null : String(query.pageSize),
  };
}
