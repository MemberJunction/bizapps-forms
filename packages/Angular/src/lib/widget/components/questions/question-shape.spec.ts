/**
 * How each question type is labelled for assistive tech.
 *
 * The defect (UI audit F11): the question header was `<label for="inputId()">` for every type, but
 * only a single control (an input, select, textarea, or the Checkbox button) carries that id. For a
 * group, a matrix or an address the `for` pointed at nothing; the address fields were not grouped
 * under the question at all. One classification now decides the header's markup.
 */
import { describe, expect, it } from 'vitest';
import { FORM_QUESTION_TYPES } from '@mj-biz-apps/forms-entities/contracts';
import { questionShape } from './question-shape';

describe('questionShape', () => {
  it('classifies every question type', () => {
    for (const type of FORM_QUESTION_TYPES) {
      expect(['control', 'group', 'grid', 'fieldset', 'none'], type).toContain(questionShape(type));
    }
  });

  it.each(['ShortText', 'LongText', 'Email', 'Phone', 'Website', 'Number', 'Dropdown', 'Date', 'Time', 'FileUpload', 'Checkbox'] as const)(
    '%s is one labelable control, named by <label for>',
    (type) => {
      expect(questionShape(type)).toBe('control');
    },
  );

  it.each(['SingleChoice', 'MultiChoice', 'PictureChoice', 'Rating', 'NPS', 'OpinionScale', 'Ranking', 'YesNo', 'Legal', 'Doodle'] as const)(
    '%s is a group, named by aria-labelledby',
    (type) => {
      expect(questionShape(type)).toBe('group');
    },
  );

  it('Matrix is a grid of one radio group per row', () => {
    expect(questionShape('Matrix')).toBe('grid');
  });

  it.each(['Address', 'ContactInfo'] as const)('%s is a fieldset whose legend is the question', (type) => {
    expect(questionShape(type)).toBe('fieldset');
  });

  it('Statement has no control to label', () => {
    expect(questionShape('Statement')).toBe('none');
  });
});
