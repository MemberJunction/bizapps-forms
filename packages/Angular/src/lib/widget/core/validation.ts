/**
 * Client-side enforcement of `isRequired` + `ValidationRule` (S2). The server
 * re-validates the same rules on submit; this layer gives instant, accessible
 * feedback and blocks navigation/submit on a visible, required question.
 */
import {
  coerceAnswerToNumber,
  isAnswerableQuestionType,
  isAnswerSupplied,
  isRequiredSatisfied,
  matchesValidationPattern,
  validateAnswerFormat,
  validateCompositeParts,
} from '@mj-biz-apps/forms-entities';
import type {
  AnswerValue,
  PublishedFormQuestion,
  ValidationRule,
} from '@mj-biz-apps/forms-entities';

/** A per-question validation outcome. `null` message means "valid". */
export interface FieldValidationResult {
  valid: boolean;
  message: string | null;
  /**
   * For composite questions (Address / ContactInfo): which SUB-FIELD each problem belongs to,
   * so the UI can put every message beneath the input that caused it and mark only that input.
   *
   * Absent — not empty — when the failure belongs to the question as a whole (required, or a
   * value that is not a record at all). That distinction is what the renderer branches on: a
   * group-level failure still gets one message under the group.
   */
  parts?: Record<string, string>;
}

const VALID: FieldValidationResult = { valid: true, message: null };

/**
 * True when a value counts as "supplied" (non-blank string / non-empty array / present).
 *
 * Kept as the widget's own exported name (callers import it from the widget's public surface)
 * but implemented on the shared predicate, because this used to be one of FOUR hand-written
 * copies of "is it answered" and they had drifted: the conditional evaluator did not trim while
 * every validator did.
 */
export function hasValue(value: AnswerValue): boolean {
  return isAnswerSupplied(value);
}

/**
 * Validate one question's current value. Only call for VISIBLE questions — hidden
 * questions (failed conditional rule) are never required and never validated.
 */
export function validateQuestion(
  question: PublishedFormQuestion,
  value: AnswerValue,
): FieldValidationResult {
  if (!isAnswerableQuestionType(question.type)) {
    return VALID;
  }
  const present = hasValue(value);
  // Not `present`: a required consent box is only satisfied by a TICK, and an unticked one is
  // `false`, which counts as supplied. See isRequiredSatisfied.
  if (question.isRequired && !isRequiredSatisfied(question.type, value)) {
    return {
      valid: false,
      message:
        question.type === 'Checkbox' || question.type === 'Legal'
          ? 'Please tick this box to continue.'
          : 'This question is required.',
    };
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

/**
 * Built-in format checks for typed questions, delegated to the shared contract.
 *
 * This used to be its own copy of the rules, and the server had no copy at all — so the widget
 * rejected a malformed email that the mutation behind it happily stored. Both sides now call
 * {@link validateAnswerFormat}, which is the only way the two stay in agreement.
 */
function validateByType(
  question: PublishedFormQuestion,
  value: AnswerValue,
): FieldValidationResult {
  const message = validateAnswerFormat(question, value);
  if (!message) {
    return VALID;
  }
  // The summary IS these parts joined, so asking for both cannot produce a disagreement.
  const parts = validateCompositeParts(question.type, value);
  return Object.keys(parts).length > 0 ? { valid: false, message, parts } : { valid: false, message };
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
    if (rule.pattern !== undefined && !matchesValidationPattern(text, rule.pattern)) {
      return { valid: false, message: rule.patternMessage ?? 'Value is not in the expected format.' };
    }
  }
  const num = coerceAnswerToNumber(value);
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

