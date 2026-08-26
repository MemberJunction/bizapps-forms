import { describe, expect, it } from 'vitest';
import type { ConditionalCondition, ConditionalGroup, ConditionalRule } from '@mj-biz-apps/forms-entities';
import {
  ENDING_RULE_CARDS,
  PAGE_RULE_CARDS,
  QUESTION_RULE_CARDS,
  cardSpec,
  groupConditions,
  isAuthoredGroup,
  isDraftCommittable,
  isDraftDirty,
  sameGroup,
  type RuleDraft,
  activeCards,
  summarizeGroup,
  verbGroup,
  withVerbGroup,
} from './rules-panel-model';
import type { ConditionalSourceQuestion } from './condition-sources';

const C1: ConditionalCondition = { questionId: 'q1', op: 'equals', value: 'vip' };
const C2: ConditionalCondition = { questionId: 'q2', op: 'greaterThan', value: 10 };

const SOURCES: ConditionalSourceQuestion[] = [
  { id: 'q1', prompt: 'Ticket type?', kind: 'singleChoice', options: [{ label: 'VIP', value: 'vip' }] },
  { id: 'q2', prompt: 'Company size?', kind: 'number' },
];

describe('withVerbGroup', () => {
  describe('happy', () => {
    it('sets a verb group on an empty rule', () => {
      const group = { all: [{ questionId: 'q1', op: 'equals' as const, value: 'vip' }] };
      expect(withVerbGroup(undefined, 'show', group)).toEqual({ show: group });
    });
  });

  describe('edge', () => {
    it('replacing a group keeps the rest of the rule intact', () => {
      const rule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'isAnswered' }] } };
      const next = withVerbGroup(rule, 'show', { any: [{ questionId: 'q2', op: 'isAnswered' }] });
      expect(next).toEqual({ show: { any: [{ questionId: 'q2', op: 'isAnswered' }] } });
      // The input rule is never mutated.
      expect(rule.show).toEqual({ all: [{ questionId: 'q1', op: 'isAnswered' }] });
    });
  });

  describe('worst', () => {
    it('clearing the only verb collapses to undefined, never a phantom {}', () => {
      const rule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'isAnswered' }] } };
      expect(withVerbGroup(rule, 'show', undefined)).toBeUndefined();
      expect(withVerbGroup(undefined, 'show', undefined)).toBeUndefined();
    });
  });
});

describe('activeCards / verbGroup', () => {
  it('happy: a rule with a show group activates the show card', () => {
    const rule: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'isAnswered' }] } };
    expect(activeCards(rule, QUESTION_RULE_CARDS).map((c) => c.verb)).toEqual(['show']);
    expect(verbGroup(rule, 'show')).toBe(rule.show);
  });

  it('worst: no rule, or a rule with no known verbs, activates nothing', () => {
    expect(activeCards(undefined, QUESTION_RULE_CARDS)).toEqual([]);
    expect(activeCards({}, QUESTION_RULE_CARDS)).toEqual([]);
  });
});

describe('summarizeGroup', () => {
  describe('happy', () => {
    it('names the question, the operator, and the value', () => {
      const group = { all: [{ questionId: 'q1', op: 'equals' as const, value: 'vip' }] };
      expect(summarizeGroup(group, SOURCES)).toBe('Ticket type? equals vip');
    });

    it('counts the conditions beyond the first', () => {
      const group = {
        all: [
          { questionId: 'q1', op: 'equals' as const, value: 'vip' },
          { questionId: 'q2', op: 'isAnswered' as const },
          { questionId: 'q2', op: 'isNotAnswered' as const },
        ],
      };
      expect(summarizeGroup(group, SOURCES)).toBe('Ticket type? equals vip · +2 more');
    });
  });

  describe('edge', () => {
    it('valueless operators summarize without a value', () => {
      const group = { any: [{ questionId: 'q2', op: 'isAnswered' as const }] };
      expect(summarizeGroup(group, SOURCES)).toBe('Company size? is answered');
    });

    it('array values join readably', () => {
      const group = { all: [{ questionId: 'q1', op: 'in' as const, value: ['vip', 'ga'] }] };
      expect(summarizeGroup(group, SOURCES)).toBe('Ticket type? is one of vip, ga');
    });
  });

  describe('worst', () => {
    it('a deleted question is said out loud, not hidden', () => {
      const group = { all: [{ questionId: 'gone', op: 'equals' as const, value: 'x' }] };
      expect(summarizeGroup(group, SOURCES)).toBe('(deleted question) equals x');
    });

    it('an empty or missing group reads as unconfigured', () => {
      expect(summarizeGroup(undefined, SOURCES)).toBe('No conditions yet');
      expect(summarizeGroup({ all: [] }, SOURCES)).toBe('No conditions yet');
    });
  });
});

