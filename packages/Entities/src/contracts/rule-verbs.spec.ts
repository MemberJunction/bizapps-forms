import { describe, expect, it } from 'vitest';
import type { AnswerValue, ConditionalRule } from './conditional-rule';
import { MAX_JUMP_RULES } from './conditional-rule';
import type { PublishedFormPage, PublishedFormScreen } from './form-definition';
import { isRequiredNow, resolveDisqualification, resolveVisiblePages } from './rule-verbs';

function answers(record: Record<string, AnswerValue>): Map<string, AnswerValue> {
  return new Map(Object.entries(record));
}

function page(id: string, displayOrder: number, conditionalRule?: ConditionalRule): PublishedFormPage {
  return { id, displayOrder, questions: [], ...(conditionalRule ? { conditionalRule } : {}) };
}

function ending(
  id: string,
  displayOrder: number,
  extra?: Partial<PublishedFormScreen>,
): PublishedFormScreen {
  return { id, screenType: 'Ending', title: id, displayOrder, ...extra };
}

/** `{ show: { all: [ q1 equals <value> ] } }` — the workhorse rule for these specs. */
function whenQ1Equals(value: string): ConditionalRule {
  return { show: { all: [{ questionId: 'q1', op: 'equals', value }] } };
}

describe('isRequiredNow', () => {
  const requireIfOther: ConditionalRule = {
    require: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] },
  };

  describe('happy', () => {
    it('an optional question becomes required when its require group fires', () => {
      const q = { isRequired: false, conditionalRule: requireIfOther };
      expect(isRequiredNow(q, answers({ q1: 'Other' }))).toBe(true);
      expect(isRequiredNow(q, answers({ q1: 'Red' }))).toBe(false);
      expect(isRequiredNow(q, answers({}))).toBe(false);
    });
  });

  describe('edge', () => {
    it('static isRequired stays the stronger promise — a failing group cannot un-require', () => {
      const q = { isRequired: true, conditionalRule: requireIfOther };
      expect(isRequiredNow(q, answers({ q1: 'Red' }))).toBe(true);
    });

    it('a rule with only a show group adds no requiredness', () => {
      const q = { isRequired: false, conditionalRule: whenQ1Equals('Other') };
      expect(isRequiredNow(q, answers({ q1: 'Other' }))).toBe(false);
    });
  });

  describe('worst', () => {
    it('a require group naming an unknown question never fires', () => {
      const q = {
        isRequired: false,
        conditionalRule: { require: { all: [{ questionId: 'gone', op: 'isAnswered' as const }] } },
      };
      expect(isRequiredNow(q, answers({ q1: 'x' }))).toBe(false);
    });

    it('no rule at all means exactly the static flag', () => {
      expect(isRequiredNow({ isRequired: false }, answers({}))).toBe(false);
      expect(isRequiredNow({ isRequired: true }, answers({}))).toBe(true);
    });
  });
});

