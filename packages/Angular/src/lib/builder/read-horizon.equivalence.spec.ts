/**
 * The frozen oracle for the four source getters the builder used to hand-slice.
 *
 * `pageConditionalSources`, `pageJumpConditionSources`, `questionJumpSources` and
 * `conditionalSources` each answered "which questions may this rule read" by slicing the tree
 * themselves — four statements of one ordering rule, in a component that cannot be instantiated
 * in this suite. They now all read `sourcesUpTo(readHorizon(...))`.
 *
 * This file transcribes the OLD arithmetic literally, once, and asserts the new arithmetic
 * agrees with it over every page and every question of a deliberately awkward fixture. It is not
 * a test of the getters (component classes are not unit-tested here); it is the record that the
 * refactor moved the rule without changing it, and it stays because the oracle is the only thing
 * that can catch the arithmetic drifting back.
 *
 * TWO PROPERTIES OF THE FIXTURE ARE LOAD-BEARING and neither is decoration:
 *
 *  - an EMPTY SECTION, because a page's show horizon is `fireIndex − questions.length + 1` and
 *    the `+ 1` is invisible on a fixture where every section has the same size;
 *  - a `Statement` IN THE PREFIX, because index arithmetic runs on the full question list while
 *    existence and labelling run on the filtered one. Conflating them shifts every horizon on
 *    any form containing display-only copy, and nothing else in the suite would notice.
 */
import { describe, expect, it } from 'vitest';

import { readHorizon } from './jump-reach';

/** A question as this oracle needs it: an id, and whether it collects an answer. */
interface OracleQuestion {
  id: string;
  /** `Statement` renders prose and never reaches the answer map — `sourcesOf` drops it. */
  isStatement?: boolean;
}

interface OraclePage {
  id: string;
  questions: OracleQuestion[];
}

/** p1: q1 s2(Statement) q3 · p2: (empty) · p3: q4 q5 · p4: q6 */
const TREE: OraclePage[] = [
  { id: 'p1', questions: [{ id: 'q1' }, { id: 's2', isStatement: true }, { id: 'q3' }] },
  { id: 'p2', questions: [] },
  { id: 'p3', questions: [{ id: 'q4' }, { id: 'q5' }] },
  { id: 'p4', questions: [{ id: 'q6' }] },
];

const ALL_QUESTION_IDS = TREE.flatMap((page) => page.questions.map((question) => question.id));

/** Stands in for the component's `sourcesOf` — the one filter, applied on both sides. */
const sourcesOf = (questions: readonly OracleQuestion[]): string[] =>
  questions.filter((question) => question.isStatement !== true).map((question) => question.id);

// -- the old arithmetic, transcribed from the four getters as they stood ------

const oldPageConditionalSources = (pages: OraclePage[], index: number): string[] =>
  index <= 0 ? [] : pages.slice(0, index).flatMap((page) => sourcesOf(page.questions));

const oldPageJumpConditionSources = (pages: OraclePage[], index: number): string[] =>
  index < 0 ? [] : pages.slice(0, index + 1).flatMap((page) => sourcesOf(page.questions));

const oldQuestionJumpSources = (pages: OraclePage[], selectedId: string): string[] => {
  const sources: string[] = [];
  for (const page of pages) {
    for (const question of page.questions) {
      sources.push(...sourcesOf([question]));
      if (question.id === selectedId) {
        return sources;
      }
    }
  }
  return sources;
};

const oldConditionalSources = (pages: OraclePage[], selectedId: string): string[] => {
  const sources: string[] = [];
  for (const page of pages) {
    for (const question of page.questions) {
      if (question.id === selectedId) {
        return sources;
      }
      sources.push(...sourcesOf([question]));
    }
  }
  return sources;
};

// -- the new arithmetic, exactly as the component now spells it ---------------

