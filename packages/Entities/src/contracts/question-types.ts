/**
 * The question-type taxonomy, and the behaviour every consumer derives from it.
 *
 * WHY THIS IS A TABLE AND NOT A SET OF SWITCHES. Question type drove behaviour through six
 * independent `switch`/`if` chains living in four packages: the widget's typed-column routing
 * (`answer-value.ts`), the widget's soft-keyboard hints (`input-mode.ts`), BOTH validators'
 * "is this even answerable" test, the dashboard's breakdown kind, the export's cell shape —
 * and a hand-copied 15-string `QUESTION_TYPES` set in the server's snapshot parser, which is
 * the tell: the same list already existed twice, and the copy had no way to know when the
 * original changed. Adding ten types to that arrangement means sixty new branches whose only
 * link is that somebody remembered.
 *
 * So the union is DERIVED FROM the table rather than declared alongside it. A type that is
 * not in {@link QUESTION_TYPE_BEHAVIOR} does not exist as a `FormQuestionType`, and a table
 * row that no type names is a compile error. Neither can drift, because there is only one of
 * them.
 *
 * WHY IT LIVES IN ENTITIES. forms-server needs it as much as forms-ng does — the duplicated
 * set in `snapshot-parser.ts` is exactly what a shared contract package exists to prevent.
 * Purely presentational facts (icon, palette group, label) are NOT here: they are the
 * builder's business and belong in `forms-ng`'s catalog, which derives its behaviour from
 * this table and adds only the chrome.
 *
 * ROUTING IS TYPE-DRIVEN, NEVER VALUE-DRIVEN. {@link QuestionTypeBehavior.answerColumn} is a
 * property of the TYPE, so "which column does this answer go in" is answerable without an
 * answer in hand. That is what lets the persistence layer, the widget and the export agree
 * without passing values around. It is also why `PictureChoice` is single-select: a
 * multi-select variant would store JSON instead of text, making the column depend on a
 * setting, and every consumer would need the settings blob to know where to look. A
 * `PictureMultiChoice` row is the honest way to add that later.
 */

/** Whether a type carries selectable options, and what kind. */
export type QuestionOptionMode =
  /** No options at all. */
  | 'none'
  /** Plain label/value options: Single/Multi/Dropdown/Ranking. */
  | 'values'
  /** Options that additionally carry an image: PictureChoice. */
  | 'images'
  /** Options split into rows and columns by `MatrixAxis`: Matrix. */
  | 'matrix';

/**
 * Which typed column of `FormResponseAnswer` an answer of this type lands in.
 *
 * `FormResponseAnswer` spreads one answer across six columns of which exactly one is
 * populated (see `answer-canonical.ts`). This names that one, so the widget's wire mapping,
 * the server's persistence and the export all pick the same column instead of each deciding.
 */
export type QuestionAnswerColumn = 'text' | 'numeric' | 'boolean' | 'date' | 'json' | 'file';

/**
 * How a type's answers are summarised on the reporting dashboard.
 *
 * Deliberately a SEMANTIC name rather than the dashboard's `BreakdownKind` widget name: the
 * contract says what the data is, and the dashboard decides which card renders it. `Ranking`
 * and `Matrix` are both `'choice'`-shaped in the end (a distribution over option labels) but
 * they count something different, which is a dashboard concern, not a contract one.
 */
export type QuestionAnalysisKind =
  | 'choice'
  | 'numeric'
  | 'boolean'
  | 'text'
  /** Composite objects (Address, ContactInfo, Matrix) — listed, not bucketed. */
  | 'composite'
  /** Nothing meaningful to aggregate: files, drawings, dates, display-only content. */
  | 'none';

