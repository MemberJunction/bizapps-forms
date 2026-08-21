/**
 * Which stub each detailed question refines.
 *
 * The outline creates stub rows; the detail pass returns the same questions with their full
 * wording, and each one has to land on the stub it belongs to — because `conditionalRule`s
 * reference questions by KEY, and a key that ends up on the wrong row points every rule naming it
 * at the wrong question. The builder's own docstring says keys exist to prevent exactly that.
 *
 * The bug these cover: claiming was one pass, so an unkeyed question earlier in the detail list
 * consumed the stub a later KEYED question needed, and the keyed one then fell through to
 * whatever was left. Reordering by the model was enough to trigger it.
 */
import { describe, expect, it } from 'vitest';
import { stubClaimer } from './form-blueprint-builder';

const stubs = (...ids: string[]) => ids.map((ID) => ({ ID }));

describe('stubClaimer', () => {
  it('gives a keyed question its own stub even when an unkeyed one comes first', () => {
    // Stubs A (key "a") and B; the model returns B first, then A. One pass let B take A's row.
    const claim = stubClaimer(stubs('A', 'B'), new Map([['a', 'A']]), [undefined, 'a']);

    expect(claim(undefined)?.ID).toBe('B');
    expect(claim('a')?.ID).toBe('A');
  });

  it('still matches by key when the order is unchanged', () => {
    const claim = stubClaimer(stubs('A', 'B'), new Map([['a', 'A']]), ['a', undefined]);

    expect(claim('a')?.ID).toBe('A');
    expect(claim(undefined)?.ID).toBe('B');
  });

  it('hands a stub out only once, even if two questions name the same key', () => {
    const claim = stubClaimer(stubs('A', 'B'), new Map([['a', 'A']]), ['a', 'a']);

    expect(claim('a')?.ID).toBe('A');
    expect(claim('a')?.ID).toBe('B');
  });

  it('falls through for a key belonging to another page', () => {
    // The model echoing a key from elsewhere resolves to nothing here and takes the next free row.
    const claim = stubClaimer(stubs('A', 'B'), new Map([['elsewhere', 'Z']]), ['elsewhere', undefined]);

    expect(claim('elsewhere')?.ID).toBe('A');
    expect(claim(undefined)?.ID).toBe('B');
  });

  it('returns undefined once every stub is claimed', () => {
    const claim = stubClaimer(stubs('A'), new Map(), [undefined, undefined]);

    expect(claim(undefined)?.ID).toBe('A');
    expect(claim(undefined)).toBeUndefined();
  });

  it('reserves several keyed stubs against several unkeyed questions', () => {
    const claim = stubClaimer(stubs('A', 'B', 'C'), new Map([['a', 'A'], ['c', 'C']]), [undefined, 'c', 'a']);

    expect(claim(undefined)?.ID).toBe('B');
    expect(claim('c')?.ID).toBe('C');
    expect(claim('a')?.ID).toBe('A');
  });
});
