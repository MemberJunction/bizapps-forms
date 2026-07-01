/**
 * Per-question-type mobile keyboard + autocomplete hints. Driving the right on-screen
 * keyboard per field is a hard requirement of the §2 UX bar ("correct mobile keyboards
 * per field type").
 */
import type { FormQuestionType } from '@mj-biz-apps/forms-entities';

/** HTML `inputmode` for the soft keyboard a text-style question should summon. */
export function inputModeFor(type: FormQuestionType): string {
  switch (type) {
    case 'Email':
      return 'email';
    case 'Phone':
      return 'tel';
    case 'Number':
      return 'decimal';
    default:
      return 'text';
  }
}

/** Native `<input type>` for a text-style question. */
export function inputTypeFor(type: FormQuestionType): string {
  switch (type) {
    case 'Email':
      return 'email';
    case 'Phone':
      return 'tel';
    case 'Number':
      return 'number';
    case 'Date':
      return 'date';
    case 'Time':
      return 'time';
    default:
      return 'text';
  }
}

/** `autocomplete` token to speed up known fields on mobile. */
export function autocompleteFor(type: FormQuestionType): string {
  switch (type) {
    case 'Email':
      return 'email';
    case 'Phone':
      return 'tel';
    default:
      return 'on';
  }
}
