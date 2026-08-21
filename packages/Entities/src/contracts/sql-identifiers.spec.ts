import { describe, it, expect } from 'vitest';
import { assertGuid, guidOrUndefined, isGuid } from './sql-identifiers';

/**
 * These guards stand between a caller-supplied id and a `RunView.ExtraFilter` string. The property
 * that matters is narrow and absolute: anything this accepts CANNOT contain a quote, and therefore
 * cannot terminate the SQL literal it is interpolated into.
 */
const INJECTIONS = [
  "x' OR '1'='1",
  "' OR 1=1--",
  "11111111-2222-4333-8444-555555555555' OR '1'='1",
  "'; DROP TABLE x;--",
  '11111111-2222-4333-8444-555555555555 OR 1=1',
];

describe('isGuid', () => {
  it('accepts a real GUID in either case', () => {
    expect(isGuid('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isGuid('AABBCCDD-EEFF-4A1B-8C2D-3E4F5A6B7C8D')).toBe(true);
  });

  it('rejects every injection attempt', () => {
    for (const attempt of INJECTIONS) {
      expect(isGuid(attempt), attempt).toBe(false);
    }
  });

  it('rejects a GUID with anything appended — the anchors are the whole point', () => {
    // Unanchored, `11111111-...-555555555555' OR '1'='1` would MATCH and be interpolated whole.
    expect(isGuid("11111111-2222-4333-8444-555555555555 ")).toBe(false);
    expect(isGuid(" 11111111-2222-4333-8444-555555555555")).toBe(false);
    expect(isGuid('11111111-2222-4333-8444-555555555555x')).toBe(false);
  });

  it('rejects the nearly-right', () => {
    expect(isGuid('')).toBe(false);
    expect(isGuid(null)).toBe(false);
    expect(isGuid(undefined)).toBe(false);
    expect(isGuid('not-a-guid')).toBe(false);
    expect(isGuid('11111111222243338444555555555555')).toBe(false); // no dashes
    expect(isGuid('11111111-2222-4333-8444-55555555555')).toBe(false); // one short
  });

  it('accepts nothing containing a quote, whatever it looks like', () => {
    // The property the interpolation depends on, asserted directly rather than inferred.
    for (const attempt of [...INJECTIONS, "''", "a'b"]) {
      if (attempt.includes("'")) {
        expect(isGuid(attempt), attempt).toBe(false);
      }
    }
  });
});

describe('guidOrUndefined', () => {
  it('passes a GUID through and drops anything else', () => {
    const real = '11111111-2222-4333-8444-555555555555';
    expect(guidOrUndefined(real)).toBe(real);
    for (const attempt of INJECTIONS) {
      expect(guidOrUndefined(attempt), attempt).toBeUndefined();
    }
    expect(guidOrUndefined(null)).toBeUndefined();
  });
});

describe('assertGuid', () => {
  it('names what was wrong, so the failure is findable', () => {
    expect(() => assertGuid("x' OR '1'='1", 'page id')).toThrow(/page id/);
    // The offending value is quoted into the message — a guard that says only "invalid input"
    // sends whoever hits it back to the code to work out which id it meant.
    expect(() => assertGuid("x' OR '1'='1", 'page id')).toThrow(/OR/);
  });

  it('passes a real GUID silently', () => {
    expect(() => assertGuid('11111111-2222-4333-8444-555555555555', 'page id')).not.toThrow();
  });
});
