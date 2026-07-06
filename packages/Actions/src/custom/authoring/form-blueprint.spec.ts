import { describe, it, expect } from 'vitest';
import {
  parseFormBlueprint,
  extractJSON,
  formQuestionTypeSchema,
  CHOICE_QUESTION_TYPES,
} from './form-blueprint';

describe('parseFormBlueprint', () => {
  it('parses a valid blueprint object', () => {
    const bp = parseFormBlueprint({
      name: 'RSVP',
      pages: [{ questions: [{ type: 'Email', prompt: 'Email' }] }],
    });
    expect(bp.name).toBe('RSVP');
    expect(bp.pages[0].questions[0].type).toBe('Email');
  });

  it('rejects an unknown question type (enforces the §5.3 taxonomy)', () => {
    expect(() =>
      parseFormBlueprint({
        name: 'Bad',
        pages: [{ questions: [{ type: 'Signature', prompt: 'Sign here' }] }],
      }),
    ).toThrow();
  });

  it('rejects a form with no pages', () => {
    expect(() => parseFormBlueprint({ name: 'Empty', pages: [] })).toThrow();
  });

  it('rejects a page with no questions', () => {
    expect(() => parseFormBlueprint({ name: 'Empty page', pages: [{ questions: [] }] })).toThrow();
  });

  it('parses JSON wrapped in a markdown fence + prose', () => {
    const text = 'Here is your form:\n```json\n{"name":"X","pages":[{"questions":[{"type":"ShortText","prompt":"Q"}]}]}\n```\nEnjoy!';
    const bp = parseFormBlueprint(text);
    expect(bp.name).toBe('X');
  });
});

describe('extractJSON', () => {
  it('strips a json fence', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('extracts the first balanced object from prose', () => {
    expect(extractJSON('prefix {"a":1} suffix')).toBe('{"a":1}');
  });
  it('returns the trimmed string when no braces are present', () => {
    expect(extractJSON('  no json here  ')).toBe('no json here');
  });
});

describe('taxonomy', () => {
  it('choice types are exactly Single/Multi/Dropdown', () => {
    expect([...CHOICE_QUESTION_TYPES].sort()).toEqual(['Dropdown', 'MultiChoice', 'SingleChoice']);
  });
  it('the question-type enum has the 15 Phase-1 types', () => {
    expect(formQuestionTypeSchema.options).toHaveLength(15);
  });
});
