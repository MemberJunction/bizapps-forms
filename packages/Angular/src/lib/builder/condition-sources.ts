/**
 * The condition editor's model: what a rule can reference, and how each condition's comparison
 * value should be edited. Pure functions, no Angular — the editor component renders these
 * answers; it does not compute them. (RULES_AND_BRANCHING_PLAN Phase A1.)
 */
import {
  MAX_CONDITIONS_PER_GROUP,
  isFormQuestionType,
  questionTypeBehavior,
  type ConditionalCondition,
  type ConditionalOperator,
  type ConditionValue,
  type QuestionTypeBehavior,
} from '@mj-biz-apps/forms-entities';
import { publishedOptionIdentities, type PublishableOptionFields } from './option-labels';

/** A selectable answer the value picker offers — label shown, value stored. */
export interface ConditionalSourceOption {
  label: string;
  value: string;
}

/**
 * What shape of answer a source produces — the one fact the editor needs to offer the right
 * operators and the right value control.
 *
 * Derived from `QUESTION_TYPE_BEHAVIOR`, never from a hardcoded type list: a list goes stale
 * the next time a question type ships, and the failure is silent (the new type quietly gets
 * whatever the fallback arm gives it). `'score'` is the running total, which is not a question
 * at all but appears in the same menu.
 */
export type ConditionalSourceKind = 'singleChoice' | 'multiSelect' | 'number' | 'date' | 'text' | 'score';

