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
 * still applies on top, so an author who supplies their own `pattern` keeps full control
 * and can constrain a type further (never loosen it — the type floor always holds).
 */
import { isAnswerSupplied } from './conditional-rule';
import type { AnswerValue } from './conditional-rule';
import type { FormQuestionType } from './form-definition';

/**
 * Check an answered value against the format its question TYPE implies.
 *
 * @param type  the question's type
 * @param value the answered value
 * @returns a human-readable message when the value does not fit the type, else `undefined`
 */
export function validateAnswerFormat(
  type: FormQuestionType,
  value: AnswerValue,
): string | undefined {
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
    case 'Phone':
      return isPhone(String(value)) ? undefined : 'Enter a valid phone number.';
    case 'Date':
      return isDate(value) ? undefined : 'Enter a valid date.';
    default:
      return undefined;
  }
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
 * Deliberately permissive phone check: count digits, ignore everything people use to make a
 * number readable (spaces, dashes, parentheses, dots, a leading `+`).
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
 * rather than a bare `Number()` check, because `Number('')`, `NaN` and `Infinity` are all
 * things a caller can hand us and none of them is an answer.
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
