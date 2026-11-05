/**
 * A cross-section move (issue #149) is ONE save: the question's new `PageID`, and the renumbering of
 * both sections, commit together or not at all.
 *
 * It used to be one `PageID` write plus up to N+M `DisplayOrder` writes, ordered so a failure
 * part-way still left a tree that reloaded — the worst outcome being one section's order wrong.
 * In one transaction there is no part-way: a refusal leaves the question in its old section with
 * every order as it was. Staging the question under the DESTINATION page is the move — its
 * `PageID` becomes that page's on save.
 *
 * Run against a stand-in graph (`testing/fake-structure-graph.ts`); the server half is proven by
 * forms-core-entities-server's opt-in `form-structure-graph.integration.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { fakeTree, GraphedBuilderState } from './testing/fake-structure-graph';
import type { FormTree, PageNode, QuestionNode } from './builder-models';

/** Two sections, then `q2` moved in memory to `index` of section B, as the drop handler does. */
function movedTree(index: number): {
  tree: FormTree;
  source: PageNode;
  destination: PageNode;
  moved: QuestionNode;
  state: GraphedBuilderState;
} {
  const { tree, store } = fakeTree([
    { id: 'A', questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] },
    { id: 'B', questions: [{ id: 'q4' }, { id: 'q5' }] },
  ]);
  const [source, destination] = tree.pages;
  const [moved] = source.questions.splice(1, 1);
  destination.questions.splice(index, 0, moved);
  return { tree, source, destination, moved, state: new GraphedBuilderState(store) };
}

describe('persistCrossPageMove', () => {
  describe('happy', () => {
    it('writes the move and both renumberings in ONE save', async () => {
      const { tree, source, destination, moved, state } = movedTree(1);

      expect(await state.persistCrossPageMove(tree, moved, source, destination)).toBe(true);

      expect(state.graphs).toHaveLength(1);
      expect(state.store.saves).toHaveLength(1);
    });

    it('moves the question into the destination section', async () => {
      const { tree, source, destination, moved, state } = movedTree(1);

      await state.persistCrossPageMove(tree, moved, source, destination);

      expect(state.store.stored('q2')?.['PageID']).toBe('B');
      expect(moved.entity.PageID).toBe('B');
    });

    it("leaves both sections numbered 0..n-1, in the database and on the builder's rows", async () => {
      const { tree, source, destination, moved, state } = movedTree(1);

      await state.persistCrossPageMove(tree, moved, source, destination);

      expect(['q4', 'q2', 'q5'].map((id) => state.store.stored(id)?.DisplayOrder)).toEqual([0, 1, 2]);
      expect(['q1', 'q3'].map((id) => state.store.stored(id)?.DisplayOrder)).toEqual([0, 1]);
      expect(destination.questions.map((q) => q.entity.DisplayOrder)).toEqual([0, 1, 2]);
      expect(source.questions.map((q) => q.entity.DisplayOrder)).toEqual([0, 1]);
    });
  });

  describe('edge', () => {
    it('appends to the end of the destination', async () => {
      const { tree, source, destination, moved, state } = movedTree(2);

      await state.persistCrossPageMove(tree, moved, source, destination);

      expect(state.store.stored('q2')).toMatchObject({ PageID: 'B', DisplayOrder: 2 });
    });

    it("writes the move even when the question's order number happens not to change", async () => {
      // q2 sat at order 1 in A and lands at index 1 in B: nothing about its order is new, and a
      // renumber that only staged changed orders would never write the move at all.
      const { tree, source, destination, moved, state } = movedTree(1);
      expect(moved.entity.DisplayOrder).toBe(1);

      await state.persistCrossPageMove(tree, moved, source, destination);

      expect(state.store.stored('q2')?.['PageID']).toBe('B');
    });
  });

  describe('worst', () => {
    it("changes nothing stored, and nothing on the builder's rows, when any write is refused", async () => {
      const { tree, source, destination, moved, state } = movedTree(1);
      state.store.refuse.set('q3', 'refused by the database');

      expect(await state.persistCrossPageMove(tree, moved, source, destination)).toBe(false);

      expect(state.store.stored('q2')).toMatchObject({ PageID: 'A', DisplayOrder: 1 });
      expect(state.store.stored('q5')?.DisplayOrder).toBe(1);
      expect(moved.entity.PageID).toBe('A');
    });

    it('reports a refusal to the author rather than swallowing it', async () => {
      const { tree, source, destination, moved, state } = movedTree(1);
      state.store.refuse.set('q2', 'refused by the database');

      await state.persistCrossPageMove(tree, moved, source, destination);

      expect(state.lastFailure()).toBe('Could not move question to another section. refused by the database');
    });

    it('refuses a question the caller has not moved in memory yet', async () => {
      const { tree, store } = fakeTree([{ id: 'A', questions: [{ id: 'q1' }] }, { id: 'B' }]);
      const state = new GraphedBuilderState(store);
      const [source, destination] = tree.pages;

      await expect(state.persistCrossPageMove(tree, source.questions[0], source, destination)).rejects.toThrow(
        /not in destination page/,
      );
      expect(state.graphs).toHaveLength(0);
    });

    it('refuses a question still sitting in the source page', async () => {
      const { tree, store } = fakeTree([{ id: 'A', questions: [{ id: 'q1' }] }, { id: 'B' }]);
      const state = new GraphedBuilderState(store);
      const [source, destination] = tree.pages;
      destination.questions.push(source.questions[0]);

      await expect(state.persistCrossPageMove(tree, source.questions[0], source, destination)).rejects.toThrow(
        /still in source page/,
      );
    });

    it('refuses a same-page "move", which is persistQuestionOrder\'s job', async () => {
      const { tree, store } = fakeTree([{ id: 'A', questions: [{ id: 'q1' }] }]);
      const state = new GraphedBuilderState(store);
      const [page] = tree.pages;

      await expect(state.persistCrossPageMove(tree, page.questions[0], page, page)).rejects.toThrow(/same page/);
    });
  });
});
