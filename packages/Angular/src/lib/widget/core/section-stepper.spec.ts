/**
 * Which sections a respondent actually steps through in Scroll mode.
 *
 * Scroll used to stack every section on one surface with a single Submit, which left a `Go to`
 * rule with nowhere to land: it could only make questions disappear from a page the respondent
 * was already looking at. A section is a STEP, so a jump has a destination and the questions
 * between are simply never reached rather than removed from under a thumb.
 *
 * The rule for what counts as a step is the whole content of this module, and it is not
 * "every visible page": a page whose questions are all hidden by their own `show` rules still
 * passes the flow walk, and as one item in a long scroll an empty heading was merely odd. As a
 * whole STEP — a screen with a title, nothing to answer, and a Next button — it is a dead end
 * the respondent has to work out how to leave.
 */
import { describe, expect, it } from 'vitest';
import type { PublishedFormPage, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

import { steppableSections } from './section-stepper';

function q(id: string, type: PublishedFormQuestion['type'] = 'ShortText'): PublishedFormQuestion {
  return { id, type, prompt: id, isRequired: false, displayOrder: 0, options: [] };
}

function page(id: string, questions: PublishedFormQuestion[]): PublishedFormPage {
  return { id, displayOrder: 0, questions };
}

const ids = (pages: readonly PublishedFormPage[]): string[] => pages.map((p) => p.id);

describe('steppableSections', () => {
  describe('happy', () => {
    it('every section that renders something is a step, in order', () => {
      const pages = [page('p1', [q('q1')]), page('p2', [q('q2')])];
      expect(ids(steppableSections(pages, [q('q1'), q('q2')]))).toEqual(['p1', 'p2']);
    });

    it('a section whose questions are all hidden is not a step', () => {
      const pages = [page('p1', [q('q1')]), page('p2', [q('q2')]), page('p3', [q('q3')])];
      // q2 hidden by its own show rule: p2 is still "visible" to the flow walk, but there is
      // nothing on it to answer.
      expect(ids(steppableSections(pages, [q('q1'), q('q3')]))).toEqual(['p1', 'p3']);
    });
  });

  describe('edge', () => {
    it('a one-section form is one step, which is the form as it always looked', () => {
      expect(ids(steppableSections([page('p1', [q('q1')])], [q('q1')]))).toEqual(['p1']);
    });

    it('a form with nothing to render has no steps at all', () => {
      expect(steppableSections([page('p1', [q('q1')])], [])).toEqual([]);
    });
  });

  describe('worst', () => {
    it('a section holding only a Statement is still a step', () => {
      // Display-only, so it collects nothing and never reaches `visibleAnswerableQuestions` —
      // but it is content the author wrote for the respondent to READ, and an instructions
      // section dropped for having no inputs is the author's copy silently deleted.
      const pages = [page('p1', [q('intro', 'Statement')]), page('p2', [q('q2')])];
      expect(ids(steppableSections(pages, [q('intro', 'Statement'), q('q2')]))).toEqual(['p1', 'p2']);
    });

    it('a question rendered on another section does not keep this one alive', () => {
      // The rendered list is form-wide, so membership has to be decided per section rather than
      // by "is anything rendered at all".
      const pages = [page('p1', [q('q1')]), page('p2', [q('q2')])];
      expect(ids(steppableSections(pages, [q('q2')]))).toEqual(['p2']);
    });
  });
});
