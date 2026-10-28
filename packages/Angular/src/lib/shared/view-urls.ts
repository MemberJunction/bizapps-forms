/**
 * What each Forms surface keeps in the URL, so a reload or a shared link lands where the reader was
 * (UI audit F09: the builder tab, the open response, the home search and the Analytics form all
 * lived only in memory).
 *
 * One codec per surface, each a pair of pure functions: params → view, view → params. Every reader
 * is total — an unknown value, a mistyped link, an id that is not an id all fall back to that part's
 * default, so a bad link still opens the page. Every writer gives `null` for a part at its default,
 * which removes it from the URL, so the plain URL stays the plain URL.
 *
 * The params go through MJ's own tab-scoped query params (`BaseResourceComponent.UpdateQueryParams`
 * and `NavigationService`), never the Angular router: Explorer's shell owns the URL and keeps it in
 * step with its tabs. The builder's tab is `?view=`, not `?tab=`: the shell reads `?tab=` itself, to
 * pick a workspace tab.
 */
import { queryFromParams, queryToParams, type ResponseQuery } from '../responses/responses-query';

type Params = Record<string, string | undefined>;
type ParamWrites = Record<string, string | null>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function guidOrNull(value: string | undefined): string | null {
  return value && GUID.test(value) ? value : null;
}

// --- Forms home -------------------------------------------------------------

export interface HomeView {
  query: string;
  showArchived: boolean;
}

export function homeViewFromParams(params: Params): HomeView {
  return { query: params['q'] ?? '', showArchived: params['archived'] === '1' };
}

export function homeViewToParams(view: HomeView): ParamWrites {
  const query = view.query.trim();
  return { q: query === '' ? null : query, archived: view.showArchived ? '1' : null };
}

// --- Responses & Analytics --------------------------------------------------

export type ReportingMode = 'insights' | 'responses';

export interface ReportingView {
  formId: string | null;
  view: ReportingMode;
}

export function reportingViewFromParams(params: Params): ReportingView {
  return { formId: guidOrNull(params['form']), view: params['view'] === 'responses' ? 'responses' : 'insights' };
}

export function reportingViewToParams(view: ReportingView): ParamWrites {
  return { form: view.formId, view: view.view === 'responses' ? 'responses' : null };
}

// --- The builder -------------------------------------------------------------

export const BUILDER_TABS = ['build', 'design', 'distribute', 'automate', 'responses'] as const;
export type BuilderTab = (typeof BUILDER_TABS)[number];

export interface BuilderView {
  view: BuilderTab;
  /** The Responses tab's table and open response; only written while that tab is showing. */
  responses: { query: ResponseQuery; responseId: string | null };
}

export function builderViewFromParams(params: Params): BuilderView {
  const view = BUILDER_TABS.find((t) => t === params['view']) ?? 'build';
  return { view, responses: { query: queryFromParams(params), responseId: guidOrNull(params['response']) } };
}

export function builderViewToParams(state: BuilderView): ParamWrites {
  const onResponses = state.view === 'responses';
  const table = queryToParams(state.responses.query);
  return {
    view: state.view === 'build' ? null : state.view,
    q: onResponses ? table['q'] : null,
    sort: onResponses ? table['sort'] : null,
    page: onResponses ? table['page'] : null,
    size: onResponses ? table['size'] : null,
    response: onResponses ? state.responses.responseId : null,
  };
}

/**
 * Whether `url` is the record view of `recordId` — Explorer's `…/ID|<id>` record segment, encoded
 * or not, any case. The builder reads its params from the address bar only when it is, so a builder
 * restored in a background tab never adopts another tab's URL.
 */
export function urlNamesRecord(url: string, recordId: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch (err) {
    // Only a malformed escape is expected (and is a correct "no": Explorer cannot have built it).
    if (!(err instanceof URIError)) {
      throw err;
    }
    decoded = path;
  }
  return decoded.toLowerCase().includes(`id|${recordId.toLowerCase()}`);
}
