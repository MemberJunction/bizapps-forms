/**
 * The condition editor's model: what a rule can reference, and how each condition's comparison
 * value should be edited. Pure functions, no Angular — the editor component renders these
 * answers; it does not compute them. (RULES_AND_BRANCHING_PLAN Phase A1.)
 */
import {
  MAX_CONDITIONS_PER_GROUP,
  impliedAnswerValues,
  isFormQuestionType,
  questionTypeBehavior,
  type ConditionalCondition,
  type ConditionalOperator,
  type ConditionValue,
  type FormQuestionType,
  type QuestionTypeBehavior,
} from '@mj-biz-apps/forms-entities';
import { parseQuestionSettings } from './json-fields';
import { publishedOptionIdentities, type PublishableOptionFields } from './option-labels';

/**
 * A selectable answer the value picker offers — label shown, value STORED.
 *
 * The value is not always a string, and that is the whole point of the field's type. An
 * option-driven question stores its answer as text, but a `Rating` stores `5` and a `YesNo`
 * stores `true`; a condition holding `'5'` against an answer of `5` is a rule that can never
 * fire, and whose negation fires for everyone. The label is what a human reads ("Yes",
 * "Accepted", "3"); the value is what the evaluator compares.
 */
export interface ConditionalSourceOption {
  label: string;
  value: string | number | boolean;
}

/**
 * An option an AUTHOR wrote — narrower than {@link ConditionalSourceOption} in the one way that
 * matters to its other caller: its value is always the text a published form stores, because
 * that is what an option row holds. Scoring keys its points by exactly this string.
 */
export interface AuthoredAnswerOption {
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
 *
 * The kinds divide three ways, and the division is what every table below turns on:
 *
 *  - **Picked** — `singleChoice`, `multiSelect`, `scale`, `boolean`. The answer set is known,
 *    so the comparison value is chosen from it and can never be a value the question cannot
 *    produce. `scale` and `boolean` are new here: their sets come from the TYPE (1..max,
 *    true/false) rather than from options an author wrote, which is exactly why they used to
 *    fall through to free text — a five-star rating offered a box you could type "excellent"
 *    into, and the rule then never fired.
 *  - **Typed** — `number`, `date`, `time`, `text`, `score`. The answer is open, so the value
 *    is entered, in the control that matches it. `time` is separate from `date` because they
 *    are different HTML inputs and different comparison scales.
 *  - **Neither** — `presence`. The answer is an object, a file id, or a full ranking; no
 *    operator but the answered-pair can say anything true about it.
 */
export type ConditionalSourceKind =
  | 'singleChoice'
  | 'multiSelect'
  | 'scale'
  | 'boolean'
  | 'number'
  | 'date'
  | 'time'
  | 'text'
  | 'presence'
  | 'score';

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
  /** Per-type settings JSON — where a scale question keeps the bounds of its answer set. */
  Settings: string | null;
}

/**
 * Map a builder question (entity + option rows) to what the condition editor can offer — or
 * `undefined` when the question cannot be the subject of a condition at all.
 *
 * A `Statement` collects no answer, so it never reaches the answer map, so every operator on it
 * is a constant: `isAnswered` false for everyone, `notEquals` true for everyone. It was offered
 * in the question dropdown all the same, which is a rule that reads like a decision and is one.
 * Returning `undefined` is what keeps it off the list without every caller remembering to filter.
 *
 * Two kinds of option list can end up on a source, and they arrive from opposite directions.
 * AUTHORED options come from `values`/`images` questions (never `matrix` — a Matrix's options
 * are axes, and its answer an object no operator can match an option against). IMPLIED options
 * come from the type itself, for the scale and boolean questions whose answer sets nobody wrote
 * down. Both end in the same field because the editor's question is the same either way: is this
 * value picked, or typed?
 *
 * An unknown question type (a stale row, an unshipped type) degrades to a plain text source
 * rather than guessing.
 */
