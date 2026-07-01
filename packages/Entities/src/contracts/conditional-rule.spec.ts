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
