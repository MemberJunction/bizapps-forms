import { describe, it, expect } from 'vitest';
import {
  evaluateConditionalRule,
  type AnswerValue,
  type ConditionalRule,
} from './conditional-rule';
import { parseConditionalRule } from './schemas';

/** Helper: build an answers map from a plain record. */
function answers(record: Record<string, AnswerValue>): Map<string, AnswerValue> {
  return new Map(Object.entries(record));
}

describe('evaluateConditionalRule', () => {
  it('defaults to visible when there is no rule', () => {
    expect(evaluateConditionalRule(undefined, answers({}))).toBe(true);
  });

  it('defaults to visible when the rule has no show group', () => {
    expect(evaluateConditionalRule({}, answers({ q1: 'x' }))).toBe(true);
  });

  describe('equals / notEquals', () => {
    const rule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] } };

    it('shows when the answer equals the value', () => {
      expect(evaluateConditionalRule(rule, answers({ q1: 'Other' }))).toBe(true);
    });

    it('hides when the answer does not equal the value', () => {
      expect(evaluateConditionalRule(rule, answers({ q1: 'Yes' }))).toBe(false);
    });

    it('hides when the question is unanswered', () => {
      expect(evaluateConditionalRule(rule, answers({}))).toBe(false);
    });

    it('notEquals is the inverse of equals', () => {
      const ne: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'notEquals', value: 'Other' }] } };
      expect(evaluateConditionalRule(ne, answers({ q1: 'Yes' }))).toBe(true);
      expect(evaluateConditionalRule(ne, answers({ q1: 'Other' }))).toBe(false);
    });
  });

  describe('all vs any combinators', () => {
    const allRule: ConditionalRule = {
      show: {
        all: [
          { questionId: 'q1', op: 'equals', value: 'A' },
          { questionId: 'q2', op: 'equals', value: 'B' },
        ],
      },
    };
    const anyRule: ConditionalRule = {
      show: {
        any: [
          { questionId: 'q1', op: 'equals', value: 'A' },
          { questionId: 'q2', op: 'equals', value: 'B' },
        ],
      },
    };

    it('all requires every condition to pass', () => {
      expect(evaluateConditionalRule(allRule, answers({ q1: 'A', q2: 'B' }))).toBe(true);
      expect(evaluateConditionalRule(allRule, answers({ q1: 'A', q2: 'X' }))).toBe(false);
    });

    it('any requires at least one condition to pass', () => {
      expect(evaluateConditionalRule(anyRule, answers({ q1: 'A', q2: 'X' }))).toBe(true);
      expect(evaluateConditionalRule(anyRule, answers({ q1: 'X', q2: 'X' }))).toBe(false);
    });

    it('when both all and any are present, both must hold', () => {
      const both: ConditionalRule = {
        show: {
          all: [{ questionId: 'q1', op: 'equals', value: 'A' }],
          any: [
            { questionId: 'q2', op: 'equals', value: 'B' },
            { questionId: 'q3', op: 'equals', value: 'C' },
          ],
        },
      };
      expect(evaluateConditionalRule(both, answers({ q1: 'A', q2: 'B' }))).toBe(true);
      expect(evaluateConditionalRule(both, answers({ q1: 'A', q2: 'X', q3: 'X' }))).toBe(false);
      expect(evaluateConditionalRule(both, answers({ q1: 'X', q2: 'B' }))).toBe(false);
    });
  });

  describe('in / notIn', () => {
    const inRule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'in', value: ['A', 'B'] }] } };

    it('in matches a scalar answer that is a member', () => {
      expect(evaluateConditionalRule(inRule, answers({ q1: 'B' }))).toBe(true);
      expect(evaluateConditionalRule(inRule, answers({ q1: 'C' }))).toBe(false);
    });

    it('in matches an array answer that intersects the set', () => {
      expect(evaluateConditionalRule(inRule, answers({ q1: ['C', 'A'] }))).toBe(true);
      expect(evaluateConditionalRule(inRule, answers({ q1: ['C', 'D'] }))).toBe(false);
    });

    it('notIn passes only when answered and not a member', () => {
      const notInRule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'notIn', value: ['A', 'B'] }] } };
      expect(evaluateConditionalRule(notInRule, answers({ q1: 'C' }))).toBe(true);
      expect(evaluateConditionalRule(notInRule, answers({ q1: 'A' }))).toBe(false);
      expect(evaluateConditionalRule(notInRule, answers({}))).toBe(false);
    });

    it('in works with numeric sets', () => {
      const numRule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'in', value: [1, 2, 3] }] } };
      expect(evaluateConditionalRule(numRule, answers({ q1: 2 }))).toBe(true);
      expect(evaluateConditionalRule(numRule, answers({ q1: 9 }))).toBe(false);
    });
  });

  describe('isAnswered', () => {
    const rule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'isAnswered' }] } };

    it('is true for a non-empty value', () => {
      expect(evaluateConditionalRule(rule, answers({ q1: 'hi' }))).toBe(true);
      expect(evaluateConditionalRule(rule, answers({ q1: 0 }))).toBe(true);
      expect(evaluateConditionalRule(rule, answers({ q1: false }))).toBe(true);
      expect(evaluateConditionalRule(rule, answers({ q1: ['x'] }))).toBe(true);
    });

    it('is false for absent / empty / null', () => {
      expect(evaluateConditionalRule(rule, answers({}))).toBe(false);
      expect(evaluateConditionalRule(rule, answers({ q1: '' }))).toBe(false);
      expect(evaluateConditionalRule(rule, answers({ q1: null }))).toBe(false);
      expect(evaluateConditionalRule(rule, answers({ q1: [] }))).toBe(false);
    });

    // A whitespace-only string is not an answer. This evaluator used to be the one place that
    // said otherwise: it tested `answer.length > 0` while every validator tested
    // `value.trim().length > 0`. So a single space revealed the branch that depended on the
    // question while every validator still read it as blank — the same keystroke made the
    // question answered and unanswered at once, which is not a state a form should reach.
    it('is false for a whitespace-only answer, agreeing with the validators', () => {
      expect(evaluateConditionalRule(rule, answers({ q1: '   ' }))).toBe(false);
      expect(evaluateConditionalRule(rule, answers({ q1: '\t\n' }))).toBe(false);
    });
  });

  describe('greaterThan / lessThan', () => {
    const gt: ConditionalRule = { show: { all: [{ questionId: 'age', op: 'greaterThan', value: 18 }] } };
    const lt: ConditionalRule = { show: { all: [{ questionId: 'age', op: 'lessThan', value: 18 }] } };

    it('greaterThan compares numerically', () => {
      expect(evaluateConditionalRule(gt, answers({ age: 21 }))).toBe(true);
      expect(evaluateConditionalRule(gt, answers({ age: 18 }))).toBe(false);
      expect(evaluateConditionalRule(gt, answers({ age: 5 }))).toBe(false);
    });

    it('lessThan compares numerically', () => {
      expect(evaluateConditionalRule(lt, answers({ age: 5 }))).toBe(true);
      expect(evaluateConditionalRule(lt, answers({ age: 18 }))).toBe(false);
    });

    it('coerces numeric strings', () => {
      expect(evaluateConditionalRule(gt, answers({ age: '21' }))).toBe(true);
    });

    it('is false when the answer is non-numeric', () => {
      expect(evaluateConditionalRule(gt, answers({ age: 'old' }))).toBe(false);
    });
  });

  describe('contains', () => {
    it('substring-matches a string answer', () => {
      const rule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'contains', value: 'cat' }] } };
      expect(evaluateConditionalRule(rule, answers({ q1: 'concatenate' }))).toBe(true);
      expect(evaluateConditionalRule(rule, answers({ q1: 'dog' }))).toBe(false);
    });

    it('membership-matches an array answer', () => {
      const rule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'contains', value: 'A' }] } };
      expect(evaluateConditionalRule(rule, answers({ q1: ['A', 'B'] }))).toBe(true);
      expect(evaluateConditionalRule(rule, answers({ q1: ['B', 'C'] }))).toBe(false);
    });
  });
});

