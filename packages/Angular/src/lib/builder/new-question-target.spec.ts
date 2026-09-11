import { describe, expect, it } from 'vitest';
import type {
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
} from '@mj-biz-apps/forms-entities';
import { NOTHING_SELECTED, selectPage, selectQuestion, selectScreen } from './builder-selection';
import type { PageNode } from './builder-models';
import { ADDING_HERE, ADDING_TO_LAST, targetPageFor } from './new-question-target';

/**
 * A page carrying the only field the rule reads. The node shape stays real and the cast is
 * confined to the entity inside it — the same shape `snapshot-builder.spec.ts` uses — so a change
 * to `PageNode` itself still breaks this fixture, which is exactly what should happen.
 */
const page = (id: string, questionIds: readonly string[]): PageNode => ({
  entity: { ID: id } as mjBizAppsFormsFormPageEntity,
  questions: questionIds.map((qid) => ({
    entity: { ID: qid } as mjBizAppsFormsFormQuestionEntity,
    options: [],
  })),
});

const pages: readonly PageNode[] = [page('page-1', ['q-1']), page('page-2', ['q-2'])];

describe('where a palette click puts its question', () => {
  it('uses the section whose header the author selected', () => {
    // THE DEFECT (#148). The canvas highlights the header the author clicked, and the old rule —
    // which read the question selection and nothing else — sent the question to the last section
    // anyway. The builder marked one section and wrote to another.
    expect(targetPageFor(selectPage('page-1'), pages)?.page.entity.ID).toBe('page-1');
    expect(targetPageFor(selectPage('page-2'), pages)?.page.entity.ID).toBe('page-2');
  });

  it('never falls back to the last section while a section is selected', () => {
    // The property behind the two examples above: whichever section is selected is the target,
    // so the fallback is unreachable while the canvas is highlighting anything.
    for (const target of pages) {
      const chosen = targetPageFor(selectPage(target.entity.ID), pages);
      expect(chosen?.page.entity.ID).toBe(target.entity.ID);
      expect(chosen?.notice).toBe(ADDING_HERE);
    }
  });

  it('still appends to the selected question’s section', () => {
    const chosen = targetPageFor(selectQuestion('q-1'), pages);
    expect(chosen?.page.entity.ID).toBe('page-1');
    expect(chosen?.notice).toBe(ADDING_HERE);
  });

  it('falls back to the last section when nothing is selected, and says nothing', () => {
    const chosen = targetPageFor(NOTHING_SELECTED, pages);
    expect(chosen?.page.entity.ID).toBe('page-2');
    expect(chosen?.notice).toBeNull();
  });

  it('says so when a selected screen leaves the last section as the target', () => {
    // A welcome or ending screen sits on no page, so the fallback is the honest answer — but an
    // author pointing at a screen has no way to know that until the question appears somewhere.
    const chosen = targetPageFor(selectScreen('screen-1'), pages);
    expect(chosen?.page.entity.ID).toBe('page-2');
    expect(chosen?.notice).toBe(ADDING_TO_LAST);
  });

  it('says so when the selected question is no longer on any page', () => {
    const chosen = targetPageFor(selectQuestion('deleted-q'), pages);
    expect(chosen?.page.entity.ID).toBe('page-2');
    expect(chosen?.notice).toBe(ADDING_TO_LAST);
  });

  it('ignores a page selection whose page is gone', () => {
    const chosen = targetPageFor(selectPage('deleted-page'), pages);
    expect(chosen?.page.entity.ID).toBe('page-2');
    expect(chosen?.notice).toBe(ADDING_TO_LAST);
  });

  it('has no target at all on a form with no pages', () => {
    expect(targetPageFor(selectPage('page-1'), [])).toBeNull();
    expect(targetPageFor(NOTHING_SELECTED, [])).toBeNull();
  });

  it('targets the only section of a one-section form, whatever is selected', () => {
    const single = [page('only', ['q-1'])];
    expect(targetPageFor(NOTHING_SELECTED, single)?.page.entity.ID).toBe('only');
    expect(targetPageFor(selectPage('only'), single)?.page.entity.ID).toBe('only');
    expect(targetPageFor(selectQuestion('q-1'), single)?.page.entity.ID).toBe('only');
  });
});
