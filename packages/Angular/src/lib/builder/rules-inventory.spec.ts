import { describe, expect, it } from 'vitest';
import type { ConditionalRule } from '@mj-biz-apps/forms-entities';
import type { ConditionalSourceQuestion } from './condition-sources';
import { describeCondition } from './rules-panel-model';
import {
  collectRuleEntries,
  endingReachFor,
  ruleBadgesFor,
  type EndingReach,
  type RuleInventoryForm,
} from './rules-inventory';

const SOURCES: ConditionalSourceQuestion[] = [
  { id: 'q1', prompt: 'Ticket type', kind: 'singleChoice', options: [{ label: 'VIP', value: 'vip' }] },
  { id: 'q2', prompt: 'Age', kind: 'number' },
  { id: 'q3', prompt: 'Interests', kind: 'multiSelect', options: [{ label: 'Sports', value: 'sports' }] },
];

const showVip: ConditionalRule = { show: { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] } };

/**
 * `sources` and `pages` must describe the SAME form.
 *
 * They are two views of one thing — the whole form's questions, and those questions in document
 * order — and the builder derives both from one tree, so it cannot produce a form where they
 * disagree. A fixture that did was testing a state that does not exist, and it showed up the
 * moment rules started reporting what they skip: a target present in `sources` but absent from
 * `pages` reads as "resolves fine" to the sentence and "not ahead of the rule" to the reach.
 * Overridden pages therefore top up `sources` with anything they add.
 */
function form(overrides?: Partial<RuleInventoryForm>): RuleInventoryForm {
  const base: RuleInventoryForm = {
    sources: SOURCES,
    pages: [
      { id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type' }] },
      { id: 'p2', label: 'Page 2', questions: [{ id: 'q2', label: 'Age' }] },
    ],
    endings: [],
    ...overrides,
  };
  const known = new Set(base.sources.map((source) => source.id));
  const extra = base.pages
    .flatMap((page) => page.questions)
    .filter((question) => !known.has(question.id))
    .map((question): ConditionalSourceQuestion => ({ id: question.id, prompt: question.label, kind: 'text' }));
  return extra.length > 0 ? { ...base, sources: [...base.sources, ...extra] } : base;
}

describe('describeCondition', () => {
  describe('happy', () => {
    it('reads as a phrase, in the voice of the source it read', () => {
      expect(describeCondition({ questionId: 'q1', op: 'equals', value: 'vip' }, SOURCES)).toBe(
        'Ticket type equals VIP',
      );
      expect(describeCondition({ questionId: 'q3', op: 'in', value: ['sports'] }, SOURCES)).toBe(
        'Interests includes any of Sports',
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
        sentence: 'Show "Age" when Ticket type equals VIP',
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

      expect(entries[0].sentence).toBe('After "Intro", skip to "VIP details" when Ticket type equals VIP');
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
        'Show "Age" when Ticket type equals VIP or Age is greater than 18',
      );
    });
  });

  describe('edge', () => {
    it('says an unconditional Go to never runs, in plain English', () => {
      // REVERSED, deliberately. This used to read "always — applies to everyone", because
      // `evaluateGroup({})` is vacuously TRUE and the resolver obeyed it: a conditionless jump
      // skipped pages for every respondent. It is now REFUSED at the resolver (`hasCondition`
      // in rule-verbs.ts), on the grounds that nobody means "send everybody past this, always"
      // and ignoring is the recoverable direction. The reason for surfacing it is unchanged —
      // the builder cannot author one, but mj-sync metadata and the AI builder both can — and
      // what is surfaced is now the truth about what the respondent will experience.
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
        'After "Intro", skip to "Page 2" never — this rule has no conditions, so it never runs',
      );
      expect(entries[0].broken).toEqual(['no conditions, so it never runs']);
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


describe('an item carrying several Go to rules', () => {
  const twoRules: ConditionalRule = {
    jump: [
      { when: { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] }, target: { kind: 'question', id: 'q2' } },
      { when: { all: [{ questionId: 'q1', op: 'equals', value: 'staff' }] }, target: { kind: 'submit' } },
    ],
  };

  describe('happy', () => {
    it('lists every rule, numbered, in the order they are checked', () => {
      // First-match-wins makes order the semantics. A hub that collapsed them, or listed only
      // the first, would hide the very thing an author most needs to check.
      const entries = collectRuleEntries(
        form({ pages: [{ id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: twoRules }] }] }),
      );

      expect(entries.map((e) => e.sentence)).toEqual([
        'Rule 1: After "Ticket type", skip to "Age" when Ticket type equals VIP',
        'Rule 2: After "Ticket type", submit the form when Ticket type equals staff',
      ]);
      expect(new Set(entries.map((e) => e.id)).size).toBe(2);
    });

    it('does not number a lone rule — it reads as a sentence, not a list entry', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: { jump: [twoRules.jump![0]] } }],
            },
          ],
        }),
      );
      expect(entries[0].sentence).toBe('After "Ticket type", skip to "Age" when Ticket type equals VIP');
    });
  });

  describe('worst', () => {
    it('flags only the broken rule, not its healthy neighbours', () => {
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
                      twoRules.jump![0],
                      { when: { all: [{ questionId: 'q1', op: 'isAnswered' }] }, target: { kind: 'question', id: 'gone' } },
                    ],
                  },
                },
              ],
            },
            // Rule 1 points at "Age", so the form has to actually contain it — otherwise the
            // healthy rule is only healthy because nothing checked where it lands.
            { id: 'p2', label: 'Page 2', questions: [{ id: 'q2', label: 'Age' }] },
          ],
        }),
      );

      expect(entries[0].broken).toEqual([]);
      expect(entries[1].broken).toEqual(['a question that no longer exists']);
    });
  });
});

