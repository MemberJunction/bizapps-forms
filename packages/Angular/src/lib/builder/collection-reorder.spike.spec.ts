/**
 * SPIKE for issue #103 — can a `RelatedRecordCollection` express a REORDER?
 *
 * The issue claims `Sequence` makes `persistQuestionOrder` "go away". Reading the source said
 * otherwise, and this file established what the public API actually permits.
 *
 * THE ANSWER SHIPPED HERE IS "NOT IN THE BUILDER", and this file records why rather than being
 * deleted with the design it ruled out. The builder reorders through a `TransactionGroup` over
 * sibling rows, which needs no collection at all — see `persistSequence` in
 * `builder-state.service.ts`. What is kept below is the finding that made the collection route
 * unattractive even before atomicity settled it: **`Remove(x); Add(x)` to move a row DELETES it**,
 * because `Remove` queues a delete for a persisted child and `Add` does not take it back off. The
 * only safe expression of a move is `SetLoadedItems([])` then re-`Add` in the new order.
 *
 * That trap is still live for any caller that does adopt collections, which is why this stays. Be
 * precise about who that is: `form-blueprint-builder` (`packages/Actions/`) genuinely runs on the
 * server, where the provider supports entity transactions and a delete graph IS atomic.
 * `form-clone` does NOT — it is an `@Injectable()` Angular service that runs in the browser
 * alongside the builder, so it inherits exactly the non-atomic client path described above. An
 * earlier version of this comment claimed both were server-side; anyone converting `form-clone` to
 * owned collections on that basis would reinstate issue #103 inside the clone service.
 *
 * Fakes follow MJ core's own `relatedRecordCollection.load.test.ts` — duck-typed owner and records.
 * The one thing modelled more carefully here is DIRTY: a real `BaseEntity.Set` marks the record
 * dirty only when the value actually CHANGES, and the whole question of whether a reorder costs
 * one write or N turns on that.
 */
import { describe, expect, it } from 'vitest';
import { RelatedRecordCollection } from '@memberjunction/core';
import type { BaseEntity } from '@memberjunction/core';

function makeRecord(id: string, displayOrder: number): BaseEntity {
  const data: Record<string, unknown> = { ID: id, PageID: 'PAGE1', DisplayOrder: displayOrder };
  let dirty = false;
  return {
    get Dirty() {
      return dirty;
    },
    IsSaved: true,
    Get: (f: string) => data[f],
    // Real BaseEntity semantics: writing the value it already holds is not a change.
    Set: (f: string, v: unknown) => {
      if (data[f] !== v) {
        data[f] = v;
        dirty = true;
      }
    },
    GetAll: () => ({ ...data }),
  } as unknown as BaseEntity;
}

function makeCollection() {
  const owner = {
    EntityInfo: { Name: 'MJ_BizApps_Forms: Form Pages' },
    FirstPrimaryKey: { Value: 'PAGE1' },
    PrimaryKey: { ToString: () => 'PAGE1' },
    IsSaved: true,
    ContextCurrentUser: undefined,
    ProviderToUse: { RunView: async () => ({ Success: true, Results: [] }) },
  } as unknown as BaseEntity;

  return new RelatedRecordCollection(owner, {
    Name: 'Questions',
    RelatedEntity: 'MJ_BizApps_Forms: Form Questions',
    RelatedEntityJoinField: 'PageID',
    OrderBy: 'DisplayOrder ASC',
    Load: 'explicit',
    OnRemove: 'delete',
    Sequence: { Field: 'DisplayOrder', From: 0 },
  });
}

const ids = (c: RelatedRecordCollection): string[] => c.Items.map((i) => i.Get('ID') as string);
const orders = (c: RelatedRecordCollection): number[] =>
  c.Items.map((i) => i.Get('DisplayOrder') as number);

describe('the obvious way to reorder is a data-loss trap', () => {
  it('Remove-then-Add queues a DELETE of the row being moved', () => {
    const c = makeCollection();
    const [a, b, d] = [makeRecord('A', 0), makeRecord('B', 1), makeRecord('C', 2)];
    c.SetLoadedItems([a, b, d]);

    // "Move C to the front" — the intuitive expression of a drag.
    c.Remove(d);
    c.Add(d);

    expect(ids(c)).toEqual(['A', 'B', 'C']);
    // THE TRAP. `Remove` pushes a persisted child onto `removed`, and `Add` does not take it back
    // off. Saving the parent now DELETES question C and re-inserts nothing — the row, its id, and
    // every answer that references it are gone. This is why reorder cannot be Remove+Add.
    expect(c.Removed).toHaveLength(1);
    expect(c.Removed[0].Get('ID')).toBe('C');
  });
});

describe('SetLoadedItems + re-Add is the working expression', () => {
  it('reorders and renumbers with no queued deletions', () => {
    const c = makeCollection();
    const [a, b, d] = [makeRecord('A', 0), makeRecord('B', 1), makeRecord('C', 2)];
    c.SetLoadedItems([a, b, d]);

    // Clear WITHOUT Remove() — SetLoadedItems resets `removed`, so nothing is queued for delete —
    // then re-add in the new order. Each Add re-runs the sequence over the whole list.
    c.SetLoadedItems([]);
    for (const item of [d, a, b]) {
      c.Add(item);
    }

    expect(ids(c)).toEqual(['C', 'A', 'B']);
    expect(orders(c)).toEqual([0, 1, 2]);
    expect(c.Removed).toHaveLength(0);
  });

  it('dirties only the rows whose position actually changed', () => {
    // The property that decides whether this is cheaper than today's loop. Today
    // `persistQuestionOrder` skips a row whose DisplayOrder is unchanged; the replacement must not
    // regress that into "rewrite every sibling on every drag".
    const c = makeCollection();
    const rows = ['A', 'B', 'C', 'D', 'E'].map((id, i) => makeRecord(id, i));
    c.SetLoadedItems(rows);

    // Swap only the last two: C and the head keep their positions.
    c.SetLoadedItems([]);
    for (const item of [rows[0], rows[1], rows[2], rows[4], rows[3]]) {
      c.Add(item);
    }

    expect(ids(c)).toEqual(['A', 'B', 'C', 'E', 'D']);
    expect(rows.slice(0, 3).map((r) => r.Dirty)).toEqual([false, false, false]);
    expect([rows[3].Dirty, rows[4].Dirty]).toEqual([true, true]);
  });
});

describe('a delete through the collection', () => {
  it('queues the removal and renumbers the survivors in one shot', () => {
    const c = makeCollection();
    const rows = ['A', 'B', 'C'].map((id, i) => makeRecord(id, i));
    c.SetLoadedItems(rows);

    c.Remove(rows[0]);

    expect(ids(c)).toEqual(['B', 'C']);
    expect(orders(c)).toEqual([0, 1]);
    expect(c.Removed.map((r) => r.Get('ID'))).toEqual(['A']);
  });
});
