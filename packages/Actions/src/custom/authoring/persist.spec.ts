import { describe, it, expect } from 'vitest';
import { clampText, isDuplicateKeyFailure } from './persist';
import { conditionalRuleJSON, resolveConditionalRule, BlueprintRuleError } from './blueprint-rules';

/**
 * The two pure pieces the Builder leans on, tested directly rather than only through it.
 *
 * `isDuplicateKeyFailure` is the one place this design matches on a PROVIDER MESSAGE, so its
 * wording coverage is the thing most likely to rot — a phrase that stops matching turns the
 * self-healing style save silently back into a failing one.
 */
describe('isDuplicateKeyFailure', () => {
  it('recognises the wordings SQL Server actually produces', () => {
    for (const detail of [
      "Violation of UNIQUE KEY constraint 'UQ_FormStyle_Name'. Cannot insert duplicate key in object.",
      'Cannot insert duplicate key row in object with unique index IX_Thing.',
      'The duplicate key value is (Event RSVP theme).',
      'UQ_FormStyle_Name',
    ]) {
      expect(isDuplicateKeyFailure(detail), detail).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(isDuplicateKeyFailure('VIOLATION OF UNIQUE KEY CONSTRAINT')).toBe(true);
  });

  it('does not fire on unrelated failures', () => {
    // A false positive is the harmful direction: it would retry a row that will fail identically
    // and then report the wrong cause. A false negative just throws with the real detail.
    for (const detail of [
      'The INSERT statement conflicted with the FOREIGN KEY constraint.',
      'String or binary data would be truncated.',
      'Cannot insert the value NULL into column Name.',
      'no detail reported by the provider',
    ]) {
      expect(isDuplicateKeyFailure(detail), detail).toBe(false);
    }
  });
});

describe('clampText', () => {
  it('returns short values untouched, including at exactly the limit', () => {
    expect(clampText('abc', 5, 'x')).toBe('abc');
    expect(clampText('abcde', 5, 'x')).toBe('abcde');
  });

  it('truncates to the limit and marks the cut', () => {
    const clamped = clampText('abcdefgh', 5, 'x');
    expect(clamped).toHaveLength(5);
    expect(clamped).toBe('abcd…');
  });
});

describe('resolveConditionalRule', () => {
  const idByKey = new Map([
    ['attending', 'q-1'],
    ['diet', 'q-2'],
  ]);

  it('resolves both combinators, not just `all`', () => {
    const resolved = resolveConditionalRule(
      {
        show: {
          all: [{ questionKey: 'attending', op: 'equals', value: 'yes' }],
          any: [{ questionKey: 'diet', op: 'isAnswered' }],
        },
      },
      idByKey,
      'test',
    );
    expect(resolved?.show?.all?.[0]).toEqual({ questionId: 'q-1', op: 'equals', value: 'yes' });
    expect(resolved?.show?.any?.[0]).toEqual({ questionId: 'q-2', op: 'isAnswered' });
  });

  it('omits `value` for operators that carry none', () => {
    const resolved = resolveConditionalRule(
      { show: { all: [{ questionKey: 'diet', op: 'isAnswered' }] } },
      idByKey,
      'test',
    );
    expect('value' in (resolved?.show?.all?.[0] ?? {})).toBe(false);
  });

  it('treats an absent, empty, or condition-less rule as no rule at all', () => {
    expect(resolveConditionalRule(undefined, idByKey, 'test')).toBeUndefined();
    expect(resolveConditionalRule({}, idByKey, 'test')).toBeUndefined();
    expect(resolveConditionalRule({ show: {} }, idByKey, 'test')).toBeUndefined();
    expect(resolveConditionalRule({ show: { all: [] } }, idByKey, 'test')).toBeUndefined();
  });

  it('names the offending key AND the context when a key does not resolve', () => {
    expect(() =>
      resolveConditionalRule({ show: { all: [{ questionKey: 'ghost', op: 'isAnswered' }] } }, idByKey, 'Ending 2'),
    ).toThrow(BlueprintRuleError);
    expect(() =>
      resolveConditionalRule({ show: { all: [{ questionKey: 'ghost', op: 'isAnswered' }] } }, idByKey, 'Ending 2'),
    ).toThrow(/Ending 2 references question key "ghost"/);
  });
});

describe('conditionalRuleJSON', () => {
  it('gives NULL for no rule, so the column keeps meaning "always visible"', () => {
    expect(conditionalRuleJSON(undefined, new Map(), 'test')).toBeNull();
    expect(conditionalRuleJSON({ show: {} }, new Map(), 'test')).toBeNull();
  });

  it('serializes a resolved rule', () => {
    const json = conditionalRuleJSON(
      { show: { all: [{ questionKey: 'a', op: 'isAnswered' }] } },
      new Map([['a', 'q-9']]),
      'test',
    );
    expect(JSON.parse(String(json))).toEqual({ show: { all: [{ questionId: 'q-9', op: 'isAnswered' }] } });
  });
});
