/**
 * Question-level branching (plans/QUESTION_LEVEL_LOGIC_PLAN.md Phase 1).
 *
 * A `Go to` rule can now sit on a QUESTION and point at a later question, a later page, an
 * ending screen or Submit. Page visibility, question visibility and termination all fall out of
 * ONE forward walk, because three things have to agree about the set of questions on screen and
 * two of them are on opposite sides of the wire.
 */
import { describe, expect, it } from 'vitest';
import type { AnswerValue, ConditionalRule } from './conditional-rule';
import type { PublishedFormPage, PublishedFormQuestion, PublishedFormScreen } from './form-definition';
import {
  resolveFormOutcome,
  resolveTermination,
  resolveVisiblePages,
  resolveVisibleQuestions,
} from './rule-verbs';

function answers(record: Record<string, AnswerValue>): Map<string, AnswerValue> {
  return new Map(Object.entries(record));
}

function q(id: string, displayOrder: number, extra?: Partial<PublishedFormQuestion>): PublishedFormQuestion {
  return { id, type: 'ShortText', prompt: id, isRequired: false, displayOrder, options: [], ...extra };
}

function page(id: string, displayOrder: number, questions: PublishedFormQuestion[], rule?: ConditionalRule): PublishedFormPage {
  return { id, displayOrder, questions, ...(rule ? { conditionalRule: rule } : {}) };
}

/** `Go to <target>` when q1 answers `value`. */
function goTo(target: ConditionalRule['jump'] extends (infer R)[] | undefined ? R['target'] : never, value = 'skip'): ConditionalRule {
  return { jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value }] }, target }] };
}

const toQ = (id: string, value?: string) => goTo({ kind: 'question', id }, value);
const toPage = (id: string, value?: string) => goTo({ kind: 'page', id }, value);
const toEnding = (id: string, value?: string) => goTo({ kind: 'ending', id }, value);
const toSubmit = (value?: string) => goTo({ kind: 'submit' }, value);

const ids = (qs: readonly PublishedFormQuestion[]) => qs.map((x) => x.id);

describe('a Go to rule on a question', () => {
  describe('happy', () => {
    it('hides the questions between it and its target', () => {
      const pages = [page('p1', 0, [q('q1', 0, { conditionalRule: toQ('q4') }), q('q2', 1), q('q3', 2), q('q4', 3)])];

      expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'skip' })))).toEqual(['q1', 'q4']);
      expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'stay' })))).toEqual(['q1', 'q2', 'q3', 'q4']);
    });

    it('reaches a target on a later page, taking the pages between with it', () => {
      const pages = [
        page('p1', 0, [q('q1', 0, { conditionalRule: toQ('q4') })]),
        page('p2', 1, [q('q2', 0), q('q3', 1)]),
        page('p3', 2, [q('q4', 0)]),
      ];

      expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'skip' })))).toEqual(['q1', 'q4']);
      // p2 held nothing else, so it is gone — an empty section header is not a page.
      expect(resolveVisiblePages(pages, answers({ q1: 'skip' })).map((p) => p.id)).toEqual(['p1', 'p3']);
    });

    it('keeps the target page visible even though its header was jumped past', () => {
      // The jump lands on q4, which is INSIDE p3, so p3's own stop is skipped. A question
      // rendering on a page the renderer thinks is hidden is the worst of both worlds.
      const pages = [
        page('p1', 0, [q('q1', 0, { conditionalRule: toQ('q4') })]),
        page('p2', 1, [q('q2', 0)]),
        page('p3', 2, [q('q3', 0), q('q4', 1)]),
      ];

      expect(resolveVisiblePages(pages, answers({ q1: 'skip' })).map((p) => p.id)).toEqual(['p1', 'p3']);
      expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'skip' })))).toEqual(['q1', 'q4']);
    });
  });

  describe('edge', () => {
    it('a page jump still works, unchanged', () => {
      const pages = [
        page('p1', 0, [q('q1', 0)], toPage('p3')),
        page('p2', 1, [q('q2', 0)]),
        page('p3', 2, [q('q3', 0)]),
      ];
      expect(resolveVisiblePages(pages, answers({ q1: 'skip' })).map((p) => p.id)).toEqual(['p1', 'p3']);
    });

    it('a jump target hidden by its own show rule stays hidden — jumping skips, it does not force', () => {
      const pages = [
        page('p1', 0, [
          q('q1', 0, { conditionalRule: toQ('q3') }),
          q('q2', 1),
          q('q3', 2, { conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'never' }] } } }),
        ]),
      ];
      expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'skip' })))).toEqual(['q1']);
    });

    it('a jumped-over question cannot jump — its rules are never consulted', () => {
      const pages = [
        page('p1', 0, [
          q('q1', 0, { conditionalRule: toQ('q3') }),
          q('q2', 1, { conditionalRule: toQ('q4') }), // would fire, but q2 is skipped
          q('q3', 2),
          q('q4', 3),
        ]),
      ];
      expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'skip' })))).toEqual(['q1', 'q3', 'q4']);
    });
  });

  describe('worst', () => {
    it('backward, self and unknown targets are inert — never an exception, never a loop', () => {
      for (const target of ['q1', 'q2', 'nowhere']) {
        const pages = [
          page('p1', 0, [q('q1', 0), q('q2', 1, { conditionalRule: toQ(target) }), q('q3', 2)]),
        ];
        expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'skip' })))).toEqual(['q1', 'q2', 'q3']);
      }
    });

    it('a Statement can be jumped over, and is never counted as answerable', () => {
      const pages = [
        page('p1', 0, [
          q('q1', 0, { conditionalRule: toQ('q3') }),
          q('note', 1, { type: 'Statement' }),
          q('q3', 2),
        ]),
      ];
      expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'skip' })))).toEqual(['q1', 'q3']);
      expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'stay' })))).toEqual(['q1', 'q3']);
    });
  });
});

