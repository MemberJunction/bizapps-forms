/**
 * Canonical collapse of a PERSISTED answer row into the one value a consumer reads — and the
 * question-GUID folding that makes looking it up safe.
 *
 * WHY THIS IS SHARED. `FormResponseAnswer` spreads a single answer across six typed columns
 * (`TextValue` / `NumericValue` / `DateValue` / `BooleanValue` / `JSONValue` / `FileID`) of
 * which exactly one is populated. Every consumer that wants "the answer to question X" has to
 * collapse that spread, and each one that reimplements it invents a slightly different
 * precedence, a different opinion on blanks, and a different date spelling. Caliber wrote its
 * own (`collapseAnswers`), the on-submit hooks read three of the six columns and silently drop
 * Date and File answers, and entity binding needs all six. This module is the single
 * definition so those readings cannot diverge.
 *
 * Distinct from {@link answerValueOf} in forms-server, deliberately: that one collapses the
 * TRANSPORT shape (`FormAnswerInput`, pre-persistence) into a comparable scalar for the
 * conditional evaluator, where a multi-select must become a plain array to be compared with
 * `in` / `contains`. This one collapses the STORED shape for consumers that write the value
 * onward (entity binding, automation parameter mapping), where fidelity to what was stored
 * matters more than comparability. Same idea, different jobs, different outputs — merging them
 * would force one caller to accept the other's lossy choice.
 *
 * Two rules run through everything here and are the reason the module is worth its weight:
 *
 * 1. **Absent is not empty.** A question that was never answered is ABSENT — its key is not in
 *    the map at all. A question answered with `''` (or `0`, or `false`) is PRESENT and its
 *    value is that blank/zero/false. Collapsing those two into one "no value" is the mistake
 *    that lets a short form silently erase what a longer form collected, because a merge policy
 *    can only honour "never blank out" if it can tell "they left it alone" from "they cleared
 *    it". `Has()` is therefore the presence test; `Get()` returning `undefined` means absent.
 * 2. **Question GUIDs are compared case-folded.** SQL Server renders `uniqueidentifier` as
 *    UPPERCASE while the widget mints its question ids lowercase, so an exact-string lookup
 *    misses EVERY field. This is not hypothetical: it shipped, in this repo (fixed in 0.4.0)
 *    and in Caliber's intake driver, and in both cases it presented as "every mapped field is
 *    missing" rather than as a casing bug. {@link CanonicalAnswers} folds on both write and
 *    read so a caller cannot forget to.
 */
import type { JSONValue } from './json-value';

/**
 * A file answer, kept distinguishable from a text answer that happens to look like a GUID.
 *
 * Wrapped rather than returned bare because callers must be able to tell a file apart from a
 * string: entity binding may only copy a file into a `File`-FK column (never a text column),
 * and a file id is the one answer value that has to pass an upload-provenance check before it
 * is written anywhere. A bare GUID string carries neither signal. Shape matches Caliber's
 * `{ fileId }` so its intake layer converges on this contract rather than translating to it.
 */
export interface FileAnswerRef {
  readonly fileId: string;
}

/**
 * The collapsed value of one answered question.
 *
 * `null` is reachable and means PRESENT-and-null (a `JSONValue` column holding the literal
 * `null`), which is distinct from absent — see rule 1 in the module comment.
 */
export type CanonicalAnswerValue = JSONValue | FileAnswerRef;

/**
 * The typed-value columns of a persisted answer.
 *
 * Every field is optional so both shapes of the same row satisfy it: the generated
 * `mjBizAppsFormsFormResponseAnswerEntity` (whose getters are non-optional) and the plain
 * object a `RunView` with `ResultType: 'simple'` returns. That second shape is not
 * hypothetical — a consumer in another Open App reads these rows by entity NAME without taking
 * a dependency on `@mj-biz-apps/forms-entities`, and gets `DateValue` as a string rather than a
 * `Date`, which is why {@link collapseAnswer} accepts both.
 */
export interface StoredAnswerColumns {
  readonly TextValue?: string | null;
  readonly NumericValue?: number | null;
  readonly DateValue?: Date | string | null;
  readonly BooleanValue?: boolean | null;
  readonly JSONValue?: string | null;
  readonly FileID?: string | null;
}

/** A persisted answer row: the typed columns plus the question they answer. */
export interface StoredAnswerRow extends StoredAnswerColumns {
  readonly QuestionID: string;
}

/**
 * Fold a question GUID into its comparable form.
 *
 * Applied at COMPARISON time, never to stored data — rewriting the GUIDs in the database to a
 * single casing would "fix" it for new rows while every existing mapping authored against the
 * other casing kept missing, and would need a migration to undo. Folding here costs nothing and
 * is reversible by deleting one function.
 */
export function foldQuestionId(questionId: string): string {
  return questionId.trim().toLowerCase();
}

/**
 * Collapse one answer row to its single value, or `undefined` when the row holds no answer.
 *
 * Precedence is `TextValue → NumericValue → DateValue → BooleanValue → JSONValue → FileID`,
 * matching the order Caliber's intake driver settled on, so a row that (against the
 * exactly-one-populated invariant) carries two values resolves the same way on both sides.
 *
 * Presence is tested with `!= null`, which catches `undefined` as well as `null`. That matters
 * for the `'simple'` RunView shape, where an unselected column is absent rather than null, and
 * it is the same convention `answerValueOf` uses for the transport shape. The consequence worth
 * stating: `''`, `0` and `false` are all PRESENT values and are returned as themselves.
 */
