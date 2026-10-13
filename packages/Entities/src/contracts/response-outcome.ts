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
 * WHO CALLS IT: the author's Preview in the widget, and the server on every respondent save
 * (`FormSubmissionEngine.SaveResponse`, #303 Task 8) — the knockout, the score and the ending all
 * come from this one call over the SETTLED answers, so a crafted payload that answers a hidden
 * question cannot fire a knockout or move a score the respondent never saw.
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