describe('ruleBadgesFor', () => {
  const jumpToP2: ConditionalRule = {
    jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] }, target: { kind: 'page', id: 'p2' } }],
  };
  const badges = (f: RuleInventoryForm) => ruleBadgesFor(collectRuleEntries(f));

  describe('happy', () => {
    it('says a question is conditional, and says what the condition is', () => {
      const map = badges(
        form({
          pages: [
            { id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: showVip }] },
          ],
        }),
      );
      const [badge] = map.get('q1') ?? [];
      expect(badge.label).toBe('Conditional');
      expect(badge.detail).toContain('Ticket type equals VIP');
      expect(badge.broken).toBe(false);
    });

    it('says a question branches, separately from whether it is conditional', () => {
      const map = badges(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: { ...showVip, ...jumpToP2 } }],
            },
            { id: 'p2', label: 'Page 2', questions: [] },
          ],
        }),
      );
      expect((map.get('q1') ?? []).map((b) => b.label)).toEqual(['Conditional', 'Branches']);
    });

    it('labels a page rule the same way it labels a question rule', () => {
      // A page rule hides every question on it. With the hub gone, the canvas is the only place
      // that could say so.
      const map = badges(form({ pages: [{ id: 'p1', label: 'Page 1', questions: [], conditionalRule: showVip }] }));
      expect((map.get('p1') ?? [])[0]?.label).toBe('Conditional');
    });
  });

  describe('edge', () => {
    it('gives an item with no rules no badge at all', () => {
      expect(badges(form()).get('q1')).toBeUndefined();
    });

    it('collapses several Go to rules into one badge that carries them all', () => {
      // Three badges reading "Branches" says nothing three times. The tooltip is where the
      // order lives, and order is what first-match-wins makes matter.
      const three: ConditionalRule = {
        jump: [
          { when: { all: [{ questionId: 'q1', op: 'equals', value: 'a' }] }, target: { kind: 'page', id: 'p2' } },
          { when: { all: [{ questionId: 'q1', op: 'equals', value: 'b' }] }, target: { kind: 'page', id: 'p2' } },
          { when: { all: [{ questionId: 'q1', op: 'equals', value: 'c' }] }, target: { kind: 'page', id: 'p2' } },
        ],
      };
      const map = badges(
        form({
          pages: [
            { id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: three }] },
            { id: 'p2', label: 'Page 2', questions: [] },
          ],
        }),
      );
      const badge = (map.get('q1') ?? [])[0];
      expect(badge.label).toBe('Branches');
      expect(badge.detail.split('\n')).toHaveLength(3);
    });
  });

  describe('worst', () => {
    it('says a broken rule is broken, in place of saying what it does', () => {
      // THE reason the Rules tab existed: a condition naming a deleted question evaluates
      // false, so the item it guards is hidden from every respondent — permanently, silently,
      // with the form still looking correct. The canvas now carries that warning.
      const map = badges(
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
      const badge = (map.get('q2') ?? [])[0];
      expect(badge.broken).toBe(true);
      expect(badge.label).toBe('Rule is broken');
      expect(badge.detail).toContain('a question that no longer exists');
    });

    it('a rule with two breakages is one badge naming both — the author opens it once', () => {
      // Counting REFERENCES rather than rules would have said "2" about one thing to fix. The
      // badge is per rule for the same reason the old count was: one decision, one line.
      const map = badges(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [],
              conditionalRule: {
                jump: [
                  { when: { all: [{ questionId: 'gone', op: 'isAnswered' }] }, target: { kind: 'page', id: 'nowhere' } },
                ],
              },
            },
          ],
        }),
      );
      const found = map.get('p1') ?? [];
      expect(found).toHaveLength(1);
      expect(found[0].detail).toContain('a question that no longer exists');
      expect(found[0].detail).toContain('a page that no longer exists');
    });

    it('a healthy rule beside a broken one still reads as itself', () => {
      const map = badges(
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
                    show: { all: [{ questionId: 'q2', op: 'isAnswered' }] },
                    jump: [
                      { when: { all: [{ questionId: 'gone', op: 'equals', value: 'x' }] }, target: { kind: 'page', id: 'p2' } },
                    ],
                  },
                },
              ],
            },
            { id: 'p2', label: 'Page 2', questions: [] },
          ],
        }),
      );
      expect((map.get('q1') ?? []).map((b) => [b.label, b.broken])).toEqual([
        ['Conditional', false],
        ['Rule is broken', true],
      ]);
    });
  });
});

