import { describe, expect, it } from 'vitest';
import type { ConditionalRule } from '@mj-biz-apps/forms-entities';
import type { ConditionalSourceQuestion } from './condition-sources';
import { describeCondition } from './rules-panel-model';
import {
  brokenRuleCount,
  collectRuleEntries,
  groupEntriesByPage,
  type RuleInventoryForm,
} from './rules-inventory';

const SOURCES: ConditionalSourceQuestion[] = [
  { id: 'q1', prompt: 'Ticket type', kind: 'singleChoice', options: [{ label: 'VIP', value: 'vip' }] },
  { id: 'q2', prompt: 'Age', kind: 'number' },
  { id: 'q3', prompt: 'Interests', kind: 'multiSelect', options: [{ label: 'Sports', value: 'sports' }] },
];

const showVip: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] } };

function form(overrides?: Partial<RuleInventoryForm>): RuleInventoryForm {
  return {
    sources: SOURCES,
    pages: [
      { id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type' }] },
      { id: 'p2', label: 'Page 2', questions: [{ id: 'q2', label: 'Age' }] },
    ],
    endings: [],
    ...overrides,
  };
}

describe('describeCondition', () => {
  describe('happy', () => {
    it('reads as a phrase, in the voice of the source it read', () => {
      expect(describeCondition({ questionId: 'q1', op: 'equals', value: 'vip' }, SOURCES)).toBe(
        'Ticket type equals vip',
      );
      expect(describeCondition({ questionId: 'q3', op: 'in', value: ['sports'] }, SOURCES)).toBe(
        'Interests includes any of sports',
      );
    });

    it('omits the value for the operators that take none', () => {
      expect(describeCondition({ questionId: 'q2', op: 'isAnswered' }, SOURCES)).toBe('Age is answered');
    });

    it('names the running score rather than a question', () => {
      expect(describeCondition({ source: 'score', op: 'greaterThan', value: 70 }, SOURCES)).toBe(
        'Total score is greater than 70',
      );
    });
  });

  describe('worst', () => {
    it('says a deleted question is deleted instead of vanishing', () => {
      // A summary that hides the breakage is how a dead rule survives unnoticed — and a show
      // rule on a deleted source evaluates false, hiding the item from EVERYONE, silently.
      expect(describeCondition({ questionId: 'gone', op: 'equals', value: 'x' }, SOURCES)).toBe(
        '(deleted question) equals x',
      );
    });
  });
});

describe('collectRuleEntries', () => {
  describe('happy', () => {
    it('reads a question show rule as one full sentence', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [{ id: 'q2', label: 'Age', conditionalRule: showVip }],
            },
          ],
        }),
      );

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        itemKind: 'question',
        itemId: 'q2',
        pageId: 'p1',
        verb: 'show',
        sentence: 'Show "Age" when Ticket type equals vip',
        broken: [],
      });
    });

    it('reads a page jump as where it goes and on what', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Intro',
              questions: [],
              conditionalRule: {
                jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] }, target: { kind: 'page', id: 'p2' } }],
              },
            },
            { id: 'p2', label: 'VIP details', questions: [] },
          ],
        }),
      );

      expect(entries[0].sentence).toBe('After "Intro", skip to "VIP details" when Ticket type equals vip');
    });

    it('says what a screened-out ending IS, and that its own condition is ignored', () => {
      // `resolveEndingScreen` excludes flagged screens, so a show rule on one is never
      // consulted — a fact worth saying out loud, because the author wrote that condition.
      const entries = collectRuleEntries(
        form({
          endings: [{ id: 's1', label: 'Not eligible', isDisqualification: true, conditionalRule: showVip }],
        }),
      );

      expect(entries[0]).toMatchObject({
        itemKind: 'ending',
        sentence: 'Record "Not eligible" as screened out (its own condition is ignored)',
      });
      expect(entries[0].broken).toContain('nothing — no rule sends anyone to this screen');
    });

    it('does not flag a screened-out ending that a Go to rule actually targets', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [
                {
                  id: 'q1',
                  label: 'Ticket type',
                  conditionalRule: {
                    jump: [
                      {
                        when: { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] },
                        target: { kind: 'ending', id: 's1' },
                      },
                    ],
                  },
                },
              ],
            },
          ],
          endings: [{ id: 's1', label: 'Not eligible', isDisqualification: true }],
        }),
      );

      const endingRow = entries.find((e) => e.itemKind === 'ending');
      expect(endingRow?.broken).toEqual([]);
    });

    it('spells out EVERY condition, joined by the combinator word', () => {
      // The rail summary truncates to "+2 more" because it is one line in a 300px column. The
      // hub exists to be the place where a rule is read in full; truncating here would leave no
      // screen anywhere that shows the whole rule.
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [
                {
                  id: 'q2',
                  label: 'Age',
                  conditionalRule: {
                    show: {
                      any: [
                        { questionId: 'q1', op: 'equals', value: 'vip' },
                        { questionId: 'q2', op: 'greaterThan', value: 18 },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        }),
      );

      expect(entries[0].sentence).toBe(
        'Show "Age" when Ticket type equals vip or Age is greater than 18',
      );
    });
  });

  describe('edge', () => {
    it('says an unconditional rule applies to everyone, in plain English', () => {
      // `evaluateGroup({})` is vacuously TRUE, so a rule with no conditions fires for every
      // respondent. The builder's Done button refuses to author one, but mj-sync metadata and
      // the AI builder both can, and a jump that always fires silently skips pages for
      // everyone — which is precisely the kind of rule this tab exists to surface.
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Intro',
              questions: [],
              conditionalRule: { jump: [{ when: {}, target: { kind: 'page', id: 'p2' } }] },
            },
            { id: 'p2', label: 'Page 2', questions: [] },
          ],
        }),
      );

      expect(entries[0].sentence).toBe(
        'After "Intro", skip to "Page 2" always — this rule has no conditions, so it applies to everyone',
      );
    });

    it('is empty for a form with no rules at all', () => {
      expect(collectRuleEntries(form())).toEqual([]);
    });

    it('keeps page order, and lists a page rule before that page\u2019s questions', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            { id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: showVip }] },
            { id: 'p2', label: 'Page 2', conditionalRule: showVip, questions: [{ id: 'q2', label: 'Age', conditionalRule: showVip }] },
          ],
        }),
      );

      expect(entries.map((e) => [e.pageId, e.itemKind, e.itemId])).toEqual([
        ['p1', 'question', 'q1'],
        ['p2', 'page', 'p2'],
        ['p2', 'question', 'q2'],
      ]);
    });

    it('gives every entry a distinct id, so one page can carry two verbs', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [],
              conditionalRule: {
                ...showVip,
                jump: [{ when: { all: [{ questionId: 'q1', op: 'isAnswered' }] }, target: { kind: 'page', id: 'p2' } }],
              },
            },
            { id: 'p2', label: 'Page 2', questions: [] },
          ],
        }),
      );

      expect(entries).toHaveLength(2);
      expect(new Set(entries.map((e) => e.id)).size).toBe(2);
    });
  });

  describe('worst', () => {
    it('flags a rule whose source question no longer exists', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [
                {
                  id: 'q2',
                  label: 'Age',
                  conditionalRule: { show: { all: [{ questionId: 'gone', op: 'equals', value: 'x' }] } },
                },
              ],
            },
          ],
        }),
      );

      // This is THE silent failure the hub exists for: the condition is NOT_EVALUABLE, so the
      // show rule is false, so "Age" is hidden from every respondent with nothing anywhere
      // saying why.
      expect(entries[0].broken).toEqual(['a question that no longer exists']);
    });

    it('flags a jump pointing at a page that no longer exists', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [],
              conditionalRule: {
                jump: [{ when: { all: [{ questionId: 'q1', op: 'isAnswered' }] }, target: { kind: 'page', id: 'gone' } }],
              },
            },
          ],
        }),
      );

      expect(entries[0].broken).toEqual(['a page that no longer exists']);
    });

    it('reports both breakages when a rule has both', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [],
              conditionalRule: {
                jump: [{ when: { all: [{ questionId: 'gone', op: 'isAnswered' }] }, target: { kind: 'page', id: 'nowhere' } }],
              },
            },
          ],
        }),
      );

      expect(entries[0].broken).toHaveLength(2);
    });
  });
});

