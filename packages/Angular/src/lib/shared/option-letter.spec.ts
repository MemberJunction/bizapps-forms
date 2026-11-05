import { describe, it, expect } from 'vitest';
import { optionLetter } from './option-letter';

// Split out of the builder's option-labels.spec.ts when option-labels moved to the contracts
// (#303): `optionLetter` is a forms-ng display helper and stays here.
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
