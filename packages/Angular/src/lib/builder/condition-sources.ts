/**
 * The condition editor's model: what a rule can reference, and how each condition's comparison
 * value should be edited. Pure functions, no Angular — the editor component renders these
 * answers; it does not compute them. (RULES_AND_BRANCHING_PLAN Phase A1.)
 */
import {
  MAX_CONDITIONS_PER_GROUP,
  isFormQuestionType,
  questionTypeBehavior,
  type ConditionalOperator,
  type ConditionValue,
} from '@mj-biz-apps/forms-entities';
import { publishedOptionIdentities, type PublishableOptionFields } from './option-labels';

/** A selectable answer the value picker offers — label shown, value stored. */
export interface ConditionalSourceOption {
  label: string;
  value: string;
}

/** A question a rule may reference (for questions: preceding ones only; for endings: all). */
export interface ConditionalSourceQuestion {
  id: string;
  prompt: string;
  /**
   * The published option identities when the source question is option-driven; absent for
   * free-input questions. These are EXACTLY the values a published form stores as answers —
   * same display-order sort, same `Value ?? Label` fallback, same uniqueness rewrite as the
   * snapshot builder, all via {@link publishedOptionIdentities}.
   */
  options?: ConditionalSourceOption[];
}

/** The question fields {@link toConditionalSource} reads — structural, so specs need no BaseEntity. */
export interface ConditionSourceQuestionFields {
  ID: string;
  Prompt: string;
  QuestionType: string;
}

/**
 * Map a builder question (entity + option rows) to what the condition editor can offer.
 *
 * Options are attached only for `values`/`images` option modes: a Matrix's options are axes,
 * and a Matrix answer is an object no operator can match an option value against — offering
 * them would fill the picker with values that can never fire. An unknown question type (a
 * stale row, an unshipped type) degrades to a plain source rather than guessing.
 */
export function toConditionalSource(
  question: ConditionSourceQuestionFields,
  options: readonly PublishableOptionFields[],
): ConditionalSourceQuestion {
  const source: ConditionalSourceQuestion = { id: question.ID, prompt: question.Prompt };
  if (!isFormQuestionType(question.QuestionType)) {
    return source;
  }
  const mode = questionTypeBehavior(question.QuestionType).optionMode;
  if (mode !== 'values' && mode !== 'images') {
    return source;
  }
  const identities = publishedOptionIdentities(options).map(({ label, value }) => ({ label, value }));
  if (identities.length > 0) {
    source.options = identities;
  }
  return source;
}

/** One operator with its human-readable label. */
export interface OperatorChoice {
  op: ConditionalOperator;
  label: string;
}

/**
 * Every operator, in the order the editor offers them, with the labels shown wherever a rule
 * is edited or summarized. One list — the operator dropdown and the rule-card summaries must
 * never name the same operator differently.
 */
export const OPERATOR_CHOICES = [
  { op: 'equals', label: 'equals' },
  { op: 'notEquals', label: 'does not equal' },
  { op: 'in', label: 'is one of' },
  { op: 'notIn', label: 'is not one of' },
  { op: 'greaterThan', label: 'is greater than' },
  { op: 'lessThan', label: 'is less than' },
  { op: 'isAnswered', label: 'is answered' },
  { op: 'isNotAnswered', label: 'is not answered' },
] as const satisfies ReadonlyArray<OperatorChoice>;

/**
 * Adding an operator to the contract without a label here is a compile error.
 *
 * {@link operatorLabel} falls back to the raw operator name, which is a reasonable runtime
 * posture and a terrible way to find out: the menu quietly gains a row reading `notIn` and
 * every summary of a rule using it reads back in code. This assignment fails to typecheck the
 * moment `ConditionalOperator` gains a member the list does not carry.
 */
const _everyOperatorHasALabel: Record<ConditionalOperator, true> = Object.fromEntries(
  OPERATOR_CHOICES.map((choice) => [choice.op, true]),
) as Record<(typeof OPERATOR_CHOICES)[number]['op'], true>;
void _everyOperatorHasALabel;

/** The label for one operator (falls back to the raw name for an operator not in the list). */
export function operatorLabel(op: ConditionalOperator): string {
  return OPERATOR_CHOICES.find((o) => o.op === op)?.label ?? op;
}

/** Operators that take no comparison value at all. */
const VALUELESS_OPERATORS: ReadonlySet<ConditionalOperator> = new Set<ConditionalOperator>([
  'isAnswered',
  'isNotAnswered',
]);

/** Whether an operator needs a comparison value entered. */
export function operatorNeedsValue(op: ConditionalOperator): boolean {
  return !VALUELESS_OPERATORS.has(op);
}

/** How one condition's comparison value should be edited. */
export type ValueEditorKind = 'none' | 'text' | 'select' | 'checklist';

/**
 * Pick the value editor for a condition.
 *
 * Equality operators against an option-driven source get a picker — this is the A1 fix: a
 * hand-typed value that mismatches an option's case or wording fails `===` forever with no
 * warning, so the author should never have to type one. Membership operators get a checklist.
 * Ordering operators keep free text even when options exist, because their natural operand
 * (a number, a date) is not an option identity.
 */
export function valueEditorKind(op: ConditionalOperator, hasOptions: boolean): ValueEditorKind {
  if (!operatorNeedsValue(op)) {
    return 'none';
  }
  if (!hasOptions) {
    return 'text';
  }
  switch (op) {
    case 'in':
    case 'notIn':
      return 'checklist';
    case 'equals':
    case 'notEquals':
      return 'select';
    default:
      return 'text';
  }
}

/** `in` / `notIn` take a list (comma-separated when typed); everything else a scalar string. */
export function coerceConditionValue(op: ConditionalOperator, raw: string): ConditionValue {
  if (op === 'in' || op === 'notIn') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return raw;
}

/**
 * Toggle one option's membership in a checklist value.
 *
 * Entries that are no longer options (deleted after the rule was authored) are preserved
 * untouched — the rule keeps saying what it said, visibly wrong in the summary, rather than
 * being silently rewritten by an unrelated toggle.
 */
export function toggleMembership(
  current: ConditionValue | undefined,
  optionValue: string,
  checked: boolean,
): string[] {
  const list = Array.isArray(current) ? current.map((v) => String(v)) : [];
  const without = list.filter((v) => v !== optionValue);
  return checked ? [...without, optionValue] : without;
}

/**
 * The synthetic source id the condition editor uses for "Total score" — never a real question
 * id. Selecting it authors a `source: 'score'` condition (C4); it exists only in the editor's
 * dropdown and is never stored.
 */
export const SCORE_SOURCE_ID = '__mjf-total-score__';

/** The pseudo-source a host appends where rules may band on the running score (ending screens). */
export const SCORE_SOURCE: ConditionalSourceQuestion = { id: SCORE_SOURCE_ID, prompt: 'Total score' };

/**
 * Whether a group may take another condition — the cap `MAX_CONDITIONS_PER_GROUP` declares.
 *
 * The contract documents this cap as enforced in the editor. It was not, anywhere, and the
 * other stated enforcement did not cover the authoring path either: the builder publishes
 * through the permissive JSON parser, not the zod schema, so an over-cap group published
 * without complaint and only failed later — on the SERVER, on every public load, where the
 * throw is caught and the rule becomes "no rule". A gate that cannot be read is a gate that is
 * not applied, so the item it guarded rendered for everyone. Refusing the 21st condition here
 * is what keeps that state unauthorable.
 */
export function canAddCondition(conditionCount: number): boolean {
  return conditionCount < MAX_CONDITIONS_PER_GROUP;
}
