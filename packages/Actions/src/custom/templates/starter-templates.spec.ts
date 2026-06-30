import { describe, it, expect } from 'vitest';
import { STARTER_TEMPLATES, getStarterTemplate } from './starter-templates';
import { formBlueprintSchema, CHOICE_QUESTION_TYPES } from '../authoring/form-blueprint';

describe('starter templates', () => {
  it('exposes the expected gallery keys', () => {
    expect(STARTER_TEMPLATES.map((t) => t.key)).toEqual([
      'contact',
      'rsvp',
      'nps',
      'lead-capture',
      'application',
    ]);
  });

  it('every template is a schema-valid blueprint', () => {
    for (const t of STARTER_TEMPLATES) {
      expect(() => formBlueprintSchema.parse(t.blueprint), `template ${t.key}`).not.toThrow();
    }
  });

  it('choice questions always have at least two options; non-choice never do', () => {
    for (const t of STARTER_TEMPLATES) {
      for (const page of t.blueprint.pages) {
        for (const q of page.questions) {
          if (CHOICE_QUESTION_TYPES.has(q.type)) {
            expect(q.options?.length ?? 0, `${t.key}/${q.prompt}`).toBeGreaterThanOrEqual(2);
          } else {
            expect(q.options ?? [], `${t.key}/${q.prompt}`).toHaveLength(0);
          }
        }
      }
    }
  });

  it('getStarterTemplate is case-insensitive and returns undefined for unknown keys', () => {
    expect(getStarterTemplate('RSVP')?.key).toBe('rsvp');
    expect(getStarterTemplate('nope')).toBeUndefined();
  });
});