/**
 * How a respondent reaches an ending screen — the line the endings list shows above its title.
 *
 * That line used to be derived from the screen ALONE: default, or has a condition, or "Never
 * shown — add a condition". It was right when a condition on the screen was the only way to
 * reach one. A `Go to` rule can now name an ending directly, so a screen an author had
 * deliberately wired up as a rule's destination was labelled unreachable and told to add a
 * condition — advice that is merely unnecessary on an ordinary screen and actively wrong on a
 * screened-out one, where `resolveEndingScreen` never consults the condition at all.
 *
 * Reachability is read off the same `targetedEndings` walk the broken-rule badges use, because a
 * second answer to "which endings does a rule point at" is a second answer that can disagree.
 */
describe('endingReachFor', () => {
  const goToEnding = (id: string): ConditionalRule => ({
    jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] }, target: { kind: 'ending', id } }],
  });

  function withEndings(
    endings: RuleInventoryForm['endings'],
    rule?: ConditionalRule,
  ): Map<string, EndingReach> {
    return endingReachFor(
      form({
        endings,
        pages: [{ id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: rule }] }],
      }),
    );
  }

  describe('happy', () => {
    it('a screen a rule points at is reached by that rule, not unreachable', () => {
      const reach = withEndings([{ id: 'e1', label: 'Thanks' }], goToEnding('e1'));
      expect(reach.get('e1')).toEqual({ label: 'Reached by a rule', unreachable: false });
    });

    it('the default and the conditional ones read as they always did', () => {
      const reach = withEndings([
        { id: 'e0', label: 'Thanks', isDefault: true },
        { id: 'e1', label: 'VIP', conditionalRule: showVip },
      ]);
      expect(reach.get('e0')).toEqual({ label: 'Default ending', unreachable: false });
      expect(reach.get('e1')).toEqual({ label: 'Conditional ending', unreachable: false });
    });

    it('a screen nothing reaches still says so', () => {
      const reach = withEndings([{ id: 'e1', label: 'Orphan' }]);
      expect(reach.get('e1')).toEqual({ label: 'Never shown — add a condition', unreachable: true });
    });
  });

  describe('edge', () => {
    it('a screened-out screen is named for what it is, once a rule sends people there', () => {
      const reach = withEndings([{ id: 'e1', label: 'Not eligible', isDisqualification: true }], goToEnding('e1'));
      expect(reach.get('e1')).toEqual({ label: 'Screened out', unreachable: false });
    });

    it('a page rule counts as a route, the same as a question rule', () => {
      const reach = endingReachFor(
        form({
          endings: [{ id: 'e1', label: 'Thanks' }],
          pages: [{ id: 'p1', label: 'Page 1', conditionalRule: goToEnding('e1'), questions: [] }],
        }),
      );
      expect(reach.get('e1')?.unreachable).toBe(false);
    });
  });

  describe('worst', () => {
    it('an unreached screened-out screen is NOT told to add a condition', () => {
      // Its condition is never read — `resolveEndingScreen` excludes screened-out screens — so
      // "add a condition" sends the author to spend an afternoon on a control that does nothing.
      // What is actually missing is a rule pointing here.
      const reach = withEndings([{ id: 'e1', label: 'Not eligible', isDisqualification: true }]);
      expect(reach.get('e1')).toEqual({
        label: 'Never shown — no rule sends anyone here',
        unreachable: true,
      });
    });

    it('a rule naming a screen that no longer exists reaches nothing', () => {
      const reach = withEndings([{ id: 'e1', label: 'Thanks' }], goToEnding('deleted'));
      expect(reach.get('e1')?.unreachable).toBe(true);
    });
  });
});