describe('parseConditionalRule', () => {
  it('parses the canonical §6 shape from a JSON string', () => {
    const json = '{ "show": { "all": [ { "questionId": "q1", "op": "equals", "value": "Other" } ] } }';
    const rule = parseConditionalRule(json);
    expect(evaluateConditionalRule(rule, answers({ q1: 'Other' }))).toBe(true);
  });

  it('parses an already-parsed object', () => {
    const rule = parseConditionalRule({ show: { any: [{ questionId: 'q1', op: 'isAnswered' }] } });
    expect(evaluateConditionalRule(rule, answers({ q1: 'x' }))).toBe(true);
  });

  it('throws on an invalid operator', () => {
    expect(() => parseConditionalRule('{ "show": { "all": [ { "questionId": "q1", "op": "bogus" } ] } }')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// RULES_AND_BRANCHING_PLAN Phase A — new operators + date-aware ordering.
// Each block follows the plan's happy / edge / worst structure (§5).
// ---------------------------------------------------------------------------

describe('date-aware greaterThan / lessThan (A2)', () => {
  const after: ConditionalRule = {
    show: { all: [{ questionId: 'start', op: 'greaterThan', value: '2026-01-01' }] },
  };
  const before: ConditionalRule = {
    show: { all: [{ questionId: 'start', op: 'lessThan', value: '2026-01-01' }] },
  };

  describe('happy', () => {
    it('a later ISO date is greater', () => {
      expect(evaluateConditionalRule(after, answers({ start: '2026-08-25' }))).toBe(true);
      expect(evaluateConditionalRule(before, answers({ start: '2026-08-25' }))).toBe(false);
    });

    it('an earlier ISO date is less', () => {
      expect(evaluateConditionalRule(before, answers({ start: '2025-12-31' }))).toBe(true);
      expect(evaluateConditionalRule(after, answers({ start: '2025-12-31' }))).toBe(false);
    });

    it('plain numbers still compare exactly as before', () => {
      const gt: ConditionalRule = { show: { all: [{ questionId: 'n', op: 'greaterThan', value: 18 }] } };
      expect(evaluateConditionalRule(gt, answers({ n: 21 }))).toBe(true);
      expect(evaluateConditionalRule(gt, answers({ n: '21' }))).toBe(true);
    });
  });

  describe('edge', () => {
    it('equal dates fire neither operator', () => {
      expect(evaluateConditionalRule(after, answers({ start: '2026-01-01' }))).toBe(false);
      expect(evaluateConditionalRule(before, answers({ start: '2026-01-01' }))).toBe(false);
    });

    it('datetime answers compare against date-only values on the same scale', () => {
      expect(evaluateConditionalRule(after, answers({ start: '2026-01-01T10:30:00Z' }))).toBe(true);
    });

    it("the numeric string '0' is a number, not a date", () => {
      const gt: ConditionalRule = { show: { all: [{ questionId: 'n', op: 'greaterThan', value: -1 }] } };
      expect(evaluateConditionalRule(gt, answers({ n: '0' }))).toBe(true);
    });
  });

  describe('worst', () => {
    it('mixed kinds never fire: a number never compares against a date', () => {
      const nonsense: ConditionalRule = {
        show: { all: [{ questionId: 'start', op: 'greaterThan', value: 5 }] },
      };
      expect(evaluateConditionalRule(nonsense, answers({ start: '2026-08-25' }))).toBe(false);
    });

    it('garbage and empty strings are non-comparable, not NaN-poisoned', () => {
      expect(evaluateConditionalRule(after, answers({ start: 'not a date' }))).toBe(false);
      expect(evaluateConditionalRule(after, answers({ start: '' }))).toBe(false);
      expect(evaluateConditionalRule(after, answers({ start: '9999-99-99' }))).toBe(false);
    });

    it('free text Date.parse would guess at stays non-comparable', () => {
      expect(evaluateConditionalRule(after, answers({ start: 'March 3' }))).toBe(false);
    });
  });
});

describe('isNotAnswered (A3)', () => {
  const rule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'isNotAnswered' }] } };

  describe('happy', () => {
    it('fires when the question was skipped', () => {
      expect(evaluateConditionalRule(rule, answers({}))).toBe(true);
      expect(evaluateConditionalRule(rule, answers({ q1: null }))).toBe(true);
    });

    it('does not fire once answered', () => {
      expect(evaluateConditionalRule(rule, answers({ q1: 'x' }))).toBe(false);
    });
  });

  describe('edge', () => {
    it('whitespace-only counts as not answered, agreeing with isAnswerSupplied', () => {
      expect(evaluateConditionalRule(rule, answers({ q1: '   ' }))).toBe(true);
      expect(evaluateConditionalRule(rule, answers({ q1: [] }))).toBe(true);
    });

    it('0 and false ARE answers', () => {
      expect(evaluateConditionalRule(rule, answers({ q1: 0 }))).toBe(false);
      expect(evaluateConditionalRule(rule, answers({ q1: false }))).toBe(false);
    });
  });

  describe('worst', () => {
    it('is the exact complement of isAnswered on every value shape', () => {
      const answered: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'isAnswered' }] } };
      const values: Array<Record<string, AnswerValue>> = [
        {},
        { q1: null },
        { q1: '' },
        { q1: ' ' },
        { q1: [] },
        { q1: 0 },
        { q1: false },
        { q1: 'x' },
        { q1: ['a'] },
        { q1: { line1: '' } },
        { q1: { line1: 'a' } },
      ];
      for (const record of values) {
        expect(evaluateConditionalRule(rule, answers(record))).toBe(
          !evaluateConditionalRule(answered, answers(record)),
        );
      }
    });
  });
});