describe('summarizeGroup speaks in the voice of the source it read', () => {
  const MULTI: ConditionalSourceQuestion[] = [
    { id: 'q3', prompt: 'Interests', kind: 'multiSelect', options: [{ label: 'Sports', value: 'sports' }] },
  ];

  it('reads a membership condition on a multi-select as "includes"', () => {
    // The summary and the operator dropdown must name the same operator the same way — an
    // author who picked "includes any of" and reads back "is one of" has to work out whether
    // the rule changed under them.
    const group = { all: [{ questionId: 'q3', op: 'in' as const, value: ['sports'] }] };
    expect(summarizeGroup(group, MULTI)).toBe('Interests includes any of sports');
  });

  it('keeps the canonical wording on a single-answer source', () => {
    const group = { all: [{ questionId: 'q1', op: 'in' as const, value: ['vip'] }] };
    expect(summarizeGroup(group, SOURCES)).toBe('Ticket type? is one of vip');
  });

  it('a deleted source says so and keeps the canonical wording', () => {
    const group = { all: [{ questionId: 'gone', op: 'in' as const, value: ['x'] }] };
    expect(summarizeGroup(group, SOURCES)).toBe('(deleted question) is one of x');
  });
});

describe('cardSpec', () => {
  it('finds the spec for a verb the item offers', () => {
    expect(cardSpec('jump', PAGE_RULE_CARDS)?.title).toBe('Jump to page');
    expect(cardSpec('show', PAGE_RULE_CARDS)?.title).toBe('Show only if');
  });

  it('is undefined for a verb this item does not offer, rather than falling back to the first', () => {
    // A question has no `jump` card. Returning QUESTION_RULE_CARDS[0] would title the dialog
    // "Show only if" while it edited a jump — the two are not interchangeable.
    expect(cardSpec('jump', QUESTION_RULE_CARDS)).toBeUndefined();
    expect(cardSpec('disqualify', PAGE_RULE_CARDS)).toBeUndefined();
  });

  it('reads disqualify off the ending cards, where it is a pseudo-verb rather than a JSON key', () => {
    expect(cardSpec('disqualify', ENDING_RULE_CARDS)?.title).toBe('Disqualify if');
  });

  it('is undefined for an empty spec list', () => {
    expect(cardSpec('show', [])).toBeUndefined();
  });
});

describe('groupConditions', () => {
  it('reads whichever combinator holds them', () => {
    expect(groupConditions({ all: [C1] })).toEqual([C1]);
    expect(groupConditions({ any: [C1, C2] })).toEqual([C1, C2]);
  });

  it('is empty for nothing, an empty group, and an empty list alike', () => {
    expect(groupConditions(undefined)).toEqual([]);
    expect(groupConditions({})).toEqual([]);
    expect(groupConditions({ all: [] })).toEqual([]);
  });
});

describe('isAuthoredGroup', () => {
  it('is true only once a condition exists', () => {
    expect(isAuthoredGroup({ all: [C1] })).toBe(true);
    expect(isAuthoredGroup({ any: [C1] })).toBe(true);
  });

  it('is false for the shapes an untouched editor produces', () => {
    // These are what "opened the card and did nothing" looks like. Committing any of them
    // would give the author a rule card that reads "No conditions yet" forever.
    expect(isAuthoredGroup(undefined)).toBe(false);
    expect(isAuthoredGroup({})).toBe(false);
    expect(isAuthoredGroup({ all: [] })).toBe(false);
    expect(isAuthoredGroup({ any: [] })).toBe(false);
  });
});

