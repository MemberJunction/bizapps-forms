import { describe, it, expect } from 'vitest';
import { nextOptionLabel, optionLetter, withUniqueValues } from './option-labels';

describe('nextOptionLabel', () => {
  it('numbers the first option 1', () => {
    expect(nextOptionLabel([], 'Option')).toBe('Option 1');
  });

  it('continues the sequence when nothing has been deleted', () => {
    expect(nextOptionLabel(['Option 1', 'Option 2'], 'Option')).toBe('Option 3');
  });

  it('REUSES the gap left by a deleted option instead of minting a duplicate', () => {
    // The reported bug. Naming from the count, a list of just ["Option 2"] produced a second
    // "Option 2" — two options with one name, and one answer between them.
    expect(nextOptionLabel(['Option 2'], 'Option')).toBe('Option 1');
  });

  it('skips a name an author typed by hand, whatever its casing or padding', () => {
    expect(nextOptionLabel(['  option 1 '], 'Option')).toBe('Option 2');
  });

  it('works for a matrix axis, which numbers within its own axis', () => {
    expect(nextOptionLabel(['Row 1', 'Row 3'], 'Row')).toBe('Row 2');
  });

  it('never returns a name already present, however scrambled the list', () => {
    const labels = ['Option 3', 'Option 1', 'Custom', 'Option 4'];
    expect(labels).not.toContain(nextOptionLabel(labels, 'Option'));
  });
});

describe('withUniqueValues', () => {
  const opt = (label: string, value = label) => ({ label, value });

  it('leaves distinct values alone', () => {
    const options = [opt('Yes'), opt('No')];
    expect(withUniqueValues(options)).toEqual(options);
  });

  it('disambiguates a duplicate so the two are different answers', () => {
    // Without this the widget highlights both, because in the published definition they ARE the
    // same answer — the value is what gets stored.
    expect(withUniqueValues([opt('Other'), opt('Other')])).toEqual([
      { label: 'Other', value: 'Other' },
      { label: 'Other', value: 'Other (2)' },
    ]);
  });

  it('keeps the FIRST occurrence untouched, so the common answer stays readable', () => {
    expect(withUniqueValues([opt('Other'), opt('Other')])[0].value).toBe('Other');
  });

  it('handles three of a kind', () => {
    expect(withUniqueValues([opt('A'), opt('A'), opt('A')]).map((o) => o.value)).toEqual([
      'A',
      'A (2)',
      'A (3)',
    ]);
  });

  it('does not collide with a suffix an author already used', () => {
    // "Other (2)" existing as a real label must not be stolen by the disambiguator.
    expect(withUniqueValues([opt('Other'), opt('Other (2)'), opt('Other')]).map((o) => o.value)).toEqual([
      'Other',
      'Other (2)',
      'Other (3)',
    ]);
  });

  it('preserves every other field on the option', () => {
    const options = [
      { label: 'Pick', value: 'Pick', displayOrder: 0, imageURL: 'a.png' },
      { label: 'Pick', value: 'Pick', displayOrder: 1, imageURL: 'b.png' },
    ];
    expect(withUniqueValues(options)[1]).toEqual({
      label: 'Pick',
      value: 'Pick (2)',
      displayOrder: 1,
      imageURL: 'b.png',
    });
  });
});

describe('optionLetter', () => {
  it('labels the first options A, B, C', () => {
    expect([0, 1, 2].map(optionLetter)).toEqual(['A', 'B', 'C']);
  });

  it('carries past Z instead of repeating or stopping', () => {
    // A repeat would undo the only thing the badge is for.
    expect(optionLetter(25)).toBe('Z');
    expect(optionLetter(26)).toBe('AA');
    expect(optionLetter(27)).toBe('AB');
    expect(optionLetter(51)).toBe('AZ');
    expect(optionLetter(52)).toBe('BA');
  });

  it('never repeats across a long list', () => {
    const seen = Array.from({ length: 200 }, (_, i) => optionLetter(i));
    expect(new Set(seen).size).toBe(200);
  });

  it('returns nothing for a nonsense index rather than a stray character', () => {
    expect(optionLetter(-1)).toBe('');
  });
});
