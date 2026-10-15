/**
 * What happens to a form's ONE default ending when it moves, or when the default is deleted.
 *
 * `setDefaultEnding` and `deleteScreen`'s promotion are the two paths that move the flag the
 * `UQ_FormScreen_OneDefaultEndingPerForm` index constrains, and both are two writes: clear one
 * row, set another. They used to be two separate saves, and the failure between them was silent
 * and asymmetric — the index refuses a SECOND default, but nothing notices a form with NONE — so a
 * restore path had to put the flag back by hand, and could itself fail.
 *
 * Both are ONE graph save now. A refusal leaves the stored flags AND the builder's rows exactly as
 * they were, so there is nothing to restore. The store below models the unique index, so the ORDER
 * inside the save — clear before set — is observable the way the database sees it.
 */
import { describe, expect, it } from 'vitest';
import type { mjBizAppsFormsFormScreenEntity } from '@mj-biz-apps/forms-entities';
import { fakeTree, GraphedBuilderState, type FakeRow } from './testing/fake-structure-graph';

const ending = (id: string, order: number, isDefault: boolean, extra: Partial<FakeRow> = {}): FakeRow => ({
  ID: id,
  DisplayOrder: order,
  ScreenType: 'Ending',
  IsDefault: isDefault,
  IsDisqualification: false,
  ...extra,
});

/** Which rows the DATABASE holds as the default. */
const storedDefaults = (state: GraphedBuilderState): string[] =>
  [...state.store.rows.values()].filter((r) => r['ScreenType'] === 'Ending' && r['IsDefault'] === true).map((r) => r.ID);

/** Which rows the BUILDER shows as the default. */
const shownDefaults = (screens: readonly mjBizAppsFormsFormScreenEntity[]): string[] =>
  screens.filter((s) => s.IsDefault).map((s) => s.ID);

function endings(...rows: FakeRow[]) {
  const { tree, store } = fakeTree([], rows);
  store.enforceOneDefaultEnding = true;
  return { tree, state: new GraphedBuilderState(store) };
}

describe('moving the default against the real constraint', () => {
  it('clears before it sets, in one save, so the one-default index never sees two', async () => {
    const { tree, state } = endings(ending('a', 0, true), ending('b', 1, false));

    expect(await state.setDefaultEnding(tree, 'b')).toBe(true);

    expect(state.store.saves).toHaveLength(1);
    expect(storedDefaults(state)).toEqual(['b']);
    expect(shownDefaults(tree.screens)).toEqual(['b']);
  });

  it('clears every screen that held the flag on a form that had several', async () => {
    const { tree, state } = endings(ending('a', 0, true), ending('b', 1, true), ending('c', 2, false));
    // A form already broken this way predates the index, which is why it can exist at all.
    state.store.enforceOneDefaultEnding = false;

    await state.setDefaultEnding(tree, 'c');

    expect(storedDefaults(state)).toEqual(['c']);
    expect(shownDefaults(tree.screens)).toEqual(['c']);
  });
});

describe('setDefaultEnding when the save is refused', () => {
  it('leaves the form with the default it had — stored and shown — whichever row was refused', async () => {
    for (const refused of ['a', 'b']) {
      const { tree, state } = endings(ending('a', 0, true), ending('b', 1, false));
      state.store.refuse.set(refused, 'refused by the database');

      expect(await state.setDefaultEnding(tree, 'b')).toBe(false);

      expect(storedDefaults(state)).toEqual(['a']);
      expect(shownDefaults(tree.screens)).toEqual(['a']);
      expect(state.lastFailure()).toBe('Could not change the default ending. refused by the database');
    }
  });
});

describe('deleting the default ending', () => {
  it('promotes a survivor in the SAME save, so the form is never left with no catch-all', async () => {
    const { tree, state } = endings(ending('a', 0, true), ending('b', 1, false));

    expect(await state.deleteScreen(tree, tree.screens[0])).toBe(true);

    expect(state.store.saves).toEqual([{ written: ['b'], deleted: ['a'] }]);
    expect(storedDefaults(state)).toEqual(['b']);
    expect(tree.screens.map((s) => [s.ID, s.IsDefault])).toEqual([['b', true]]);
  });

  it('deletes nothing and promotes nothing when the promotion is refused', async () => {
    // The old two-save path reported the delete as done and could only roll the flag back in
    // memory; in one save the delete is undone with it, and the form keeps its default.
    const { tree, state } = endings(ending('a', 0, true), ending('b', 1, false));
    state.store.refuse.set('b', 'refused by the database');

    expect(await state.deleteScreen(tree, tree.screens[0])).toBe(false);

    expect(tree.screens.map((s) => s.ID)).toEqual(['a', 'b']);
    expect(storedDefaults(state)).toEqual(['a']);
    expect(shownDefaults(tree.screens)).toEqual(['a']);
  });

  it('promotes nothing when the deleted screen was not the default', async () => {
    const { tree, state } = endings(ending('a', 0, true), ending('b', 1, false));

    await state.deleteScreen(tree, tree.screens[1]);

    expect(state.store.saves).toEqual([{ written: [], deleted: ['b'] }]);
  });
});

describe('a new ending fills a vacancy, rather than counting endings', () => {
  it('becomes the default on a form whose only ending is screened out', async () => {
    // "No ending exists yet" is not the same question: a form whose only ending is screened out
    // has an ending and no default, and the next one added must become its catch-all.
    const { tree, state } = endings(ending('dq', 0, false, { IsDisqualification: true }));

    const screen = await state.addScreen(tree, 'Ending', 'Thanks');

    expect(screen?.IsDefault).toBe(true);
  });

  it('does not take the flag from a form that already has a default', async () => {
    const { tree, state } = endings(ending('a', 0, true));

    const screen = await state.addScreen(tree, 'Ending', 'Another');

    expect(screen?.IsDefault).toBe(false);
  });
});


describe('deleting an ending preserves display order', () => {
  it('closes only the ending gap, so an appended ending has a distinct position', async () => {
    const { tree, state } = endings(
      ending('welcome', 0, false, { ScreenType: 'Welcome' }),
      ending('a', 0, false), ending('b', 1, false), ending('c', 2, true),
    );
    expect(await state.deleteScreen(tree, tree.screens[1])).toBe(true);
    const added = await state.addScreen(tree, 'Ending', 'Next');
    expect(tree.screens.map((screen) => [screen.ID, screen.DisplayOrder])).toEqual([
      ['welcome', 0], ['b', 0], ['c', 1],
    ]);
    expect(['b', 'c'].map((id) => state.store.stored(id)?.DisplayOrder)).toEqual([0, 1]);
    expect(added?.DisplayOrder).toBe(2);
  });
});
