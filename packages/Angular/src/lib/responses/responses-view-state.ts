/**
 * Which single view the responses surface should show.
 *
 * This exists because the states are not independent and the template got it wrong when
 * they were checked ad hoc: "no published version" and "the load failed" both presented as
 * an absent question list, so an API outage rendered as *"this form has never been
 * published"* — telling an author their live, response-collecting form did not exist.
 *
 * Making the resolution one total function over one state object means the precedence is
 * stated once, in a place a test can reach, instead of being implied by the order of
 * `@else if` branches.
 */

/** The mutually exclusive views the responses surface can be in. */
export type ResponsesView =
  /** Still fetching. */
  | 'loading'
  /** The fetch failed; the error banner explains it. Says nothing about publish state. */
  | 'failed'
  /** Loaded, and the form has no published version — so it cannot have responses yet. */
  | 'never-published'
  /** Loaded and published, but nothing has been submitted yet. */
  | 'no-responses'
  /** A single response is open. */
  | 'detail'
  /** The response list. */
  | 'list';

/** Everything the choice depends on. */
export interface ResponsesViewState {
  loading: boolean;
  /**
   * True when the load that POPULATES THIS VIEW failed — i.e. the list/questions load.
   * Distinct from "loaded, and there is nothing there", and deliberately NOT set by a
   * failure to open one response: that surfaces as a banner over a list the user can still
   * see and retry from, rather than blanking the surface they were working in.
   */
  failed: boolean;
  /** Whether the form has a published version. Only meaningful once loaded. */
  isPublished: boolean;
  rowCount: number;
  hasDetail: boolean;
}

/**
 * Precedence, and why: in flight beats everything; a FAILURE outranks every "empty"
 * reading, because an empty result we never received is not evidence of anything.
 */
export function resolveResponsesView(state: ResponsesViewState): ResponsesView {
  if (state.loading) return 'loading';
  if (state.failed) return 'failed';
  if (!state.isPublished) return 'never-published';
  if (state.hasDetail) return 'detail';
  if (state.rowCount === 0) return 'no-responses';
  return 'list';
}
