/**
 * Structural edits are ONE graph save each, and a refused one changes nothing (spec #303 §3, DW14).
 *
 * The builder used to write a structural edit row by row — a page delete was every option, then
 * every question, then the page; a reorder was one save per question — so a refusal part-way left
 * the tree half-changed in the database and on screen. Now every row an edit touches is staged in
 * one `FormStructureGraph` and saved once, through the Form root (`MJ.SaveEntityGraph` in the
 * browser). These run the real `BuilderStateService` against a stand-in graph that keeps the
 * properties the builder relies on (`testing/fake-structure-graph.ts`); what the server does with
 * the graph is proven against a real database in forms-core-entities-server's opt-in
 * `form-structure-graph.integration.spec.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { mjBizAppsFormsFormQuestionOptionEntity, mjBizAppsFormsFormScreenEntity } from '@mj-biz-apps/forms-entities';
import { fakeTree, GraphedBuilderState, type FakeRow } from './testing/fake-structure-graph';
import type { PageNode } from './builder-models';

afterEach(() => {
  vi.useRealTimers();
});

const ids = (page: PageNode): string[] => page.questions.map((q) => q.entity.ID);
const orders = (page: PageNode): number[] => page.questions.map((q) => q.entity.DisplayOrder);

describe('deleting a page', () => {
  it('stages ONE removal of the page and saves once — the server deletes its questions and options in that save', async () => {
    const { tree, store } = fakeTree([
      { id: 'p1', questions: [{ id: 'q1' }] },
      { id: 'p2', questions: [{ id: 'q2', options: [{ id: 'o1' }, { id: 'o2' }] }, { id: 'q3' }, { id: 'q4' }] },
    ]);
    const state = new GraphedBuilderState(store);

    const ok = await state.deletePage(tree, tree.pages[1]);

    expect(ok).toBe(true);
    expect(state.graphs).toHaveLength(1);
    expect(state.graphs[0].staged.map((s) => [s.copy.ID, s.removed])).toEqual([['p2', true]]);
    expect(store.saves).toEqual([{ written: [], deleted: ['p2'] }]);
  });

  it('leaves the database and the author told when the delete is refused', async () => {
    const { tree, store } = fakeTree([{ id: 'p1' }, { id: 'p2', questions: [{ id: 'q2' }] }]);
    store.refuse.set('p2', 'The DELETE statement conflicted with the REFERENCE constraint.');
    const state = new GraphedBuilderState(store);

    const ok = await state.deletePage(tree, tree.pages[1]);

    expect(ok).toBe(false);
    expect(store.stored('p2')).toBeDefined();
    expect(store.saves).toHaveLength(0);
    expect(state.lastFailure()).toBe('Could not delete page. The DELETE statement conflicted with the REFERENCE constraint.');
  });
});

describe('inserting a question between two others', () => {
  it('creates it at the seam AND renumbers everything below it in the same save', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] }]);
    const state = new GraphedBuilderState(store);

    const node = await state.addQuestion(tree, tree.pages[0], 'ShortText', 'New one', 1);

    expect(node).toBeDefined();
    expect(state.graphs).toHaveLength(1);
    expect(node?.entity.DisplayOrder).toBe(1);
    // q1 keeps its place; q2 and q3 move down one, written in the same save as the new row.
    expect(store.stored('q2')?.DisplayOrder).toBe(2);
    expect(store.stored('q3')?.DisplayOrder).toBe(3);
    expect(store.stored('q1')?.DisplayOrder).toBe(0);
    // …the builder's own rows took the stored order back, so their next autosave cannot undo it,
    // and the service put the new question into the page at the seam itself.
    expect(ids(tree.pages[0])).toEqual(['q1', node?.entity.ID, 'q2', 'q3']);
    expect(orders(tree.pages[0])).toEqual([0, 1, 2, 3]);
  });

  it('seeds the starter options in the question\'s own save', async () => {
    const { tree, store } = fakeTree([{ id: 'p1' }]);
    const state = new GraphedBuilderState(store);

    const node = await state.addQuestion(tree, tree.pages[0], 'SingleChoice', 'Pick one');

    expect(state.graphs).toHaveLength(1);
    expect(node?.options.map((o) => [o.Label, o.DisplayOrder])).toEqual([
      ['Option 1', 0],
      ['Option 2', 1],
    ]);
  });

  it('writes nothing and moves nothing when the save is refused', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }] }]);
    store.refuse.set('q2', 'refused');
    const state = new GraphedBuilderState(store);

    const node = await state.addQuestion(tree, tree.pages[0], 'ShortText', 'New one', 0);

    expect(node).toBeUndefined();
    expect(orders(tree.pages[0])).toEqual([0, 1]);
    expect([...store.rows.keys()].filter((id) => id.startsWith('new-'))).toEqual([]);
  });
});

describe('deleting a question', () => {
  it('deletes it, closes the gap, and takes it out of the page — in one save', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];

    const ok = await state.deleteQuestion(tree, page, page.questions[0]);

    expect(ok).toBe(true);
    expect(state.graphs).toHaveLength(1);
    expect(store.stored('q1')).toBeUndefined();
    expect(ids(page)).toEqual(['q2', 'q3']);
    expect(orders(page)).toEqual([0, 1]);
  });

  it('keeps the question on the page when the delete is refused', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }] }]);
    store.refuse.set('q1', 'refused');
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];

    expect(await state.deleteQuestion(tree, page, page.questions[0])).toBe(false);
    expect(ids(page)).toEqual(['q1', 'q2']);
    expect(orders(page)).toEqual([0, 1]);
  });
});

describe('options', () => {
  it('a new option is staged under its staged question and page', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1', options: [{ id: 'o1' }] }] }]);
    const state = new GraphedBuilderState(store);
    const node = tree.pages[0].questions[0];

    const option = await state.addOption(tree, node, 'Option 2');

    expect(option?.DisplayOrder).toBe(1);
    expect(state.graphs[0].staged.map((s) => s.kind)).toEqual(['page', 'question', 'option']);
  });

  it('deleting one closes the gap in one save', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1', options: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }] }] }]);
    const state = new GraphedBuilderState(store);
    const node = tree.pages[0].questions[0];

    const ok = await state.deleteOption(tree, node, node.options[0] as mjBizAppsFormsFormQuestionOptionEntity);

    expect(ok).toBe(true);
    expect(state.graphs).toHaveLength(1);
    expect(node.options.map((o) => [o.ID, o.DisplayOrder])).toEqual([
      ['o2', 0],
      ['o3', 1],
    ]);
  });
});

describe('reordering', () => {
  it('writes every moved row in ONE save', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];
    page.questions.reverse();

    expect(await state.persistQuestionOrder(tree, page)).toBe(true);

    expect(state.graphs).toHaveLength(1);
    expect(['q3', 'q2', 'q1'].map((id) => store.stored(id)?.DisplayOrder)).toEqual([0, 1, 2]);
  });

  it('opens no graph when the order already matches', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }] }]);
    const state = new GraphedBuilderState(store);

    expect(await state.persistQuestionOrder(tree, tree.pages[0])).toBe(true);
    expect(state.graphs).toHaveLength(0);
  });

  it('a refusal leaves every stored order as it was — no half-reordered page', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] }]);
    store.refuse.set('q1', 'refused');
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];
    page.questions.reverse();

    expect(await state.persistQuestionOrder(tree, page)).toBe(false);
    expect(['q1', 'q2', 'q3'].map((id) => store.stored(id)?.DisplayOrder)).toEqual([0, 1, 2]);
  });
});

describe('field saves', () => {
  it('are single-row saves: a row\'s loaded collections never ride along', async () => {
    const save = vi.fn(async () => true);
    const state = new GraphedBuilderState();

    await state.save({ Save: save, LatestResult: null } as unknown as mjBizAppsFormsFormScreenEntity);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]).toEqual([expect.objectContaining({ SkipRelatedCollections: true })]);
  });

  it('wait for a structural save in flight, so their payload cannot undo it', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];
    const events: string[] = [];
    const question = page.questions[1].entity as unknown as FakeRow;
    question['Save'] = async () => {
      events.push(`autosave q2 at DisplayOrder ${question.DisplayOrder}`);
      return true;
    };

    let release = (): void => undefined;
    store.hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    page.questions.reverse();
    const reorder = state.persistQuestionOrder(tree, page);
    await new Promise((r) => setTimeout(r, 0));
    // The author edits q2 while the reorder's save is in flight.
    state.saveDebounced(page.questions[0].entity);
    const flushing = state.flushPendingSaves();
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual([]);

    release();
    await reorder;
    await flushing;

    // The autosave ran AFTER the reorder committed and the row adopted its stored order.
    expect(events).toEqual(['autosave q2 at DisplayOrder 0']);
  });
});

/**
 * Fix round 1 of #303 Task 10a: two structural edits queued back to back, field saves on the same
 * queue, and writes made elsewhere while the builder was open. The fake graph ships only a
 * handle's key and what the edit set, as the real one does, and writes the form root.
 */