/** A question a rule may reference (for questions: preceding ones only; for endings: all). */
export interface ConditionalSourceQuestion {
  id: string;
  prompt: string;
  /** See {@link ConditionalSourceKind} — what the editor offers for this source turns on it. */
  kind: ConditionalSourceKind;
  /**
   * The published option identities when the source question is option-driven; absent for
   * free-input questions. These are EXACTLY the values a published form stores as answers —
   * same display-order sort, same `Value ?? Label` fallback, same uniqueness rewrite as the
   * snapshot builder, all via {@link publishedOptionIdentities}.
   *
   * Absent does NOT mean "not a choice question": a choice question whose options the author
   * has not written yet has a `singleChoice`/`multiSelect` kind and no options. The two facts
   * are separate on purpose — reading the kind off this list would flip the question to free
   * text mid-authoring and let a value be typed that the finished question can never produce.
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
  const base = { id: question.ID, prompt: question.Prompt };
  if (!isFormQuestionType(question.QuestionType)) {
    return { ...base, kind: 'text' };
  }
  const behavior = questionTypeBehavior(question.QuestionType);
  const source: ConditionalSourceQuestion = { ...base, kind: sourceKindOf(behavior) };
  if (behavior.optionMode !== 'values' && behavior.optionMode !== 'images') {
    return source;
  }
  const identities = publishedOptionIdentities(options).map(({ label, value }) => ({ label, value }));
  if (identities.length > 0) {
    source.options = identities;
  }
  return source;
}

/** The fields of a question-type behavior row {@link sourceKindOf} reads. */
type SourceKindInputs = Pick<QuestionTypeBehavior, 'optionMode' | 'answerColumn' | 'multiValued'>;

/**
 * Classify a question type from its capabilities.
 *
 * Option modes first, because being option-driven is what decides whether a value is picked or
 * typed, and that is the decision with teeth. Then the answer column, which is what decides
 * whether ordering means anything: `compareOrdered` coerces numeric strings AND ISO dates, so a
 * Date question genuinely supports greater/less than — dropping it into `'text'` would take
 * working operators away.
 *
 * Everything else is `'text'`, including booleans and composites. A composite answer is an
 * object no operator compares, so its only useful conditions are the answered-pair, which every
 * kind offers.
 */
function sourceKindOf(behavior: SourceKindInputs): ConditionalSourceKind {
  if (behavior.optionMode === 'values' || behavior.optionMode === 'images') {
    return behavior.multiValued ? 'multiSelect' : 'singleChoice';
  }
  if (behavior.answerColumn === 'numeric') {
    return 'number';
  }
  if (behavior.answerColumn === 'date') {
    return 'date';
  }
  return 'text';
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

/**
 * The membership operators mean something different on a set-valued answer, and have to say so.
 *
 * `isMember` INTERSECTS when the answer is an array, so on a multi-select `in ['Sports']` reads
 * "your answer includes Sports" — where on a single answer it reads "your answer is one of
 * these". Same operator, same evaluator, two honest English readings. Keyed here, in the one
 * label function, rather than as a second choice list: two lists is how the dropdown and the
 * rule summary end up naming the same operator differently.
 */
const MULTI_SELECT_LABELS: Partial<Record<ConditionalOperator, string>> = {
  in: 'includes any of',
  notIn: 'includes none of',
};

/**
 * The label for one operator, in the voice of the source it reads (falls back to the raw name
 * for an operator not in the list — see the exhaustiveness assertion above for why that never
 * happens in practice).
 */
export function operatorLabel(op: ConditionalOperator, kind?: ConditionalSourceKind): string {
  if (kind === 'multiSelect' && MULTI_SELECT_LABELS[op]) {
    return MULTI_SELECT_LABELS[op];
  }
  return OPERATOR_CHOICES.find((o) => o.op === op)?.label ?? op;
}

/**
 * The operators offered for each kind of source — the menu an author actually sees.
 *
 * Narrower than the union on purpose, and the narrowing is correctness rather than taste:
 *
 *  - **multiSelect** gets neither equality operator. `scalarsEqual` returns `false` for any
 *    array answer, so `equals` can NEVER match a multi-select and `notEquals` — its negation —
 *    ALWAYS does. Both were offered, both were silently wrong, and in opposite directions.
 *  - **text** gets no ordering. `compareOrdered` on two arbitrary strings is a comparison no
 *    author meant to ask for.
 *  - **singleChoice** gets no `notIn`: "is not" already covers the single-exclusion case, and a
 *    menu that offers two ways to say the same thing costs a decision at every rule.
 *  - **score** gets no answered-pair. The running total is always a number; asking whether it
 *    is answered is a question with one answer.
 */
const OPERATORS_BY_KIND: Record<ConditionalSourceKind, ReadonlyArray<ConditionalOperator>> = {
  singleChoice: ['equals', 'notEquals', 'in', 'isAnswered', 'isNotAnswered'],
  multiSelect: ['in', 'notIn', 'isAnswered', 'isNotAnswered'],
  number: ['equals', 'notEquals', 'greaterThan', 'lessThan', 'isAnswered', 'isNotAnswered'],
  date: ['equals', 'notEquals', 'greaterThan', 'lessThan', 'isAnswered', 'isNotAnswered'],
  text: ['equals', 'notEquals', 'isAnswered', 'isNotAnswered'],
  score: ['greaterThan', 'lessThan', 'equals'],
};

/**
 * The operator menu for a source kind, labelled in that kind's voice.
 *
 * Pass `currentOp` when rendering an existing condition and the menu will carry that operator
 * even where the kind does not offer it. That is not politeness: a `<select>` whose `[value]`
 * is absent from its options renders BLANK, so a rule stored before this menu narrowed —
 * `equals` on a multi-select, say — would show an empty operator box on a row that reads
 * perfectly well in the database. Same posture as the value picker's deleted-option entry:
 * show the truth, keep the stored value, and let the author be the one who changes it.
 */
export function operatorChoicesFor(
  kind: ConditionalSourceKind,
  currentOp?: ConditionalOperator,
): ReadonlyArray<OperatorChoice> {
  const offered = OPERATORS_BY_KIND[kind].map((op) => ({ op, label: operatorLabel(op, kind) }));
  if (currentOp === undefined || operatorOfferedFor(currentOp, kind)) {
    return offered;
  }
  return [...offered, { op: currentOp, label: `${operatorLabel(currentOp)} (not available here)` }];
}

/** Whether this kind's menu carries that operator — the guard for a stored or carried-over op. */
export function operatorOfferedFor(op: ConditionalOperator, kind: ConditionalSourceKind): boolean {
  return OPERATORS_BY_KIND[kind].includes(op);
}

/** The operator a new condition on this kind starts with — always one the kind offers. */
export function defaultOperatorFor(kind: ConditionalSourceKind): ConditionalOperator {
  return OPERATORS_BY_KIND[kind][0];
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
 * On a source with a fixed answer set the value is PICKED, never typed, and that is the whole
 * point: a hand-typed value that misses an option's spelling fails `===` forever, silently, and
 * the author's own test submission is what convinces them the rule works. Because
 * {@link OPERATORS_BY_KIND} offers an option kind nothing but equality and membership
 * operators, `'text'` is unreachable for one — pinned by a spec that walks every offered
 * operator rather than trusting this switch to stay in step.
 *
 * Free-input kinds get text; {@link valueInputMode} decides which keyboard.
 */
export function valueEditorKind(op: ConditionalOperator, kind: ConditionalSourceKind): ValueEditorKind {
  if (!operatorNeedsValue(op)) {
    return 'none';
  }
  if (kind !== 'singleChoice' && kind !== 'multiSelect') {
    return 'text';
  }
  return op === 'in' || op === 'notIn' ? 'checklist' : 'select';
}

/**
 * The `inputmode` hint for a free-text value box, or `null` for the default keyboard.
 *
 * Mobile-first is a repo rule, and this is where it costs nothing: a number condition on a
 * phone should raise a keypad. Dates deliberately do not — the value is an ISO string, and a
 * numeric keypad has no `-`.
 */
export function valueInputMode(kind: ConditionalSourceKind): 'numeric' | null {
  return kind === 'number' || kind === 'score' ? 'numeric' : null;
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
export const SCORE_SOURCE: ConditionalSourceQuestion = {
  id: SCORE_SOURCE_ID,
  prompt: 'Total score',
  kind: 'score',
};

/**
 * The source a NEW condition should open on, given the item whose rule is being written.
 *
 * The subject wins whenever it is on offer, which is the case that matters: a question's jump
 * rule reads its own answer ("if THIS answer is X, go to Y"), and a page's reads the questions
 * on it. Opening every fresh row on the form's first question instead made the author's first
 * move always be "repoint this".
 *
 * When the subject is genuinely absent — a SHOW gate's sources stop one question short of the
 * item, because a question cannot gate itself on its own answer — the nearest source is the
 * fallback, not the first. Sources arrive in form order, so the last one is the question
 * immediately before this item, which is what an author reaching for a show rule nearly always
 * means.
 *
 * The score sentinel is skipped in that fallback even though an ending's list carries it last.
 * It is not a question, and defaulting an ending's rule to "Total score" is a guess about the
 * form's design rather than about proximity. It is still returned when it is all there is.
 */
export function defaultConditionSource(
  sources: readonly ConditionalSourceQuestion[],
  subjectId: string | null | undefined,
): ConditionalSourceQuestion | undefined {
  const subject = sources.find((s) => s.id === subjectId);
  if (subject) {
    return subject;
  }
  const nearestQuestion = [...sources].reverse().find((s) => s.id !== SCORE_SOURCE_ID);
  return nearestQuestion ?? sources[sources.length - 1];
}

/**
 * A fresh condition reading one source — the only place a condition object is built from
 * scratch, so a new row can never open on an operator its own source cannot satisfy.
 *
 * The operator comes from the source's kind rather than a hardcoded `equals`: `equals` against a
 * multi-select answer never matches, because the evaluator compares scalars and every array
 * answer fails that comparison. The value is coerced to match the operator for the same reason
 * membership and scalar operators are not interchangeable — `in` wants a list, the rest a
 * scalar.
 */
export function newCondition(source: ConditionalSourceQuestion): ConditionalCondition {
  const op = defaultOperatorFor(source.kind);
  return conditionForSource(source.id, op, coerceConditionValue(op, ''));
}

/**
 * Build a condition for a selected source id — the score sentinel authors a `source: 'score'`
 * read, anything else a question read. One builder, so the sentinel is understood in exactly
 * one place.
 */
export function conditionForSource(
  selectedId: string,
  op: ConditionalOperator,
  value: ConditionValue,
): ConditionalCondition {
  if (selectedId === SCORE_SOURCE_ID) {
    return { source: 'score', op, value };
  }
  return { questionId: selectedId, op, value };
}

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