describe('resolveVisiblePages', () => {
  const jumpTo = (toPageId: string, value = 'skip'): ConditionalRule => ({
    jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value }] }, toPageId }],
  });

  describe('happy', () => {
    it('a fired jump drops every page strictly between source and target', () => {
      const pages = [page('p1', 0, jumpTo('p4')), page('p2', 1), page('p3', 2), page('p4', 3)];
      expect(resolveVisiblePages(pages, answers({ q1: 'skip' })).map((p) => p.id)).toEqual(['p1', 'p4']);
      expect(resolveVisiblePages(pages, answers({ q1: 'stay' })).map((p) => p.id)).toEqual([
        'p1',
        'p2',
        'p3',
        'p4',
      ]);
    });

    it('show-hidden pages are dropped exactly as before jumps existed', () => {
      const pages = [page('p1', 0), page('p2', 1, whenQ1Equals('yes'))];
      expect(resolveVisiblePages(pages, answers({})).map((p) => p.id)).toEqual(['p1']);
      expect(resolveVisiblePages(pages, answers({ q1: 'yes' })).map((p) => p.id)).toEqual(['p1', 'p2']);
    });
  });

  describe('edge', () => {
    it('a jump to the very next page is a no-op', () => {
      const pages = [page('p1', 0, jumpTo('p2')), page('p2', 1)];
      expect(resolveVisiblePages(pages, answers({ q1: 'skip' })).map((p) => p.id)).toEqual(['p1', 'p2']);
    });

    it('the first matching jump rule wins', () => {
      const both: ConditionalRule = {
        jump: [
          { when: { all: [{ questionId: 'q1', op: 'isAnswered' }] }, toPageId: 'p3' },
          { when: { all: [{ questionId: 'q1', op: 'isAnswered' }] }, toPageId: 'p4' },
        ],
      };
      const pages = [page('p1', 0, both), page('p2', 1), page('p3', 2), page('p4', 3)];
      expect(resolveVisiblePages(pages, answers({ q1: 'x' })).map((p) => p.id)).toEqual(['p1', 'p3', 'p4']);
    });

    it('a jump target hidden by its own show rule stays hidden — jumping skips, it does not force', () => {
      const pages = [page('p1', 0, jumpTo('p3')), page('p2', 1), page('p3', 2, whenQ1Equals('never'))];
      expect(resolveVisiblePages(pages, answers({ q1: 'skip' })).map((p) => p.id)).toEqual(['p1']);
    });

    it('a skipped-over page cannot jump — its rules are never consulted', () => {
      const pages = [
        page('p1', 0, jumpTo('p3')),
        page('p2', 1, jumpTo('p4')), // would fire on the same answer, but p2 is skipped
        page('p3', 2),
        page('p4', 3),
      ];
      expect(resolveVisiblePages(pages, answers({ q1: 'skip' })).map((p) => p.id)).toEqual(['p1', 'p3', 'p4']);
    });

    it('pages resolve in display order, whatever the array order', () => {
      const pages = [page('p2', 1), page('p1', 0)];
      expect(resolveVisiblePages(pages, answers({})).map((p) => p.id)).toEqual(['p1', 'p2']);
    });
  });

  describe('worst', () => {
    it('backward, self, and unknown targets are inert — never an exception, never a loop', () => {
      for (const target of ['p1', 'p2', 'nowhere']) {
        const pages = [page('p1', 0), page('p2', 1, jumpTo(target)), page('p3', 2)];
        expect(resolveVisiblePages(pages, answers({ q1: 'skip' })).map((p) => p.id)).toEqual([
          'p1',
          'p2',
          'p3',
        ]);
      }
    });

    it('every page hidden yields an empty list, not a crash', () => {
      const pages = [page('p1', 0, whenQ1Equals('never')), page('p2', 1, whenQ1Equals('never'))];
      expect(resolveVisiblePages(pages, answers({}))).toEqual([]);
    });

    it(`jump rules beyond the cap of ${MAX_JUMP_RULES} are ignored`, () => {
      const inert = { when: { all: [{ questionId: 'q1', op: 'equals' as const, value: 'no' }] }, toPageId: 'p3' };
      const firing = { when: { all: [{ questionId: 'q1', op: 'equals' as const, value: 'skip' }] }, toPageId: 'p3' };
      const rule: ConditionalRule = { jump: [...Array.from({ length: MAX_JUMP_RULES }, () => inert), firing] };
      const pages = [page('p1', 0, rule), page('p2', 1), page('p3', 2)];
      // The firing rule is the 11th — over the cap, so it must NOT fire.
      expect(resolveVisiblePages(pages, answers({ q1: 'skip' })).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    });
  });
});

describe('resolveDisqualification', () => {
  const failingAnswer = whenQ1Equals('fail');

  describe('happy', () => {
    it('fires on the matching armed screen', () => {
      const dq = ending('dq', 0, { isDisqualification: true, conditionalRule: failingAnswer });
      expect(resolveDisqualification([dq], answers({ q1: 'fail' }))?.id).toBe('dq');
      expect(resolveDisqualification([dq], answers({ q1: 'pass' }))).toBeUndefined();
      expect(resolveDisqualification([dq], answers({}))).toBeUndefined();
    });
  });

  describe('edge', () => {
    it('two matching disqualifications: display order wins, matching resolveEndingScreen', () => {
      const second = ending('second', 5, { isDisqualification: true, conditionalRule: failingAnswer });
      const first = ending('first', 1, { isDisqualification: true, conditionalRule: failingAnswer });
      expect(resolveDisqualification([second, first], answers({ q1: 'fail' }))?.id).toBe('first');
    });

    it('the flag without a rule never fires — a rule is what arms it', () => {
      const flagOnly = ending('dq', 0, { isDisqualification: true });
      expect(resolveDisqualification([flagOnly], answers({ q1: 'fail' }))).toBeUndefined();
    });
  });

  describe('worst', () => {
    it('an ordinary conditional ending never disqualifies, however well it matches', () => {
      const plain = ending('plain', 0, { conditionalRule: failingAnswer });
      expect(resolveDisqualification([plain], answers({ q1: 'fail' }))).toBeUndefined();
    });

    it('no screens at all is simply no disqualification', () => {
      expect(resolveDisqualification([], answers({ q1: 'fail' }))).toBeUndefined();
    });
  });
});