/** What the rest of the system derives from a question's type. */
export interface QuestionTypeBehavior {
  /**
   * Whether the type collects an answer at all.
   *
   * `Statement` is the only `false` today, and this flag is why its name no longer appears in
   * the widget runtime, both validators and the dashboard aggregator. A non-answerable
   * question renders its prompt, is skipped by the required check, produces no
   * `FormResponseAnswer` row and gets no breakdown card.
   */
  readonly answerable: boolean;
  readonly optionMode: QuestionOptionMode;
  readonly answerColumn: QuestionAnswerColumn;
  readonly analysis: QuestionAnalysisKind;
  /**
   * Whether one answer may hold several values (MultiChoice, Ranking, Matrix).
   *
   * Distinct from `answerColumn === 'json'`: Address and ContactInfo are also JSON, but they
   * are ONE value with named parts, not a collection. The difference matters to the
   * conditional evaluator (`in` / `contains` apply to collections) and to the export, which
   * joins a collection with `; ` and flattens a composite into named sub-columns.
   */
  readonly multiValued: boolean;
  /**
   * Whether one answer ORDERS every option rather than selecting among them (`Ranking`).
   *
   * Distinct from `multiValued`, which only says an answer may hold several values. A
   * MultiChoice answer holds the options the respondent chose; a Ranking answer holds ALL of
   * them, in the order they were put. That difference is invisible in every other column —
   * the two rows were byte-identical — and it decides what a comparison can mean: membership
   * against a ranking is satisfied by every respondent who ranked anything at all, so `in`
   * reads as a real question and is in fact a constant.
   */
  readonly ordered: boolean;
}

/**
 * The exhaustive question taxonomy. Order is the canonical palette order within a group.
 *
 * Adding a row here is the ONLY step needed to make a new type exist to the type system; the
 * union, the server's accept-set and every derived helper below follow from it. What it does
 * NOT do is make the database accept the value — `CK_FormQuestion_QuestionType` is a separate
 * CHECK constraint, and a type added here but not there fails at save time with a constraint
 * violation and no explanation. The `checkConstraintTypes` test in `question-types.spec.ts` guards
 * that pairing.
 */
