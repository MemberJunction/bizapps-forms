import { describe, it, expect } from 'vitest';
import type { PublishedFormQuestion } from '@mj-biz-apps/forms-entities';
import { validateQuestion, hasValue } from './validation';

function q(overrides: Partial<PublishedFormQuestion>): PublishedFormQuestion {
  return {
    id: 'q',
    type: 'ShortText',
    prompt: 'P',
    isRequired: false,
    displayOrder: 1,
    options: [],
    ...overrides,
  };
}

describe('hasValue', () => {
  it('treats null/undefined/empty string/empty array as missing', () => {
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
    expect(hasValue('   ')).toBe(false);
    expect(hasValue([])).toBe(false);
  });
  it('treats supplied scalars/arrays as present', () => {
    expect(hasValue('x')).toBe(true);
    expect(hasValue(0)).toBe(true);
    expect(hasValue(false)).toBe(true);
    expect(hasValue(['a'])).toBe(true);
  });
});

describe('validateQuestion', () => {
  it('flags an empty required question', () => {
    expect(validateQuestion(q({ isRequired: true }), '').valid).toBe(false);
  });
  it('passes an empty optional question', () => {
    expect(validateQuestion(q({ isRequired: false }), '').valid).toBe(true);
  });
  it('never validates a Statement', () => {
    expect(validateQuestion(q({ type: 'Statement', isRequired: true }), '').valid).toBe(true);
  });
  it('validates email format', () => {
    expect(validateQuestion(q({ type: 'Email' }), 'nope').valid).toBe(false);
    expect(validateQuestion(q({ type: 'Email' }), 'a@b.co').valid).toBe(true);
  });
  it('enforces numeric range', () => {
    const num = q({ type: 'Number', validationRule: { min: 0, max: 10 } });
    expect(validateQuestion(num, 11).valid).toBe(false);
    expect(validateQuestion(num, 5).valid).toBe(true);
  });
  it('enforces maxLength', () => {
    const t = q({ validationRule: { maxLength: 3 } });
    expect(validateQuestion(t, 'abcd').valid).toBe(false);
    expect(validateQuestion(t, 'abc').valid).toBe(true);
  });
  it('enforces a pattern with a custom message', () => {
    const t = q({ validationRule: { pattern: '\\d+', patternMessage: 'Digits only.' } });
    const res = validateQuestion(t, 'abc');
    expect(res.valid).toBe(false);
    expect(res.message).toBe('Digits only.');
  });
  it('does not block on an invalid pattern source', () => {
    const t = q({ validationRule: { pattern: '[' } });
    expect(validateQuestion(t, 'anything').valid).toBe(true);
  });
});
