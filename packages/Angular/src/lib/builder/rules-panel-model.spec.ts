import { describe, expect, it } from 'vitest';
import type { ConditionalRule } from '@mj-biz-apps/forms-entities';
import type { ConditionalSourceQuestion } from './condition-sources';
import { describeCondition, groupConditions, verbGroup, withVerbGroup } from './rules-panel-model';

const SOURCES: ConditionalSourceQuestion[] = [
  { id: 'q1', prompt: 'Ticket type', kind: 'singleChoice', options: [{ label: 'VIP', value: 'vip' }] },
  { id: 'q2', prompt: 'Company size', kind: 'number' },
  { id: 'q3', prompt: 'Interests', kind: 'multiSelect', options: [{ label: 'Sports', value: 'sports' }] },
];

const showVip: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] } };

describe('verbGroup', () => {
  it('reads the group a verb holds', () => {
    expect(verbGroup(showVip, 'show')).toEqual(showVip.show);
    expect(verbGroup(undefined, 'show')).toBeUndefined();
    expect(verbGroup({}, 'show')).toBeUndefined();
  });

  it('is undefined for a LIST-valued verb rather than returning the array', () => {
    // `jump` is an array, not a group. Handing one back typed as a group would put an array
    // where a caller expects `{all|any}` and fail somewhere far from here.
    const withJump: ConditionalRule = {
      jump: [{ when: { all: [{ questionId: 'q1', op: 'isAnswered' }] }, target: { kind: 'submit' } }],
    };
    expect(verbGroup(withJump, 'jump')).toBeUndefined();
  });
});

describe('withVerbGroup', () => {
  describe('happy', () => {
    it('sets a group', () => {
      expect(withVerbGroup(undefined, 'show', showVip.show)).toEqual(showVip);
    });

    it('removes a group', () => {
      expect(withVerbGroup(showVip, 'show', undefined)).toBeUndefined();
    });
  });

  describe('edge', () => {
    it('leaves the other verbs standing when one is removed', () => {
      const both: ConditionalRule = {
        ...showVip,
        jump: [{ when: { all: [{ questionId: 'q1', op: 'isAnswered' }] }, target: { kind: 'submit' } }],
      };
      expect(withVerbGroup(both, 'show', undefined)).toEqual({ jump: both.jump });
    });
  });

  describe('worst', () => {
    it('collapses an emptied rule to undefined, never to {}', () => {
      // An empty rule object serializes as a phantom "has a rule" marker every consumer then has
      // to see through.
      expect(withVerbGroup({ show: {} }, 'show', undefined)).toBeUndefined();
    });
  });
});

describe('groupConditions', () => {
  it('reads either combinator, and treats every empty shape alike', () => {
    expect(groupConditions({ all: [{ questionId: 'q1', op: 'isAnswered' }] })).toHaveLength(1);
    expect(groupConditions({ any: [{ questionId: 'q1', op: 'isAnswered' }] })).toHaveLength(1);
    for (const empty of [undefined, {}, { all: [] }, { any: [] }]) {
      expect(groupConditions(empty)).toEqual([]);
    }
  });
});

describe('describeCondition speaks in the voice of the source it read', () => {
  describe('happy', () => {
    it('names the question, the operator and the value', () => {
      expect(describeCondition({ questionId: 'q1', op: 'equals', value: 'vip' }, SOURCES)).toBe(
        'Ticket type equals vip',
      );
    });

    it('reads a membership condition on a multi-select as "includes"', () => {
      // The summary and the operator dropdown must name the same operator the same way — an
      // author who picked "includes any of" and reads back "is one of" has to work out whether
      // the rule changed under them.
      expect(describeCondition({ questionId: 'q3', op: 'in', value: ['sports'] }, SOURCES)).toBe(
        'Interests includes any of sports',
      );
    });

    it('keeps the canonical wording on a single-answer source', () => {
      expect(describeCondition({ questionId: 'q1', op: 'in', value: ['vip'] }, SOURCES)).toBe(
        'Ticket type is one of vip',
      );
    });
  });

  describe('edge', () => {
    it('omits the value for operators that take none', () => {
      expect(describeCondition({ questionId: 'q2', op: 'isAnswered' }, SOURCES)).toBe('Company size is answered');
    });

    it('names the running score rather than a question', () => {
      expect(describeCondition({ source: 'score', op: 'greaterThan', value: 70 }, SOURCES)).toBe(
        'Total score is greater than 70',
      );
    });

    it('joins a list value so a membership condition reads as one phrase', () => {
      expect(describeCondition({ questionId: 'q1', op: 'in', value: ['vip', 'staff'] }, SOURCES)).toBe(
        'Ticket type is one of vip, staff',
      );
    });
  });

  describe('worst', () => {
    it('says a deleted question is deleted instead of vanishing', () => {
      // A summary that hides the breakage is how a dead rule survives unnoticed — and a show
      // rule on a deleted source evaluates false, hiding the item from EVERYONE.
      expect(describeCondition({ questionId: 'gone', op: 'equals', value: 'x' }, SOURCES)).toBe(
        '(deleted question) equals x',
      );
    });
  });
});
