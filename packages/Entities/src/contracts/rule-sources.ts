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

/** The parts of a FULL definition that carry rules — the published snapshot, or the author's draft. */
export interface RuleBearingDefinition {
  readonly pages: readonly {
    readonly conditionalRule?: ConditionalRule;
    readonly questions: readonly { readonly id: string; readonly conditionalRule?: ConditionalRule; readonly scoring?: QuestionScoring }[];
  }[];
  /** Required: a full definition always carries its endings (empty when the form has none). */
  readonly endScreens: readonly { readonly conditionalRule?: ConditionalRule }[];
  readonly automations?: readonly { readonly conditionalRule?: ConditionalRule }[];
}

/**
 * What the caller holds — and therefore what it can know about the rules the server applies.
 *
 *  - `full`: the published snapshot or the author's draft; every rule the server applies is in it.
 *  - `projection`: the respondent projection (`toRespondentDefinition`, #302), which the live widget
 *    holds. It has had knockout jumps, every ending, score conditions, scoring and automations
 *    removed so a respondent cannot read them — and those are exactly the rules a left-out field can
 *    still trip on the server. A projection can therefore never show that nothing reads a field.
 *
 * An explicit discriminant, not an inference from a missing key (#303 Task 10c, re-review N4-5). This
 * used to read "no `endScreens` means the projection"; the widget's own type promised `endScreens` was
 * always there, so the first `endScreens ?? []` written to satisfy that type would have made every
 * projection vouch for every field again (R3-2: a trimmed draft trips a knockout on an answer the
 * respondent gave). Now the holder says which it is, and a projection has nothing to pass as `full`.
 */
export type RuleHolder =
  | { readonly kind: 'projection' }
  | { readonly kind: 'full'; readonly definition: RuleBearingDefinition };

/**
 * Whether any rule the server applies to this form may read one of `questionIds` — directly, or
 * through the score when one of them is scored and some rule reads the score. Pure.
 *
 * A `projection` holder answers `true` for any non-empty list: it cannot see the rules that would
 * have to be checked, so the safe answer is that something might read the field (see {@link RuleHolder}).
 */
export function rulesMayRead(holder: RuleHolder, questionIds: readonly string[]): boolean {
  if (questionIds.length === 0) {
    return false;
  }
  if (holder.kind === 'projection') {
    return true;
  }
  return fullDefinitionReads(holder.definition, new Set(questionIds));
}

/** {@link rulesMayRead} for a definition that carries every rule the server applies. */
function fullDefinitionReads(definition: RuleBearingDefinition, ids: ReadonlySet<string>): boolean {
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
    ...definition.endScreens.map((screen) => screen.conditionalRule),
    ...(definition.automations ?? []).map((automation) => automation.conditionalRule),
  ];
  return rules.flatMap((rule) =>
    rule ? [...groupConditions(rule.show), ...(rule.jump ?? []).flatMap((jump) => groupConditions(jump.when))] : [],
  );
}

function groupConditions(group: ConditionalGroup | undefined): ConditionalCondition[] {
  return group ? [...(group.all ?? []), ...(group.any ?? [])] : [];
}
