/**
 * The builder's "Add content" palette: what each question type is CALLED and what icon it wears.
 *
 * Purely presentational. Everything behavioural — is it answerable, does it carry options, which
 * column does its answer occupy, how is it summarised — lives in `QUESTION_TYPE_BEHAVIOR` in
 * `@mj-biz-apps/forms-entities`, because forms-server needs those answers too and a second copy
 * is how the server's snapshot parser ended up with a hand-maintained list of type names that
 * could not learn when the contract grew.
 *
 * What stays here is the half the contract has no business knowing: a Font Awesome class and a
 * palette heading are decisions about a builder UI, not about what a form IS.
 */
import {
  FORM_QUESTION_TYPES,
  questionTypeBehavior,
  type FormQuestionType,
} from '@mj-biz-apps/forms-entities';

/**
 * Palette headings, mirroring how respondents' tools group these.
 *
 * `Structure` holds the one type that collects no answer. Grouping `Statement` with the text
 * questions is what made it easy to forget it is not one.
 */
export type QuestionPaletteGroup =
  | 'Contact'
  | 'Text'
  | 'Choice'
  | 'Scale'
  | 'Date'
  | 'Upload'
  | 'Structure';

/** Presentation metadata for one question type. */
export interface QuestionTypeMeta {
  type: FormQuestionType;
  label: string;
  /** Font Awesome icon class (icons only — no hardcoded colors). */
  icon: string;
  group: QuestionPaletteGroup;
  /** One-line description shown under the label in the palette. */
  hint: string;
}

/**
 * Label / icon / group / hint per type.
 *
 * Typed as a total `Record<FormQuestionType, …>`, which is the guard that matters: adding a type
 * to the contract without giving it a palette entry is a COMPILE error here, so a type can never
 * exist that the builder cannot offer. The old catalog was an array plus a runtime exhaustiveness
 * assertion; a Record says the same thing to the compiler instead of to a test.
 */
const PRESENTATION: Record<FormQuestionType, Omit<QuestionTypeMeta, 'type'>> = {
  // --- Contact info ---
  ContactInfo: { label: 'Contact info', icon: 'fa-solid fa-address-card', group: 'Contact', hint: 'Name, email, phone and company in one block' },
  Email: { label: 'Email', icon: 'fa-solid fa-envelope', group: 'Contact', hint: 'An email address, format-checked' },
  Phone: { label: 'Phone number', icon: 'fa-solid fa-phone', group: 'Contact', hint: 'A phone number, format-checked' },
  Address: { label: 'Address', icon: 'fa-solid fa-location-dot', group: 'Contact', hint: 'Street, city, region, postal code and country' },
  Website: { label: 'Website', icon: 'fa-solid fa-link', group: 'Contact', hint: 'A web address' },

  // --- Text ---
  ShortText: { label: 'Short text', icon: 'fa-solid fa-font', group: 'Text', hint: 'One line of free text' },
  LongText: { label: 'Long text', icon: 'fa-solid fa-align-left', group: 'Text', hint: 'A paragraph of free text' },
  Number: { label: 'Number', icon: 'fa-solid fa-hashtag', group: 'Text', hint: 'A numeric answer' },

  // --- Choice ---
  SingleChoice: { label: 'Multiple choice', icon: 'fa-regular fa-circle-dot', group: 'Choice', hint: 'Pick one option' },
  MultiChoice: { label: 'Checkboxes', icon: 'fa-regular fa-square-check', group: 'Choice', hint: 'Pick any number of options' },
  Dropdown: { label: 'Dropdown', icon: 'fa-solid fa-caret-down', group: 'Choice', hint: 'Pick one from a long list' },
  PictureChoice: { label: 'Picture choice', icon: 'fa-regular fa-image', group: 'Choice', hint: 'Pick one option shown as an image' },
  YesNo: { label: 'Yes / No', icon: 'fa-solid fa-toggle-on', group: 'Choice', hint: 'A two-way answer' },
  Checkbox: { label: 'Checkbox', icon: 'fa-regular fa-square-check', group: 'Choice', hint: 'A single box to tick — consent, opt-in' },
  Legal: { label: 'Legal', icon: 'fa-solid fa-scale-balanced', group: 'Choice', hint: 'Terms to read, then accept or decline' },

  // --- Rating & ranking ---
  NPS: { label: 'Net promoter score', icon: 'fa-solid fa-gauge-high', group: 'Scale', hint: 'The 0–10 recommendation question' },
  OpinionScale: { label: 'Opinion scale', icon: 'fa-solid fa-sliders', group: 'Scale', hint: 'A numbered scale with a label at each end' },
  Rating: { label: 'Rating', icon: 'fa-solid fa-star', group: 'Scale', hint: 'Stars, out of a configurable maximum' },
  Ranking: { label: 'Ranking', icon: 'fa-solid fa-arrow-up-9-1', group: 'Scale', hint: 'Put options in order of preference' },
  Matrix: { label: 'Matrix', icon: 'fa-solid fa-table-cells', group: 'Scale', hint: 'A grid — one answer per row' },

  // --- Date & time ---
  Date: { label: 'Date', icon: 'fa-regular fa-calendar', group: 'Date', hint: 'A calendar date' },
  Time: { label: 'Time', icon: 'fa-regular fa-clock', group: 'Date', hint: 'A time of day' },

  // --- Uploads ---
  FileUpload: { label: 'File upload', icon: 'fa-solid fa-paperclip', group: 'Upload', hint: 'A file the respondent attaches' },
  Signature: { label: 'Signature', icon: 'fa-solid fa-signature', group: 'Upload', hint: 'A signature drawn on screen, stored as an image' },

  // --- Structure ---
  Statement: { label: 'Statement', icon: 'fa-solid fa-quote-left', group: 'Structure', hint: 'Text shown to the respondent — collects no answer' },
};