describe('groupEntriesByPage', () => {
  const PAGES = [
    { id: 'p1', label: 'Page 1' },
    { id: 'p2', label: 'Page 2' },
  ];

  function entriesFor(): ReturnType<typeof collectRuleEntries> {
    return collectRuleEntries(
      form({
        pages: [
          { id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: showVip }] },
          { id: 'p2', label: 'Page 2', questions: [{ id: 'q2', label: 'Age', conditionalRule: showVip }] },
        ],
        endings: [{ id: 's1', label: 'Thanks', conditionalRule: showVip }],
      }),
    );
  }

  describe('happy', () => {
    it('groups by page, in page order, and puts the endings last', () => {
      // Miller: a flat list of every rule on a long form is a wall. Grouped by the page the
      // respondent meets them on, each group is small enough to hold in one look.
      const groups = groupEntriesByPage(entriesFor(), PAGES);
      expect(groups.map((g) => g.label)).toEqual(['Page 1', 'Page 2', 'Ending screens']);
      expect(groups.map((g) => g.entries.length)).toEqual([1, 1, 1]);
    });
  });

  describe('edge', () => {
    it('omits a page that carries no rules rather than showing an empty group', () => {
      const groups = groupEntriesByPage(
        collectRuleEntries(
          form({
            pages: [
              { id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: showVip }] },
              { id: 'p2', label: 'Page 2', questions: [{ id: 'q2', label: 'Age' }] },
            ],
          }),
        ),
        PAGES,
      );
      expect(groups.map((g) => g.label)).toEqual(['Page 1']);
    });

    it('is empty for a form with no rules', () => {
      expect(groupEntriesByPage([], PAGES)).toEqual([]);
    });
  });

  describe('worst', () => {
    it('counts the broken rules across the whole form, for the tab badge', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [
                { id: 'q2', label: 'Age', conditionalRule: { show: { all: [{ questionId: 'gone', op: 'isAnswered' }] } } },
                { id: 'q1', label: 'Ticket type', conditionalRule: showVip },
              ],
            },
          ],
        }),
      );
      expect(brokenRuleCount(entries)).toBe(1);
    });

    it('counts a rule with two breakages once — the author opens it once', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [],
              conditionalRule: {
                jump: [{ when: { all: [{ questionId: 'gone', op: 'isAnswered' }] }, target: { kind: 'page', id: 'nowhere' } }],
              },
            },
          ],
        }),
      );
      expect(entries[0].broken).toHaveLength(2);
      expect(brokenRuleCount(entries)).toBe(1);
    });
  });
});
