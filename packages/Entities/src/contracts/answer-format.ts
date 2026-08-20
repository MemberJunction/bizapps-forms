/**
 * Type-derived format validation for an answered question — the check that follows from a
 * question's TYPE rather than from an author-supplied `ValidationRule`.
 *
 * WHY THIS IS SHARED. The widget and the server must reach the same verdict on the same
 * answer, and they did not: the widget carried its own type-format check (`Email`, `Number`,
 * `Rating`, `NPS`) while the server's `validateValue` consulted only the declarative rule. An
 * `Email` question authored without a `pattern` therefore looked validated in the browser (the
 * `<input type="email">` and the widget both rejected it) yet accepted anything posted straight
 * at the GraphQL mutation, persisting `not-an-email` as a `Complete` response. That is precisely
 * the fork this package's contract exists to prevent, so the check lives here and both sides
 * call it.
 *
 * `Phone` and `Date` are validated by neither side before this module existed — the widget's
 * switch fell through to `default: return VALID` for both — so they are new enforcement here,
 * not a one-sided gap being closed.
 *
 * Runs BEFORE the declarative rule and does not replace it: an explicit `ValidationRule`
 * still applies on top, so an author who supplies their own `pattern` keeps full control and can
 * constrain a type further, never loosen it. The one case where this check does not run at all
 * is an autosave draft — see `validateValue` in forms-server, which holds a `partial` save to
 * upper bounds only. A draft can never reach `Complete` without passing through the full check.
 */
import { isAnswerSupplied } from './conditional-rule';
import type { AnswerValue } from './conditional-rule';
import { ADDRESS_FIELDS, CONTACT_INFO_FIELDS } from './question-types';
import type { FormQuestionType } from './question-types';
import type { JSONValue } from './json-value';

/**
 * What a question must tell this module about itself.
 *
 * Structurally a subset of `PublishedFormQuestion`, so both callers pass their question straight
 * in — deliberately NOT importing that type, because `form-definition.ts` imports this module's
 * sibling and a cycle here would be a hard one to unpick.
 *
 * The signature takes the QUESTION rather than its `type` for one reason: an option-based answer
 * cannot be validated without the options, and a parameter you can omit is a parameter that gets
 * omitted. Passing the type alone was the whole defect below.
 */
export interface AnswerFormatQuestion {
  type: FormQuestionType;
  /** Authored options. Absent or empty means membership cannot be checked, so it is not. */
  options?: readonly AnswerFormatOption[];
  /** Per-type open settings — `min`/`max` for `OpinionScale`. */
  settings?: Record<string, JSONValue>;
}

/** The parts of an authored option this module reads. */
export interface AnswerFormatOption {
  value: string;
  matrixAxis?: 'Row' | 'Column';
}

/** Default `OpinionScale` bounds when the author set none. Must match what the widget renders. */
const OPINION_SCALE_DEFAULT_MIN = 1;
const OPINION_SCALE_DEFAULT_MAX = 10;

/**
 * The discrete points an `OpinionScale` offers, from its authored settings.
 *
 * Exported and shared because the widget renders the scale from these bounds and the server
 * validates against them: derived twice, they drift, and the respondent gets told that the number
 * they were just shown and allowed to click is out of range.
 *
 * A `max` at or below `min` would render an empty scale — nothing to click, and no way to answer a
 * required question — so it is widened to `min + 1` rather than left unanswerable.
 */
export function opinionScaleBounds(settings?: Record<string, JSONValue>): { min: number; max: number } {
  const rawMin = settings?.['min'];
  const min = typeof rawMin === 'number' ? Math.trunc(rawMin) : OPINION_SCALE_DEFAULT_MIN;
  const rawMax = settings?.['max'];
  const parsedMax = typeof rawMax === 'number' ? Math.trunc(rawMax) : OPINION_SCALE_DEFAULT_MAX;
  return { min, max: parsedMax > min ? parsedMax : min + 1 };
}

/**
 * Check an answered value against the format its question TYPE implies.
 *
 * @param question the question as authored — its type, its options and its settings
 * @param value    the answered value
 * @returns a human-readable message when the value does not fit the type, else `undefined`
 */