export function toConditionalSource(
  question: ConditionSourceQuestionFields,
  options: readonly PublishableOptionFields[],
): ConditionalSourceQuestion | undefined {
  const base = { id: question.ID, prompt: question.Prompt };
  if (!isFormQuestionType(question.QuestionType)) {
    return { ...base, kind: 'text' };
  }
  const type = question.QuestionType;
  const behavior = questionTypeBehavior(type);
  if (!behavior.answerable) {
    return undefined;
  }
  const implied = impliedOptions(type, question.Settings);
  const source: ConditionalSourceQuestion = { ...base, kind: sourceKindOf(type, behavior, implied !== undefined) };
  if (implied !== undefined) {
    source.options = implied;
    return source;
  }
  const authored = authoredAnswerOptions(question, options);
  if (authored.length > 0) {
    source.options = authored;
  }
  return source;
}

/**
 * The options a published form will store as answers — the ones an AUTHOR wrote, never the ones
 * a type implies.
 *
 * Exactly the values a published form stores: same display-order sort, same `Value ?? Label`
 * fallback, same uniqueness rewrite as the snapshot builder, all via
 * {@link publishedOptionIdentities}. Empty for a type whose options are not answers — a
 * Matrix's are axes, and a Matrix answer is an object matching none of them.
 *
 * Separate from {@link toConditionalSource} because two callers want different halves of it.
 * Per-option SCORING keys its points by authored option value and must not grow entries for a
 * rating's stars or a checkbox's two states; the condition editor wants both kinds, because to
 * it they answer the same question — is this value picked or typed? Scoring used to borrow the
 * condition mapper for this, which quietly made it the same decision as the editor's.
 */
export function authoredAnswerOptions(
  question: ConditionSourceQuestionFields,
  options: readonly PublishableOptionFields[],
): AuthoredAnswerOption[] {
  if (!isFormQuestionType(question.QuestionType)) {
    return [];
  }
  const { optionMode } = questionTypeBehavior(question.QuestionType);
  if (optionMode !== 'values' && optionMode !== 'images') {
    return [];
  }
  return publishedOptionIdentities(options).map(({ label, value }) => ({ label, value }));
}

/** The fields of a question-type behavior row {@link sourceKindOf} reads. */
type SourceKindInputs = Pick<QuestionTypeBehavior, 'optionMode' | 'answerColumn' | 'multiValued' | 'ordered'>;

/**
 * Classify a question type from its capabilities.
 *
 * Read top to bottom; each arm takes what the ones below it would get wrong.
 *
 *  - **`ordered` first.** A Ranking's row is byte-identical to a MultiChoice's in every other
 *    column, and it is not a multi-select: its answer is EVERY option in the order they were
 *    put, so `includes any of` is satisfied by any respondent who ranked anything. The checklist
 *    read as a real question and was a constant.
 *  - **Then authored options**, because being option-driven is what decides whether a value is
 *    picked or typed, and that is the decision with teeth.
 *  - **Then the shapes no operator can compare** — json objects (Address, ContactInfo, Matrix)
 *    and file ids. `equals` against an object is false for everyone and `notEquals` true for
 *    everyone, which is worse than offering nothing.
 *  - **Then booleans**, whose two answers are an implied set: picked, never typed.
 *  - **Then numbers**, split by whether the type fixes the answers. A `Rating` is a scale with
 *    a known set; a `Number` is open, so its value is entered.
 *  - **Then dates**, split into calendar and clock. They are different HTML controls and, in
 *    `compareOrdered`, different scales — a time was ordered as a date before this and could
 *    never fire.
 *
 * Everything left is `'text'`.
 */
function sourceKindOf(
  type: FormQuestionType,
  behavior: SourceKindInputs,
  hasImpliedSet: boolean,
): ConditionalSourceKind {
  if (behavior.ordered) {
    return 'presence';
  }
  if (behavior.optionMode === 'values' || behavior.optionMode === 'images') {
    return behavior.multiValued ? 'multiSelect' : 'singleChoice';
  }
  if (behavior.answerColumn === 'json' || behavior.answerColumn === 'file') {
    return 'presence';
  }
  if (behavior.answerColumn === 'boolean') {
    return 'boolean';
  }
  if (behavior.answerColumn === 'numeric') {
    return hasImpliedSet ? 'scale' : 'number';
  }
  if (behavior.answerColumn === 'date') {
    // The one arm the behaviour table cannot answer: `Date` and `Time` share a column, and what
    // separates them is which HTML control edits them — presentation, which is this package's
    // business and not the contract's (the widget's `input-mode.ts` draws the same line for the
    // same reason). Their comparison scales differ too, but the evaluator reads that off the
    // VALUE's shape, not off the type.
    return type === 'Time' ? 'time' : 'date';
  }
  return 'text';
}

