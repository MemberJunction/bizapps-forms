import { describe, expect, it } from 'vitest';
import type { ConditionalRule } from '@mj-biz-apps/forms-entities';
import {
  QUESTION_RULE_CARDS,
  activeCards,
  summarizeGroup,
  verbGroup,
  withVerbGroup,
} from './rules-panel-model';
import type { ConditionalSourceQuestion } from './condition-sources';

const SOURCES: ConditionalSourceQuestion[] = [
  { id: 'q1', prompt: 'Ticket type?', options: [{ label: 'VIP', value: 'vip' }] },
  { id: 'q2', prompt: 'Company size?' },
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