/**
 * What a `Go to` rule costs, and whether it can fire — see `jump-reach.ts` for the reasoning.
 *
 * Both facts were unsayable in the builder, and both are silent. A rule that skips four
 * questions reads as a shortcut and behaves as a deletion; a rule whose destination stopped
 * being ahead of it after a drag reads perfectly and does nothing at all.
 */
describe('a Go to rule reports what it passes over', () => {
  const goTo = (target: ConditionalRule['jump'] extends (infer R)[] | undefined ? R['target'] : never): ConditionalRule => ({
    jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] }, target }],
  });

  /** p1: q1 (the rule) q2* q3 · p2: q4 */
  function longForm(rule: ConditionalRule): RuleInventoryForm {
    return form({
      pages: [
        {
          id: 'p1',
          label: 'Page 1',
          questions: [
            { id: 'q1', label: 'Ticket type', conditionalRule: rule },
            { id: 'q2', label: 'Age', isRequired: true },
            { id: 'q3', label: 'Interests' },
          ],
        },
        { id: 'p2', label: 'Page 2', questions: [{ id: 'q4', label: 'Notes' }] },
      ],
    });
  }

  describe('happy', () => {
    it('says how many questions go unasked, and how many were required', () => {
      const entry = collectRuleEntries(longForm(goTo({ kind: 'question', id: 'q4' })))[0];
      expect(entry.note).toBe('Skips 2 questions, 1 of them required');
      expect(entry.broken).toEqual([]);
    });

    it('a jump to Submit passes over the whole rest of the form', () => {
      expect(collectRuleEntries(longForm(goTo({ kind: 'submit' })))[0].note).toBe(
        'Skips 3 questions, 1 of them required',
      );
    });
  });

  describe('edge', () => {
    it('says nothing when the destination is the very next question', () => {
      expect(collectRuleEntries(longForm(goTo({ kind: 'question', id: 'q2' })))[0].note).toBe('');
    });

    it('a show rule has nothing to report — it goes nowhere', () => {
      const entry = collectRuleEntries(
        form({ pages: [{ id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: showVip }] }] }),
      )[0];
      expect(entry.note).toBe('');
    });
  });

  describe('worst', () => {
    it('a destination that is no longer ahead of the rule is broken, not merely quiet', () => {
      // Unauthorable through the picker, which offers forward targets only — this is what a
      // REORDER leaves behind, and the rule still reads perfectly while doing nothing.
      const backward = form({
        pages: [
          {
            id: 'p1',
            label: 'Page 1',
            questions: [
              { id: 'q0', label: 'Name' },
              { id: 'q1', label: 'Ticket type', conditionalRule: goTo({ kind: 'question', id: 'q0' }) },
            ],
          },
        ],
      });
      expect(collectRuleEntries(backward)[0].broken).toEqual([
        'a destination that is no longer ahead of it, so the rule never runs',
      ]);
    });

    it('the badge on the item says the rule is broken', () => {
      const backward = form({
        pages: [
          {
            id: 'p1',
            label: 'Page 1',
            questions: [
              { id: 'q0', label: 'Name' },
              { id: 'q1', label: 'Ticket type', conditionalRule: goTo({ kind: 'question', id: 'q0' }) },
            ],
          },
        ],
      });
      const badge = ruleBadgesFor(collectRuleEntries(backward)).get('q1')?.[0];
      expect(badge?.broken).toBe(true);
    });
  });
});

