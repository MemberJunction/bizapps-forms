/**
 * Type-derived format validation for an answered question — the check that follows from a
 * question's TYPE rather than from an author-supplied {@link ValidationRule}.
 *
 * WHY THIS IS SHARED. The widget and the server must reach the same verdict on the same
 * answer, and they did not: the widget carried its own type-format check while the server's
 * `validateValue` consulted only the declarative rule. An `Email` question authored without
 * a `pattern` therefore looked validated in the browser (the `<input type="email">` and the
 * widget both rejected it) yet accepted anything posted straight at the GraphQL mutation,
 * persisting `not-an-email` as a `Complete` response. That is precisely the fork this
 * package's contract exists to prevent, so the check lives here and both sides call it.
 *
 * Runs BEFORE the declarative rule and does not replace it: an explicit `ValidationRule`
 * still applies on top, so an author who supplies their own `pattern` keeps full control
 * and can constrain a type further (never loosen it — the type floor always holds).
 */
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
  if (!isAnswered(value)) {
    return undefined;
  }
  switch (type) {
    case 'Email':
      return isEmail(String(value)) ? undefined : 'Enter a valid email address.';
    case 'Number':
    case 'Rating':
    case 'NPS':
      return toFiniteNumber(value) === undefined ? 'Enter a number.' : undefined;
    case 'Phone':
      return isPhone(String(value)) ? undefined : 'Enter a valid phone number.';
    case 'Date':
      return isDate(value) ? undefined : 'Enter a valid date.';
    default:
      return undefined;
  }
}

/**
 * Whether a value counts as supplied. Mirrors the "answered" notion the conditional evaluator
 * and both validators already use: a blank or whitespace-only string is not an answer.
 */
function isAnswered(value: AnswerValue): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
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
 * Accept anything JS can parse as a real instant. `Date` answers normally arrive through the
 * typed `dateValue` column, where the GraphQL layer has already rejected nonsense — this
 * covers the path where a date is smuggled through `textValue` instead, which bypasses that
 * coercion entirely.
 */
function isDate(value: AnswerValue): boolean {
  if (typeof value !== 'string') {
    return true; // a non-string reached us through a typed column; transport already vetted it
  }
  return !Number.isNaN(new Date(value.trim()).getTime());
}

/**
 * Coerce to a finite number, or `undefined` when the value is not numeric at all.
 *
 * Numeric questions reach the server as either `numericValue` (a real number) or `textValue`
 * (the string an `<input>` produced), so both spellings have to be accepted. `Number.isFinite`
 * rather than a bare `Number()` check, because `Number('')`, `NaN` and `Infinity` are all
 * things a caller can hand us and none of them is an answer.
 */
function toFiniteNumber(value: AnswerValue): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