export function validateAnswerFormat(
  question: AnswerFormatQuestion,
  value: AnswerValue,
): string | undefined {
  const { type } = question;
  // An unanswered question has no format to be wrong about — that is the `isRequired` check's
  // business. Enforced here rather than left as a precondition on callers, because getting it
  // wrong is silent and plausible: `String(null)` is `'null'`, a non-empty string that fails
  // every format test, so a blank optional email would report "Enter a valid email address."
  if (!isAnswerSupplied(value)) {
    return undefined;
  }
  switch (type) {
    case 'Email':
      return isEmail(String(value)) ? undefined : 'Enter a valid email address.';
    case 'Number':
    case 'Rating':
    case 'NPS':
      return coerceAnswerToNumber(value) === undefined ? 'Enter a number.' : undefined;
    case 'OpinionScale':
      return validateOpinionScale(question, value);
    case 'SingleChoice':
    case 'Dropdown':
    case 'PictureChoice':
      return validateSingleChoice(question, value);
    case 'MultiChoice':
      return validateMultiChoice(question, value);
    case 'Phone':
      return isPhone(String(value)) ? undefined : 'Enter a valid phone number.';
    case 'Website':
      return isWebUrl(String(value)) ? undefined : 'Enter a valid web address.';
    case 'Date':
      return isDate(value) ? undefined : 'Enter a valid date.';
    case 'Checkbox':
    case 'Legal':
      // Distinct from `isRequired`: a REQUIRED consent box must be TICKED, which is the
      // required check's job (an unticked box is `false`, and `false` is a supplied answer).
      // All this asks is that the value is actually a boolean and not, say, the string
      // "false" that a caller posting straight at the mutation would send.
      return typeof value === 'boolean' ? undefined : 'Select yes or no.';
    case 'Ranking':
      return validateRanking(question, value);
    case 'Address':
      return isStringRecord(value) ? undefined : 'Enter an address.';
    case 'ContactInfo':
      return validateContactInfo(value);
    case 'Matrix':
      return validateMatrix(question, value);
    default:
      return undefined;
  }
}

/**
 * A web address a browser would actually navigate to.
 *
 * Requires an explicit `http`/`https` scheme rather than inferring one. Inferring is tempting
 * — respondents type `example.com` — but the value is stored and later rendered as a link, and
 * a scheme-less href resolves RELATIVE to whatever page renders it, so `example.com` becomes a
 * dead link on the form owner's own domain. The widget prefills `https://` in the input so the
 * respondent rarely meets this message; a caller posting at the mutation directly does.
 *
 * `new URL()` rather than a regex: it is the same parser the browser will use on the stored
 * value, so anything it accepts here resolves there. Non-web schemes are excluded explicitly
 * — `javascript:alert(1)` is a URL `new URL()` parses happily, and this value ends up in an
 * `href`.
 */
function isWebUrl(text: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(text.trim());
  } catch {
    return false;
  }
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
}

/** A plain string array — the stored shape of a `Ranking` answer (option values, best first). */
function isStringArray(value: AnswerValue): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** A flat object whose every value is a string — the stored shape of `Address` / `ContactInfo`. */
function isStringRecord(value: AnswerValue): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((v) => typeof v === 'string');
}

/**
 * A `ContactInfo` answer, with its email part held to the same standard a standalone `Email`
 * question is.
 *
 * Without this the composite is a hole in the type floor: an author who replaces a pair of
 * Email + Phone questions with one ContactInfo field would silently lose the format checks
 * both had, and the whole point of {@link validateAnswerFormat} is that a type's guarantees
 * hold wherever the type appears.
 */
function validateContactInfo(value: AnswerValue): string | undefined {
  if (!isStringRecord(value)) {
    return 'Enter your contact details.';
  }
  const messages = Object.values(validateCompositeParts('ContactInfo', value));
  return messages.length > 0 ? messages.join(' ') : undefined;
}

