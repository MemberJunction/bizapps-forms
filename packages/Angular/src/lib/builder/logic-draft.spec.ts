/**
 * The working copy behind the "Edit logic" dialog
 * (plans/done/QUESTION_LEVEL_LOGIC_PLAN.md Phases 3–4).
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
  isCommittableJump,
  emptyLogicDraft,
  isLogicDraftDirty,
  jumpRules,
  logicDraftOf,
  moveJumpRule,
  removeJumpRule,
  ruleFromLogicDraft,
  updateJumpRule,
} from './logic-draft';

const SUBMIT = { kind: 'submit' } as const;
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
      expect(addJumpRule(two).jumps[2].when).toEqual({});
    });

    it('starts the new rule from a given condition, so the dialog can point it at its own item', () => {
      // The dialog knows which question the rule belongs to; this module does not, and should
      // not. It takes the opening condition rather than deriving one.
      const seed = cond('seeded');
      expect(addJumpRule(two, seed).jumps[2].when).toEqual(seed);
    });

    it('a seeded rule still does not commit until it is told where to go', () => {
      const seeded = addJumpRule({ show: undefined, jumps: [] }, cond('seeded'));
      expect(ruleFromLogicDraft(seeded)).toBeUndefined();
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

describe('an unfinished condition is dropped on save', () => {
  // Since the dialog opens a new rule with a row already filled in, an author can reach Save
  // with a question and an operator chosen but no VALUE typed. Stored as-is that reads
  // `equals ""`, which no answer matches — so the item would hide from everyone, on a rule the
  // author never finished writing. Dropping it means an abandoned edit leaves things as they
  // were, rather than quietly turning the gate all the way off.
  const complete = { questionId: 'q1', op: 'equals' as const, value: 'Bug' };
  const blank = { questionId: 'q2', op: 'equals' as const, value: '' };

  describe('happy', () => {
    it('keeps the conditions that are finished and drops the one that is not', () => {
      const rule = ruleFromLogicDraft({ show: { all: [complete, blank] }, jumps: [] });
      expect(rule?.show).toEqual({ all: [complete] });
    });
  });

  describe('edge', () => {
    it('a show gate with nothing finished stores no rule at all, so the item still shows', () => {
      expect(ruleFromLogicDraft({ show: { all: [blank] }, jumps: [] })).toBeUndefined();
    });

    it('an operator that takes no value is finished the moment it is chosen', () => {
      const answered = { questionId: 'q1', op: 'isAnswered' as const };
      expect(ruleFromLogicDraft({ show: { all: [answered] }, jumps: [] })?.show).toEqual({
        all: [answered],
      });
    });

    it('zero and false are values, not emptiness', () => {
      // `!value` would drop both, and a rule reading "score equals 0" is a rule an author means.
      const zero = { questionId: 'q1', op: 'equals' as const, value: 0 };
      const no = { questionId: 'q2', op: 'equals' as const, value: false };
      expect(ruleFromLogicDraft({ show: { all: [zero, no] }, jumps: [] })?.show).toEqual({
        all: [zero, no],
      });
    });

    it('an empty checklist is unfinished — nothing has been ticked yet', () => {
      const nothingTicked = { questionId: 'q1', op: 'in' as const, value: [] };
      expect(ruleFromLogicDraft({ show: { any: [nothingTicked] }, jumps: [] })).toBeUndefined();
    });

    it('pruning an any-group leaves it an any-group', () => {
      const other = { questionId: 'q3', op: 'equals' as const, value: 'Feature' };
      expect(
        ruleFromLogicDraft({ show: { any: [complete, blank, other] }, jumps: [] })?.show,
      ).toEqual({ any: [complete, other] });
    });
  });

  describe('worst', () => {
    it('a jump left with no conditions is not stored, because it would fire for everyone', () => {
      const draft = { show: undefined, jumps: [{ when: { all: [blank] }, target: SUBMIT }] };
      expect(ruleFromLogicDraft(draft)).toBeUndefined();
      expect(isCommittableJump(draft.jumps[0])).toBe(false);
    });

    it('a condition naming no question is dropped rather than published', () => {
      // The server parses stored rules with zod, which rejects one — and a rule it cannot read
      // becomes "no rule", so the gate it was supposed to apply is not applied at all.
      const nameless = { op: 'equals' as const, value: 'Bug' };
      expect(ruleFromLogicDraft({ show: { all: [nameless] }, jumps: [] })).toBeUndefined();
    });

    it('a score condition has no questionId and must survive that check', () => {
      const score = { source: 'score' as const, op: 'greaterThan' as const, value: 70 };
      expect(ruleFromLogicDraft({ show: { all: [score] }, jumps: [] })?.show).toEqual({
        all: [score],
      });
    });
  });

  describe('and so closing the dialog stays quiet about it', () => {
    it('choosing a question and leaving the value blank is not a change worth warning about', () => {
      // Dirtiness asks "would saving change anything?". Now that saving would not, the dialog
      // must not claim there is unsaved work — the two answers come from the same function.
      const baseline = emptyLogicDraft();
      expect(isLogicDraftDirty({ ...baseline, show: { all: [blank] } }, baseline)).toBe(false);
    });
  });
});
