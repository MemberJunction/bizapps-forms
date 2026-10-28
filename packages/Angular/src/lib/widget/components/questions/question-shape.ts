import type { FormQuestionType } from '@mj-biz-apps/forms-entities/contracts';

/**
 * How a question type is labelled for assistive tech:
 * - `control`: one labelable element carries `inputId()`, so the header is `<label for>`.
 * - `group`: several controls inside one element named by `aria-labelledby="labelId()"`.
 * - `grid`: a matrix; the table is named by the question, each row is its own radio group.
 * - `fieldset`: several fields of one answer; the question is the `<legend>`.
 * - `none`: display-only content with nothing to label.
 */
export type QuestionShape = 'control' | 'group' | 'grid' | 'fieldset' | 'none';

/**
 * The shape of `type`. No `default`: a type added to the catalog fails to compile here until it is
 * classified, instead of silently getting a `<label for>` that points at nothing (UI audit F11).
 */
export function questionShape(type: FormQuestionType): QuestionShape {
  switch (type) {
    case 'ShortText':
    case 'LongText':
    case 'Email':
    case 'Phone':
    case 'Website':
    case 'Number':
    case 'Dropdown':
    case 'Date':
    case 'Time':
    case 'FileUpload':
    case 'Checkbox':
      return 'control';
    case 'SingleChoice':
    case 'MultiChoice':
    case 'PictureChoice':
    case 'Rating':
    case 'NPS':
    case 'OpinionScale':
    case 'Ranking':
    case 'YesNo':
    case 'Legal':
    case 'Doodle':
      return 'group';
    case 'Matrix':
      return 'grid';
    case 'Address':
    case 'ContactInfo':
      return 'fieldset';
    case 'Statement':
      return 'none';
  }
}
