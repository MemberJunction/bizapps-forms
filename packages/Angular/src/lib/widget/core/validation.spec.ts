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

describe('validateQuestion on composites', () => {
  const contact = q({ type: 'ContactInfo' });

  it('names the sub-fields that are wrong so each message can sit under its own input', () => {
    const result = validateQuestion(contact, { email: 'fsa', phone: '12' });

    expect(result.valid).toBe(false);
    expect(result.parts).toEqual({
      email: 'Enter a valid email address.',
      phone: 'Enter a valid phone number.',
    });
  });

  it('leaves parts empty for a group-level failure, which belongs to the whole question', () => {
    const result = validateQuestion(q({ type: 'ContactInfo', isRequired: true }), null);

    expect(result.message).toBe('This question is required.');
    expect(result.parts).toBeUndefined();
  });
});

describe('validateQuestion on consent boxes', () => {
  it('refuses to accept a required consent box that was never ticked', () => {
    // `false` is a SUPPLIED answer, so the plain required check waves it through. For a Legal
    // or Checkbox question that is the whole point of the field: an unticked box is not consent.
    const result = validateQuestion(q({ type: 'Legal', isRequired: true }), false);

    expect(result.valid).toBe(false);
  });

  it('accepts a ticked one', () => {
    expect(validateQuestion(q({ type: 'Legal', isRequired: true }), true).valid).toBe(true);
  });

  it('leaves an OPTIONAL consent box alone when unticked', () => {
    expect(validateQuestion(q({ type: 'Checkbox', isRequired: false }), false).valid).toBe(true);
  });
});
