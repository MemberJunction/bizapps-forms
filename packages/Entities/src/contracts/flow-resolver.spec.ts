/**
 * Question-level branching (plans/done/QUESTION_LEVEL_LOGIC_PLAN.md Phase 1).
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
  endsWithoutSubmit,
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

/**
 * A `Go to` rule on a PAGE fires when the respondent LEAVES the page, not when they arrive.
 *
 * The builder offers a page's own questions as sources for its jump conditions — "leaving a page
 * is decided by what was just answered on it" — so a page rule reading its own page is the
 * NORMAL authoring, not an exotic one. Firing at the header made that shape self-destructive:
 * the only answer that can satisfy the condition belongs to a question the jump then skips.
 *
 * Three things went wrong at once, which is why this is tested at the resolver rather than
 * anywhere downstream:
 *
 *  1. The page rendered as an empty header — every question on it, INCLUDING the trigger, gone.
 *  2. The trigger's own answer stopped being transmitted, so it was never persisted.
 *  3. The widget's fixed point could not settle: dropping the trigger un-fires the jump, which
 *     puts the questions back, which fires it again. It hit MAX_VISIBILITY_PASSES, warned, and
 *     left the client and the server deriving different question sets from the same answers.
 */
describe('a Go to rule on a page', () => {
  const trigger = q('q1', 0, {});
  const pages = [
    page('p1', 0, [trigger, q('q2', 1)], toPage('p3')),
    page('p2', 1, [q('q3', 0)]),
    page('p3', 2, [q('q4', 0)]),
  ];

  describe('happy', () => {
    it('asks the whole page first, then skips what it was pointed past', () => {
      expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'skip' })))).toEqual(['q1', 'q2', 'q4']);
    });

    it('changes nothing when its condition does not hold', () => {
      expect(ids(resolveVisibleQuestions(pages, answers({ q1: 'stay' })))).toEqual(['q1', 'q2', 'q3', 'q4']);
    });
  });

  describe('edge', () => {
    it('a page with no questions still fires its jump', () => {
      const empty = [page('p1', 0, [], toPage('p3')), page('p2', 1, [q('q3', 0)]), page('p3', 2, [q('q4', 0)])];
      expect(ids(resolveVisibleQuestions(empty, answers({ q1: 'skip' })))).toEqual(['q4']);
    });

    it('a target on its own page is backward from the exit, so it stays inert', () => {
      const selfTarget = [page('p1', 0, [q('q1', 0), q('q2', 1)], toQ('q2')), page('p2', 1, [q('q3', 0)])];
      expect(ids(resolveVisibleQuestions(selfTarget, answers({ q1: 'skip' })))).toEqual(['q1', 'q2', 'q3']);
    });
  });

  describe('worst', () => {
    it('settles in one pass — restricting the answers to the visible set reproduces it', () => {
      // The widget's own convergence check, run here because a resolver that cannot settle
      // cannot be made to agree with the server by any amount of iteration downstream.
      const first = resolveVisibleQuestions(pages, answers({ q1: 'skip' }));
      const restricted = new Map(first.filter((x) => x.id === 'q1').map((x) => [x.id, 'skip' as AnswerValue]));
      expect(ids(resolveVisibleQuestions(pages, restricted))).toEqual(ids(first));
    });

    it('a terminal page jump ends the form AFTER its own page, not before it', () => {
      const ending = [page('p1', 0, [q('q1', 0), q('q2', 1)], toSubmit()), page('p2', 1, [q('q3', 0)])];
      expect(ids(resolveVisibleQuestions(ending, answers({ q1: 'skip' })))).toEqual(['q1', 'q2']);
      expect(resolveTermination(ending, answers({ q1: 'skip' }))).toEqual({ kind: 'submit' });
    });
  });
});

/**
 * Who ends the response: the respondent, or the rule.
 *
 * `endedEarly` says the FLOW is over — nothing more will be asked. It was also being read as
 * "so send it now", and those are different claims. A screening is done TO a respondent: they
 * are ineligible, the rest of the form is not for them, and the whole point of a knockout is
 * that they do not fill it in first, so the widget seals it on their behalf. Every other finish
 * is done BY them, and pressing Submit is the moment they say so.
 *
 * Conflating the two meant a `Go to → Submit` — an author's way of saying "stop asking, they
 * are done" — transmitted a completed response the instant the respondent clicked out of a text
 * box. In scroll mode, where a commit is a blur, that is one keystroke and one stray click away
 * from a finished submission nobody chose to make.
 */