/**
 * Whether a REQUIRED question is actually satisfied by `value`.
 *
 * For nearly every type this is just "is there an answer", but consent is the exception that
 * makes the function necessary: an unticked box is `false`, `false` is a supplied answer, and so
 * the plain required check waved it straight through. A form could carry a required "I agree to
 * the terms" and be submitted — client AND server, which used the same test — without anyone
 * ever agreeing to anything. The comment on the `Checkbox` / `Legal` branch of
 * {@link validateAnswerFormat} asserted that the required check was handling this. It was not.
 *
 * Deliberately narrow: only `Checkbox` and `Legal` demand `true`. `YesNo` is a genuine choice
 * where "No" is an answer, and a `Rating` or `NPS` of 0 is a real score — treating either as
 * unanswered would force respondents to give a reading they do not mean.
 *
 * Shared, because a rule enforced only in the browser is not enforced: the public submit
 * mutation is reachable without the widget.
 */
export function isRequiredSatisfied(type: FormQuestionType, value: AnswerValue): boolean {
  if (type === 'Checkbox' || type === 'Legal') {
    return value === true;
  }
  return isAnswerSupplied(value);
}

/**
 * How much of one question is filled in, 0..1.
 *
 * All-or-nothing for a scalar question, and PER SUB-FIELD for a composite. That distinction is
 * the whole reason this exists: `isAnswerSupplied` calls a ContactInfo answered as soon as any
 * one of its five parts has a value, so a respondent typing first name, last name, email, phone
 * and company watched the progress bar move once and then sit still through four more fields —
 * three consecutive actions with no feedback, which teaches them their input is not registering.
 *
 * Progress is the only caller. Validation deliberately keeps the coarser test: a partly-filled
 * ContactInfo IS an answer, and the form is submittable on it.
 */
export function answerCompleteness(type: FormQuestionType, value: AnswerValue): number {
  const fields = compositeFieldsFor(type);
  if (fields && isStringRecord(value)) {
    const parts = value as Record<string, string>;
    const filled = fields.filter((f) => isAnswerSupplied(parts[f])).length;
    return filled / fields.length;
  }
  return isRequiredSatisfied(type, value) ? 1 : 0;
}

/** The fixed sub-field list of a composite type, or undefined for everything else. */
function compositeFieldsFor(type: FormQuestionType): readonly string[] | undefined {
  if (type === 'Address') {
    return ADDRESS_FIELDS;
  }
  if (type === 'ContactInfo') {
    return CONTACT_INFO_FIELDS;
  }
  return undefined;
}

/**
 * Per-SUB-FIELD verdicts for a composite answer: `{ email: '…', phone: '…' }`, empty when the
 * whole thing is fine.
 *
 * Exists because a composite is several fields wearing one question's clothes, and a single
 * `string | null` cannot say WHICH of them is wrong. The widget used to render that one string
 * beneath the whole group and mark every input invalid, so a bad email lit up all five boxes
 * and parked its message under `Phone` — respondents read it as a phone error. It also stopped
 * at the first failure, so fixing the email revealed a phone error that had been there all
 * along: one round trip per mistake.
 *
 * {@link validateAnswerFormat} derives its single message from this, so the two can never
 * disagree about whether a composite is valid — the summary is literally these messages joined.
 * Returns `{}` for non-composite types and for `Address`, which has no per-part format rules
 * (its parts are free text); callers can treat "no parts" as "fall back to the summary".
 */