describe('equalsIgnoreCase (A3)', () => {
  const rule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'equalsIgnoreCase', value: 'Yes' }] } };

  describe('happy', () => {
    it('matches across case', () => {
      expect(evaluateConditionalRule(rule, answers({ q1: 'yes' }))).toBe(true);
      expect(evaluateConditionalRule(rule, answers({ q1: 'YES' }))).toBe(true);
      expect(evaluateConditionalRule(rule, answers({ q1: 'No' }))).toBe(false);
    });
  });

  describe('edge', () => {
    it('unicode case folds through toLowerCase', () => {
      const unicode: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'equalsIgnoreCase', value: 'STRASSE' }] } };
      expect(evaluateConditionalRule(unicode, answers({ q1: 'strasse' }))).toBe(true);
    });

    it('non-strings fall back to strict equals', () => {
      const num: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'equalsIgnoreCase', value: 5 }] } };
      expect(evaluateConditionalRule(num, answers({ q1: 5 }))).toBe(true);
      expect(evaluateConditionalRule(num, answers({ q1: '5' }))).toBe(false);
    });
  });

  describe('worst', () => {
    it('arrays and missing values never match', () => {
      expect(evaluateConditionalRule(rule, answers({ q1: ['Yes'] }))).toBe(false);
      expect(evaluateConditionalRule(rule, answers({}))).toBe(false);
    });
  });
});

