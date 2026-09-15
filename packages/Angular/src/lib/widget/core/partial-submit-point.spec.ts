import { describe, it, expect } from 'vitest';
import { passedSubmitPoints } from './partial-submit-point';
import type { PublishedFormPage, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

function question(id: string): PublishedFormQuestion {
  return { id, type: 'ShortText', prompt: id, isRequired: false, displayOrder: 0, options: [] };
}

function page(id: string, questionIds: string[], isPartialSubmitPoint = false): PublishedFormPage {
  return {
    id,
    displayOrder: 0,
    questions: questionIds.map(question),
    ...(isPartialSubmitPoint ? { isPartialSubmitPoint: true } : {}),
  };
}

const pages: PublishedFormPage[] = [
  page('p1', ['q1', 'q2'], true),
  page('p2', ['q3']),
  page('p3', ['q4'], true),
];

describe('passedSubmitPoints', () => {
  it('reports nothing when nothing has been answered', () => {
    expect(passedSubmitPoints(pages, new Set())).toEqual([]);
  });

  it('does not count a submit-point page as passed while the respondent is still on it', () => {
    // The whole point of the rule: answering the LAST question of page 1 is not leaving page 1.
    expect(passedSubmitPoints(pages, new Set(['q1', 'q2']))).toEqual([]);
  });

  it('counts it once an answer lands on a later page', () => {
    expect(passedSubmitPoints(pages, new Set(['q1', 'q3']))).toEqual(['p1']);
  });

  it('ignores pages not marked as submit points', () => {
    // p2 is passed too, but the author did not ask for a checkpoint there.
    expect(passedSubmitPoints(pages, new Set(['q4']))).toEqual(['p1']);
  });

  it('never reports the final page, which cannot be passed', () => {
    // p3 is a submit point but there is nothing after it, so it can only be reached by submitting.
    expect(passedSubmitPoints(pages, new Set(['q1', 'q3', 'q4']))).toEqual(['p1']);
  });

  it('reports several in page order when the respondent jumps ahead', () => {
    const many: PublishedFormPage[] = [
      page('a', ['qa'], true),
      page('b', ['qb'], true),
      page('c', ['qc']),
    ];
    expect(passedSubmitPoints(many, new Set(['qc']))).toEqual(['a', 'b']);
  });

  it('works for a form with no submit points at all', () => {
    const plain = [page('x', ['qx']), page('y', ['qy'])];
    expect(passedSubmitPoints(plain, new Set(['qy']))).toEqual([]);
  });

  it('ignores answers to questions that are not on any page', () => {
    // A stale answer left over from a conditional branch that has since been removed.
    expect(passedSubmitPoints(pages, new Set(['ghost']))).toEqual([]);
  });
});