export function collapseAnswer(row: StoredAnswerColumns): CanonicalAnswerValue | undefined {
  if (row.TextValue != null) {
    return row.TextValue;
  }
  if (row.NumericValue != null) {
    return row.NumericValue;
  }
  if (row.DateValue != null) {
    const instant = canonicalizeDate(row.DateValue);
    // An uninterpretable Date OBJECT carries no information to hand on, so it falls through to
    // the remaining columns rather than masking them. (An uninterpretable date STRING does carry
    // information — the text someone stored — and canonicalizeDate returns it verbatim.)
    if (instant !== undefined) {
      return instant;
    }
  }
  if (row.BooleanValue != null) {
    return row.BooleanValue;
  }
  if (row.JSONValue != null) {
    return parseJsonOrKeepRaw(row.JSONValue);
  }
  if (row.FileID != null) {
    return { fileId: row.FileID };
  }
  return undefined;
}

/**
 * Normalize a date answer to an ISO-8601 instant so every consumer reads one spelling.
 *
 * Returns the input verbatim when it is a string that does not parse: the stored text is the
 * only record of what the respondent gave us, and discarding it here would turn a validation
 * problem into a data-loss one. Returns `undefined` only for a `Date` object that is not a real
 * instant (`new Date('nonsense')`), which carries nothing to preserve — and which must not
 * reach `toISOString()`, because that throws `RangeError` rather than returning a bad string.
 */
function canonicalizeDate(value: Date | string): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/**
 * Parse a JSON column, keeping the raw text when it will not parse.
 *
 * Keeping the raw string rather than throwing or nulling matches Caliber and follows from the
 * same reasoning as the date case: whatever is in the column is the only copy, and a consumer
 * that receives an unexpected string can report it, while one that receives `undefined` cannot
 * tell a corrupt value from an unanswered question.
 */
function parseJsonOrKeepRaw(text: string): JSONValue {
  try {
    return JSON.parse(text) as JSONValue;
  } catch {
    return text;
  }
}

/**
 * The collapsed answers of one response, addressable by question GUID in any casing.
 *
 * Exists as a type rather than a bare `Map` so the case-folding cannot be forgotten at the call
 * site: a `Map<string, …>` handed to a caller invites `map.get(question.id)`, which is exactly
 * the lookup that silently missed everything before the fold existed. Here the only way in is
 * through {@link Get} / {@link Has}, which fold for you.
 */
export class CanonicalAnswers {
  private readonly byFoldedId: Map<string, CanonicalAnswerValue>;

  /**
   * Collapse a response's answer rows.
   *
   * Rows holding no answer are skipped entirely, so `Has()` reports presence rather than "a row
   * existed". On the duplicate question ids that the schema permits but the submit path does not
   * produce, the FIRST present value wins: the alternative (last wins) lets a trailing blank
   * duplicate erase a real answer, which is the same failure absent-is-not-empty exists to
   * prevent.
   */
  constructor(rows: readonly StoredAnswerRow[]) {
    this.byFoldedId = new Map<string, CanonicalAnswerValue>();
    for (const row of rows) {
      const value = collapseAnswer(row);
      if (value === undefined) {
        continue;
      }
      const key = foldQuestionId(row.QuestionID);
      if (!this.byFoldedId.has(key)) {
        this.byFoldedId.set(key, value);
      }
    }
  }

  /** Whether the question was answered at all. The presence test — see module rule 1. */
  public Has(questionId: string): boolean {
    return this.byFoldedId.has(foldQuestionId(questionId));
  }

  /** The collapsed answer, or `undefined` when the question was not answered. */
  public Get(questionId: string): CanonicalAnswerValue | undefined {
    return this.byFoldedId.get(foldQuestionId(questionId));
  }

  /** How many questions were answered. */
  public get Size(): number {
    return this.byFoldedId.size;
  }

  /**
   * The answered questions as `[foldedQuestionId, value]` pairs.
   *
   * Keys are folded, so anything compared against them must be folded too — use
   * {@link foldQuestionId}. Intended for whole-map consumers (parameter mapping, an overflow
   * capture of unmapped answers); point lookups should use {@link Get}.
   */
  public Entries(): IterableIterator<[string, CanonicalAnswerValue]> {
    return this.byFoldedId.entries();
  }
}

/**
 * Narrow a collapsed value to a file reference.
 *
 * Checks the EXACT shape — a non-array object whose only key is a string `fileId` — rather than
 * merely probing for the key, because `{ fileId: … }` is also a shape a `JSONValue` answer could
 * legitimately hold. A false positive here is not cosmetic: the binding executor uses this to
 * decide which values may be written into a `File`-FK column and which must clear an
 * upload-provenance check first, so a JSON answer mistaken for a file would be sent to a check
 * it can only fail.
 */
export function isFileAnswer(value: CanonicalAnswerValue | undefined): value is FileAnswerRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === 'fileId' && typeof value.fileId === 'string';
}