describe('resolveTermination', () => {
  describe('happy', () => {
    it('reports the ending a fired ending-jump names', () => {
      const pages = [page('p1', 0, [q('q1', 0, { conditionalRule: toEnding('s-no') }), q('q2', 1)])];
      expect(resolveTermination(pages, answers({ q1: 'skip' }))).toEqual({ kind: 'ending', id: 's-no' });
    });

    it('reports a submit target, which names no screen', () => {
      const pages = [page('p1', 0, [q('q1', 0, { conditionalRule: toSubmit() }), q('q2', 1)])];
      expect(resolveTermination(pages, answers({ q1: 'skip' }))).toEqual({ kind: 'submit' });
    });

    it('is undefined when nothing terminal fired', () => {
      const pages = [page('p1', 0, [q('q1', 0, { conditionalRule: toEnding('s-no') }), q('q2', 1)])];
      expect(resolveTermination(pages, answers({ q1: 'stay' }))).toBeUndefined();
    });
  });

  describe('edge', () => {
    it('stops the form there — nothing after a termination is visible', () => {
      const pages = [
        page('p1', 0, [q('q1', 0, { conditionalRule: toEnding('s-no') }), q('q2', 1)]),
        page('p2', 1, [q('q3', 0)]),
      ];
      expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'skip' })))).toEqual(['q1']);
      expect(resolveVisiblePages(pages, answers({ q1: 'skip' })).map((p) => p.id)).toEqual(['p1']);
    });

    it('a page-level rule can terminate too', () => {
      const pages = [page('p1', 0, [q('q1', 0)], toEnding('s-no')), page('p2', 1, [q('q2', 0)])];
      expect(resolveTermination(pages, answers({ q1: 'skip' }))).toEqual({ kind: 'ending', id: 's-no' });
    });
  });

  describe('worst', () => {
    it('the FIRST termination reached wins, not the last authored', () => {
      const pages = [
        page('p1', 0, [
          q('q1', 0, { conditionalRule: toEnding('s-first') }),
          q('q2', 1, { conditionalRule: toEnding('s-second') }),
        ]),
      ];
      expect(resolveTermination(pages, answers({ q1: 'skip' }))).toEqual({ kind: 'ending', id: 's-first' });
    });

    it('a termination inside a jumped-over region never fires', () => {
      const pages = [
        page('p1', 0, [
          q('q1', 0, { conditionalRule: toQ('q3') }),
          q('q2', 1, { conditionalRule: toEnding('s-no') }),
          q('q3', 2),
        ]),
      ];
      expect(resolveTermination(pages, answers({ q1: 'skip' }))).toBeUndefined();
    });

    it('an ending target naming nothing real still terminates — the screen resolver decides', () => {
      // Inertness is for FORWARD-ORDER violations. A terminal target has no ordering to break,
      // so a dangling screen id must still stop the form: continuing would ask questions the
      // author had decided this respondent should not see.
      const pages = [page('p1', 0, [q('q1', 0, { conditionalRule: toEnding('gone') }), q('q2', 1)])];
      expect(resolveTermination(pages, answers({ q1: 'skip' }))).toEqual({ kind: 'ending', id: 'gone' });
    });
  });
});

