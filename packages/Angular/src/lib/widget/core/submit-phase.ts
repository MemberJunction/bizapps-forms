/**
 * Pure phase-transition helpers for the respondent widget's submit lifecycle.
 *
 * Framework-free (no Angular, no signals) so the state machine that decides "did this submit
 * reach the confirmation screen?" is unit-testable in isolation — the component just wires
 * these to its `phase` signal. This is the guard layer that closes the "success but no
 * thank-you screen" and "double-submit" bugs.
 */
import type { FormSubmissionResult, PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

/**
 * Lifecycle phase of the widget. Mirrors the component's `WidgetPhase`.
 *
 * `welcome` sits between `loading` and `ready` and is where the separation of screens from
 * intake actually lives: a welcome screen is not a page, not a question and not a step in the
 * form — it is a phase the shell is in before the form exists to the respondent at all. The
 * intake components are not even constructed while it is showing.
 */
export type WidgetPhase = 'loading' | 'welcome' | 'ready' | 'submitting' | 'done' | 'error';

/**
 * The phase a freshly-loaded definition starts in.
 *
 * A form with a welcome screen opens on it; every other form goes straight to the questions,
 * which is what every form published before screens existed does.
 */
export function initialPhaseFor(definition: Pick<PublishedFormDefinition, 'welcomeScreen'>): WidgetPhase {
  return definition.welcomeScreen ? 'welcome' : 'ready';
}

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

/**
 * The phase a RESUMED draft opens in, from the status the server reported for it.
 *
 * A sealed row goes straight to `done` — the confirmation phase — and that is the whole of "decide
 * sealed at MOUNT". It matters because the widget cannot learn it later: `savePartial` ignores the
 * result's status, and the pipeline answers a partial against a sealed row with `success: true`, so
 * a respondent who was allowed to start typing would type into a row that will never accept another
 * answer. Reaching `done` also makes `shouldIgnoreSubmit` true, so no submit can be issued from
 * that screen at all.
 *
 * `Partial` is the only resumable status, and it opens where a fresh load would — never on the
 * welcome screen, because somebody who is coming BACK has already been welcomed.
 */
export function resumedPhaseFor(status: FormSubmissionResult['status']): WidgetPhase {
  return status === 'Partial' ? 'ready' : 'done';
}
