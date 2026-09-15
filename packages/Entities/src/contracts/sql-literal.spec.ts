import { describe, it, expect } from 'vitest';

import { escapeSqlString, quoteSqlString, sqlLiteral } from './sql-literal';

describe('escapeSqlString', () => {
  it('doubles every quote, not just the first', () => {
    expect(escapeSqlString("O'Brien")).toBe("O''Brien");
    expect(escapeSqlString("'''")).toBe("''''''");
  });

  it('returns the body without quotes, so a call site can build its own literal', () => {
    // The distinction from quoteSqlString, pinned: several call sites write the quotes into a
    // longer template (`FileID='${...}'`) and would produce `''value''` if these two were confused.
    expect(`FileID='${escapeSqlString('abc')}'`).toBe("FileID='abc'");
  });

  it('leaves a value with nothing to escape exactly as it was', () => {
    expect(escapeSqlString('')).toBe('');
    expect(escapeSqlString('plain')).toBe('plain');
    // Backslash and the LIKE wildcards are NOT this function's concern — a value bound with `=`
    // treats them literally. `sqlLikeLiteral` in response-lookup.service.ts layers that on top for
    // the two filters that use LIKE, and it must stay the only place that does.
    expect(escapeSqlString('100%_a\\b')).toBe('100%_a\\b');
  });
});

describe('quoteSqlString', () => {
  it('wraps and escapes in one step', () => {
    expect(quoteSqlString("O'Brien")).toBe("'O''Brien'");
    expect(quoteSqlString('')).toBe("''");
  });

  it('closes the literal even when the value is nothing but quotes', () => {
    // The case that turns a bad escaper into a syntax error rather than a wrong answer: an odd
    // number of quotes must still come back balanced.
    expect(quoteSqlString("'")).toBe("''''");
  });
});

describe('sqlLiteral', () => {
  it('doubles embedded quotes and marks the literal as unicode on SQL Server', () => {
    expect(sqlLiteral("O'Brien")).toBe("N'O''Brien'");
  });

  it('omits the unicode prefix for PostgreSQL, which rejects it', () => {
    expect(sqlLiteral("O'Brien", 'postgresql')).toBe("'O''Brien'");
  });

  it('defaults to SQL Server when no dialect is named', () => {
    // Every call site in the repo takes this default; if it ever flipped, the N prefix would
    // silently disappear from the binding path and non-Latin respondents would start duplicating.
    expect(sqlLiteral('x')).toBe(sqlLiteral('x', 'sqlserver'));
    expect(sqlLiteral('x')).toBe("N'x'");
  });

  it('keeps a non-Latin value intact — the reason the prefix exists', () => {
    expect(sqlLiteral('Łukasz')).toBe("N'Łukasz'");
    expect(sqlLiteral('田中')).toBe("N'田中'");
  });

  it('differs from quoteSqlString by exactly the prefix', () => {
    // Stated as a relationship rather than two literals, so the pair cannot drift apart silently.
    for (const value of ['', 'plain', "O'Brien", 'Łukasz']) {
      expect(sqlLiteral(value)).toBe(`N${quoteSqlString(value)}`);
      expect(sqlLiteral(value, 'postgresql')).toBe(quoteSqlString(value));
    }
  });
});
