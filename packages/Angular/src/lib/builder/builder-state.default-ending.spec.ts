import { describe, it, expect } from 'vitest';
import { BuilderStateService } from './builder-state.service';
import type { FormTree } from './builder-models';
import type { mjBizAppsFormsFormScreenEntity } from '@mj-biz-apps/forms-entities';

/**
 * What happens to a form's ONE default ending when a write is refused.
 *
 * `setDefaultEnding` and `deleteScreen`'s promotion are the only two paths that move the flag the
 * `UQ_FormScreen_OneDefaultEndingPerForm` index constrains, and both are multi-write: clear one
 * row, then set another. Neither had a behavioural test — the existing guards read the SOURCE for
 * clear-before-set ordering, which proves the happy path is spelled correctly and says nothing
 * about what a refusal leaves behind.
 *
 * That gap matters because the failure is silent and asymmetric. The index refuses a SECOND
 * default; nothing at the database level notices a form with NONE. So the write that fails
 * halfway leaves exactly the state no constraint will ever report, on the flag whose entire
 * purpose is that every form has one.
 *
 * The fake below models `BaseEntity` the way it actually refuses — returning false with the
 * reason on `LatestResult`, never throwing — and keeps `persisted` separate from the in-memory
 * field, because "the builder and the database disagree" is precisely the bug being tested and a
 * fake that mutates one value cannot express it.
 */
class FakeScreen {
  public LatestResult = { CompleteMessage: 'The UPDATE statement conflicted with an index.' };
  /** What the database holds. Advanced only by a save that succeeded. */
  public persisted: boolean;
  public saveCount = 0;
  /** Saves currently running against this row — a concurrent pair is the defect, not the count. */
  public concurrent = 0;
  public maxConcurrent = 0;
  public failSave = false;
  public failDelete = false;
  /** Held by the NEXT save only, so a test can interleave a second write into the gap. */
  public blockOn: Promise<void> | null = null;
  /** Rows sharing this form's unique index. Empty means no index is being modelled. */
  public indexPeers: FakeScreen[] = [];

  constructor(
    public ID: string,
    public DisplayOrder: number,
    public IsDefault: boolean,
    public ScreenType: 'Ending' | 'Welcome' = 'Ending',
    public IsDisqualification = false,
  ) {
    this.persisted = IsDefault;
  }

  public async Save(): Promise<boolean> {
    this.saveCount++;
    this.concurrent++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.concurrent);
    if (this.blockOn) {
      const held = this.blockOn;
      this.blockOn = null;
      await held;
    }
    this.concurrent--;
    if (this.failSave) {
      return false;
    }
    // UQ_FormScreen_OneDefaultEndingPerForm, modelled: a write that would leave the form holding
    // two defaults is refused by the database, not merely discouraged.
    if (this.IsDefault && this.indexPeers.some((p) => p !== this && p.persisted)) {
      return false;
    }
    this.persisted = this.IsDefault;
    return true;
  }

  public async Delete(): Promise<boolean> {
    return !this.failDelete;
  }
}

const asScreen = (s: FakeScreen): mjBizAppsFormsFormScreenEntity =>
  s as unknown as mjBizAppsFormsFormScreenEntity;

const treeOf = (screens: FakeScreen[]): FormTree =>
  ({ form: {}, pages: [], screens: screens.map(asScreen) }) as unknown as FormTree;

/** Put the screens under one filtered unique index, as the real table is. */
const underOneDefaultIndex = (screens: FakeScreen[]): FakeScreen[] => {
  for (const s of screens) {
    s.indexPeers = screens;
  }
  return screens;
};

/** Which rows the DATABASE currently believes are the default. */
const persistedDefaults = (screens: FakeScreen[]): string[] =>
  screens.filter((s) => s.persisted).map((s) => s.ID);

/** Which rows the BUILDER currently shows as the default. */
const shownDefaults = (screens: FakeScreen[]): string[] =>
  screens.filter((s) => s.IsDefault).map((s) => s.ID);

describe('setDefaultEnding when a write is refused', () => {
  it('leaves the form with a default when the new one cannot be saved', async () => {
    // THE DEFECT. The clear lands, the set is refused, and the form is left with NO default —
    // the one broken state the unique index cannot report, reached by the method whose whole
    // job is that the form has exactly one.
    const held = new FakeScreen('a', 0, true);
    const wanted = new FakeScreen('b', 1, false);
    wanted.failSave = true;
    const service = new BuilderStateService();

    const ok = await service.setDefaultEnding(treeOf([held, wanted]), 'b');

    expect(ok).toBe(false);
    expect(persistedDefaults([held, wanted])).toEqual(['a']);
  });

  it('shows the author the default the database actually kept', async () => {
    // The same halfway state, read from the OTHER side. A restore that fixed only the database
    // would leave the builder insisting the move worked, so the next edit is authored against a
    // form the author cannot see the real shape of — and the disagreement survives until reload.
    const held = new FakeScreen('a', 0, true);
    const wanted = new FakeScreen('b', 1, false);
    wanted.failSave = true;
    const service = new BuilderStateService();

    await service.setDefaultEnding(treeOf([held, wanted]), 'b');

    expect(shownDefaults([held, wanted])).toEqual(persistedDefaults([held, wanted]));
    expect(shownDefaults([held, wanted])).toEqual(['a']);
  });

  it('keeps the builder honest when it is the CLEAR that is refused', async () => {
    // The mirror image, and the one the restore path never reaches: the flag is dropped in memory
    // BEFORE the save is attempted, so a refused clear leaves the builder showing no default at
    // all while the database still holds one. Nothing later corrects it — the method returns
    // false and stops.
    const held = new FakeScreen('a', 0, true);
    held.failSave = true;
    const wanted = new FakeScreen('b', 1, false);
    const service = new BuilderStateService();

    const ok = await service.setDefaultEnding(treeOf([held, wanted]), 'b');

    expect(ok).toBe(false);
    expect(persistedDefaults([held, wanted])).toEqual(['a']);
    expect(shownDefaults([held, wanted])).toEqual(['a']);
  });
});

