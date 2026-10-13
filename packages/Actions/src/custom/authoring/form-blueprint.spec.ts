import { describe, it, expect } from 'vitest';
import { parseFormBlueprint, extractJSON } from './form-blueprint';

describe('parseFormBlueprint', () => {
  it('parses a valid blueprint object', () => {
    const bp = parseFormBlueprint({
      name: 'RSVP',
      pages: [{ questions: [{ type: 'Email', prompt: 'Email' }] }],
    });
    expect(bp.name).toBe('RSVP');
    expect(bp.pages[0].questions[0].type).toBe('Email');
  });

  it('rejects a question type outside the contract taxonomy', () => {
    // Was `Signature`, which the taxonomy grew to include and has since retired — a rejection
    // test whose
    // example became valid stops testing rejection and starts asserting nothing. `Payment` is a
    // type we have deliberately NOT implemented, so it is a stable stand-in for "not a type".
    expect(() =>
      parseFormBlueprint({
        name: 'Bad',
        pages: [{ questions: [{ type: 'Payment', prompt: 'Pay here' }] }],
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
