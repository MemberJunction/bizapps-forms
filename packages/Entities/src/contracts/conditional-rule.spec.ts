import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  evaluateConditionalRule,
  type AnswerValue,
  type ConditionalOperator,
  type ConditionalRule,
  type ConditionValue,
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

describe('every operator passes the untrusted-snapshot gate', () => {
  it('parseConditionalRule accepts each of the eight, and nothing else', () => {
    // The gate is the reason a removal is a breaking change rather than dead code: an operator
    // off this list is a PARSE FAILURE on the server, and a parse failure is a fail-open on a
    // show rule. See legacy-rules.spec.ts for what that costs and why it is still the right
    // posture.
    const ops = ['equals', 'notEquals', 'in', 'notIn', 'isAnswered', 'isNotAnswered', 'greaterThan', 'lessThan'];
    for (const op of ops) {
      const value = op === 'in' || op === 'notIn' ? '["x"]' : '"x"';
      const json = `{ "show": { "all": [ { "questionId": "q1", "op": "${op}", "value": ${value} } ] } }`;
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

    // This used to assert the opposite — that `5` and `'5'` stayed different answers to a
    // question — on the reasoning that collapsing them would change what published rules meant.
    // It does change it, and the change is the point: a Rating, NPS, OpinionScale or Number
    // question can ONLY answer with a number, so a rule naming `'5'` was not "a different
    // question", it was a dead one, whose negation fired for every respondent alive. The
    // comparand below is still untouched for question conditions; the tolerance moved to
    // `scalarsEqual`, where it applies to the OPERATOR rather than to the stored value.
    it('a question condition reads either spelling of the same answer', () => {
      const q: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'equals', value: '5' }] } };
      expect(evaluateConditionalRule(q, answers({ q1: 5 }))).toBe(true);
      expect(evaluateConditionalRule(q, answers({ q1: '5' }))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Comparing an answer against a value that was SPELLED differently.
//
// An answer's type comes from its question's column: a Rating answers `5`, a YesNo answers
// `true`. A condition's value comes from wherever the rule was written — the builder's own
// editor now stores those typed, but mj-sync metadata, the AI form builder and every rule
// authored before this all carry `'5'` and `'true'` as strings. Strict `===` made those rules
// not merely wrong but wrong in BOTH directions at once: `equals` could never fire and
// `notEquals`, its negation, fired for everyone — including respondents who answered exactly
// what the author named.
// ---------------------------------------------------------------------------

describe('equality across spellings of the same answer', () => {
  const evaluate = (answer: AnswerValue, value: ConditionValue, op: ConditionalOperator): boolean =>
    evaluateCondition({ questionId: 'q', op, value }, answers({ q: answer }));

  describe('happy', () => {
    it('a rating answered 5 equals the string a text box stored', () => {
      expect(evaluate(5, '5', 'equals')).toBe(true);
      expect(evaluate(5, '5', 'notEquals')).toBe(false);
    });

    it('a Yes answer equals the boolean it is stored as, and its written spelling', () => {
      expect(evaluate(true, true, 'equals')).toBe(true);
      expect(evaluate(true, 'true', 'equals')).toBe(true);
      expect(evaluate(false, 'false', 'equals')).toBe(true);
    });

    it('a date answer equals the same instant written another way', () => {
      expect(evaluate('2026-08-25', '2026-08-25', 'equals')).toBe(true);
    });
  });

  describe('edge', () => {
    it('still says no when the two are genuinely different', () => {
      expect(evaluate(5, '6', 'equals')).toBe(false);
      expect(evaluate(true, 'false', 'equals')).toBe(false);
      expect(evaluate('Sports', 'Music', 'equals')).toBe(false);
    });

    it('leaves free text alone — two strings compare as strings', () => {
      expect(evaluate('VIP', 'VIP', 'equals')).toBe(true);
      expect(evaluate('vip', 'VIP', 'equals')).toBe(false);
    });

    it('an unanswered question equals nothing', () => {
      expect(evaluate(undefined, '5', 'equals')).toBe(false);
      expect(evaluate(null, 'true', 'equals')).toBe(false);
    });
  });

  describe('worst', () => {
    // JavaScript would have `0 == false` and `1 == true`. A respondent who rated a form 1 star
    // has not said "yes" to anything, and a scale that starts at 0 is not "no".
    it('never lets a number stand in for a boolean, in either direction', () => {
      expect(evaluate(true, '1', 'equals')).toBe(false);
      expect(evaluate(true, 1, 'equals')).toBe(false);
      expect(evaluate(false, 0, 'equals')).toBe(false);
      expect(evaluate(1, 'true', 'equals')).toBe(false);
      expect(evaluate(0, 'false', 'equals')).toBe(false);
    });

    it('never lets a date stand in for the number of milliseconds it is', () => {
      expect(evaluate('2026-08-25', Date.parse('2026-08-25'), 'equals')).toBe(false);
    });

    it('a composite answer equals no scalar, however it is spelled', () => {
      expect(evaluate({ line1: '12 Main' }, '12 Main', 'equals')).toBe(false);
      expect(evaluate({ line1: '12 Main' }, 'true', 'equals')).toBe(false);
    });

    it('blank is not zero — an empty condition value matches nothing numeric', () => {
      expect(evaluate(0, '', 'equals')).toBe(false);
    });
  });
});

describe('ordering a time-of-day answer', () => {
  const compare = (answer: AnswerValue, value: ConditionValue, op: ConditionalOperator): boolean =>
    evaluateCondition({ questionId: 'q', op, value }, answers({ q: answer }));

  describe('happy', () => {
    // `<input type="time">` gives `"14:30"`, which `Number()` reads as NaN and the ISO-date
    // pattern does not match — so before this, greaterThan/lessThan on a Time question were
    // offered in the editor and could never fire, for any answer, ever.
    it('an afternoon is later than a morning', () => {
      expect(compare('14:30', '09:00', 'greaterThan')).toBe(true);
      expect(compare('09:00', '14:30', 'lessThan')).toBe(true);
    });

    it('reads the seconds some browsers add', () => {
      expect(compare('14:30:00', '09:00', 'greaterThan')).toBe(true);
    });
  });

  describe('edge', () => {
    it('orders by the clock, not by the string', () => {
      // '9:00' > '14:30' as text; 09:00 is earlier as a time.
      expect(compare('09:00', '14:30', 'greaterThan')).toBe(false);
    });

    it('the same time is neither greater nor less', () => {
      expect(compare('14:30', '14:30', 'greaterThan')).toBe(false);
      expect(compare('14:30', '14:30', 'lessThan')).toBe(false);
      expect(compare('14:30', '14:30', 'equals')).toBe(true);
    });
  });

  describe('worst', () => {
    it('a time is not a number of minutes, and not a date', () => {
      expect(compare('14:30', 870, 'greaterThan')).toBe(false);
      expect(compare('14:30', '2026-08-25', 'greaterThan')).toBe(false);
    });

    it('refuses an impossible clock reading rather than guessing at it', () => {
      expect(compare('25:00', '09:00', 'greaterThan')).toBe(false);
      expect(compare('14:60', '09:00', 'greaterThan')).toBe(false);
    });
  });
});

/**
 * What a condition naming a question that is not in the answer map actually does.
 *
 * Four comments in the builder asserted this is `NOT_EVALUABLE`, which the evaluator reads as
 * `false`, so the guarded item is "hidden from every respondent". Both halves are wrong, and the
 * builder now says something else — these pin what it may say.
 *
 * The case arises two ways and they are indistinguishable here: the question was DELETED, or it
 * is answered LATER than the rule runs, so nothing has been put in the map yet.
 *
 * These DOCUMENT behaviour that already shipped; they drove no change to the evaluator. They
 * exist so the corrected prose cannot quietly drift back to what it said.
 */
describe('a condition whose question is absent from the answers', () => {
  const missing = (op: ConditionalOperator, value?: ConditionValue): boolean =>
    evaluateCondition({ questionId: 'gone', op, value }, answers({ q1: 'x' }));

  describe('happy', () => {
    it('is NOT the NOT_EVALUABLE sentinel — a deleted question still has an id', () => {
      // `conditionOperand` returns that sentinel only for a MISSING or empty `questionId`, or a
      // score condition with no score. A deleted question's id is a perfectly good string, so
      // the operand is a plain `undefined` and every operator gets to run on it.
      // Observable proof: the sentinel short-circuits to `false` before the operator is
      // consulted, so an operator that answers `true` on `undefined` could not fire at all.
      expect(missing('isNotAnswered')).toBe(true);
    });

    it('is false under the equality family, which is the case people expect', () => {
      expect(missing('equals', 'x')).toBe(false);
      expect(missing('in', ['x'])).toBe(false);
      expect(missing('isAnswered')).toBe(false);
    });
  });

  describe('worst', () => {
    it('is TRUE under isNotAnswered and notEquals, so the item is shown to EVERYONE', () => {
      // The half that makes "hidden from every respondent" a lie. A show rule reading a deleted
      // or not-yet-answered question with either operator pins the item OPEN, not shut — and a
      // badge caught lying once is a badge nobody reads on the day it is right.
      expect(missing('isNotAnswered')).toBe(true);
      expect(missing('notEquals', 'x')).toBe(true);
    });

    it('pins a whole show rule open, not shut', () => {
      expect(
        evaluateConditionalRule(
          { show: { all: [{ questionId: 'gone', op: 'isNotAnswered' }] } },
          answers({ q1: 'x' }),
        ),
      ).toBe(true);
    });
  });
});
