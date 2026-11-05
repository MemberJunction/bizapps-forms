import { describe, it, expect } from 'vitest';
import { DesignerSideEffectError, parseDesignerBlueprint, extractJSON } from './form-blueprint';

describe('parseDesignerBlueprint', () => {
  it('parses a valid blueprint object', () => {
    const bp = parseDesignerBlueprint({
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
      parseDesignerBlueprint({
        name: 'Bad',
        pages: [{ questions: [{ type: 'Payment', prompt: 'Pay here' }] }],
      }),
    ).toThrow();
  });

  it('rejects a form with no pages', () => {
    expect(() => parseDesignerBlueprint({ name: 'Empty', pages: [] })).toThrow();
  });

  it('rejects a page with no questions', () => {
    expect(() => parseDesignerBlueprint({ name: 'Empty page', pages: [{ questions: [] }] })).toThrow();
  });

  it('parses JSON wrapped in a markdown fence + prose', () => {
    const text = 'Here is your form:\n```json\n{"name":"X","pages":[{"questions":[{"type":"ShortText","prompt":"Q"}]}]}\n```\nEnjoy!';
    const bp = parseDesignerBlueprint(text);
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

describe('parseDesignerBlueprint — the model authors questions, never side effects (#303)', () => {
  const content = { name: 'RSVP', pages: [{ questions: [{ type: 'Email', prompt: 'Email' }] }] };

  it('refuses a reply carrying automations or onSubmitMode with a typed error naming them', () => {
    const reply = JSON.stringify({ ...content, onSubmitMode: 'Configured', automations: [{ actionName: 'Some Powerful Action' }] });
    let caught: unknown;
    try {
      parseDesignerBlueprint(reply);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DesignerSideEffectError);
    expect((caught as DesignerSideEffectError).keys).toEqual(['automations', 'onSubmitMode']);
    expect((caught as Error).message).toMatch(/must not author on-submit side effects .*automations, onSubmitMode/);
  });

  it('returns a value with no side-effect keys for a clean reply', () => {
    const parsed = parseDesignerBlueprint(content);
    expect('automations' in parsed).toBe(false);
    expect('onSubmitMode' in parsed).toBe(false);
  });
});
