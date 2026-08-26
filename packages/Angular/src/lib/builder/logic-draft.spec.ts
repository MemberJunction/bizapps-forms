/**
 * The working copy behind the "Edit logic" dialog
 * (plans/QUESTION_LEVEL_LOGIC_PLAN.md Phases 3–4).
 *
 * An item's logic is now two things at once — an optional "show this when…" gate and an ordered
 * list of "if … then go to …" rules — and they are edited together in one dialog. That makes the
 * draft a pair rather than a single group, and it makes ORDER load-bearing: rule 1 beating rule 2
 * is the whole semantics of first-match-wins.
 */
import { describe, expect, it } from 'vitest';
import { MAX_JUMP_RULES, type ConditionalJumpRule, type ConditionalRule } from '@mj-biz-apps/forms-entities';
import {
  addJumpRule,
  canAddJumpRule,
  emptyLogicDraft,
  isLogicDraftDirty,
  jumpRules,
  logicDraftOf,
  moveJumpRule,
  removeJumpRule,
  ruleFromLogicDraft,
  updateJumpRule,
} from './logic-draft';

const cond = (value: string) => ({ all: [{ questionId: 'q1', op: 'equals' as const, value }] });
const jump = (value: string, id: string): ConditionalJumpRule => ({
  when: cond(value),
  target: { kind: 'question', id },
});

describe('jumpRules', () => {
  it('reads the whole list, not just the first', () => {
    // `jumpRule()` read `rule.jump[0]` because the panel authored exactly one. The contract
    // always stored a list with first-match-wins; only the UI was singular.
    const rule: ConditionalRule = { jump: [jump('a', 'q2'), jump('b', 'q3')] };
    expect(jumpRules(rule).map((j) => j.when)).toEqual([cond('a'), cond('b')]);
  });

  it('is empty for a rule with no jumps at all', () => {
    expect(jumpRules(undefined)).toEqual([]);
    expect(jumpRules({ show: cond('x') })).toEqual([]);
  });
});

describe('logicDraftOf / ruleFromLogicDraft', () => {
  describe('happy', () => {
    it('round-trips an item that has both a show gate and jumps', () => {
      const rule: ConditionalRule = { show: cond('vip'), jump: [jump('a', 'q2')] };
      expect(ruleFromLogicDraft(logicDraftOf(rule))).toEqual(rule);
    });

    it('collapses to undefined when the draft says nothing', () => {
      // An empty rule object would serialize as a phantom "has a rule" marker every consumer
      // then has to see through.
      expect(ruleFromLogicDraft(emptyLogicDraft())).toBeUndefined();
    });
  });

  describe('edge', () => {
    it('drops a jump that never got a target', () => {
      // Half-authored rows exist while the dialog is open; they must not reach the item.
      const draft = addJumpRule(emptyLogicDraft());
      expect(ruleFromLogicDraft(draft)).toBeUndefined();
    });

    it('drops a jump whose conditions were never written', () => {
      // A jump with no conditions fires for EVERYONE — the one thing a half-finished rule must
      // never silently become.
      const draft = { show: undefined, jumps: [{ when: {}, target: { kind: 'question' as const, id: 'q2' } }] };
      expect(ruleFromLogicDraft(draft)).toBeUndefined();
    });

    it('keeps the show gate even when every jump is incomplete', () => {
      const draft = { show: cond('vip'), jumps: [{ when: {}, target: undefined }] };
      expect(ruleFromLogicDraft(draft)).toEqual({ show: cond('vip') });
    });
  });

  describe('worst', () => {
    it('preserves authoring order, because order IS the semantics', () => {
      const draft = { show: undefined, jumps: [jump('a', 'q2'), jump('b', 'q3')] };
      expect(ruleFromLogicDraft(draft)?.jump).toEqual([jump('a', 'q2'), jump('b', 'q3')]);
    });
  });
});

describe('editing the jump list', () => {
  const two = { show: undefined, jumps: [jump('a', 'q2'), jump('b', 'q3')] };

  describe('happy', () => {
    it('adds a blank rule at the end', () => {
      expect(addJumpRule(two).jumps).toHaveLength(3);
      expect(addJumpRule(two).jumps[2].target).toBeUndefined();
    });

    it('updates one rule without touching its neighbours', () => {
      const next = updateJumpRule(two, 0, { target: { kind: 'question', id: 'q9' } });
      expect(next.jumps[0].target).toEqual({ kind: 'question', id: 'q9' });
      expect(next.jumps[1]).toEqual(two.jumps[1]);
    });

    it('removes one rule', () => {
      expect(removeJumpRule(two, 0).jumps).toEqual([two.jumps[1]]);
    });
  });

  describe('edge', () => {
    it('moves a rule up, which changes which one wins', () => {
      expect(moveJumpRule(two, 1, -1).jumps.map((j) => j.when)).toEqual([cond('b'), cond('a')]);
    });

    it('refuses to move the first rule up or the last one down', () => {
      expect(moveJumpRule(two, 0, -1)).toEqual(two);
      expect(moveJumpRule(two, 1, 1)).toEqual(two);
    });

    it('never mutates the draft it was given', () => {
      const before = JSON.stringify(two);
      addJumpRule(two);
      removeJumpRule(two, 0);
      moveJumpRule(two, 1, -1);
      expect(JSON.stringify(two)).toBe(before);
    });
  });

  describe('worst', () => {
    it(`stops offering another rule at the cap of ${MAX_JUMP_RULES}`, () => {
      // The cap is in the contract and enforced by the zod schema at the server boundary. An
      // editor that let an author write past it would produce a rule the server refuses to
      // read at all — which for a show rule means visible to everyone.
      const full = { show: undefined, jumps: Array.from({ length: MAX_JUMP_RULES }, () => jump('a', 'q2')) };
      expect(canAddJumpRule(full)).toBe(false);
      expect(canAddJumpRule(two)).toBe(true);
      expect(addJumpRule(full).jumps).toHaveLength(MAX_JUMP_RULES);
    });
  });
});

describe('isLogicDraftDirty', () => {
  it('is false for an untouched draft, whatever the key order', () => {
    const rule: ConditionalRule = { show: cond('vip'), jump: [jump('a', 'q2')] };
    expect(isLogicDraftDirty(logicDraftOf(rule), logicDraftOf(rule))).toBe(false);
  });

  it('notices a changed condition, a changed target, and a reorder', () => {
    const base = { show: undefined, jumps: [jump('a', 'q2'), jump('b', 'q3')] };
    expect(isLogicDraftDirty(updateJumpRule(base, 0, { when: cond('z') }), base)).toBe(true);
    expect(isLogicDraftDirty(updateJumpRule(base, 0, { target: { kind: 'question', id: 'q9' } }), base)).toBe(true);
    expect(isLogicDraftDirty(moveJumpRule(base, 1, -1), base)).toBe(true);
  });

  it('is false again once an edit is undone — dirty is value equality, not touched-ness', () => {
    const base = { show: undefined, jumps: [jump('a', 'q2')] };
    const there = updateJumpRule(base, 0, { when: cond('z') });
    expect(isLogicDraftDirty(updateJumpRule(there, 0, { when: cond('a') }), base)).toBe(false);
  });
});
