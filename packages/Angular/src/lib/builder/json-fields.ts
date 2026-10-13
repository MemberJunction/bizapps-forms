import {
  readStoredConditionalRule,
  readStoredValidationRule,
  type ConditionalRule,
  type FormSettings,
  type JSONValue,
  type ValidationRule,
} from '@mj-biz-apps/forms-entities/contracts';

/**
 * The builder's half of the JSON-string columns it edits: WRITING them, plus how an editor shows
 * one it cannot read.
 *
 * Reading lives in the contracts (`stored-columns.ts`), validated by the zod schemas, because the
 * server reads the same columns to publish and two readers drifted: this file used to hold
 * tolerant parsers that cast any JSON object through as a valid rule, so publish froze malformed
 * rules into the snapshot that the server's parser then dropped. Writing stays here — only the
 * builder writes these columns.
 */

/**
 * Serialize an object for storage, or `null` when it carries nothing.
 *
 * "Carries nothing" counts DEFINED values only. `JSON.stringify({ show: undefined })` is
 * `'{}'`, so counting raw keys would store a phantom "this item has a rule" marker that every
 * reader then has to see through — the exact shape `withVerbGroup` deletes keys to avoid.
 */
function serializeObject(value: object | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const populated = Object.values(value).some((v) => v !== undefined);
  return populated ? JSON.stringify(value) : null;
}

/**
 * Serialize a {@link ConditionalRule}, or `null` when it carries no verb.
 *
 * Deliberately verb-agnostic. This used to short-circuit on `!rule.show`, written when `show`
 * was the only verb there was — so once `require` and `jump` arrived, a rule carrying only one
 * of them serialized to `null` and was discarded on save: a page's jump never persisted, and
 * deleting an unrelated "Show only if" card from an item that also had a jump wiped the jump
 * with it. Any new verb is covered here by construction rather than by remembering to add it.
 */
export function serializeConditionalRule(rule: ConditionalRule | undefined): string | null {
  return serializeObject(rule);
}

export function serializeValidationRule(rule: ValidationRule | undefined): string | null {
  return serializeObject(rule);
}

export function serializeQuestionSettings(settings: Record<string, JSONValue>): string | null {
  return serializeObject(settings);
}

export function serializeFormSettings(settings: FormSettings): string {
  return JSON.stringify(settings);
}

/**
 * The stored conditional rule as an editor shows it: the rule, or none when the column is empty
 * OR cannot be read.
 *
 * Showing an unreadable rule as "no rule" is deliberate, and not the silent drop it looks like.
 * The canvas badge reports that column as broken (the rule inventory reads it with the same
 * reader) and publish refuses it, so the author has already been told; what the editor owes them
 * is a working control to write a valid rule with, and saving one replaces the unreadable text.
 * Throwing here would instead take the whole editor down on render.
 */
export function editableConditionalRule(raw: string | null | undefined): ConditionalRule | undefined {
  const read = readStoredConditionalRule(raw);
  return read.ok ? read.value : undefined;
}

/**
 * The stored validation rule as the editor shows it — none when unreadable, for the reason given
 * on {@link editableConditionalRule}. Publish refuses an unreadable one with the column named.
 */
export function editableValidationRule(raw: string | null | undefined): ValidationRule | undefined {
  const read = readStoredValidationRule(raw);
  return read.ok ? read.value : undefined;
}
