/**
 * A held delete (UI audit F07) reaches the database before anything that needs it current.
 *
 * The builder takes a deleted item out of the tree at once and holds the write for the undo window
 * (`pending-delete.ts`). That is only safe if no other save can overtake it: a reorder or an insert
 * saved first would renumber around a row that is about to vanish, and a publish would snapshot a
 * question the author has already deleted. These run the real `BuilderStateService` against the
 * stand-in graph (`testing/fake-structure-graph.ts`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { mjBizAppsFormsFormQuestionOptionEntity } from '@mj-biz-apps/forms-entities';
import { fakeTree, GraphedBuilderState } from './testing/fake-structure-graph';
import type { PageNode, QuestionNode } from './builder-models';

afterEach(() => {
  vi.useRealTimers();
});

const ids = (page: PageNode): string[] => page.questions.map((q) => q.entity.ID);

/** What the builder does on a trash click: out of the tree, the write held. */
async function holdQuestionDelete(state: GraphedBuilderState, tree: Parameters<GraphedBuilderState['deleteQuestion']>[0], page: PageNode, node: QuestionNode) {
  const restore = vi.fn();
  await state.holdDelete(node.entity.ID, () => {
    const index = page.questions.indexOf(node);
    page.questions = page.questions.filter((q) => q !== node);
    return {
      restore: () => {
        restore();
        page.questions = [...page.questions.slice(0, index), node, ...page.questions.slice(index)];
      },
      commit: () => state.deleteQuestion(tree, page, node),
    };
  });
  return restore;
}

type Tree = Parameters<GraphedBuilderState['deleteScreen']>[0];
type Screen = Parameters<GraphedBuilderState['deleteScreen']>[1];

/** The same for an ending screen. */
function holdScreenDelete(state: GraphedBuilderState, tree: Tree, screen: Screen): Promise<boolean> {
  return state.holdDelete(screen.ID, () => {
    const index = tree.screens.indexOf(screen);
    tree.screens = tree.screens.filter((s) => s !== screen);
    return {
      restore: () => {
        tree.screens = [...tree.screens.slice(0, index), screen, ...tree.screens.slice(index)];
      },
      commit: () => state.deleteScreen(tree, screen),
    };
  });
}

