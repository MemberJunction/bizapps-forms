import type { FormQuestionType } from '@mj-biz-apps/forms-entities';

/** UI grouping for the "Add question" palette. */
export type QuestionPaletteGroup = 'Text' | 'Choice' | 'Scale' | 'Advanced';

/** Static metadata for one Phase-1 question type, driving the palette + preview. */
export interface QuestionTypeMeta {
  type: FormQuestionType;
  label: string;
  /** Font Awesome icon class (icons only — no hardcoded colors). */
  icon: string;
  group: QuestionPaletteGroup;
  /** Whether this type carries selectable options (Single/Multi/Dropdown). */
  hasOptions: boolean;
}

/**
 * The exhaustive Phase-1 question taxonomy (FORMS_BUILD_PLAN §5.3). Order within a
 * group is the palette display order. Kept in lockstep with the `FormQuestionType`
 * union from the shared contract — adding a type to the union without adding it here
 * is a compile error via {@link assertCatalogExhaustive}.
 */
export const QUESTION_TYPE_CATALOG: ReadonlyArray<QuestionTypeMeta> = [
  { type: 'ShortText', label: 'Short text', icon: 'fa-solid fa-font', group: 'Text', hasOptions: false },
  { type: 'LongText', label: 'Long text', icon: 'fa-solid fa-align-left', group: 'Text', hasOptions: false },
  { type: 'Email', label: 'Email', icon: 'fa-solid fa-envelope', group: 'Text', hasOptions: false },
  { type: 'Phone', label: 'Phone', icon: 'fa-solid fa-phone', group: 'Text', hasOptions: false },
  { type: 'Number', label: 'Number', icon: 'fa-solid fa-hashtag', group: 'Text', hasOptions: false },
  { type: 'SingleChoice', label: 'Single choice', icon: 'fa-regular fa-circle-dot', group: 'Choice', hasOptions: true },
  { type: 'MultiChoice', label: 'Multi choice', icon: 'fa-regular fa-square-check', group: 'Choice', hasOptions: true },
  { type: 'Dropdown', label: 'Dropdown', icon: 'fa-solid fa-caret-down', group: 'Choice', hasOptions: true },
  { type: 'Rating', label: 'Rating', icon: 'fa-solid fa-star', group: 'Scale', hasOptions: false },
  { type: 'NPS', label: 'NPS', icon: 'fa-solid fa-gauge-high', group: 'Scale', hasOptions: false },
  { type: 'YesNo', label: 'Yes / No', icon: 'fa-solid fa-toggle-on', group: 'Scale', hasOptions: false },
  { type: 'Date', label: 'Date', icon: 'fa-regular fa-calendar', group: 'Advanced', hasOptions: false },
  { type: 'Time', label: 'Time', icon: 'fa-regular fa-clock', group: 'Advanced', hasOptions: false },
  { type: 'FileUpload', label: 'File upload', icon: 'fa-solid fa-paperclip', group: 'Advanced', hasOptions: false },
  { type: 'Statement', label: 'Statement', icon: 'fa-solid fa-quote-left', group: 'Advanced', hasOptions: false },
];

const CATALOG_BY_TYPE: ReadonlyMap<FormQuestionType, QuestionTypeMeta> = new Map(
  QUESTION_TYPE_CATALOG.map((m) => [m.type, m]),
);

/** Palette groups in display order. */
export const QUESTION_PALETTE_GROUPS: ReadonlyArray<QuestionPaletteGroup> = ['Text', 'Choice', 'Scale', 'Advanced'];

/** Look up the metadata for a question type. Always defined for valid Phase-1 types. */
export function questionTypeMeta(type: FormQuestionType): QuestionTypeMeta {
  const meta = CATALOG_BY_TYPE.get(type);
  if (!meta) {
    throw new Error(`Unknown FormQuestionType: ${String(type)}`);
  }
  return meta;
}

/** Whether a question type carries selectable options. */
export function questionTypeHasOptions(type: FormQuestionType): boolean {
  return questionTypeMeta(type).hasOptions;
}

/** The catalog entries belonging to one palette group, in display order. */
export function questionTypesInGroup(group: QuestionPaletteGroup): QuestionTypeMeta[] {
  return QUESTION_TYPE_CATALOG.filter((m) => m.group === group);
}
