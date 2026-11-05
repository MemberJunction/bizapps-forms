/**
 * What a `Go to` rule passes over, and whether it can fire at all.
 *
 * Two authoring facts the builder could not state, and both are silent in exactly the way that
 * costs an author a testing round:
 *
 *  - A jump SKIPS questions, required ones included. That is the feature, not a bug — but an
 *    author who writes "if First name is Soham, go to Submit" is entitled to be told that this
 *    means four questions never get asked, two of which they marked required. Without it the
 *    rule reads as a shortcut and behaves as a deletion.
 *  - A jump whose destination is no longer AHEAD of it is inert. The picker only ever offers
 *    forward targets, so this cannot be authored — it is arrived at by REORDERING, after which
 *    the rule still reads perfectly and does nothing at all.
 *
 * The ordering here mirrors `flattenStops` in `rule-verbs.ts`: pages in order, each page's
 * questions in order, and a PAGE's rule firing where the page is LEFT rather than entered. If
 * that resolver's shape ever changes, this lies — hence the edge case pinning it below.
 */
import { describe, expect, it } from 'vitest';

import { jumpReach, reachNote, readHorizon, type ReachPage } from './jump-reach';

const q = (id: string, isRequired = false) => ({ id, label: id, isRequired });

/** p1: q1 q2* q3 · p2: q4* q5 */
const PAGES: ReachPage[] = [
  { id: 'p1', questions: [q('q1'), q('q2', true), q('q3')] },
  { id: 'p2', questions: [q('q4', true), q('q5')] },
];

const from = (kind: 'page' | 'question', id: string) => ({ kind, id }) as const;

describe('jumpReach', () => {
  describe('happy', () => {
    it('counts the questions between the rule and its destination', () => {
      expect(jumpReach(PAGES, from('question', 'q1'), { kind: 'question', id: 'q4' })).toEqual({
        skipped: 2,
        required: 1,
        inert: false,
      });
    });

    it('a terminal jump passes over everything after it', () => {
      expect(jumpReach(PAGES, from('question', 'q2'), { kind: 'submit' })).toEqual({
        skipped: 3,
        required: 1,
        inert: false,
      });
    });

    it('an adjacent destination skips nothing', () => {
      expect(jumpReach(PAGES, from('question', 'q1'), { kind: 'question', id: 'q2' })).toEqual({
        skipped: 0,
        required: 0,
        inert: false,
      });
    });
  });

  describe('edge', () => {
    it("a section's rule fires where the section is LEFT, so it never skips its own questions", () => {
      // Pins the resolver's page-exit semantics. Firing on arrival instead would report this as
      // skipping q1..q3 — the questions the rule's own conditions are written against.
      expect(jumpReach(PAGES, from('page', 'p1'), { kind: 'page', id: 'p2' })).toEqual({
        skipped: 0,
        required: 0,
        inert: false,
      });
    });

    it('a jump to a later section passes over the questions in between', () => {
      expect(jumpReach(PAGES, from('question', 'q1'), { kind: 'page', id: 'p2' })).toEqual({
        skipped: 2,
        required: 1,
        inert: false,
      });
    });
  });

  describe('worst', () => {
    it('a destination behind the rule is inert — it reads fine and never fires', () => {
      expect(jumpReach(PAGES, from('question', 'q4'), { kind: 'question', id: 'q1' }).inert).toBe(true);
    });

    it('a rule pointing at itself is inert', () => {
      expect(jumpReach(PAGES, from('question', 'q2'), { kind: 'question', id: 'q2' }).inert).toBe(true);
    });

    it("a section rule pointing inside its own section is inert, because it fires after it", () => {
      expect(jumpReach(PAGES, from('page', 'p1'), { kind: 'question', id: 'q2' }).inert).toBe(true);
    });

    it('a destination that no longer exists is inert rather than skipping the whole form', () => {
      // Guessing "everything after" for an unresolvable id would report a deleted question as a
      // rule that silently ends the form for everyone.
      expect(jumpReach(PAGES, from('question', 'q1'), { kind: 'question', id: 'gone' })).toEqual({
        skipped: 0,
        required: 0,
        inert: true,
      });
    });

    it('a terminal jump is never inert, wherever it sits', () => {
      // Terminal targets have no ordering to violate — the resolver accepts them anywhere.
      expect(jumpReach(PAGES, from('question', 'q5'), { kind: 'submit' })).toEqual({
        skipped: 0,
        required: 0,
        inert: false,
      });
    });
  });
});

