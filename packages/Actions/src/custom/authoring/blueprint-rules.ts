/**
 * Translating a blueprint's key-referencing rules into the id-referencing JSON the database and
 * the widget share.
 *
 * Pure, and separate from the Builder for that reason: this is the one part of persistence with no
 * entity I/O in it, so it is testable without a fake `Metadata` and provable on its own. It is also
 * the step most worth proving — a rule that persists with the wrong reference produces a form that
 * renders correctly and behaves wrongly, which no amount of looking at the builder will reveal.
 */
import type { ConditionalCondition, ConditionalRule } from '@mj-biz-apps/forms-entities';
import { conditionsOf, type BlueprintCondition, type BlueprintConditionalRule } from './form-blueprint';

/** Question key to the `FormQuestion.ID` the Builder minted for it. */
export type QuestionIdByKey = ReadonlyMap<string, string>;

/**
 * Raised when a rule names a key that never became a question.
 *
 * Unreachable through the AI path — {@link parseFormBlueprint}'s key-integrity check rejects an
 * unknown reference before the Builder ever runs — but reachable through the starter templates,
 * which are hand-written objects handed straight to the Builder without parsing. Loud is right for
 * both: a template with a typo'd key should fail during development, not ship forms whose rules
 * quietly match nothing.
 */
export class BlueprintRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlueprintRuleError';
  }
}

/**
 * The JSON to store in a `ConditionalRule` column, or `null` when there is no rule.
 *
 * `null` rather than `'{}'` deliberately: the column's meaning is "no rule ⇒ always visible" on a
 * page or question, and an empty-object rule and a NULL one are read identically by the parsers —
 * so writing NULL keeps the stored data saying what it means.
 */
export function conditionalRuleJSON(
  rule: BlueprintConditionalRule | undefined,
  idByKey: QuestionIdByKey,
  context: string,
): string | null {
  const resolved = resolveConditionalRule(rule, idByKey, context);
  return resolved ? JSON.stringify(resolved) : null;
}

/** The rule with every `questionKey` replaced by its real id, or `undefined` when there is none. */
export function resolveConditionalRule(
  rule: BlueprintConditionalRule | undefined,
  idByKey: QuestionIdByKey,
  context: string,
): ConditionalRule | undefined {
  if (!rule?.show || conditionsOf(rule).length === 0) {
    return undefined;
  }
  const show: ConditionalRule['show'] = {};
  if (rule.show.all?.length) {
    show.all = rule.show.all.map((c) => resolveCondition(c, idByKey, context));
  }
  if (rule.show.any?.length) {
    show.any = rule.show.any.map((c) => resolveCondition(c, idByKey, context));
  }
  return { show };
}

function resolveCondition(
  condition: BlueprintCondition,
  idByKey: QuestionIdByKey,
  context: string,
): ConditionalCondition {
  const questionId = idByKey.get(condition.questionKey);
  if (!questionId) {
    throw new BlueprintRuleError(
      `${context} references question key "${condition.questionKey}", which no persisted question ` +
        `carries. Known keys: ${[...idByKey.keys()].join(', ') || '(none)'}.`,
    );
  }
  // Rebuilt field by field rather than spread-and-overwrite so `questionKey` cannot survive into
  // the stored JSON as a stray property beside the id it was replaced by.
  const resolved: ConditionalCondition = { questionId, op: condition.op };
  if (condition.value !== undefined) {
    resolved.value = condition.value;
  }
  return resolved;
}