/** The component's `sourcesUpTo`: slice the FULL list, filter after. */
const sourcesUpTo = (pages: OraclePage[], horizon: number): string[] =>
  sourcesOf(pages.flatMap((page) => page.questions).slice(0, horizon + 1));

const newPageShow = (pages: OraclePage[], pageId: string): string[] =>
  sourcesUpTo(pages, readHorizon(pages, { kind: 'page', id: pageId }, 'show'));

const newPageJump = (pages: OraclePage[], pageId: string): string[] =>
  sourcesUpTo(pages, readHorizon(pages, { kind: 'page', id: pageId }, 'jump'));

const newQuestionShow = (pages: OraclePage[], questionId: string): string[] =>
  sourcesUpTo(pages, readHorizon(pages, { kind: 'question', id: questionId }, 'show'));

const newQuestionJump = (pages: OraclePage[], questionId: string): string[] =>
  sourcesUpTo(pages, readHorizon(pages, { kind: 'question', id: questionId }, 'jump'));

describe('readHorizon reproduces the four source getters it replaced', () => {
  describe('happy', () => {
    it("offers a page's show rule exactly what it used to", () => {
      TREE.forEach((page, index) => {
        expect(newPageShow(TREE, page.id)).toEqual(oldPageConditionalSources(TREE, index));
      });
    });

    it("offers a page's jump conditions exactly what they used to", () => {
      TREE.forEach((page, index) => {
        expect(newPageJump(TREE, page.id)).toEqual(oldPageJumpConditionSources(TREE, index));
      });
    });

    it("offers a question's show rule exactly what it used to", () => {
      for (const id of ALL_QUESTION_IDS) {
        expect(newQuestionShow(TREE, id)).toEqual(oldConditionalSources(TREE, id));
      }
    });

    it("offers a question's jump conditions exactly what they used to", () => {
      for (const id of ALL_QUESTION_IDS) {
        expect(newQuestionJump(TREE, id)).toEqual(oldQuestionJumpSources(TREE, id));
      }
    });
  });

  describe('edge', () => {
    it('the Statement is never offered, and never shifts the questions around it', () => {
      // The assertion that fails if index arithmetic is run on the FILTERED list: q3 sits at
      // index 2 of the full list and would be read as index 1 of the filtered one.
      expect(newQuestionShow(TREE, 'q3')).toEqual(['q1']);
      expect(newQuestionShow(TREE, 'q4')).toEqual(['q1', 'q3']);
    });

    it('the section after the empty one can read the whole prefix, not one short of it', () => {
      // The `+ 1` in the page arm of the show horizon. `fireIndex − questions.length` would
      // drop `q3` here — narrowing the picker AND falsely badging a legal rule.
      expect(newPageShow(TREE, 'p3')).toEqual(['q1', 'q3']);
    });

    it('an empty section offers the same either way — it has nothing of its own to add', () => {
      expect(newPageJump(TREE, 'p2')).toEqual(newPageShow(TREE, 'p2'));
    });

    it('the first section and the first question offer nothing', () => {
      expect(newPageShow(TREE, 'p1')).toEqual([]);
      expect(newQuestionShow(TREE, 'q1')).toEqual([]);
    });
  });

  describe('worst', () => {
    it('a selection that is no longer on the form offers everything, as it always did', () => {
      // Both old loops fell through and returned the whole accumulated list. `readHorizon`
      // returning "everything readable" for an unresolvable source is what preserves that.
      const everything = sourcesOf(TREE.flatMap((page) => page.questions));
      expect(newQuestionShow(TREE, 'gone')).toEqual(everything);
      expect(newQuestionJump(TREE, 'gone')).toEqual(everything);
      expect(newPageShow(TREE, 'gone')).toEqual(everything);
    });

    it('a form with a single empty section offers nothing to anything', () => {
      const empty: OraclePage[] = [{ id: 'p1', questions: [] }];
      expect(newPageShow(empty, 'p1')).toEqual([]);
      expect(newPageJump(empty, 'p1')).toEqual([]);
    });
  });
});