describe('reachNote', () => {
  describe('happy', () => {
    it('says how many questions go unasked, and how many were required', () => {
      expect(reachNote({ skipped: 4, required: 2, inert: false })).toBe(
        'Skips 4 questions, 2 of them required',
      );
    });

    it('reads as one question when it is one', () => {
      expect(reachNote({ skipped: 1, required: 0, inert: false })).toBe('Skips 1 question');
    });
  });

  describe('edge', () => {
    it('says nothing when nothing is skipped', () => {
      expect(reachNote({ skipped: 0, required: 0, inert: false })).toBe('');
    });
  });

  describe('worst', () => {
    it('an inert rule reports that instead of a count', () => {
      // The count is beside the point on a rule that cannot fire, and leading with it would
      // describe behaviour the respondent will never see.
      expect(reachNote({ skipped: 3, required: 1, inert: true })).toBe(
        'This destination is no longer ahead of the rule, so it never runs',
      );
    });
  });
});

/**
 * `readHorizon` is the same walk as `jumpReach`, asked the other question: not "what does this
 * rule skip" but "how far back can it see". Both are restatements of `flattenStops`, which is
 * why they live together — two modules would be two answers that can disagree.
 */
describe('readHorizon', () => {
  /** p1: q1 q2 · p2: (empty) · p3: q3 q4 — the empty section is load-bearing, see 'edge'. */
  const GAPPED: ReachPage[] = [
    { id: 'p1', questions: [q('q1'), q('q2')] },
    { id: 'p2', questions: [] },
    { id: 'p3', questions: [q('q3'), q('q4')] },
  ];

  describe('happy', () => {
    it("a question's show rule may read everything strictly before it", () => {
      expect(readHorizon(GAPPED, from('question', 'q3'), 'show')).toBe(1);
    });

    it("a question's jump may also read the question's own answer", () => {
      // The whole point of a jump: "if THIS answer is X, go to Y".
      expect(readHorizon(GAPPED, from('question', 'q3'), 'jump')).toBe(2);
    });

    it("a section's show rule may read everything before the section starts", () => {
      // Reading its own questions would hide the section out from under a respondent mid-fill.
      expect(readHorizon(GAPPED, from('page', 'p3'), 'show')).toBe(1);
    });

    it("a section's jump may read the section's own questions, because it fires on the way out", () => {
      expect(readHorizon(GAPPED, from('page', 'p3'), 'jump')).toBe(3);
    });
  });

  describe('edge', () => {
    it('the first question can read nothing', () => {
      expect(readHorizon(GAPPED, from('question', 'q1'), 'show')).toBe(-1);
    });

    it('the first section can read nothing', () => {
      expect(readHorizon(GAPPED, from('page', 'p1'), 'show')).toBe(-1);
    });

    it("a section with no questions reads the same either way — there is nothing of its own to add", () => {
      expect(readHorizon(GAPPED, from('page', 'p2'), 'show')).toBe(1);
      expect(readHorizon(GAPPED, from('page', 'p2'), 'jump')).toBe(1);
    });

    it("a section's show horizon counts the questions before it, not the ones an empty section lacks", () => {
      // The arm that is off by one if you write `fireIndex - questions.length`: p3 fires at 3,
      // holds 2 questions, and the last question BEFORE it is index 1 — not index 0. Getting
      // this wrong narrows the picker by one question and falsely badges a legal page rule.
      expect(readHorizon(GAPPED, from('page', 'p3'), 'show')).toBe(
        readHorizon(GAPPED, from('question', 'q3'), 'show'),
      );
    });
  });

  describe('worst', () => {
    it('an unresolvable source may read EVERYTHING — the opposite of jumpReach, deliberately', () => {
      // Both returns mean "claim nothing". There, the alarming claim would be "this jump skips
      // the rest of the form"; here it would be "every condition on this rule is broken".
      expect(readHorizon(GAPPED, from('question', 'gone'), 'show')).toBe(3);
      expect(readHorizon(GAPPED, from('page', 'gone'), 'jump')).toBe(3);
    });

    it('a form with no questions at all leaves nothing readable', () => {
      expect(readHorizon([{ id: 'p1', questions: [] }], from('page', 'p1'), 'jump')).toBe(-1);
    });
  });
});