describe('structural edits queued back to back', () => {
  it('two quick deletes on one page leave the screen and the stored rows agreeing', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0' }, { id: 'q1' }, { id: 'q2' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];

    const first = state.deleteQuestion(tree, page, page.questions[0]);
    const second = state.deleteQuestion(tree, page, page.questions[1]);

    expect([await first, await second]).toEqual([true, true]);
    expect(ids(page)).toEqual(['q2']);
    expect(orders(page)).toEqual([0]);
    expect(['q0', 'q1', 'q2'].map((id) => store.stored(id)?.DisplayOrder ?? null)).toEqual([null, null, 0]);
  });

  it('an option added while a delete is queued is on screen and stored, after the delete', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0', options: [{ id: 'o0' }, { id: 'o1' }] }] }]);
    const state = new GraphedBuilderState(store);
    const node = tree.pages[0].questions[0];

    const removed = state.deleteOption(tree, node, node.options[0] as mjBizAppsFormsFormQuestionOptionEntity);
    const added = state.addOption(tree, node, 'New');

    expect(await removed).toBe(true);
    const option = await added;
    expect(node.options.map((o) => o.ID)).toEqual(['o1', option?.ID]);
    expect(node.options.map((o) => store.stored(o.ID)?.DisplayOrder)).toEqual([0, 1]);
  });

  it('a question inserted while a delete is queued lands where the page is when its save runs', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0' }, { id: 'q1' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];

    const removed = state.deleteQuestion(tree, page, page.questions[0]);
    const added = state.addQuestion(tree, page, 'ShortText', 'Appended');
    await removed;
    const node = await added;

    expect(ids(page)).toEqual(['q1', node?.entity.ID]);
    expect(page.questions.map((q) => store.stored(q.entity.ID)?.DisplayOrder)).toEqual([0, 1]);
  });
});