/**
 * A conditionless rule means opposite things to the two verbs, and the hub has to say so.
 *
 * `evaluateGroup({})` is vacuously true, which is right for a `show` gate — no condition, always
 * visible — and refused for a jump, which now needs at least one condition to run at all (see
 * `hasCondition` in rule-verbs.ts). One sentence for both would be wrong about one of them, and
 * the old one — "always, this rule applies to everyone" — was wrong about the dangerous one.
 */
describe('a rule with no conditions', () => {
  const noConditions = (target: ConditionalRule['jump'] extends (infer R)[] | undefined ? R['target'] : never): ConditionalRule => ({
    jump: [{ when: { all: [] }, target }],
  });

  describe('happy', () => {
    it('a Go to with none says it never runs, and is broken', () => {
      const entries = collectRuleEntries(
        form({
          pages: [
            { id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: noConditions({ kind: 'question', id: 'q2' }) }] },
            { id: 'p2', label: 'Page 2', questions: [{ id: 'q2', label: 'Age' }] },
          ],
        }),
      );
      expect(entries[0].sentence).toContain('never — this rule has no conditions, so it never runs');
      expect(entries[0].broken).toEqual(['no conditions, so it never runs']);
    });
  });

  describe('edge', () => {
    it('a show gate with none still reads as always, and is not broken', () => {
      const entries = collectRuleEntries(
        form({ pages: [{ id: 'p1', label: 'Page 1', questions: [{ id: 'q1', label: 'Ticket type', conditionalRule: { show: { all: [] } } }] }] }),
      );
      expect(entries[0].sentence).toContain('always — this rule has no conditions, so it applies to everyone');
      expect(entries[0].broken).toEqual([]);
    });
  });

  describe('worst', () => {
    it('says the rule never runs rather than what it would have skipped', () => {
      // A count of what a dead rule "skips" describes behaviour no respondent will ever meet,
      // and reads as though the rule is working.
      const entries = collectRuleEntries(
        form({
          pages: [
            {
              id: 'p1',
              label: 'Page 1',
              questions: [
                { id: 'q1', label: 'Ticket type', conditionalRule: noConditions({ kind: 'submit' }) },
                { id: 'q2', label: 'Age', isRequired: true },
              ],
            },
          ],
        }),
      );
      expect(entries[0].note).toBe('');
    });
  });
});