export const QUESTION_TYPE_BEHAVIOR = {
  // --- Text ---------------------------------------------------------------
  ShortText: { answerable: true, optionMode: 'none', answerColumn: 'text', analysis: 'text', multiValued: false, ordered: false },
  LongText: { answerable: true, optionMode: 'none', answerColumn: 'text', analysis: 'text', multiValued: false, ordered: false },
  Email: { answerable: true, optionMode: 'none', answerColumn: 'text', analysis: 'text', multiValued: false, ordered: false },
  Phone: { answerable: true, optionMode: 'none', answerColumn: 'text', analysis: 'text', multiValued: false, ordered: false },
  Website: { answerable: true, optionMode: 'none', answerColumn: 'text', analysis: 'text', multiValued: false, ordered: false },
  Number: { answerable: true, optionMode: 'none', answerColumn: 'numeric', analysis: 'numeric', multiValued: false, ordered: false },

  // --- Choice -------------------------------------------------------------
  SingleChoice: { answerable: true, optionMode: 'values', answerColumn: 'text', analysis: 'choice', multiValued: false, ordered: false },
  MultiChoice: { answerable: true, optionMode: 'values', answerColumn: 'json', analysis: 'choice', multiValued: true, ordered: false },
  Dropdown: { answerable: true, optionMode: 'values', answerColumn: 'text', analysis: 'choice', multiValued: false, ordered: false },
  PictureChoice: { answerable: true, optionMode: 'images', answerColumn: 'text', analysis: 'choice', multiValued: false, ordered: false },

  // --- Scale & ranking ----------------------------------------------------
  Rating: { answerable: true, optionMode: 'none', answerColumn: 'numeric', analysis: 'numeric', multiValued: false, ordered: false },
  NPS: { answerable: true, optionMode: 'none', answerColumn: 'numeric', analysis: 'numeric', multiValued: false, ordered: false },
  OpinionScale: { answerable: true, optionMode: 'none', answerColumn: 'numeric', analysis: 'numeric', multiValued: false, ordered: false },
  Ranking: { answerable: true, optionMode: 'values', answerColumn: 'json', analysis: 'choice', multiValued: true, ordered: true },
  Matrix: { answerable: true, optionMode: 'matrix', answerColumn: 'json', analysis: 'composite', multiValued: true, ordered: false },

  // --- Boolean ------------------------------------------------------------
  YesNo: { answerable: true, optionMode: 'none', answerColumn: 'boolean', analysis: 'boolean', multiValued: false, ordered: false },
  Checkbox: { answerable: true, optionMode: 'none', answerColumn: 'boolean', analysis: 'boolean', multiValued: false, ordered: false },
  Legal: { answerable: true, optionMode: 'none', answerColumn: 'boolean', analysis: 'boolean', multiValued: false, ordered: false },

  // --- Date & time --------------------------------------------------------
  Date: { answerable: true, optionMode: 'none', answerColumn: 'date', analysis: 'none', multiValued: false, ordered: false },
  Time: { answerable: true, optionMode: 'none', answerColumn: 'date', analysis: 'none', multiValued: false, ordered: false },

  // --- Composite ----------------------------------------------------------
  Address: { answerable: true, optionMode: 'none', answerColumn: 'json', analysis: 'composite', multiValued: false, ordered: false },
  ContactInfo: { answerable: true, optionMode: 'none', answerColumn: 'json', analysis: 'composite', multiValued: false, ordered: false },

  // --- Files --------------------------------------------------------------
  FileUpload: { answerable: true, optionMode: 'none', answerColumn: 'file', analysis: 'none', multiValued: false, ordered: false },
  // Named for what it IS — a freehand drawing exported as a PNG. It was called `Signature` and
  // is deliberately NOT any more: it has no identity verification, no content hash, no signing
  // certificate and no audit trail of a signing event, so a customer reaching for it to collect
  // a legally-meaningful signature would have been reading a promise nothing here keeps. Real
  // e-signature is separate work through a signing provider (#97).
  //
  // NO `Signature` ALIAS. `isFormQuestionType` deliberately stops recognising the old key, and
  // the rename's migration rewrites `"type":"Signature"` in every stored snapshot. An alias here
  // would not be the cheap insurance it looks like: a key this test admits with no row in this
  // table turns a clean fail-closed into `questionTypeBehavior` THROWING on the first
  // `answerColumnFor`, and a key with a row is not a rename at all — the palette's total
  // `Record<FormQuestionType, …>` would have to offer "Signature" again, and the CHECK
  // constraint would have to keep accepting it. See the migration for why nothing can be missed:
  // the snapshot token is written by `JSON.stringify`, so it has exactly one spelling.
  Doodle: { answerable: true, optionMode: 'none', answerColumn: 'file', analysis: 'none', multiValued: false, ordered: false },

  // --- Display-only -------------------------------------------------------
  Statement: { answerable: false, optionMode: 'none', answerColumn: 'text', analysis: 'none', multiValued: false, ordered: false },
} as const satisfies Record<string, QuestionTypeBehavior>;

/**
 * Every question type MJ Forms supports.
 *
 * Derived from {@link QUESTION_TYPE_BEHAVIOR} rather than written out, so the union and the
 * behaviour table are the same fact stated once.
 */
export type FormQuestionType = keyof typeof QUESTION_TYPE_BEHAVIOR;

/**
 * The taxonomy as an array, in table order.
 *
 * `Object.keys` loses the literal key types, so the cast restores what the table already
 * proves. It is the one place in this module where a cast is warranted: the alternative is a
 * second hand-written list, which is the duplication the module exists to remove.
 */
export const FORM_QUESTION_TYPES: readonly FormQuestionType[] = Object.keys(
  QUESTION_TYPE_BEHAVIOR,
) as FormQuestionType[];

