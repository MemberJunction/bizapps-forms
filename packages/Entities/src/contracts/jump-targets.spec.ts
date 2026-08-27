/**
 * Where a `Go to` rule can point, and how a rule authored before it could point anywhere but a
 * page still parses (plans/done/QUESTION_LEVEL_LOGIC_PLAN.md Phase 1).
 *
 * The stored shape is a TAGGED target — `{ kind, id }` — so the resolver never has to guess what
 * an id refers to. Legacy rules carry `{ when, toPageId }` instead, and a published snapshot is
 * a frozen blob no migration rewrites, so the parse boundary is where the two shapes become one.
 * Tolerance lives HERE and nowhere else: everything downstream sees only tagged targets.
 */
import { describe, expect, it } from 'vitest';
import { parseConditionalRule } from './schemas';

const WHEN = { all: [{ questionId: 'q1', op: 'equals', value: 'yes' }] };

/** The single jump on a parsed rule, for brevity in the assertions below. */
function jumpOf(raw: unknown) {
  return parseConditionalRule(raw).jump?.[0];
}

describe('jump targets', () => {
  describe('happy', () => {
    it('carries a tagged question target through unchanged', () => {
      expect(jumpOf({ jump: [{ when: WHEN, target: { kind: 'question', id: 'q8' } }] })?.target).toEqual({
        kind: 'question',
        id: 'q8',
      });
    });

    it('carries a tagged ending target through unchanged', () => {
      expect(jumpOf({ jump: [{ when: WHEN, target: { kind: 'ending', id: 's1' } }] })?.target).toEqual({
        kind: 'ending',
        id: 's1',
      });
    });

    it('accepts the submit target, which names nothing', () => {
      // "Stop asking, they are done" — the ending is left to `resolveEndingScreen`, which is
      // what an author wants when several endings compete on score.
      expect(jumpOf({ jump: [{ when: WHEN, target: { kind: 'submit' } }] })?.target).toEqual({
        kind: 'submit',
      });
    });
  });

  describe('edge', () => {
    it('normalizes a legacy toPageId into a tagged page target', () => {
      expect(jumpOf({ jump: [{ when: WHEN, toPageId: 'p3' }] })?.target).toEqual({
        kind: 'page',
        id: 'p3',
      });
    });

    it('keeps the when-group intact while normalizing', () => {
      expect(jumpOf({ jump: [{ when: WHEN, toPageId: 'p3' }] })?.when).toEqual(WHEN);
    });

    it('leaves no toPageId behind for a downstream reader to find', () => {
      // Two shapes reaching the resolver is how the resolver comes to prefer one of them by
      // accident. There is exactly one shape past this boundary.
      const jump = jumpOf({ jump: [{ when: WHEN, toPageId: 'p3' }] });
      expect(jump && 'toPageId' in jump).toBe(false);
    });
  });

  describe('worst', () => {
    it('refuses a rule carrying BOTH shapes rather than silently picking one', () => {
      expect(() =>
        parseConditionalRule({
          jump: [{ when: WHEN, toPageId: 'p3', target: { kind: 'question', id: 'q8' } }],
        }),
      ).toThrow();
    });

    it('refuses a target kind it does not know', () => {
      expect(() =>
        parseConditionalRule({ jump: [{ when: WHEN, target: { kind: 'planet', id: 'mars' } }] }),
      ).toThrow();
    });

    it('refuses an id-bearing kind with no id', () => {
      for (const kind of ['question', 'page', 'ending']) {
        expect(() => parseConditionalRule({ jump: [{ when: WHEN, target: { kind } }] })).toThrow();
      }
    });

    it('refuses a jump with no target at all', () => {
      expect(() => parseConditionalRule({ jump: [{ when: WHEN }] })).toThrow();
    });
  });
});
