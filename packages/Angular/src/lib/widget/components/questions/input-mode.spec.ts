import { describe, expect, it } from 'vitest';
import { autocompleteFor } from './input-mode';

describe('autocompleteFor', () => {
  it('keeps the type-driven tokens', () => {
    expect(autocompleteFor('Email', 'Work email')).toBe('email');
    expect(autocompleteFor('Phone', 'Mobile')).toBe('tel');
    expect(autocompleteFor('Website', 'Site')).toBe('url');
  });

  it.each([
    ['First name', 'given-name'],
    ['First Name *', 'given-name'],
    ['Given name', 'given-name'],
    ['Last name', 'family-name'],
    ['Last Name:', 'family-name'],
    ['Family name', 'family-name'],
    ['Surname', 'family-name'],
    ['Middle name', 'additional-name'],
    ['Full name', 'name'],
    ['Name', 'name'],
    ['Your name', 'name'],
    ['Company', 'organization'],
    ['Organization', 'organization'],
    ['Organisation', 'organization'],
  ])('ShortText "%s" → %s', (prompt, token) => {
    expect(autocompleteFor('ShortText', prompt)).toBe(token);
  });

  it.each(['Name of your pet', 'Company size', 'Favourite colour', 'First job title', ''])(
    'leaves ShortText "%s" to the browser',
    (prompt) => {
      expect(autocompleteFor('ShortText', prompt)).toBe('on');
    },
  );

  it('never infers a person token for non-ShortText types', () => {
    expect(autocompleteFor('LongText', 'Full name')).toBe('on');
  });
});
