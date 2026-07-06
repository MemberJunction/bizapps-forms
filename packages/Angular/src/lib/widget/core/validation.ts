/**
 * Client-side enforcement of `isRequired` + `ValidationRule` (S2). The server
 * re-validates the same rules on submit; this layer gives instant, accessible
 * feedback and blocks navigation/submit on a visible, required question.
 */
import type {
  AnswerValue,
  PublishedFormQuestion,
  ValidationRule,
} from '@mj-biz-apps/forms-entities';

/** A per-question validation outcome. `null` message means "valid". */
export interface FieldValidationResult {
  valid: boolean;
  message: string | null;
}

const VALID: FieldValidationResult = { valid: true, message: null };

/** True when a value counts as "supplied" (non-empty string / non-empty array / present). */
export function hasValue(value: AnswerValue): boolean {
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
 * Validate one question's current value. Only call for VISIBLE questions — hidden
 * questions (failed conditional rule) are never required and never validated.
 */
export function validateQuestion(
  question: PublishedFormQuestion,
  value: AnswerValue,
): FieldValidationResult {
  if (question.type === 'Statement') {
    return VALID;
  }
  const present = hasValue(value);
  if (question.isRequired && !present) {
    return { valid: false, message: 'This question is required.' };
  }
  if (!present) {
    return VALID;
  }
  const typeResult = validateByType(question, value);
  if (!typeResult.valid) {
    return typeResult;
  }
  return validateRule(question.validationRule, value);
}

/** Built-in format checks for typed questions (Email, Phone, Number). */
function validateByType(
  question: PublishedFormQuestion,
  value: AnswerValue,
): FieldValidationResult {
  switch (question.type) {
    case 'Email':
      return isEmail(String(value))
        ? VALID
        : { valid: false, message: 'Enter a valid email address.' };
    case 'Number':
    case 'Rating':
    case 'NPS':
      return Number.isFinite(toNumber(value))
        ? VALID
        : { valid: false, message: 'Enter a number.' };
    default:
      return VALID;
  }
}

/** Apply the declarative {@link ValidationRule} (length / range / pattern). */
function validateRule(
  rule: ValidationRule | undefined,
  value: AnswerValue,
): FieldValidationResult {
  if (!rule) {
    return VALID;
  }
  const text = typeof value === 'string' ? value : undefined;
  if (text !== undefined) {
    if (rule.minLength !== undefined && text.length < rule.minLength) {
      return { valid: false, message: `Use at least ${rule.minLength} characters.` };
    }
    if (rule.maxLength !== undefined && text.length > rule.maxLength) {
      return { valid: false, message: `Use at most ${rule.maxLength} characters.` };
    }
    if (rule.pattern !== undefined && !matchesPattern(text, rule.pattern)) {
      return { valid: false, message: rule.patternMessage ?? 'Value is not in the expected format.' };
    }
  }
  const num = toNumber(value);
  if (num !== undefined) {
    if (rule.min !== undefined && num < rule.min) {
      return { valid: false, message: `Must be at least ${rule.min}.` };
    }
    if (rule.max !== undefined && num > rule.max) {
      return { valid: false, message: `Must be at most ${rule.max}.` };
    }
  }
  return VALID;
}

/** Anchored full-string regex test; an invalid pattern source never blocks the user. */
function matchesPattern(text: string, pattern: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`).test(text);
  } catch {
    return true;
  }
}

/** Pragmatic email check — intentionally lenient; the server is authoritative. */
function isEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

/** Coerce to a finite number or `undefined`. */
function toNumber(value: AnswerValue): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
