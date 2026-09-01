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
 *
 * `expired` is terminal, like `done`, and unlike `error`: the anonymous session JWT has lapsed,
 * MJ issues no refresh tokens, and every request this widget could still make is a certain 401.
 * The form stays mounted underneath the notice (it is not an `@case` of its own), but every
 * guard that reads `ready` — autosave, knockouts, checkpoints, submit — now refuses, which is
 * the whole reason this is a phase and not a flag beside one.
 */
export type WidgetPhase = 'loading' | 'welcome' | 'ready' | 'submitting' | 'done' | 'error' | 'expired';

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
 * Whether a submit attempt should be IGNORED. A submit is ignored while one is already in
 * flight ('submitting'), once the widget has confirmed ('done') — the double-submit guard — and
 * once the session has expired ('expired'), where it would not be a retry but a guaranteed
 * refusal. From any other phase the submit proceeds.
 */
export function shouldIgnoreSubmit(phase: WidgetPhase): boolean {
  return phase === 'submitting' || phase === 'done' || phase === 'expired';
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
