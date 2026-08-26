import { describe, expect, it } from 'vitest';
import type { AnswerValue, ConditionalRule } from './conditional-rule';
import { MAX_JUMP_RULES } from './conditional-rule';
import type { PublishedFormPage, PublishedFormScreen } from './form-definition';
import {
  resolveDisqualification,
  resolveVisiblePages,
  resolveVisibleQuestions,
} from './rule-verbs';
import type { PublishedFormQuestion } from './form-definition';

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

describe('resolveVisiblePages', () => {
  const jumpTo = (toPageId: string, value = 'skip'): ConditionalRule => ({
    jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value }] }, target: { kind: 'page' as const, id: toPageId } }],
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
          { when: { all: [{ questionId: 'q1', op: 'isAnswered' }] }, target: { kind: 'page' as const, id: 'p3' } },
          { when: { all: [{ questionId: 'q1', op: 'isAnswered' }] }, target: { kind: 'page' as const, id: 'p4' } },
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
      const inert = { when: { all: [{ questionId: 'q1', op: 'equals' as const, value: 'no' }] }, target: { kind: 'page' as const, id: 'p3' } };
      const firing = { when: { all: [{ questionId: 'q1', op: 'equals' as const, value: 'skip' }] }, target: { kind: 'page' as const, id: 'p3' } };
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


describe('an unarmed knockout screen never fires', () => {
  const flagged = (rule?: ConditionalRule): PublishedFormScreen[] => [
    ending('ko', 0, { isDisqualification: true, ...(rule ? { conditionalRule: rule } : {}) }),
  ];

  describe('worst', () => {
    it('an EMPTY condition group disqualifies nobody', () => {
      // `evaluateGroup` is vacuously true on an empty group — correct for `show`, where "no
      // condition" means "always visible", and catastrophic here, where it means "disqualify
      // everyone, before they have answered anything". The guard tested `show !== undefined`,
      // which `{}` satisfies. Unauthorable through the builder, but rules also arrive from
      // mj-sync metadata and the AI form builder, neither of which goes near it.
      for (const empty of [{}, { all: [] }, { any: [] }, { all: [], any: [] }]) {
        expect(resolveDisqualification(flagged({ show: empty }), answers({}))).toBeUndefined();
        expect(resolveDisqualification(flagged({ show: empty }), answers({ q1: 'anything' }))).toBeUndefined();
      }
    });
  });

  describe('edge', () => {
    it('a flag with no rule at all still fires nothing', () => {
      expect(resolveDisqualification(flagged(), answers({ q1: 'x' }))).toBeUndefined();
    });

    it('a rule carrying only OTHER verbs is not armed either', () => {
      // A jump group is a real, populated group — and not this screen's. Arming a knockout off
      // it would disqualify on a condition the author wrote about page order.
      const jumpOnly: ConditionalRule = {
        jump: [{ when: { all: [{ questionId: 'q1', op: 'isAnswered' }] }, target: { kind: 'page' as const, id: 'p2' } }],
      };
      expect(resolveDisqualification(flagged(jumpOnly), answers({ q1: 'x' }))).toBeUndefined();
    });
  });

  describe('happy', () => {
    it('one real condition is all it takes to arm it', () => {
      expect(resolveDisqualification(flagged(whenQ1Equals('No')), answers({ q1: 'No' }))?.id).toBe('ko');
      expect(resolveDisqualification(flagged(whenQ1Equals('No')), answers({ q1: 'Yes' }))).toBeUndefined();
    });
  });
});

describe('resolveVisibleQuestions', () => {
  function question(
    id: string,
    extra?: Partial<PublishedFormQuestion>,
  ): PublishedFormQuestion {
    return { id, type: 'ShortText', prompt: id, isRequired: false, displayOrder: 0, options: [], ...extra };
  }

  function pageWith(id: string, displayOrder: number, questions: PublishedFormQuestion[]): PublishedFormPage {
    return { id, displayOrder, questions };
  }

  describe('happy', () => {
    it('is every answerable question on a reachable page, in document order', () => {
      const pages = [
        pageWith('p2', 1, [question('q3', { displayOrder: 0 })]),
        pageWith('p1', 0, [question('q2', { displayOrder: 1 }), question('q1', { displayOrder: 0 })]),
      ];
      expect(resolveVisibleQuestions(pages, answers({})).map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    });
  });

  describe('edge', () => {
    it('drops a question hidden by its OWN show rule', () => {
      const pages = [
        pageWith('p1', 0, [question('q1'), question('q2', { conditionalRule: whenQ1Equals('Yes') })]),
      ];
      expect(resolveVisibleQuestions(pages, answers({ q1: 'No' })).map((q) => q.id)).toEqual(['q1']);
      expect(resolveVisibleQuestions(pages, answers({ q1: 'Yes' })).map((q) => q.id)).toEqual(['q1', 'q2']);
    });

    it('drops a display-only question — a Statement collects no answer and scores nothing', () => {
      const pages = [pageWith('p1', 0, [question('note', { type: 'Statement' }), question('q1')])];
      expect(resolveVisibleQuestions(pages, answers({})).map((q) => q.id)).toEqual(['note', 'q1'].slice(1));
    });

    it('drops every question on a page the respondent cannot reach', () => {
      const pages = [
        pageWith('p1', 0, [question('q1')]),
        { ...pageWith('p2', 1, [question('q2')]), conditionalRule: whenQ1Equals('Yes') },
      ];
      expect(resolveVisibleQuestions(pages, answers({ q1: 'No' })).map((q) => q.id)).toEqual(['q1']);
    });
  });

  describe('worst', () => {
    it('a stale answer to a now-hidden question does not make it visible again', () => {
      // This is the case the server sees: the request carries an answer for a question the
      // respondent can no longer see. Visibility is decided by the rule, never by the presence
      // of an answer — otherwise a crafted submission re-admits any question it likes.
      const pages = [
        pageWith('p1', 0, [question('q1'), question('q2', { conditionalRule: whenQ1Equals('Yes') })]),
      ];
      expect(resolveVisibleQuestions(pages, answers({ q1: 'No', q2: 'left over' })).map((q) => q.id)).toEqual([
        'q1',
      ]);
    });
  });
});