export function validateCompositeParts(
  type: FormQuestionType,
  value: AnswerValue,
): Record<string, string> {
  if (type !== 'ContactInfo' || !isStringRecord(value)) {
    return {};
  }
  const parts = value as Record<string, string>;
  const errors: Record<string, string> = {};
  if (parts.email?.trim() && !isEmail(parts.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (parts.phone?.trim() && !isPhone(parts.phone)) {
    errors.phone = 'Enter a valid phone number.';
  }
  return errors;
}

/**
 * A `Matrix` answer: row value -> the column value(s) chosen for it.
 *
 * Both spellings are accepted because the row's own single/multi setting can change after
 * responses exist, and a form that stops reading its old answers on a settings change is worse
 * than one that accepts both.
 */
/**
 * The values the author actually offered on an axis, or null when there are none to check against.
 *
 * Null and empty set are the same thing here and both mean "do not check": a question authored
 * without options yet, or imported from a source that did not carry them, must not have every
 * answer rejected. Membership checking is a floor on top of a populated option list, never a
 * requirement that one exists.
 */
function offeredValues(
  question: AnswerFormatQuestion,
  axis?: 'Row' | 'Column',
): ReadonlySet<string> | null {
  const options = question.options ?? [];
  const matching = axis
    ? options.filter((o) => (o.matrixAxis ?? 'Row') === axis)
    : options;
  return matching.length > 0 ? new Set(matching.map((o) => o.value)) : null;
}

/** One value, and it has to be one the author offered. */
function validateSingleChoice(question: AnswerFormatQuestion, value: AnswerValue): string | undefined {
  if (typeof value !== 'string') {
    return 'Choose one of the offered options.';
  }
  const offered = offeredValues(question);
  return !offered || offered.has(value) ? undefined : 'Choose one of the offered options.';
}

/** Any number of values, each offered, none repeated. */
function validateMultiChoice(question: AnswerFormatQuestion, value: AnswerValue): string | undefined {
  if (!isStringArray(value)) {
    return 'Choose only from the offered options.';
  }
  const offered = offeredValues(question);
  if (offered && value.some((v) => !offered.has(v))) {
    return 'Choose only from the offered options.';
  }
  return new Set(value).size === value.length ? undefined : 'Each option may be chosen only once.';
}

/**
 * An ordering of offered options, each appearing at most once.
 *
 * Deliberately does NOT require every option to be ranked: a partial ranking is a real answer
 * shape, and inventing a completeness rule here would reject respondents the widget let through.
 * A duplicate is different — it makes the ordering self-contradictory, since one option cannot be
 * both first and second.
 */
function validateRanking(question: AnswerFormatQuestion, value: AnswerValue): string | undefined {
  if (!isStringArray(value)) {
    return 'Rank the options in order.';
  }
  const offered = offeredValues(question);
  if (offered && value.some((v) => !offered.has(v))) {
    return 'Rank only the offered options.';
  }
  return new Set(value).size === value.length ? undefined : 'Each option may be ranked only once.';
}

/**
 * A row-keyed map whose keys are authored rows and whose cells are authored columns.
 *
 * Array cells are tolerated for the same reason `form-question.component.ts` tolerates them: a
 * form switched between multi- and single-select after collecting answers must still be able to
 * read what those respondents chose.
 */
function validateMatrix(question: AnswerFormatQuestion, value: AnswerValue): string | undefined {
  if (!isMatrixAnswer(value)) {
    return 'Answer each row.';
  }
  const rows = offeredValues(question, 'Row');
  const columns = offeredValues(question, 'Column');
  const answered = value as Record<string, string | string[]>;
  for (const [row, picked] of Object.entries(answered)) {
    if (rows && !rows.has(row)) {
      return 'Answer only the rows shown.';
    }
    const cells = Array.isArray(picked) ? picked : [picked];
    if (columns && cells.some((cell) => !columns.has(cell))) {
      return 'Choose one of the offered answers for each row.';
    }
  }
  return undefined;
}

/** A whole number on the scale the author configured — the same points the widget renders. */
function validateOpinionScale(question: AnswerFormatQuestion, value: AnswerValue): string | undefined {
  const numeric = coerceAnswerToNumber(value);
  if (numeric === undefined) {
    return 'Enter a number.';
  }
  const { min, max } = opinionScaleBounds(question.settings);
  const outOfRange = !Number.isInteger(numeric) || numeric < min || numeric > max;
  return outOfRange ? `Choose a value between ${min} and ${max}.` : undefined;
}

function isMatrixAnswer(value: AnswerValue): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (v) => typeof v === 'string' || (Array.isArray(v) && v.every((c) => typeof c === 'string')),
  );
}