describe('resolveFormOutcome', () => {
  function ending(id: string, displayOrder: number, extra?: Partial<PublishedFormScreen>): PublishedFormScreen {
    return { id, screenType: 'Ending', title: id, displayOrder, ...extra };
  }

  const thanks = ending('thanks', 1, { isDefault: true });
  const notEligible = ending('not-eligible', 0, { isDisqualification: true });

  describe('happy', () => {
    it('a Go to naming a disqualifying screen ends the form AND disqualifies', () => {
      const pages = [page('p1', 0, [q('q1', 0, { conditionalRule: toEnding('not-eligible') }), q('q2', 1)])];

      expect(resolveFormOutcome(pages, [notEligible, thanks], answers({ q1: 'skip' }))).toEqual({
        screen: notEligible,
        disqualified: true,
        endedEarly: true,
      });
    });

    it('a Go to naming an ordinary screen ends the form as a COMPLETION', () => {
      // The whole point of decision 4: the rule says where to go, the screen says what arriving
      // means. An unflagged screen is a normal finish — quota counts it, automations fire.
      const pages = [page('p1', 0, [q('q1', 0, { conditionalRule: toEnding('thanks') }), q('q2', 1)])];

      expect(resolveFormOutcome(pages, [notEligible, thanks], answers({ q1: 'skip' }))).toEqual({
        screen: thanks,
        disqualified: false,
        endedEarly: true,
      });
    });

    it('a Go to Submit ends the form and lets the ending resolver pick', () => {
      const pages = [page('p1', 0, [q('q1', 0, { conditionalRule: toSubmit() }), q('q2', 1)])];

      expect(resolveFormOutcome(pages, [notEligible, thanks], answers({ q1: 'skip' }))).toEqual({
        screen: thanks,
        disqualified: false,
        endedEarly: true,
      });
    });
  });

  describe('edge', () => {
    it('with nothing terminal fired, it is the ordinary end-of-form answer', () => {
      const pages = [page('p1', 0, [q('q1', 0, { conditionalRule: toEnding('not-eligible') })])];

      expect(resolveFormOutcome(pages, [notEligible, thanks], answers({ q1: 'stay' }))).toEqual({
        screen: thanks,
        disqualified: false,
        endedEarly: false,
      });
    });

    it('never picks a disqualifying screen as the ordinary ending', () => {
      // `resolveEndingScreen` excludes them, and it must stay that way: a knockout screen is a
      // destination you are SENT to, not one anybody lands on by finishing.
      expect(resolveFormOutcome([], [notEligible], answers({})).screen).toBeUndefined();
    });
  });

  describe('worst', () => {
    it('a Go to naming a deleted screen still ends the form, and does not disqualify', () => {
      // We cannot know whether the missing screen was a knockout, and guessing "yes" would
      // discard a real respondent's submission on the strength of a dangling id. Complete is the
      // recoverable direction, and the Rules tab flags the rule as broken.
      const pages = [page('p1', 0, [q('q1', 0, { conditionalRule: toEnding('gone') }), q('q2', 1)])];

      expect(resolveFormOutcome(pages, [notEligible, thanks], answers({ q1: 'skip' }))).toEqual({
        screen: thanks,
        disqualified: false,
        endedEarly: true,
      });
    });

    it('the FIRST terminal reached decides, even when a later one would disqualify', () => {
      const pages = [
        page('p1', 0, [
          q('q1', 0, { conditionalRule: toEnding('thanks') }),
          q('q2', 1, { conditionalRule: toEnding('not-eligible') }),
        ]),
      ];

      expect(resolveFormOutcome(pages, [notEligible, thanks], answers({ q1: 'skip' })).disqualified).toBe(false);
    });
  });
});