/** The exhaustive palette, in contract order. */
export const QUESTION_TYPE_CATALOG: ReadonlyArray<QuestionTypeMeta> = FORM_QUESTION_TYPES.map(
  (type) => ({ type, ...PRESENTATION[type] }),
);

const CATALOG_BY_TYPE: ReadonlyMap<FormQuestionType, QuestionTypeMeta> = new Map(
  QUESTION_TYPE_CATALOG.map((m) => [m.type, m]),
);

/** Palette groups in display order. */
export const QUESTION_PALETTE_GROUPS: ReadonlyArray<QuestionPaletteGroup> = [
  'Contact',
  'Text',
  'Choice',
  'Scale',
  'Date',
  'Upload',
  'Structure',
];

/** Look up the presentation metadata for a question type. */
export function questionTypeMeta(type: FormQuestionType): QuestionTypeMeta {
  const meta = CATALOG_BY_TYPE.get(type);
  if (!meta) {
    throw new Error(`Unknown FormQuestionType: ${String(type)}`);
  }
  return meta;
}

/**
 * Whether a type carries selectable options.
 *
 * Re-exported as a thin wrapper rather than having callers import the contract directly, because
 * every builder surface already imports this module for the label and icon — but note it now
 * ANSWERS FROM the contract, so `Ranking` and `Matrix` count as option-carrying without this file
 * having an opinion about it.
 */
export function questionTypeHasOptions(type: FormQuestionType): boolean {
  return questionTypeBehavior(type).optionMode !== 'none';
}

/** The catalog entries belonging to one palette group, in display order. */
export function questionTypesInGroup(group: QuestionPaletteGroup): QuestionTypeMeta[] {
  return QUESTION_TYPE_CATALOG.filter((m) => m.group === group);
}

/**
 * Palette entries matching a search string, over both label and hint.
 *
 * Searching the hint as well as the label is what makes the palette findable at 25 types: an
 * author looking for "consent" finds `Checkbox`, and one looking for "url" finds `Website`,
 * neither of which says so in its name.
 */
export function searchQuestionTypes(query: string): QuestionTypeMeta[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...QUESTION_TYPE_CATALOG];
  }
  return QUESTION_TYPE_CATALOG.filter(
    (m) =>
      m.label.toLowerCase().includes(needle) ||
      m.hint.toLowerCase().includes(needle) ||
      m.type.toLowerCase().includes(needle),
  );
}
