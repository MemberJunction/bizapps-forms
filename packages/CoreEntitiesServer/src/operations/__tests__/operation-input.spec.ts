import { describe, expect, it } from 'vitest';
import {
  nullableInstantInput,
  nullablePositiveIntegerInput,
  optionalBooleanInput,
  optionalChoiceInput,
  optionalNullableTextInput,
  optionalTextInput,
  requireBooleanInput,
  requireTextInput,
} from '../operation-input.js';

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

describe('optionalBooleanInput', () => {
  it('returns a JSON boolean, and undefined when absent or null', () => {
    expect(optionalBooleanInput(true, 'CaptchaRequired', 'Forms.IssueDistributionLink')).toBe(true);
    expect(optionalBooleanInput(false, 'CaptchaRequired', 'Forms.IssueDistributionLink')).toBe(false);
    expect(optionalBooleanInput(undefined, 'CaptchaRequired', 'Forms.IssueDistributionLink')).toBeUndefined();
    expect(optionalBooleanInput(null, 'CaptchaRequired', 'Forms.IssueDistributionLink')).toBeUndefined();
  });

  it.each(['true', 1, 0, ''])('refuses %j rather than guessing', (value) => {
    expect(() => optionalBooleanInput(value, 'CaptchaRequired', 'Forms.IssueDistributionLink')).toThrow(
      'Forms.IssueDistributionLink: CaptchaRequired must be true or false when given.',
    );
  });
});

describe('optionalChoiceInput', () => {
  const CHANNELS = ['Email', 'Embed', 'PublicLink', 'QR'] as const;

  it('returns one of the choices, and undefined when absent or null', () => {
    expect(optionalChoiceInput('QR', CHANNELS, 'ChannelType', 'Forms.IssueDistributionLink')).toBe('QR');
    expect(optionalChoiceInput(undefined, CHANNELS, 'ChannelType', 'Forms.IssueDistributionLink')).toBeUndefined();
    expect(optionalChoiceInput(null, CHANNELS, 'ChannelType', 'Forms.IssueDistributionLink')).toBeUndefined();
  });

  it.each(['qr', 'Fax', '', 3])('refuses %j, listing the choices', (value) => {
    expect(() => optionalChoiceInput(value, CHANNELS, 'ChannelType', 'Forms.IssueDistributionLink')).toThrow(
      'Forms.IssueDistributionLink: ChannelType must be one of Email, Embed, PublicLink, QR when given.',
    );
  });
});

describe('nullablePositiveIntegerInput', () => {
  it('returns a positive integer, and null when absent or null (no bound)', () => {
    expect(nullablePositiveIntegerInput(25, 'MaxResponses', 'Forms.IssueDistributionLink')).toBe(25);
    expect(nullablePositiveIntegerInput(undefined, 'MaxResponses', 'Forms.IssueDistributionLink')).toBeNull();
    expect(nullablePositiveIntegerInput(null, 'MaxResponses', 'Forms.IssueDistributionLink')).toBeNull();
  });

  it.each([0, -1, 1.5, '10', Number.NaN, Number.POSITIVE_INFINITY])('refuses %j', (value) => {
    expect(() => nullablePositiveIntegerInput(value, 'MaxResponses', 'Forms.IssueDistributionLink')).toThrow(
      'Forms.IssueDistributionLink: MaxResponses must be a whole number of at least 1, or null.',
    );
  });
});

describe('nullableInstantInput', () => {
  it('parses an ISO-8601 instant, and returns null when absent or null', () => {
    expect(nullableInstantInput('2026-11-01T09:00:00Z', 'OpenAt', 'Forms.IssueDistributionLink')?.toISOString()).toBe(
      '2026-11-01T09:00:00.000Z',
    );
    expect(nullableInstantInput(undefined, 'OpenAt', 'Forms.IssueDistributionLink')).toBeNull();
    expect(nullableInstantInput(null, 'OpenAt', 'Forms.IssueDistributionLink')).toBeNull();
  });

  it.each(['tomorrow', '', 1730000000000, '2026-13-45'])('refuses %j', (value) => {
    expect(() => nullableInstantInput(value, 'OpenAt', 'Forms.IssueDistributionLink')).toThrow(
      'Forms.IssueDistributionLink: OpenAt must be an ISO-8601 date and time, or null.',
    );
  });
});