/**
 * Membership test for untrusted input (stored snapshots, GraphQL payloads).
 *
 * `hasOwnProperty` rather than the `in` operator, which walks the prototype chain: `'toString'
 * in QUESTION_TYPE_BEHAVIOR` is `true`, so `in` would certify `toString`, `constructor` and
 * `__proto__` as question types — all three being strings a caller posting straight at the
 * GraphQL mutation fully controls.
 */
export function isFormQuestionType(value: unknown): value is FormQuestionType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(QUESTION_TYPE_BEHAVIOR, value);
}

/**
 * The behaviour row for a type.
 *
 * Throws rather than returning a default for an unknown type. A default would mean a typo in
 * a stored snapshot silently becomes a text question that accepts anything — the failure this
 * whole module is meant to make impossible. Callers reading untrusted input gate on
 * {@link isFormQuestionType} first.
 */
export function questionTypeBehavior(type: FormQuestionType): QuestionTypeBehavior {
  const behavior = QUESTION_TYPE_BEHAVIOR[type];
  if (!behavior) {
    throw new Error(`Unknown FormQuestionType: ${String(type)}`);
  }
  return behavior;
}

/** Whether a type collects an answer (false only for display-only content). */
export function isAnswerableQuestionType(type: FormQuestionType): boolean {
  return questionTypeBehavior(type).answerable;
}

/** Whether a type carries selectable options of any kind. */
export function questionTypeHasOptions(type: FormQuestionType): boolean {
  return questionTypeBehavior(type).optionMode !== 'none';
}

/** The typed `FormResponseAnswer` column an answer of this type occupies. */
export function answerColumnFor(type: FormQuestionType): QuestionAnswerColumn {
  return questionTypeBehavior(type).answerColumn;
}

/** How this type's answers are summarised. */
export function analysisKindFor(type: FormQuestionType): QuestionAnalysisKind {
  return questionTypeBehavior(type).analysis;
}

// --- Composite sub-field shapes ------------------------------------------
//
// Address and ContactInfo store ONE JSON object with named parts rather than expanding into
// child questions. Child questions were the obvious alternative and are worse: they double
// the question count in every list the author reads, they make `isRequired` ambiguous
// (required street, or required address?), and they hand conditional rules five ids where the
// author sees one field. The cost is that these shapes must be agreed here, in the contract,
// rather than falling out of the schema — hence the constants below, which the widget renders
// from and the export flattens with.

/** Ordered sub-fields of an `Address` answer, as stored in its JSON value. */
export const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'region', 'postalCode', 'country'] as const;

/** One part of an `Address` answer. */
export type AddressField = (typeof ADDRESS_FIELDS)[number];

/** The stored shape of an `Address` answer. Every part is optional; `isRequired` governs the whole. */
export type AddressAnswer = Partial<Record<AddressField, string>>;

/** Ordered sub-fields of a `ContactInfo` answer, as stored in its JSON value. */
export const CONTACT_INFO_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'company'] as const;

/** One part of a `ContactInfo` answer. */
export type ContactInfoField = (typeof CONTACT_INFO_FIELDS)[number];

/** The stored shape of a `ContactInfo` answer. */
export type ContactInfoAnswer = Partial<Record<ContactInfoField, string>>;

/**
 * The stored shape of a `Matrix` answer: row option value -> selected column value(s).
 *
 * A string for single-select rows, an array for multi-select rows. Both spellings are
 * accepted on read so a form switched from single to multi after collecting answers keeps
 * reading its old responses.
 */
export type MatrixAnswer = Record<string, string | string[]>;

/**
 * Which axis of a `Matrix` an option belongs to.
 *
 * Rows and columns share the `FormQuestionOption` table rather than getting a child table of
 * their own: they are both "a label with a value and an order", which is what that table
 * already is. The discriminator is stored on the option row.
 */
export type MatrixAxis = 'Row' | 'Column';
