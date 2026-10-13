/**
 * Where a response ends up — which ending screen, whether it is screened out, whether a rule ended
 * the form early — from ONE derivation meant for both the author's Preview and the live server
 * (#75).
 *
 * The widget used to reach this over its own one-pass mirror of the server (`transmittedView`)
 * while the server reached it over the raw payload, so a score-gated ending could differ between
 * what an author previewed and what a respondent got. This settles visibility first
 * ({@link settleVisibility}), scores the settled answerable questions, and resolves the outcome over
 * the settled answers.
 *
 * WHO CALLS IT TODAY: the widget only. The server still judges its knockout over the raw payload
 * (`buildAnswerMap` + `resolveFormOutcome` in forms-server's `submit-pipeline.ts`) and resolves the
 * confirmation ending with a one-pass score; moving the server onto this function is #303 Task 8
 * (FormSubmissionEngine). Until then the two agree for every payload the widget builds — that
 * payload is already the settled set — but not for a crafted one.
 */
import { computeScore } from './scoring';
import { resolveFormOutcome, type FormOutcome } from './rule-verbs';
import type { AnswerValue } from './conditional-rule';
import type { PublishedFormDefinition } from './form-definition';
import { settleVisibility, type SettledVisibility } from './visibility';

/** The outcome, plus what it was decided from. */
export interface ResponseOutcome {
  readonly outcome: FormOutcome;
  /** The running total over the settled answerable questions. */
  readonly score: number;
  /** The settled visibility the outcome was read from — including whether it settled at all. */
  readonly visibility: SettledVisibility;
}

/** Resolve the outcome for these answers. Pure. */
export function resolveResponseOutcome(
  definition: Pick<PublishedFormDefinition, 'pages' | 'endScreens'>,
  answers: ReadonlyMap<string, AnswerValue>,
): ResponseOutcome {
  const visibility = settleVisibility(definition, answers);
  const score = computeScore(visibility.answerable, visibility.answers);
  const outcome = resolveFormOutcome(
    [...definition.pages].sort((a, b) => a.displayOrder - b.displayOrder),
    definition.endScreens ?? [],
    visibility.answers,
    { score },
  );
  return { outcome, score, visibility };
}