describe('a held builder delete', () => {
  it('still deletes a question that is no longer in the page', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0' }, { id: 'q1' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];
    const node = page.questions[0];
    page.questions = page.questions.filter((q) => q !== node);

    expect(await state.deleteQuestion(tree, page, node)).toBe(true);
    expect(store.stored('q0')).toBeUndefined();
    expect(store.stored('q1')?.DisplayOrder).toBe(0);
  });

  it('is written before a structural edit asked for after it', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0' }, { id: 'q1' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];
    await holdQuestionDelete(state, tree, page, page.questions[0]);

    const added = await state.addQuestion(tree, page, 'ShortText', 'Appended');

    expect(store.stored('q0')).toBeUndefined();
    expect(ids(page)).toEqual(['q1', added?.entity.ID]);
    expect(page.questions.map((q) => store.stored(q.entity.ID)?.DisplayOrder)).toEqual([0, 1]);
    expect(state.heldDelete()).toBeNull();
  });

  it('is written by flushPendingSaves, which publish awaits', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0' }, { id: 'q1' }] }]);
    const state = new GraphedBuilderState(store);
    await holdQuestionDelete(state, tree, tree.pages[0], tree.pages[0].questions[0]);

    await state.flushPendingSaves();

    expect(store.stored('q0')).toBeUndefined();
  });

  it('is written when the undo window passes', async () => {
    vi.useFakeTimers();
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0' }, { id: 'q1' }] }]);
    const state = new GraphedBuilderState(store);
    await holdQuestionDelete(state, tree, tree.pages[0], tree.pages[0].questions[0]);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(store.stored('q0')).toBeUndefined();
  });

  it('is never written when undone, and the question is back where it was', async () => {
    vi.useFakeTimers();
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0' }, { id: 'q1' }, { id: 'q2' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];
    const restore = await holdQuestionDelete(state, tree, page, page.questions[1]);

    expect(state.undoDelete()).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);

    expect(restore).toHaveBeenCalledTimes(1);
    expect(ids(page)).toEqual(['q0', 'q1', 'q2']);
    expect(store.stored('q1')).toBeDefined();
    expect(store.saves).toHaveLength(0);
  });

  it('comes back, with the reason shown, when the delete is refused', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0' }, { id: 'q1' }] }]);
    store.refuse.set('q0', 'refused');
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];
    await holdQuestionDelete(state, tree, page, page.questions[0]);

    await state.flushPendingSaves();

    expect(ids(page)).toEqual(['q0', 'q1']);
    expect(state.lastFailure()).toBe('Could not delete question. refused');
  });

  it('two deletes in a row both land, and the queue keeps moving (no deadlock)', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0' }, { id: 'q1' }, { id: 'q2' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];
    await holdQuestionDelete(state, tree, page, page.questions[0]);
    // Holding the second commits the first; the first's save must not wait on the second.
    await holdQuestionDelete(state, tree, page, page.questions[0]);
    // Let the first delete's save start while the second is still held: that is the window in
    // which a flush inside the save would release the second and wait on it behind itself.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const settled = await Promise.race([
      state.addQuestion(tree, page, 'ShortText', 'After').then(() => 'done'),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 500)),
    ]);

    expect(settled).toBe('done');
    expect(['q0', 'q1'].map((id) => store.stored(id))).toEqual([undefined, undefined]);
    expect(store.stored('q2')?.DisplayOrder).toBe(0);
  });

  it('still deletes an option that is no longer on its question', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0', options: [{ id: 'o0' }, { id: 'o1' }] }] }]);
    const state = new GraphedBuilderState(store);
    const node = tree.pages[0].questions[0];
    const option = node.options[0] as mjBizAppsFormsFormQuestionOptionEntity;
    node.options = node.options.filter((o) => o !== option);

    expect(await state.deleteOption(tree, node, option)).toBe(true);
    expect(store.stored('o0')).toBeUndefined();
    expect(store.stored('o1')?.DisplayOrder).toBe(0);
  });

  it('moves the default ending while the old default\'s delete is held, in one consistent save', async () => {
    const end = (id: string, order: number, isDefault: boolean) => ({ ID: id, FormID: 'form-1', ScreenType: 'Ending', IsDisqualification: false, DisplayOrder: order, IsDefault: isDefault, Title: id });
    const { tree, store } = fakeTree([{ id: 'p1' }], [end('x', 0, false), end('y', 1, false), end('d', 2, true)]);
    const state = new GraphedBuilderState(store);
    await holdScreenDelete(state, tree, tree.screens[2]);

    expect(await state.setDefaultEnding(tree, 'y')).toBe(true);

    expect(store.stored('d')).toBeUndefined();
    expect(['x', 'y'].map((id) => store.stored(id)?.IsDefault)).toEqual([false, true]);
    expect(state.lastFailure()).toBeNull();
  });

  it('says in words why a delete of an answered question was refused, and keeps the SQL out of it', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q0' }, { id: 'q1' }] }]);
    store.refuse.set('q0', 'Error executing SQL Error: The DELETE statement conflicted with the REFERENCE constraint "FK_FormResponseAnswer_Question". Query: DECLARE @ResultTable');
    const state = new GraphedBuilderState(store);
    await holdQuestionDelete(state, tree, tree.pages[0], tree.pages[0].questions[0]);

    await state.flushPendingSaves();

    expect(state.lastFailure()).toBe('Could not delete question. Respondents have already answered it, and their answers stay linked to it.');
  });

  it('shows a refusal the builder decided itself', () => {
    const state = new GraphedBuilderState();
    state.showRefusal('“Short text” can’t be deleted.');
    expect(state.lastFailure()).toBe('“Short text” can’t be deleted.');
  });
});

/**
 * UI audit F07, review of PR #350: a second delete used to leave the tree BEFORE the first one's
 * held write ran, and that write renumbers what it finds when it runs. So the second item was left
 * out of the order the database was given, and Undo put it back at a position the rows no longer had.
 */
describe('a second delete while one is held', () => {
  const end = (id: string, order: number, isDefault: boolean) => ({ ID: id, FormID: 'form-1', ScreenType: 'Ending', IsDisqualification: false, DisplayOrder: order, IsDefault: isDefault, Title: id });

  it('leaves the stored order matching the page when the second is undone', async () => {
    const { tree, store } = fakeTree([{ id: 'p1', questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] }]);
    const state = new GraphedBuilderState(store);
    const page = tree.pages[0];
    const [q1, q2] = page.questions;
    void holdQuestionDelete(state, tree, page, q1);
    await holdQuestionDelete(state, tree, page, q2);
    expect(store.stored('q1')).toBeUndefined();

    expect(state.undoDelete()).toBe(true);
    await state.flushPendingSaves();

    expect(ids(page)).toEqual(['q2', 'q3']);
    expect(page.questions.map((q) => store.stored(q.entity.ID)?.DisplayOrder)).toEqual([0, 1]);
  });

  it('keeps a default ending when the old default and then the survivor are deleted, and the survivor undone', async () => {
    const { tree, store } = fakeTree([{ id: 'p1' }], [end('e1', 0, true), end('e2', 1, false)]);
    const state = new GraphedBuilderState(store);
    const [e1, e2] = tree.screens;
    void holdScreenDelete(state, tree, e1);
    await holdScreenDelete(state, tree, e2);
    expect(store.stored('e1')).toBeUndefined();

    expect(state.undoDelete()).toBe(true);
    await state.flushPendingSaves();

    expect(tree.screens.map((s) => s.ID)).toEqual(['e2']);
    expect(store.stored('e2')?.IsDefault).toBe(true);
  });
});
