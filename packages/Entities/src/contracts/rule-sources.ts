/**
 * Which answers a form's rules read — asked by the widget before it leaves an answer out of an
 * autosave (#303 Task 8 fix round 4, re-review R3-1/R3-2).
 *
 * The autosave leaves out a field the server cannot store, so one bad field does not get the whole
 * draft refused. That is safe only for a field no rule reads. To a rule, a field left out of the
 * payload is a field the respondent did not answer, and the server judges the payload it receives:
 *  - a show rule on it hides the question that depends on it, and the server drops that answer and
 *    then DELETES its saved draft row (R3-1);
 *  - an `isNotAnswered` / `notEquals` knockout on it fires on an answer the respondent DID give, and
 *    the partial save comes back `ended` with the knockout screen (R3-2);
 *  - a scored field moves the total that a score condition reads;
 *  - an `OnPartial` automation's condition runs on the trimmed set.
 */
import type { ConditionalCondition, ConditionalGroup, ConditionalRule } from './conditional-rule';
import type { QuestionScoring } from './scoring';

/** The parts of a definition that carry rules — structural, so the full snapshot and the respondent projection both qualify. */
export interface RuleBearingDefinition {
  readonly pages: readonly {
    readonly conditionalRule?: ConditionalRule;
    readonly questions: readonly { readonly id: string; readonly conditionalRule?: ConditionalRule; readonly scoring?: QuestionScoring }[];
  }[];
  /** Absent on the respondent projection — which is what makes the projection unable to vouch (see {@link rulesMayRead}). */
  readonly endScreens?: readonly { readonly conditionalRule?: ConditionalRule }[];
  readonly automations?: readonly { readonly conditionalRule?: ConditionalRule }[];
}

/**
 * Whether any rule the server applies to this form may read one of `questionIds` — directly, or
 * through the score when one of them is scored and some rule reads the score. Pure.
 *
 * A definition WITHOUT `endScreens` answers `true` for any non-empty list. That is the respondent
 * projection (`toRespondentDefinition`, #302), which the widget holds in production: it removes
 * knockout jumps, every ending, score conditions, scoring and automations so a respondent cannot
 * read them — and those are exactly the rules a left-out field can still trip on the server. The
 * projection therefore cannot show that nothing reads a field, and the safe answer is that
 * something might. The full snapshot always carries `endScreens` (empty when the form has none).
 */
export function rulesMayRead(definition: RuleBearingDefinition, questionIds: readonly string[]): boolean {
  if (questionIds.length === 0) {
    return false;
  }
  if (definition.endScreens === undefined) {
    return true;
  }
  const ids = new Set(questionIds);
  const conditions = everyCondition(definition);
  if (conditions.some((condition) => condition.source !== 'score' && condition.questionId !== undefined && ids.has(condition.questionId))) {
    return true;
  }
  return (
    conditions.some((condition) => condition.source === 'score') &&
    definition.pages.some((page) => page.questions.some((question) => ids.has(question.id) && question.scoring !== undefined))
  );
}

/** Every condition in every rule the definition carries: questions, pages, endings and automations. */
function everyCondition(definition: RuleBearingDefinition): ConditionalCondition[] {
  const rules: (ConditionalRule | undefined)[] = [
    ...definition.pages.flatMap((page) => [page.conditionalRule, ...page.questions.map((question) => question.conditionalRule)]),
    ...(definition.endScreens ?? []).map((screen) => screen.conditionalRule),
    ...(definition.automations ?? []).map((automation) => automation.conditionalRule),
  ];
  return rules.flatMap((rule) =>
    rule ? [...groupConditions(rule.show), ...(rule.jump ?? []).flatMap((jump) => groupConditions(jump.when))] : [],
  );
}

function groupConditions(group: ConditionalGroup | undefined): ConditionalCondition[] {
  return group ? [...(group.all ?? []), ...(group.any ?? [])] : [];
}