describe('startsWith / endsWith (A3)', () => {
  const starts: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'startsWith', value: 'ACME' }] } };
  const ends: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'endsWith', value: '.edu' }] } };

  describe('happy', () => {
    it('prefix-matches a string answer', () => {
      expect(evaluateConditionalRule(starts, answers({ q1: 'ACME Corp' }))).toBe(true);
      expect(evaluateConditionalRule(starts, answers({ q1: 'Not ACME' }))).toBe(false);
    });

    it('suffix-matches a string answer', () => {
      expect(evaluateConditionalRule(ends, answers({ q1: 'dean@university.edu' }))).toBe(true);
      expect(evaluateConditionalRule(ends, answers({ q1: 'ceo@company.com' }))).toBe(false);
    });
  });

  describe('edge', () => {
    it('matching is case-sensitive, like contains', () => {
      expect(evaluateConditionalRule(starts, answers({ q1: 'acme corp' }))).toBe(false);
    });

    it('a numeric comparison value is stringified', () => {
      const numeric: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'startsWith', value: 20 }] } };
      expect(evaluateConditionalRule(numeric, answers({ q1: '2026 budget' }))).toBe(true);
    });
  });

  describe('worst', () => {
    it('array answers never match a string affix', () => {
      expect(evaluateConditionalRule(starts, answers({ q1: ['ACME Corp'] }))).toBe(false);
    });

    it('an empty comparison value never matches — an unfinished rule must not fire', () => {
      const blank: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'startsWith', value: '' }] } };
      expect(evaluateConditionalRule(blank, answers({ q1: 'anything' }))).toBe(false);
    });

    it('non-string answers never match', () => {
      expect(evaluateConditionalRule(starts, answers({ q1: 42 }))).toBe(false);
      expect(evaluateConditionalRule(starts, answers({}))).toBe(false);
    });
  });
});