describe('sameGroup', () => {
  it('two undefineds are the same', () => {
    expect(sameGroup(undefined, undefined)).toBe(true);
  });

  it('a group is never the same as nothing', () => {
    expect(sameGroup({ all: [C1] }, undefined)).toBe(false);
    expect(sameGroup(undefined, { all: [C1] })).toBe(false);
  });

  it('the same conditions in the same combinator are the same', () => {
    expect(sameGroup({ all: [C1, C2] }, { all: [C1, C2] })).toBe(true);
  });

  it('does not depend on key order, which JSON.stringify would', () => {
    // The baseline is parsed from a stored JSON column and the draft is built by the editor;
    // nothing guarantees the two write `op` and `value` in the same order.
    const a: ConditionalGroup = { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] };
    const b: ConditionalGroup = { all: [{ value: 'vip', op: 'equals', questionId: 'q1' }] };
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(sameGroup(a, b)).toBe(true);
  });

  it('notices a changed combinator, so all -> any counts as an edit', () => {
    expect(sameGroup({ all: [C1] }, { any: [C1] })).toBe(false);
  });

  it('notices a changed operator, value, question and count', () => {
    expect(sameGroup({ all: [C1] }, { all: [{ ...C1, op: 'notEquals' }] })).toBe(false);
    expect(sameGroup({ all: [C1] }, { all: [{ ...C1, value: 'other' }] })).toBe(false);
    expect(sameGroup({ all: [C1] }, { all: [{ ...C1, questionId: 'q2' }] })).toBe(false);
    expect(sameGroup({ all: [C1] }, { all: [C1, C2] })).toBe(false);
  });

  it('compares list values by element, not by identity', () => {
    const a: ConditionalGroup = { all: [{ questionId: 'q1', op: 'in', value: ['a', 'b'] }] };
    const b: ConditionalGroup = { all: [{ questionId: 'q1', op: 'in', value: ['a', 'b'] }] };
    const c: ConditionalGroup = { all: [{ questionId: 'q1', op: 'in', value: ['b', 'a'] }] };
    expect(sameGroup(a, b)).toBe(true);
    expect(sameGroup(a, c)).toBe(false);
  });

  it('distinguishes a missing value from an empty one', () => {
    // `isAnswered` omits value; a text condition mid-typing has ''. Treating them as equal
    // would let a cleared field close without warning.
    const missing: ConditionalGroup = { all: [{ questionId: 'q1', op: 'equals' }] };
    const empty: ConditionalGroup = { all: [{ questionId: 'q1', op: 'equals', value: '' }] };
    expect(sameGroup(missing, empty)).toBe(false);
  });

  it('reads score conditions by source, not only by questionId', () => {
    const byScore: ConditionalGroup = { all: [{ source: 'score', op: 'greaterThan', value: 5 }] };
    const byQuestion: ConditionalGroup = { all: [{ op: 'greaterThan', value: 5 }] };
    expect(sameGroup(byScore, byQuestion)).toBe(false);
  });
});

describe('isDraftCommittable', () => {
  const draft = (over: Partial<RuleDraft> = {}): RuleDraft => ({
    verb: 'show',
    group: { all: [C1] },
    jumpTargetId: null,
    ...over,
  });

  it('a group verb needs one condition and nothing else', () => {
    expect(isDraftCommittable(draft())).toBe(true);
    expect(isDraftCommittable(draft({ group: undefined }))).toBe(false);
    expect(isDraftCommittable(draft({ group: { all: [] } }))).toBe(false);
  });

  it('a jump needs BOTH halves — a target alone persists nothing', () => {
    expect(isDraftCommittable(draft({ verb: 'jump', group: undefined, jumpTargetId: 'p2' }))).toBe(false);
    expect(isDraftCommittable(draft({ verb: 'jump', jumpTargetId: null }))).toBe(false);
    expect(isDraftCommittable(draft({ verb: 'jump', jumpTargetId: 'p2' }))).toBe(true);
  });

  it('an empty target string is no target', () => {
    expect(isDraftCommittable(draft({ verb: 'jump', jumpTargetId: '' }))).toBe(false);
  });

  it('a disqualify still needs a condition — the flag alone screens out everyone', () => {
    expect(isDraftCommittable(draft({ verb: 'disqualify', group: undefined }))).toBe(false);
    expect(isDraftCommittable(draft({ verb: 'disqualify' }))).toBe(true);
  });
});

describe('isDraftDirty', () => {
  const base: RuleDraft = { verb: 'show', group: undefined, jumpTargetId: null };

  it('an untouched card is not dirty, so closing it asks nothing', () => {
    expect(isDraftDirty(base, base)).toBe(false);
  });

  it('a first condition makes it dirty', () => {
    expect(isDraftDirty({ ...base, group: { all: [C1] } }, base)).toBe(true);
  });

  it('editing an existing rule back to its original value is not dirty', () => {
    const saved: RuleDraft = { verb: 'show', group: { all: [C1] }, jumpTargetId: null };
    expect(isDraftDirty({ verb: 'show', group: { all: [{ ...C1 }] }, jumpTargetId: null }, saved)).toBe(false);
  });

  it('a jump target change alone is dirty, even with the same conditions', () => {
    const saved: RuleDraft = { verb: 'jump', group: { all: [C1] }, jumpTargetId: 'p2' };
    expect(isDraftDirty({ ...saved, jumpTargetId: 'p3' }, saved)).toBe(true);
  });

  it('deleting the only condition off a saved rule is dirty', () => {
    const saved: RuleDraft = { verb: 'show', group: { all: [C1] }, jumpTargetId: null };
    expect(isDraftDirty({ ...saved, group: undefined }, saved)).toBe(true);
  });
});