describe('endsWithoutSubmit', () => {
  const screen = (extra?: Partial<PublishedFormScreen>): PublishedFormScreen => ({
    id: 's',
    screenType: 'Ending',
    title: 's',
    displayOrder: 0,
    ...extra,
  });

  describe('happy', () => {
    it('a screening seals itself — the respondent never agreed to anything', () => {
      expect(
        endsWithoutSubmit({ screen: screen({ isDisqualification: true }), disqualified: true, endedEarly: true }),
      ).toBe(true);
    });

    it('an ordinary early finish waits for Submit', () => {
      expect(endsWithoutSubmit({ screen: screen(), disqualified: false, endedEarly: true })).toBe(false);
    });
  });

  describe('edge', () => {
    it('a form still in progress ends nothing', () => {
      expect(endsWithoutSubmit({ screen: undefined, disqualified: false, endedEarly: false })).toBe(false);
    });
  });

  describe('worst', () => {
    it('a dangling ending id does not seal — a broken rule must not submit for someone', () => {
      // `resolveFormOutcome` reports `disqualified: false` for a screen it cannot find, because
      // guessing "screened out" would discard a real respondent. That same caution has to carry
      // here: an unresolvable rule is the last thing that should send a response unasked.
      expect(endsWithoutSubmit({ screen: undefined, disqualified: false, endedEarly: true })).toBe(false);
    });
  });
});

/**
 * A `Go to` with no conditions is refused, not obeyed.
 *
 * `evaluateGroup({})` is vacuously TRUE, which is exactly right for a `show` gate — an item with
 * no condition is visible — and catastrophic for a jump, where it means "send everybody past
 * this, always". Nobody authors that on purpose: the builder already drops a conditionless row
 * rather than storing it (`committedJump` in logic-draft.ts), so a stored one has arrived from
 * mj-sync metadata, an AI-authored rule, or hand-written JSON — none of which pass through that
 * check.
 *
 * This is the same hazard the deleted `isArmedKnockout` guard existed for. That guard went when
 * disqualification stopped being a rule verb; the underlying vacuous-truth problem did not go
 * with it, it just moved to the only verb that still reads a group as a trigger.
 *
 * Refusing is the recoverable direction. An unconditional jump that fires skips questions for
 * every respondent, silently and permanently; one that is ignored leaves the form asking
 * everything, which is visible, complainable, and loses nobody's data.
 */
describe('a Go to rule with no conditions', () => {
  const pages = (when: ConditionalRule['jump'] extends (infer R)[] | undefined ? R['when'] : never) => [
    page('p1', 0, [q('q1', 0, { conditionalRule: { jump: [{ when, target: { kind: 'question', id: 'q3' } }] } }), q('q2', 1), q('q3', 2)]),
  ];

  describe('happy', () => {
    it('does not fire, so nothing is skipped', () => {
      expect(ids(resolveVisibleQuestions(pages({ all: [] }), answers({})))).toEqual(['q1', 'q2', 'q3']);
    });

    it('an empty group in either arm is refused the same way', () => {
      expect(ids(resolveVisibleQuestions(pages({}), answers({})))).toEqual(['q1', 'q2', 'q3']);
      expect(ids(resolveVisibleQuestions(pages({ any: [] }), answers({})))).toEqual(['q1', 'q2', 'q3']);
    });
  });

  describe('edge', () => {
    it('one real condition is enough — this is not a rule against short rules', () => {
      const real = pages({ all: [{ questionId: 'q1', op: 'isAnswered' }] });
      expect(ids(resolveVisibleQuestions(real, answers({ q1: 'yes' })))).toEqual(['q1', 'q3']);
    });
  });

  describe('worst', () => {
    it('a conditionless TERMINAL jump does not end the form on arrival', () => {
      // The worst reading of the old behaviour: a half-authored "go to Submit" ended the form
      // before the first question was answered, for everyone, and the response recorded was
      // whatever the respondent had not yet typed.
      const terminal = [page('p1', 0, [q('q1', 0, { conditionalRule: { jump: [{ when: { all: [] }, target: { kind: 'submit' } }] } }), q('q2', 1)])];
      expect(resolveTermination(terminal, answers({}))).toBeUndefined();
      expect(ids(resolveVisibleQuestions(terminal, answers({})))).toEqual(['q1', 'q2']);
    });

    it('an item with no condition is still SHOWN — the show gate keeps its meaning', () => {
      // The two verbs read the same group type and must not be given the same answer: absent
      // conditions mean "always visible" and "never jump".
      const shown = [page('p1', 0, [q('q1', 0, { conditionalRule: { show: { all: [] } } })])];
      expect(ids(resolveVisibleQuestions(shown, answers({})))).toEqual(['q1']);
    });
  });
});