describe('new operators pass the untrusted-snapshot gate (A3)', () => {
  it('parseConditionalRule accepts every new operator', () => {
    const ops = ['equalsIgnoreCase', 'isNotAnswered', 'startsWith', 'endsWith'];
    for (const op of ops) {
      const json = `{ "show": { "all": [ { "questionId": "q1", "op": "${op}", "value": "x" } ] } }`;
      expect(() => parseConditionalRule(json)).not.toThrow();
    }
  });
});

describe('score conditions compare as numbers (C4)', () => {
  /**
   * The score is always a NUMBER; the condition editor's value input is a TEXT box, so it stores
   * "70". `70 === '70'` is false, which made every equality-family operator on the Total score
   * source silently wrong in the two worst directions at once: "equals 70" could never fire, and
   * "does not equal 70" fired for everyone. Only greaterThan/lessThan happened to work, because
   * their comparison already coerced numeric strings.
   *
   * Normalizing lives in the evaluator rather than the editor because rules also arrive from
   * mj-sync metadata and the AI form builder, which never touch the editor at all.
   */
  const scoreRule = (op: 'equals' | 'notEquals' | 'in' | 'notIn', value: string | string[]): ConditionalRule => ({
    show: { all: [{ source: 'score', op, value }] },
  });

  describe('happy', () => {
    it('equals matches a numeric string value', () => {
      expect(evaluateConditionalRule(scoreRule('equals', '70'), answers({}), { score: 70 })).toBe(true);
      expect(evaluateConditionalRule(scoreRule('equals', '70'), answers({}), { score: 69 })).toBe(false);
    });

    it('in matches a list of numeric strings', () => {
      expect(evaluateConditionalRule(scoreRule('in', ['70', '80']), answers({}), { score: 80 })).toBe(true);
      expect(evaluateConditionalRule(scoreRule('in', ['70', '80']), answers({}), { score: 75 })).toBe(false);
    });
  });

  describe('edge', () => {
    it('notEquals is the negation it reads as, not an always-true rule', () => {
      expect(evaluateConditionalRule(scoreRule('notEquals', '70'), answers({}), { score: 70 })).toBe(false);
      expect(evaluateConditionalRule(scoreRule('notEquals', '70'), answers({}), { score: 71 })).toBe(true);
    });

    it('notIn excludes the listed totals', () => {
      expect(evaluateConditionalRule(scoreRule('notIn', ['70']), answers({}), { score: 70 })).toBe(false);
      expect(evaluateConditionalRule(scoreRule('notIn', ['70']), answers({}), { score: 71 })).toBe(true);
    });

    it('a value already stored as a number keeps working', () => {
      const numeric: ConditionalRule = { show: { all: [{ source: 'score', op: 'equals', value: 70 }] } };
      expect(evaluateConditionalRule(numeric, answers({}), { score: 70 })).toBe(true);
    });
  });

  describe('worst', () => {
    it('a non-numeric value never matches, and its negation always does', () => {
      // "Total score equals banana" is authorable nonsense. It must stay inert rather than
      // coerce to NaN or 0 and start firing on a real total.
      expect(evaluateConditionalRule(scoreRule('equals', 'banana'), answers({}), { score: 0 })).toBe(false);
      expect(evaluateConditionalRule(scoreRule('notEquals', 'banana'), answers({}), { score: 0 })).toBe(true);
    });

    it('an unknown score still fires nothing, whatever the value spelling', () => {
      // EvalExtras' contract: "score unknown here" must never pass for "scored zero".
      expect(evaluateConditionalRule(scoreRule('equals', '0'), answers({}))).toBe(false);
      expect(evaluateConditionalRule(scoreRule('notEquals', '0'), answers({}))).toBe(false);
    });

    it('question conditions are untouched — "5" and 5 stay different answers', () => {
      const q: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'equals', value: '5' }] } };
      expect(evaluateConditionalRule(q, answers({ q1: 5 }))).toBe(false);
      expect(evaluateConditionalRule(q, answers({ q1: '5' }))).toBe(true);
    });
  });
});
