import { describe, it, expect } from 'vitest';
import { passedSubmitPoints } from './partial-submit-point';
import { toRespondentDefinition, type PublishedFormDefinition, type PublishedFormPage, type PublishedFormQuestion } from '@mj-biz-apps/forms-entities/contracts';

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

/**
 * Checkpoints on the respondent PROJECTION (#303 Task 10c carry). The projection drops a page nobody
 * can see — here, one shown only above a score, which visibility can never reach — and a dropped
 * partial-submit page leaves a copy-less stub behind so its checkpoint survives. Banking is by
 * POSITION (`passedSubmitPoints` reads pages in order), so the stub must keep the page's place: answer
 * something after it and its checkpoint counts as passed, exactly as on the full snapshot.
 */
describe('passedSubmitPoints on the respondent projection', () => {
  const full: PublishedFormDefinition = {
    formId: 'f',
    formVersionId: 'v',
    name: 'Checkpoints',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    endScreens: [],
    pages: [
      { id: 'p1', displayOrder: 1, questions: [question('q1')] },
      {
        id: 'hidden-checkpoint',
        displayOrder: 2,
        isPartialSubmitPoint: true,
        conditionalRule: { show: { all: [{ source: 'score', op: 'greaterThan', value: 5 }] } },
        questions: [question('secret')],
      },
      { id: 'p3', displayOrder: 3, questions: [question('q3')] },
    ],
  };

  it('keeps a dropped page\'s checkpoint in its place, with nothing a respondent can read', () => {
    const projection = toRespondentDefinition(full);
    expect(projection.pages.map((p) => p.id)).toEqual(['p1', 'hidden-checkpoint', 'p3']);
    expect(projection.pages[1]).toMatchObject({ isPartialSubmitPoint: true, questions: [] });
    expect(JSON.stringify(projection)).not.toContain('secret');
  });

  it('banks it once the respondent answers past it — the same verdict as on the full snapshot', () => {
    const projection = toRespondentDefinition(full);
    const answered = new Set(['q1', 'q3']);
    expect(passedSubmitPoints(projection.pages, answered)).toEqual(['hidden-checkpoint']);
    expect(passedSubmitPoints(projection.pages, answered)).toEqual(passedSubmitPoints(full.pages, answered));
    // ...and not before.
    expect(passedSubmitPoints(projection.pages, new Set(['q1']))).toEqual([]);
  });
});
