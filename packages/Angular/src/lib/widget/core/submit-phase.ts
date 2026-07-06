/**
 * Pure phase-transition helpers for the respondent widget's submit lifecycle.
 *
 * Framework-free (no Angular, no signals) so the state machine that decides "did this submit
 * reach the confirmation screen?" is unit-testable in isolation — the component just wires
 * these to its `phase` signal. This is the guard layer that closes the "success but no
 * thank-you screen" and "double-submit" bugs.
 */
import type { FormSubmissionResult } from '@mj-biz-apps/forms-entities';

/** Lifecycle phase of the widget. Mirrors the component's `WidgetPhase`. */
export type WidgetPhase = 'loading' | 'ready' | 'submitting' | 'done' | 'error';

/**
 * Whether a submit attempt should be IGNORED as re-entrant. A submit is ignored while one is
 * already in flight ('submitting') or the widget has already confirmed ('done') — the
 * double-submit guard. From any other phase the submit proceeds.
 */
export function shouldIgnoreSubmit(phase: WidgetPhase): boolean {
  return phase === 'submitting' || phase === 'done';
}

/** The phase a submit result maps to, plus whether the widget should redirect. */
export interface SubmitOutcome {
  phase: WidgetPhase;
  /** True only when a redirect URL is present on a successful result. */
  redirect: boolean;
}

/**
 * Decide the phase (and redirect intent) for a submit RESULT. On success the widget ALWAYS
 * reaches 'done' — for both render modes and whether or not a redirect URL is set (a redirect
 * still shows 'done' first, so a blocked/slow navigation never leaves a blank screen). On
 * failure it returns to 'ready' so the respondent can fix + retry.
 */
export function outcomeForResult(result: FormSubmissionResult): SubmitOutcome {
  if (!result.success) {
    return { phase: 'ready', redirect: false };
  }
  return { phase: 'done', redirect: Boolean(result.redirectUrl) };
}