/**
 * Labels for the two answers a boolean question has, in that question's own words.
 *
 * The VALUES are the contract's (`true` / `false`, from `impliedAnswerValues`); these are the
 * chrome, and they live here because "Accepted" is what a Legal question calls `true` on screen
 * and a contract package has no business knowing that. A `Checkbox` reads as checked rather
 * than as "yes" because that is the control the respondent actually saw.
 */
const BOOLEAN_LABELS: Partial<Record<FormQuestionType, readonly [string, string]>> = {
  YesNo: ['Yes', 'No'],
  Legal: ['Accepted', 'Declined'],
  Checkbox: ['Checked', 'Not checked'],
};

/** The default reading of a boolean answer, for a type with no wording of its own. */
const DEFAULT_BOOLEAN_LABELS: readonly [string, string] = ['Yes', 'No'];

/**
 * The picker entries a type IMPLIES, or `undefined` when its answers are not fixed by its type.
 *
 * Settings are parsed with the builder's forgiving reader: `Settings` is open JSON reachable by
 * API, by paste and by hand-edit, and a rating whose settings are corrupt is still a five-star
 * rating. Throwing here would take the whole rules dialog down over a stray brace.
 */
function impliedOptions(
  type: FormQuestionType,
  settings: string | null,
): ConditionalSourceOption[] | undefined {
  const values = impliedAnswerValues(type, parseQuestionSettings(settings));
  if (values === undefined) {
    return undefined;
  }
  const [whenTrue, whenFalse] = BOOLEAN_LABELS[type] ?? DEFAULT_BOOLEAN_LABELS;
  return values.map((value) => ({
    label: typeof value === 'boolean' ? (value ? whenTrue : whenFalse) : String(value),
    value,
  }));
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
 *  - **boolean** gets no ordering. There is no "greater than yes". It gets no membership pair
 *    either: "is one of Yes, No" is every respondent who answered.
 *  - **scale** gets ordering — "rated 3 or more" is most of why a rating is on a form — but no
 *    membership, for the same reason as boolean. Its equality now WORKS, which it did not while
 *    the value was typed: an answer of `5` never equalled the string `'5'`, and `notEquals`
 *    fired for the whole audience.
 *  - **presence** gets the answered-pair and nothing else. Its answers are objects, file ids
 *    and full rankings; every other operator on those is a constant, and a rule that always
 *    fires is worse than no rule because it reads like a decision.
 */
const ORDERED_OPERATORS: ReadonlyArray<ConditionalOperator> = [
  'equals',
  'notEquals',
  'greaterThan',
  'lessThan',
  'isAnswered',
  'isNotAnswered',
];

const OPERATORS_BY_KIND: Record<ConditionalSourceKind, ReadonlyArray<ConditionalOperator>> = {
  singleChoice: ['equals', 'notEquals', 'in', 'isAnswered', 'isNotAnswered'],
  multiSelect: ['in', 'notIn', 'isAnswered', 'isNotAnswered'],
  scale: ORDERED_OPERATORS,
  boolean: ['equals', 'notEquals', 'isAnswered', 'isNotAnswered'],
  number: ORDERED_OPERATORS,
  date: ORDERED_OPERATORS,
  time: ORDERED_OPERATORS,
  text: ['equals', 'notEquals', 'isAnswered', 'isNotAnswered'],
  presence: ['isAnswered', 'isNotAnswered'],
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

/**
 * How one condition's comparison value should be edited.
 *
 * `'number'`, `'date'` and `'time'` are native input types rather than a plain box with a
 * keyboard hint: an `inputmode` suggests a keyboard and accepts anything typed anyway, which is
 * how a five-star rating came to accept "excellent" as a comparison value.
 */
export type ValueEditorKind = 'none' | 'text' | 'number' | 'date' | 'time' | 'select' | 'checklist';

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
  switch (kind) {
    case 'singleChoice':
    case 'multiSelect':
      return op === 'in' || op === 'notIn' ? 'checklist' : 'select';
    case 'scale':
    case 'boolean':
      return 'select';
    case 'number':
    case 'score':
      return 'number';
    case 'date':
      return 'date';
    case 'time':
      return 'time';
    case 'text':
      return 'text';
    case 'presence':
      // Unreachable through the menu, which offers this kind nothing that takes a value. Stated
      // anyway, because a value box on an answer nothing can compare is precisely the failure
      // this switch exists to prevent, and the next operator added to the menu is where it
      // would come back.
      return 'none';
    default:
      return assertNeverKind(kind);
  }
}

/** Exhaustiveness guard: a new source kind must be given a value editor before it compiles. */
function assertNeverKind(kind: never): never {
  throw new Error(`Unhandled ConditionalSourceKind: ${String(kind)}`);
}

/**
 * What a condition should STORE for a value the author just entered or picked.
 *
 * The whole point is the type of the result, not its content. An answer's runtime type is fixed
 * by its question's column — a Rating answers `5`, a YesNo answers `true` — and a condition
 * holding the string `'5'` against an answer of `5` is a rule that can never fire, whose
 * negation fires for every respondent. Storing what the source can actually produce is what
 * makes `equals` mean equals.
 *
 * Three rules, in order:
 *
 *  - Membership operators take a list, whatever the source. (See {@link coerceConditionValue}.)
 *  - A source with a known answer set hands back the option's OWN value, looked up by the
 *    spelling the `<select>` gave us. A raw value that matches no option is kept verbatim
 *    rather than coerced — it can only be a stored rule pointing at a deleted option or a scale
 *    that has since been narrowed, and rewriting it would silently move the rule to a
 *    neighbouring answer.
 *  - An open numeric source parses, and keeps the text when it does not parse. `Number('')` is
 *    `0` and `Number('eighteen')` is `NaN`; storing either would turn an empty box into a real
 *    condition and a typo into one that can never match. Blank stays blank, which is what
 *    `isFinishedCondition` reads to drop an abandoned row on save.
 */
export function conditionValueFor(
  source: ConditionalSourceQuestion | undefined,
  op: ConditionalOperator,
  raw: string,
): ConditionValue {
  if (op === 'in' || op === 'notIn') {
    return coerceConditionValue(op, raw);
  }
  const picked = source?.options?.find((option) => String(option.value) === raw);
  if (picked !== undefined) {
    return picked.value;
  }
  if (raw === '' || (source?.kind !== 'number' && source?.kind !== 'score')) {
    return raw;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : raw;
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
/**
 * What the picker calls a stored source id it is not offering, or `''` when it IS offering it.
 *
 * THREE causes reach this, and two of them must not read alike (issue #73):
 *
 *  - the question was DELETED — "(question no longer available)", which is true;
 *  - the question EXISTS but sits after the rule in the walk, arrived at by reordering — the old
 *    wording is a lie the author can disprove by looking at the canvas, so it is named instead;
 *  - the question was converted to a type that collects no answer (a `Statement`), which
 *    `toConditionalSource` drops. It is in neither list and keeps the "no longer available"
 *    wording DELIBERATELY: telling it apart needs the raw question list threaded in to serve a
 *    case no reorder can create, and a `Statement` genuinely is not available as a source.
 *
 * `formSources` empty means the caller has not wired the form-wide list; falling back to the old
 * label is the only safe default, because the ordering claim would then have no evidence behind
 * it.
 */
export function staleSourceLabel(
  questionId: string,
  offered: readonly ConditionalSourceQuestion[],
  formSources: readonly ConditionalSourceQuestion[],
): string {
  if (offered.some((source) => source.id === questionId)) {
    return '';
  }
  const later = formSources.find((source) => source.id === questionId);
  return later ? `${later.prompt} — answered after this rule runs` : '(question no longer available)';
}

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
  return conditionForSource(source.id, op, conditionValueFor(source, op, ''));
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
