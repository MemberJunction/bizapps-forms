import { describe, it, expect } from 'vitest';
import {
  QUESTION_PALETTE_GROUPS,
  QUESTION_TYPE_CATALOG,
  questionTypeMeta,
  questionTypeHasOptions,
  questionTypesInGroup,
  searchQuestionTypes,
  questionGroupColorClass,
  questionTypeColorClass,
} from './question-type-catalog';
import { FORMS_VIZ_CSS } from '../shared';
import { FORM_QUESTION_TYPES, type FormQuestionType } from '@mj-biz-apps/forms-entities';

/**
 * This spec used to open with a hand-copied list of the 15 type names, "duplicated here to guard
 * against catalog drift". That copy WAS the drift risk: it had to be edited in lockstep with two
 * other lists, and the guard it provided was that all three were edited together — which is not a
 * guard, it is a hope. Everything below now derives from `FORM_QUESTION_TYPES`, so the catalog is
 * checked against the contract rather than against a third transcription of it.
 */
describe('palette group colours', () => {
  it('gives every group a colour, so a new group cannot render uncoloured', () => {
    // A total Record over QuestionPaletteGroup: adding a group without deciding its hue is a
    // compile error, and this asserts the runtime accessor agrees.
    for (const group of QUESTION_PALETTE_GROUPS) {
      expect(questionGroupColorClass(group)).toMatch(/^mjf-viz-[1-8]$/);
    }
  });

  it('gives every group a DIFFERENT colour', () => {
    // The whole point of colouring by group: two groups sharing a hue would make the colour
    // say nothing while looking like it says something.
    const classes = QUESTION_PALETTE_GROUPS.map(questionGroupColorClass);
    expect(new Set(classes).size).toBe(QUESTION_PALETTE_GROUPS.length);
  });

  it('colours a type by its group, not by itself', () => {
    // Inside a group the ICON tells types apart; the hue belongs to the group. Every Contact
    // type must therefore land on the same class.
    const contact = questionTypesInGroup('Contact');
    expect(contact.length).toBeGreaterThan(1);
    const classes = new Set(contact.map((m) => questionTypeColorClass(m.type)));
    expect(classes.size).toBe(1);
    expect([...classes][0]).toBe(questionGroupColorClass('Contact'));
  });

  it('names classes the shipped viz CSS actually defines', () => {
    // A class with no rule renders as the default grey and reads as a data bug rather than a
    // styling one.
    for (const group of QUESTION_PALETTE_GROUPS) {
      expect(FORMS_VIZ_CSS).toContain(`.${questionGroupColorClass(group)} {`);
    }
  });

  it('keeps display-only content grey, which is the one assignment that is a statement', () => {
    // Statement collects no answer. Grey is not a leftover here — it is the meaning.
    expect(questionTypeColorClass('Statement')).toBe('mjf-viz-8');
  });
});

describe('question type catalog', () => {
  it('covers every contract type exactly once', () => {
    expect(QUESTION_TYPE_CATALOG).toHaveLength(FORM_QUESTION_TYPES.length);
    const types = QUESTION_TYPE_CATALOG.map((m) => m.type).sort();
    expect(types).toEqual([...FORM_QUESTION_TYPES].sort());
  });

  it('answers the option question from the contract, not from its own opinion', () => {
    for (const type of ['SingleChoice', 'MultiChoice', 'Dropdown', 'PictureChoice', 'Ranking', 'Matrix'] as const) {
      expect(questionTypeHasOptions(type), type).toBe(true);
    }
    for (const type of ['ShortText', 'Rating', 'Address', 'Doodle', 'Statement'] as const) {
      expect(questionTypeHasOptions(type), type).toBe(false);
    }
  });

  it('gives every type an icon, a label and a hint', () => {
    for (const type of FORM_QUESTION_TYPES) {
      const meta = questionTypeMeta(type);
      expect(meta.icon, type).toContain('fa-');
      expect(meta.label.length, type).toBeGreaterThan(0);
      expect(meta.hint.length, type).toBeGreaterThan(0);
    }
  });

  it('partitions the catalog across the palette groups with nothing left over', () => {
    // A type in no group is invisible in the palette — present in the union, offered nowhere.
    const grouped = QUESTION_PALETTE_GROUPS.flatMap((g) => questionTypesInGroup(g));
    expect(grouped).toHaveLength(FORM_QUESTION_TYPES.length);
    expect(new Set(grouped.map((m) => m.type)).size).toBe(FORM_QUESTION_TYPES.length);
  });

  it('throws for a type outside the union rather than returning a blank entry', () => {
    expect(() => questionTypeMeta('Payment' as FormQuestionType)).toThrow(/Unknown FormQuestionType/);
  });
});

describe('searchQuestionTypes', () => {
  it('returns everything for a blank query', () => {
    expect(searchQuestionTypes('   ')).toHaveLength(FORM_QUESTION_TYPES.length);
  });

  it('matches on the label', () => {
    expect(searchQuestionTypes('ranking').map((m) => m.type)).toContain('Ranking');
  });

  it('matches on the hint, which is how the un-obvious types get found', () => {
    // Nobody searches "Checkbox" looking for a consent box, or "Website" looking for a URL
    // field — they search for what they want to collect.
    expect(searchQuestionTypes('consent').map((m) => m.type)).toContain('Checkbox');
    expect(searchQuestionTypes('web address').map((m) => m.type)).toContain('Website');
  });

  it('is case-insensitive and returns nothing for a miss', () => {
    expect(searchQuestionTypes('DOODLE').map((m) => m.type)).toContain('Doodle');
    expect(searchQuestionTypes('zzzz')).toEqual([]);
  });
});
