import { describe, expect, it } from 'vitest';
import { requireTextInput } from '../operation-input.js';

describe('requireTextInput', () => {
  it('returns the trimmed text', () => {
    expect(requireTextInput('  form-1 ', 'FormID', 'Forms.PublishForm')).toBe('form-1');
  });

  it.each([undefined, null, '', '   ', 42, {}])('refuses %j, naming the field and the operation', (value) => {
    expect(() => requireTextInput(value, 'FormID', 'Forms.PublishForm')).toThrow('Forms.PublishForm: FormID is required.');
  });
});
