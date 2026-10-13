import { describe, expect, it } from 'vitest';
import { optionalNullableTextInput, optionalTextInput, requireBooleanInput, requireTextInput } from '../operation-input.js';

describe('requireTextInput', () => {
  it('returns the trimmed text', () => {
    expect(requireTextInput('  form-1 ', 'FormID', 'Forms.PublishForm')).toBe('form-1');
  });

  it.each([undefined, null, '', '   ', 42, {}])('refuses %j, naming the field and the operation', (value) => {
    expect(() => requireTextInput(value, 'FormID', 'Forms.PublishForm')).toThrow('Forms.PublishForm: FormID is required.');
  });
});

describe('requireBooleanInput', () => {
  it.each([true, false])('returns %j', (value) => {
    expect(requireBooleanInput(value, 'AsTemplate', 'Forms.CloneForm')).toBe(value);
  });

  // A caller that wrote "true" or 1 believed it asked for something; guessing which is how a
  // working copy becomes a template, so anything but a JSON boolean is refused.
  it.each([undefined, null, 'true', 1, 0, ''])('refuses %j, naming the field and the operation', (value) => {
    expect(() => requireBooleanInput(value, 'AsTemplate', 'Forms.CloneForm')).toThrow('Forms.CloneForm: AsTemplate must be true or false.');
  });
});

describe('optionalTextInput', () => {
  it('returns the trimmed text, and undefined for absent, null or blank', () => {
    expect(optionalTextInput('  Copy ', 'Name', 'Forms.CloneForm')).toBe('Copy');
    expect([undefined, null, '', '   '].map((v) => optionalTextInput(v, 'Name', 'Forms.CloneForm'))).toEqual([undefined, undefined, undefined, undefined]);
  });

  it.each([42, true, {}])('refuses %j', (value) => {
    expect(() => optionalTextInput(value, 'Name', 'Forms.CloneForm')).toThrow('Forms.CloneForm: Name must be text when given.');
  });
});

describe('optionalNullableTextInput', () => {
  it('keeps absent (undefined), null and text apart — they mean keep, clear and replace', () => {
    expect(optionalNullableTextInput(undefined, 'Description', 'Forms.CloneForm')).toBeUndefined();
    expect(optionalNullableTextInput(null, 'Description', 'Forms.CloneForm')).toBeNull();
    expect(optionalNullableTextInput(' words ', 'Description', 'Forms.CloneForm')).toBe(' words ');
  });

  it.each([42, false, {}])('refuses %j', (value) => {
    expect(() => optionalNullableTextInput(value, 'Description', 'Forms.CloneForm')).toThrow(
      'Forms.CloneForm: Description must be text or null when given.',
    );
  });
});