/**
 * Test a value against an author-supplied `ValidationRule.pattern`, anchored to the whole value.
 *
 * A pattern that will not compile does NOT block the respondent. This is where the two sides
 * most recently disagreed: the widget failed open (`catch` → valid) while the server failed
 * closed (`catch` → invalid), so a form whose author typed a malformed regex passed every
 * client-side check and was then rejected on submit with a field error that no input could
 * clear. The respondent could not fix someone else's authoring mistake, and the form was
 * simply unsubmittable.
 *
 * Failing open is safe: an uncompilable pattern never expressed a constraint in the first
 * place, and the type floor ({@link validateAnswerFormat}) still applies underneath it.
 */
export function matchesValidationPattern(value: string, pattern: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`).test(value);
  } catch {
    return true;
  }
}

/**
 * Pragmatic email check: one `@`, a dot-bearing domain, no whitespace. Deliberately lenient —
 * fully RFC-5322-correct matching rejects addresses that real mail servers accept, and a form
 * that refuses a respondent's real address is a worse failure than one that stores an odd one.
 */
function isEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

/**
 * Deliberately permissive phone check: count the digits and ignore EVERY non-digit character —
 * not only the separators people use to make a number readable (spaces, dashes, parentheses,
 * dots, a leading `+`) but letters too. So `123456 ext 999` counts nine digits and passes the
 * seven-digit floor below on a six-digit number. That is the accepted cost of the leniency: an
 * extension is a real thing respondents type, and the alternative — deciding which letters are
 * an extension marker in which locale — rejects more real numbers than it catches bad ones.
 *
 * The bounds are the ITU E.164 range — a national number is at least 7 digits and a fully
 * qualified international one is at most 15. Anything stricter starts rejecting real numbers,
 * because the "obvious" shape of a phone number differs by country and a form that refuses a
 * respondent's actual number is a far worse failure than one that stores an unusual string.
 * Authors who need a specific national format supply a `ValidationRule.pattern` on top.
 */
function isPhone(text: string): boolean {
  const digits = text.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * A date answer must be a string JS can parse as a real instant.
 *
 * Deliberately lenient about WHICH string formats parse, for the same reason as the email
 * check — but strict that it must be a string at all. `dateValue` is a plain nullable GraphQL
 * `String` on `FormAnswerInputType` (there is no date scalar in the schema), so nothing
 * upstream coerces or rejects it; a caller posting straight at the mutation can put a number,
 * a boolean or an array on a `Date` question. This used to return `true` for every non-string
 * on the theory that "transport already vetted it". Transport vets nothing, so that was the
 * same bypass this module exists to close for `Email`, left open for `Date`.
 */
function isDate(value: AnswerValue): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return !Number.isNaN(new Date(value.trim()).getTime());
}

/**
 * A decimal number as a person would write one: optional sign, digits with an optional
 * fractional part (or a bare `.5`), and optional scientific-notation exponent.
 *
 * Exists because `Number()` also understands spellings no respondent means and no consumer
 * reads back — see {@link coerceAnswerToNumber}.
 */
const DECIMAL_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Coerce to a finite number, or `undefined` when the value is not numeric at all.
 *
 * Numeric questions reach the server as either `numericValue` (a real number) or `textValue`
 * (the string an `<input>` produced), so both spellings have to be accepted. `Number.isFinite`
 * rather than a bare `Number()` check, because a caller can hand us `NaN` or `Infinity` in the
 * `numericValue` column and neither is an answer. (Blank strings are excluded earlier, by the
 * regex below — not by `isFinite`, which would happily accept `Number('')` as the finite `0`.)
 *
 * The string branch additionally requires a DECIMAL spelling, which `Number()` alone does not:
 * `Number('0x10')` is `16`, `Number('0b101')` is `5`, `Number('0o17')` is `15`. Those passed the
 * old finite check and were then persisted as the literal text the respondent typed, so the
 * answer was accepted as a number and stored as something nothing downstream reads as one.
 */
export function coerceAnswerToNumber(value: AnswerValue): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && DECIMAL_NUMBER.test(value.trim())) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
