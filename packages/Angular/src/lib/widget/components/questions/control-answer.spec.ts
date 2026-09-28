import { describe, expect, it } from 'vitest';
import { compositeAnswer, sameAnswer, scalarAnswer } from './control-answer';

describe('scalarAnswer', () => {
  it('parses a numeric raw value to a number', () => {
    expect(scalarAnswer('5', 'number')).toBe(5);
    expect(scalarAnswer('5.0', 'number')).toBe(5);
  });

  it('keeps a non-numeric raw value as the string it was typed', () => {
    expect(scalarAnswer('abc', 'number')).toBe('abc');
  });

  it('treats a blank Number field as unanswered, including whitespace-only', () => {
    expect(scalarAnswer('', 'number')).toBeNull();
    expect(scalarAnswer('   ', 'number')).toBeNull();
  });

  it('treats only the exact empty string as an unanswered text field', () => {
    expect(scalarAnswer('', 'text')).toBeNull();
    // Unlike Number, a text field does not trim — "   " is a strange but real answer, not nothing.
    expect(scalarAnswer('   ', 'text')).toBe('   ');
  });

  it('passes a non-blank text value through unchanged', () => {
    expect(scalarAnswer('Jane', 'text')).toBe('Jane');
  });
});

describe('compositeAnswer', () => {
  it('drops blank (including whitespace-only) parts', () => {
    expect(compositeAnswer({ firstName: 'Jane', lastName: '   ' })).toEqual({ firstName: 'Jane' });
  });

  it('reports a composite with nothing filled in as null, not an empty object', () => {
    expect(compositeAnswer({ firstName: '', lastName: '' })).toBeNull();
    expect(compositeAnswer({})).toBeNull();
  });

  it('keeps every non-blank part', () => {
    expect(compositeAnswer({ firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' })).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
    });
  });
});

describe('sameAnswer', () => {
  it('compares scalars by value', () => {
    expect(sameAnswer('x', 'x')).toBe(true);
    expect(sameAnswer('x', 'y')).toBe(false);
    expect(sameAnswer(null, null)).toBe(true);
    expect(sameAnswer(0, null)).toBe(false);
  });

  it('does not treat a numeric string and its number as the same answer', () => {
    // scalarAnswer only ever produces one or the other for a given control, so this is a type
    // guard against accidental coercion, not a case the widget itself can reach.
    expect(sameAnswer(5, '5')).toBe(false);
  });

  it('compares a composite independent of key order', () => {
    expect(sameAnswer({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true);
  });

  it('treats a different value at the same key as different', () => {
    expect(sameAnswer({ a: '1' }, { a: '2' })).toBe(false);
  });

  it('treats a different key set as different, even with overlapping values', () => {
    expect(sameAnswer({ a: '1' }, { a: '1', b: '2' })).toBe(false);
  });
});
