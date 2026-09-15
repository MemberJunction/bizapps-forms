/**
 * What happens to rules authored BEFORE the require verb and the four affix/ordering operators
 * were removed (plans/RULES_SIMPLIFICATION_PLAN.md Phase 1).
 *
 * Nothing shipped carries either — `grep '"op"' migrations/ metadata/` is empty — but dev and
 * customer databases hold hand-authored rules, and a published snapshot is a frozen JSON blob
 * that no migration rewrites. So the removal has to survive its own history, and these are the
 * two ways it can: a key zod no longer knows is stripped, and an operator zod no longer knows
 * is a parse failure. They are deliberately different outcomes, and both are load-bearing.
 */
import { describe, expect, it } from 'vitest';
import { parseConditionalRule } from './schemas';

describe('rules authored before the simplification', () => {
  describe('a stored `require` group', () => {
    it('parses clean and the key is dropped', () => {
      // `conditionalRuleSchema` is a plain `z.object`, which STRIPS unknown keys rather than
      // rejecting them. That is what makes removing the verb a no-migration change: the blob
      // still parses, and the key it no longer understands simply stops existing.
      const parsed = parseConditionalRule({
        require: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] },
      });

      expect(parsed).toEqual({});
      expect('require' in parsed).toBe(false);
    });

    it('does not take the show rule down with it', () => {
      // The worst case for a strip: a rule carrying BOTH verbs. If the strip were a rejection,
      // this item's show gate would vanish and it would be visible to everyone.
      const parsed = parseConditionalRule({
        show: { all: [{ questionId: 'q1', op: 'equals', value: 'Yes' }] },
        require: { all: [{ questionId: 'q2', op: 'isAnswered' }] },
      });

      expect(parsed.show).toEqual({ all: [{ questionId: 'q1', op: 'equals', value: 'Yes' }] });
      expect('require' in parsed).toBe(false);
    });
  });

  describe('a stored condition on a removed operator', () => {
    it.each(['equalsIgnoreCase', 'contains', 'startsWith', 'endsWith'])(
      'fails parse rather than being silently reinterpreted (%s)',
      (op) => {
        // Rejection, not a strip: `op` is a required enum, so an unknown one is a parse error.
        // The callers turn that into "no rule" — loudly on the server, quietly in the builder —
        // which is why the error must reach them instead of the condition being dropped here.
        expect(() =>
          parseConditionalRule({ show: { all: [{ questionId: 'q1', op, value: 'x' }] } }),
        ).toThrow();
      },
    );

    it('leaves the eight surviving operators alone', () => {
      const survivors = [
        'equals',
        'notEquals',
        'in',
        'notIn',
        'isAnswered',
        'isNotAnswered',
        'greaterThan',
        'lessThan',
      ];

      for (const op of survivors) {
        const value = op === 'in' || op === 'notIn' ? ['x'] : 'x';
        expect(() =>
          parseConditionalRule({ show: { all: [{ questionId: 'q1', op, value }] } }),
        ).not.toThrow();
      }
    });
  });
});
