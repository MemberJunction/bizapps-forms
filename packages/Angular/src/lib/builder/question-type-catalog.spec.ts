import { describe, it, expect } from 'vitest';
import {
  QUESTION_TYPE_CATALOG,
  questionTypeMeta,
  questionTypeHasOptions,
  questionTypesInGroup,
} from './question-type-catalog';
import type { FormQuestionType } from '@mj-biz-apps/forms-entities';

/** The exhaustive Phase-1 union, duplicated here to guard against catalog drift. */
const ALL_TYPES: FormQuestionType[] = [
  'ShortText', 'LongText', 'Email', 'Phone', 'Number',
  'SingleChoice', 'MultiChoice', 'Dropdown',
  'Rating', 'NPS', 'YesNo', 'Date', 'Time', 'FileUpload', 'Statement',
];

describe('question type catalog', () => {
  it('covers every Phase-1 type exactly once', () => {
    expect(QUESTION_TYPE_CATALOG).toHaveLength(ALL_TYPES.length);
    const types = QUESTION_TYPE_CATALOG.map((m) => m.type).sort();
    expect(types).toEqual([...ALL_TYPES].sort());
  });

  it('marks only choice types as having options', () => {
    expect(questionTypeHasOptions('SingleChoice')).toBe(true);
    expect(questionTypeHasOptions('MultiChoice')).toBe(true);
    expect(questionTypeHasOptions('Dropdown')).toBe(true);
    expect(questionTypeHasOptions('ShortText')).toBe(false);
    expect(questionTypeHasOptions('Rating')).toBe(false);
  });

  it('returns metadata with a Font Awesome icon for each type', () => {
    for (const type of ALL_TYPES) {
      const meta = questionTypeMeta(type);
      expect(meta.icon).toContain('fa-');
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });

  it('groups partition the catalog', () => {
    const grouped = (['Text', 'Choice', 'Scale', 'Advanced'] as const).flatMap((g) =>
      questionTypesInGroup(g),
    );
    expect(grouped).toHaveLength(ALL_TYPES.length);
  });
});
