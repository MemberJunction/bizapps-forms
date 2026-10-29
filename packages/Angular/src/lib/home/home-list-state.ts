/** What the Forms home shows where the list goes. */
export type HomeListState = 'loading' | 'failed' | 'first-run' | 'all-archived' | 'no-match' | 'list';

export interface HomeListInput {
  loading: boolean;
  /** The last read of the list failed. */
  failed: boolean;
  /** Every form loaded, archived ones included. */
  total: number;
  archived: number;
  /** Forms left after the search and the archived toggle. */
  visible: number;
  query: string;
  showArchived: boolean;
}

/**
 * `failed` is its own state because an empty list after a failed read would otherwise say "No forms
 * yet" — a claim about the data the page cannot make. A list already on screen wins over a failed
 * reload, the same rule the reporting rail follows (`railState`); the banner reports that failure.
 */
export function homeListState(s: HomeListInput): HomeListState {
  if (s.loading) return 'loading';
  if (s.total === 0) return s.failed ? 'failed' : 'first-run';
  if (s.visible > 0) return 'list';
  if (s.query.trim() === '' && !s.showArchived && s.archived === s.total) return 'all-archived';
  return 'no-match';
}
