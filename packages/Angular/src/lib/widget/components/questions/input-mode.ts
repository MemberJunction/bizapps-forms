/**
 * Per-question-type mobile keyboard + autocomplete hints. Driving the right on-screen
 * keyboard per field is a hard requirement of the §2 UX bar ("correct mobile keyboards
 * per field type").
 *
 * These stay hand-written switches rather than moving into `QUESTION_TYPE_BEHAVIOR`: they are
 * about the HTML control a browser renders, which is presentation, and the contract package has
 * no business knowing that `Phone` means `inputmode="tel"`. The behaviour table carries what
 * every consumer needs (is it answerable, which column, how is it analysed); this carries what
 * only the widget needs.
 */
import type { FormQuestionType } from '@mj-biz-apps/forms-entities';

/** HTML `inputmode` for the soft keyboard a text-style question should summon. */
export function inputModeFor(type: FormQuestionType): string {
  switch (type) {
    case 'Email':
      return 'email';
    case 'Phone':
      return 'tel';
    case 'Website':
      return 'url';
    case 'Number':
    case 'OpinionScale':
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
    case 'Website':
      return 'url';
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
    case 'Website':
      return 'url';
    default:
      return 'on';
  }
}

/**
 * `autocomplete` token for one sub-field of a composite question.
 *
 * Composites are where autofill pays for itself: a browser that recognises a five-input group as
 * an address fills all five from one tap. It only recognises them by these tokens — the field
 * NAMES are ours and mean nothing to a browser — so a composite without them is five unrelated
 * text boxes to every password manager and mobile keyboard on the planet.
 */
export function compositeAutocompleteFor(field: string): string {
  switch (field) {
    case 'line1':
      return 'address-line1';
    case 'line2':
      return 'address-line2';
    case 'city':
      return 'address-level2';
    case 'region':
      return 'address-level1';
    case 'postalCode':
      return 'postal-code';
    case 'country':
      return 'country-name';
    case 'firstName':
      return 'given-name';
    case 'lastName':
      return 'family-name';
    case 'email':
      return 'email';
    case 'phone':
      return 'tel';
    case 'company':
      return 'organization';
    default:
      return 'on';
  }
}

/** Human label for one sub-field of a composite question. */
export function compositeLabelFor(field: string): string {
  switch (field) {
    case 'line1':
      return 'Address';
    case 'line2':
      return 'Address line 2';
    case 'city':
      return 'City';
    case 'region':
      return 'State / Region';
    case 'postalCode':
      return 'Postal code';
    case 'country':
      return 'Country';
    case 'firstName':
      return 'First name';
    case 'lastName':
      return 'Last name';
    case 'email':
      return 'Email';
    case 'phone':
      return 'Phone';
    case 'company':
      return 'Company';
    default:
      return field;
  }
}

/** `<input type>` for one sub-field of a composite question. */
export function compositeInputTypeFor(field: string): string {
  switch (field) {
    case 'email':
      return 'email';
    case 'phone':
      return 'tel';
    default:
      return 'text';
  }
}