describe('deleteScreen when the promotion is refused', () => {
  it('does not leave the builder showing a default the database refused', async () => {
    // The reviewer read this path as "failure reported as success". The RETURN VALUE is
    // deliberate and stays: the screen really was deleted, and returning false would offer an
    // undo that cannot happen. What was actually wrong is one line lower — the promoted flag is
    // set in memory before the save and never put back, so a refused promotion left the builder
    // showing a catch-all no respondent would ever reach.
    const doomed = new FakeScreen('a', 0, true);
    const survivor = new FakeScreen('b', 1, false);
    survivor.failSave = true;
    const tree = treeOf([doomed, survivor]);
    const service = new BuilderStateService();

    const ok = await service.deleteScreen(tree, tree.screens[0]);

    expect(ok).toBe(true);
    expect(persistedDefaults([survivor])).toEqual([]);
    expect(shownDefaults([survivor])).toEqual([]);
  });

  it('still tells the author the promotion did not stick', async () => {
    // Rolling the flag back must not become a way of hiding the problem: the form now genuinely
    // has no catch-all, and that is the author's to fix.
    const doomed = new FakeScreen('a', 0, true);
    const survivor = new FakeScreen('b', 1, false);
    survivor.failSave = true;
    const tree = treeOf([doomed, survivor]);
    const service = new BuilderStateService();

    await service.deleteScreen(tree, tree.screens[0]);

    expect(service.lastFailure()).toContain('promote default ending');
  });
});

describe('a default move and a pending autosave touching the same screen', () => {
  it('never runs two saves of one row at once', async () => {
    // `saveChains` exists because `BaseEntity.Save()` re-reads the record from the row it gets
    // back, so a field written while a save is in flight is overwritten the moment that save
    // returns — the service's own header calls this out as work disappearing with no error
    // anywhere. `setDefaultEnding` called `saveChecked` directly, stepping around the chain, so
    // clicking "make default" on a screen whose title edit was still settling put two concurrent
    // saves on one entity: exactly the case the chain was built to make impossible.
    const held = new FakeScreen('a', 0, true);
    const wanted = new FakeScreen('b', 1, false);
    const tree = treeOf([held, wanted]);
    const service = new BuilderStateService();

    let release!: () => void;
    held.blockOn = new Promise<void>((resolve) => {
      release = resolve;
    });

    service.saveDebounced(tree.screens[0]);
    const flushing = service.flushPendingSaves();
    await new Promise((r) => setTimeout(r, 0));

    const moving = service.setDefaultEnding(tree, 'b');
    await new Promise((r) => setTimeout(r, 0));
    release();
    await Promise.all([flushing, moving]);

    expect(held.maxConcurrent).toBe(1);
  });

  it('still moves the default once the queued save has drained', async () => {
    // Serializing must not swallow the move: the point is ordering, not exclusion.
    const held = new FakeScreen('a', 0, true);
    const wanted = new FakeScreen('b', 1, false);
    const tree = treeOf([held, wanted]);
    const service = new BuilderStateService();

    service.saveDebounced(tree.screens[0]);
    const flushing = service.flushPendingSaves();
    const moved = await service.setDefaultEnding(tree, 'b');
    await flushing;

    expect(moved).toBe(true);
    expect(persistedDefaults([held, wanted])).toEqual(['b']);
  });
});

describe('moving the default against the real constraint', () => {
  it('succeeds where a set-before-clear order would be refused', async () => {
    // This replaces a source-regex guard that asserted the literal text
    // `await this.saveChecked(screen, 'clear default ending')` inside the method. That guard
    // broke the moment the writes were routed through the save chain — the behaviour was
    // unchanged and the test failed anyway, which is the definition of testing the wrong thing.
    // With the index modelled, ORDER is observable: set-before-clear leaves the form momentarily
    // holding two defaults and the second write is refused, so a passing move IS the ordering.
    const held = new FakeScreen('a', 0, true);
    const wanted = new FakeScreen('b', 1, false);
    const service = new BuilderStateService();

    const ok = await service.setDefaultEnding(
      treeOf(underOneDefaultIndex([held, wanted])),
      'b',
    );

    expect(ok).toBe(true);
    expect(persistedDefaults([held, wanted])).toEqual(['b']);
  });

  it('is written before it returns, rather than left on a debounce', async () => {
    // The move is the one write the builder must not coalesce: the debounce keys a timer per
    // entity with no ordering between them, so the pair could land either way round and the
    // index would refuse whichever arrived second. Nothing is flushed here on purpose — the
    // database must already agree the moment the call resolves.
    const held = new FakeScreen('a', 0, true);
    const wanted = new FakeScreen('b', 1, false);
    const service = new BuilderStateService();

    await service.setDefaultEnding(treeOf(underOneDefaultIndex([held, wanted])), 'b');

    expect(persistedDefaults([held, wanted])).toEqual(['b']);
  });
});