describe('one save queue for every builder write', () => {
  it('a direct save (a page title) is held while a structural save is in flight, and flushed with the rest', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];
    const events: string[] = [];
    (page.entity as unknown as FakeRow)['Save'] = async () => {
      events.push('page title saved');
      return true;
    };
    let release = (): void => undefined;
    store.hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    page.questions.reverse();
    const reorder = state.persistQuestionOrder(tree, page);
    await new Promise((r) => setTimeout(r, 0));
    const titled = state.save(page.entity);
    const flushing = state.flushPendingSaves();
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual([]);

    release();
    await reorder;
    await flushing;

    expect(await titled).toBe(true);
    expect(events).toEqual(['page title saved']);
  });

  it('flushPendingSaves waits for a direct save already running', async () => {
    const { tree } = fakeTree([{ id: 'p1' }]);
    const state = new GraphedBuilderState();
    let finish = (): void => undefined;
    (tree.form as unknown as FakeRow)['Save'] = () =>
      new Promise<boolean>((resolve) => {
        finish = () => resolve(true);
      });

    const saving = state.save(tree.form);
    let flushed = false;
    const flushing = state.flushPendingSaves().then(() => {
      flushed = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(flushed).toBe(false);

    finish();
    await saving;
    await flushing;
    expect(flushed).toBe(true);
  });
});

describe('writes made elsewhere while the builder is open', () => {
  it("a page title changed elsewhere survives a structural edit on that page, and the builder adopts it", async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];
    (store.stored('p1') as FakeRow)['Title'] = 'Retitled elsewhere';

    expect(await state.deleteQuestion(tree, page, page.questions[0])).toBe(true);

    expect(store.stored('p1')?.['Title']).toBe('Retitled elsewhere');
    expect((page.entity as unknown as FakeRow)['Title']).toBe('Retitled elsewhere');
  });

  it('a form archived elsewhere stays archived through a reorder, and the builder adopts it', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }] }]);
    const state = new GraphedBuilderState(store);
    (store.stored('form-1') as FakeRow)['Status'] = 'Closed';
    tree.pages[0].questions.reverse();

    expect(await state.persistQuestionOrder(tree, tree.pages[0])).toBe(true);

    expect(store.stored('form-1')?.['Status']).toBe('Closed');
    expect(tree.form.Status).toBe('Closed');
  });
});

describe('re-reading a row runs inside its save chain', () => {
  it('waits for a save of the same row already in flight, so it cannot put an older value back', async () => {
    const { tree } = fakeTree([{ id: 'p1' }]);
    const state = new GraphedBuilderState();
    const form = tree.form as unknown as FakeRow;
    const events: string[] = [];
    let finish = (): void => undefined;
    form['Save'] = () =>
      new Promise<boolean>((resolve) => {
        events.push('save started');
        finish = () => {
          events.push('save committed');
          resolve(true);
        };
      });
    form['GetFieldByName'] = () => ({ Dirty: false, ResetNeverSetFlag: () => undefined });
    form['SetMany'] = (values: Record<string, unknown>) => Object.assign(form, values);

    const saving = state.save(tree.form);
    const adopting = state.adoptStored(tree.form, async () => {
      events.push('read');
      return { Name: 'as stored' };
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(['save started']);

    finish();
    await saving;
    expect(await adopting).toBe(true);
    expect(events).toEqual(['save started', 'save committed', 'read']);
    expect(form['Name']).toBe('as stored');
  });
});
