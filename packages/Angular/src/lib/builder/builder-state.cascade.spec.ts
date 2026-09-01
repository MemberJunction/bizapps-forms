/**
 * REGRESSION SUITE for issue #103 — the hand-rolled cascade and the hand-rolled re-sequence.
 *
 * Each test names the behaviour it USED to have. `BaseEntity.Delete()` and `.Save()` refuse by
 * returning `false`, never by throwing, so a cascade written as a `for` loop over `await` has no
 * rollback and no way to acquire one: whatever it had already written stayed written. The builder
 * then read `false`, declined to update its in-memory tree (`form-builder.component.ts:622`), and
 * went on rendering rows that were gone from the database. Nothing told the author until a reload.
 *
 * WHY A TRANSACTION GROUP AND NOT `entity.Delete()`. The obvious fix — declare the children as an
 * owned `RelatedRecordCollection` and let `Delete()` cascade — does not work FROM THE BROWSER, and
 * core says so itself (`baseEntity.js`, doc comment on `deleteGraph`): a delete graph has no remote
 * counterpart, so on a client provider "the nodes execute in order over ordinary mutations. That is
 * not atomic — a failure partway leaves earlier deletions committed." That is the very defect this
 * file exists to pin, relocated one layer down. `GraphQLTransactionGroup` IS atomic — it bundles
 * every enlisted mutation into one `ExecuteTransactionGroup` call that the server runs in a real
 * database transaction — so that is what the structural operations use.
 *
 * The entities are fakes cast through `as unknown as`, the way `builder-state.failure.spec.ts`
 * does it: `BuilderStateService` never constructs its own children, it only calls `Save()` /
 * `Delete()` on what it is handed, so a fake with those two methods exercises the real control
 * flow. `FakeTransactionGroup` models the one property the fix turns on — enlisting always
 * succeeds, and refusal surfaces at the commit, all-or-nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Metadata } from '@memberjunction/core';
import { BuilderStateService } from './builder-state.service';
import type { PageNode, QuestionNode } from './builder-models';
import type {
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
} from '@mj-biz-apps/forms-entities';

/**
 * A row that records what actually reached the database.
 *
 * `writes` is shared across every row in one test, so the array doubles as the round-trip count —
 * the other half of what the issue is about.
 *
 * `Delete()` mirrors the GraphQL provider exactly: when a transaction group is set it ENLISTS and
 * returns true without writing anything (provider `index.mjs`: `if (e.TransactionGroup) { …
 * AddTransaction(…); return true }`). That is the shape the fix depends on — a refusal cannot
 * surface at enlist time, only at the commit — and a fake that returned false here instead would
 * let a broken implementation pass.
 */
class FakeRow {
  public LatestResult = { CompleteMessage: 'The DELETE statement conflicted with a FK constraint.' };
  public DisplayOrder = 0;
  public TransactionGroup: FakeTransactionGroup | null = null;

  constructor(
    public readonly label: string,
    private readonly writes: string[],
    public readonly refuses = false,
    /**
     * Refuses BEFORE enlisting, which is a different failure from `refuses` and the one the fake
     * originally could not express. Core runs `CheckPermissions` and `Validate()` ahead of the
     * provider call and returns false from its own catch, so the row never reaches
     * `AddTransaction` — the commit that follows cannot know it was meant to include this row, and
     * a group left holding nothing at all still reports success.
     */
    public readonly refusesBeforeEnlist = false,
  ) {}

  public async Delete(): Promise<boolean> {
    if (this.refusesBeforeEnlist) {
      return false;
    }
    if (this.TransactionGroup) {
      this.TransactionGroup.Enlist(this.label, this);
      return true;
    }
    if (this.refuses) {
      return false;
    }
    this.writes.push(`DELETE ${this.label}`);
    return true;
  }

  public async Save(): Promise<boolean> {
    if (this.refusesBeforeEnlist) {
      return false;
    }
    if (this.TransactionGroup) {
      this.TransactionGroup.Enlist(`${this.label}@${this.DisplayOrder}`, this);
      return true;
    }
    if (this.refuses) {
      return false;
    }
    this.writes.push(`SAVE ${this.label}@${this.DisplayOrder}`);
    return true;
  }
}

/**
 * One `ExecuteTransactionGroup` round trip, all-or-nothing.
 *
 * A single `COMMIT a,b,c` entry rather than one per row, because "how many round trips" is half of
 * what issue #103 is about and an entry per row would hide the answer.
 */
class FakeTransactionGroup {
  private readonly enlisted: { description: string; row: FakeRow }[] = [];

  /**
   * A stream that never emits, hand-rolled rather than an rxjs `Subject` so the spec needs no
   * import beyond the ones it already has.
   *
   * Never emitting is the accurate model: the real group emits an error only when the submit
   * THROWS (a dropped connection, a rejected mutation). A plain refusal comes back as
   * `Success: false` with no error attached — which is the case these tests exercise, and the case
   * where the reported reason falls back to the row's own `LatestResult`.
   */
  public readonly TransactionNotifications$ = {
    subscribe: () => ({ unsubscribe: () => undefined }),
  };

  constructor(private readonly writes: string[]) {}

  public Enlist(description: string, row: FakeRow): void {
    this.enlisted.push({ description, row });
  }

  public async Submit(): Promise<boolean> {
    if (this.enlisted.length === 0) {
      // Core's own behaviour, and a trap: "nothing was queued" reports the same `true` as "all of
      // it committed" (`transactionGroup.js`: "there are no transactions to submit, so we just
      // return true"). A caller that reads only this boolean cannot tell a clean commit from a
      // reorder in which every single row was refused before it ever enlisted.
      return true;
    }
    if (this.enlisted.some((item) => item.row.refuses)) {
      return false; // the server rolled the whole thing back; nothing is written
    }
    this.writes.push(`COMMIT ${this.enlisted.map((item) => item.description).join(',')}`);
    return true;
  }
}

/**
 * Hand the service a fake group instead of one from a provider it does not have in a unit test.
 * Returns the `writes` array the group and its rows share.
 */
function stubTransactionGroup(): string[] {
  const writes: string[] = [];
  vi.spyOn(Metadata.prototype, 'CreateTransactionGroup').mockImplementation(
    async () => new FakeTransactionGroup(writes) as unknown as Awaited<ReturnType<Metadata['CreateTransactionGroup']>>,
  );
  return writes;
}

afterEach(() => {
  vi.restoreAllMocks();
});

const asQuestionNode = (row: FakeRow, options: FakeRow[] = []): QuestionNode => ({
  entity: row as unknown as mjBizAppsFormsFormQuestionEntity,
  options: options as unknown as mjBizAppsFormsFormQuestionOptionEntity[],
});

const asPageNode = (row: FakeRow, questions: QuestionNode[]): PageNode => ({
  entity: row as unknown as mjBizAppsFormsFormPageEntity,
  questions,
});

describe('deleting a page or a question is one transaction (issue #103)', () => {
  it('deletes a page, its questions and their options as one unit, or not at all', async () => {
    // WAS: q1 permanently gone, q2 and q3 and the page still there — the author asked to delete a
    // section and got two thirds of one, a state the product has no name for.
    const writes = stubTransactionGroup();
    const page = asPageNode(new FakeRow('page', writes), [
      asQuestionNode(new FakeRow('q1', writes)),
      asQuestionNode(new FakeRow('q2', writes, true)), // refuses — a FK from a submitted answer
      asQuestionNode(new FakeRow('q3', writes)),
    ]);

    const ok = await new BuilderStateService().deletePage(page);

    expect(ok).toBe(false);
    expect(writes).toEqual([]); // nothing was written — that is the entire fix
  });

  it('deletes a question and its options as one unit, or not at all', async () => {
    // WAS: opt1 deleted, opt2 refused, and the question left live offering two answers where the
    // author wrote three, with nothing anywhere saying so.
    const writes = stubTransactionGroup();
    const node = asQuestionNode(new FakeRow('question', writes), [
      new FakeRow('opt1', writes),
      new FakeRow('opt2', writes, true),
      new FakeRow('opt3', writes),
    ]);

    const ok = await new BuilderStateService().deleteQuestion(node);

    expect(ok).toBe(false);
    expect(writes).toEqual([]);
  });

  it('commits one transaction, not ten round trips', async () => {
    // The ordinary case, and the other half of the issue: three questions with two options each
    // used to be ten separate awaited round trips issued in series.
    const writes = stubTransactionGroup();
    const questions = [1, 2, 3].map((n) =>
      asQuestionNode(new FakeRow(`q${n}`, writes), [
        new FakeRow(`q${n}-o1`, writes),
        new FakeRow(`q${n}-o2`, writes),
      ]),
    );

    const ok = await new BuilderStateService().deletePage(
      asPageNode(new FakeRow('page', writes), questions),
    );

    expect(ok).toBe(true);
    // Deepest first, because a foreign key points at every row that goes after it.
    expect(writes).toEqual([
      'COMMIT q1-o1,q1-o2,q1,q2-o1,q2-o2,q2,q3-o1,q3-o2,q3,page',
    ]);
  });

  it('tells the author which operation was refused', async () => {
    // A refusal that reports nothing is the defect `reportFailure` was written to end; routing the
    // delete through a transaction must not quietly reintroduce it.
    stubTransactionGroup();
    const service = new BuilderStateService();

    await service.deletePage(
      asPageNode(new FakeRow('page', [], true), []),
    );

    expect(service.lastFailure()).toMatch(/^Could not delete page\./);
  });
});

describe('a structural change never rides along with a half-typed edit', () => {
  it('flushes pending autosaves before it opens the transaction', async () => {
    // A field edit sits on a 400ms debounce. Restructuring the tree while one is pending would
    // race it: the pending save targets a row this transaction may be deleting, and whichever
    // lands second reports a failure about a record the author has already moved on from.
    const writes = stubTransactionGroup();
    const service = new BuilderStateService();
    const typing = new FakeRow('typed-edit', writes);

    service.saveDebounced(typing as unknown as mjBizAppsFormsFormQuestionEntity);
    await service.deleteQuestion(asQuestionNode(new FakeRow('deleted', writes)));

    // The pending edit is written as ITS OWN save, before the delete's transaction opens.
    expect(writes).toEqual(['SAVE typed-edit@0', 'COMMIT deleted']);
  });
});

describe('reordering is one transaction (issue #103)', () => {
  it('leaves the stored order exactly as it was when a write refuses', async () => {
    // WAS: `first` and `third` renumbered and saved, `second` refused — the stored form left with
    // two questions at their new positions and one at its old one, an order the author never asked
    // for and cannot get back.
    const writes = stubTransactionGroup();
    const first = new FakeRow('first', writes);
    const second = new FakeRow('second', writes, true);
    const third = new FakeRow('third', writes);
    first.DisplayOrder = 2;
    second.DisplayOrder = 0;
    third.DisplayOrder = 1;

    const page = asPageNode(new FakeRow('page', writes), [
      asQuestionNode(first),
      asQuestionNode(second),
      asQuestionNode(third),
    ]);

    const ok = await new BuilderStateService().persistQuestionOrder(page);

    expect(ok).toBe(false);
    expect(writes).toEqual([]);
    // WAS: the in-memory entities were renumbered BEFORE the save and never put back, so the
    // builder went on showing an order the database did not have. They are restored now.
    expect([first.DisplayOrder, second.DisplayOrder, third.DisplayOrder]).toEqual([2, 0, 1]);
  });

  it('still writes only the rows that actually moved', async () => {
    // The one thing the old loop got right, and the replacement must not regress: a row already at
    // its target index is not written at all.
    const writes = stubTransactionGroup();
    const rows = [0, 1, 2, 3, 4].map((n) => {
      const row = new FakeRow(`q${n}`, writes);
      row.DisplayOrder = 4 - n; // reversed
      return row;
    });

    const ok = await new BuilderStateService().persistQuestionOrder(
      asPageNode(
        new FakeRow('page', writes),
        rows.map((r) => asQuestionNode(r)),
      ),
    );

    expect(ok).toBe(true);
    // Four rows, not five: reversing an odd-length list leaves the middle one already in place.
    expect(writes).toEqual(['COMMIT q0@0,q1@1,q3@3,q4@4']);
  });

  it('costs nothing at all when nothing moved', async () => {
    // Dropping a question back where it started still fires the reorder. Opening a transaction to
    // write no rows would be a round trip for nothing.
    const writes = stubTransactionGroup();
    const rows = [0, 1, 2].map((n) => {
      const row = new FakeRow(`q${n}`, writes);
      row.DisplayOrder = n;
      return row;
    });

    const ok = await new BuilderStateService().persistQuestionOrder(
      asPageNode(new FakeRow('page', writes), rows.map((r) => asQuestionNode(r))),
    );

    expect(ok).toBe(true);
    expect(writes).toEqual([]);
  });

  it('reorders a question\'s options the same way', async () => {
    const writes = stubTransactionGroup();
    const options = [0, 1].map((n) => {
      const row = new FakeRow(`opt${n}`, writes);
      row.DisplayOrder = 1 - n;
      return row;
    });

    const ok = await new BuilderStateService().persistOptionOrder(
      asQuestionNode(new FakeRow('question', writes), options),
    );

    expect(ok).toBe(true);
    expect(writes).toEqual(['COMMIT opt0@0,opt1@1']);
  });
});

describe('a committed transaction releases the rows it borrowed', () => {
  it('still writes a field edit made after a reorder commits', async () => {
    // The regression this file exists to prevent, arriving by the opposite route. `TransactionGroup`
    // is a property on the entity, and the entities here are the ones the builder keeps in its tree
    // for the whole session. Leave the group attached and MJ queues every later `Save()` onto a
    // group nobody will ever submit again — returning true, writing nothing, reporting nothing.
    const writes = stubTransactionGroup();
    const first = new FakeRow('first', writes);
    const second = new FakeRow('second', writes);
    first.DisplayOrder = 1;
    second.DisplayOrder = 0;
    const page = asPageNode(new FakeRow('page', writes), [
      asQuestionNode(first),
      asQuestionNode(second),
    ]);
    const service = new BuilderStateService();

    expect(await service.persistQuestionOrder(page)).toBe(true);
    writes.length = 0;

    // The author now retypes the prompt on a question that happened to move.
    expect(await service.save(first as unknown as mjBizAppsFormsFormQuestionEntity)).toBe(true);

    expect(writes).toEqual(['SAVE first@0']);
  });
});

describe('a row that refuses before it enlists is still a refusal', () => {
  it('reports a reorder as refused when a row never reached the transaction', async () => {
    // The subtler half of issue #103. `Save()` runs validation and permission checks BEFORE the
    // provider call, so a refused row returns false WITHOUT queueing anything. The commit then
    // succeeds over the rows that did queue and the reorder reports success — leaving two
    // questions sharing a DisplayOrder, which is the divergence this whole file exists to end.
    const writes = stubTransactionGroup();
    const first = new FakeRow('first', writes);
    const second = new FakeRow('second', writes, false, true); // refuses before enlisting
    first.DisplayOrder = 1;
    second.DisplayOrder = 0;
    const page = asPageNode(new FakeRow('page', writes), [
      asQuestionNode(first),
      asQuestionNode(second),
    ]);
    const service = new BuilderStateService();

    expect(await service.persistQuestionOrder(page)).toBe(false);

    expect(writes).toEqual([]); // the partial commit never happened
    expect([first.DisplayOrder, second.DisplayOrder]).toEqual([1, 0]); // put back
    expect(service.lastFailure()).toMatch(/^Could not reorder question\./);
  });

  it('does not report success for a transaction that ended up empty', async () => {
    // Every row refused before enlisting, so the group holds nothing — and core returns true for
    // an empty queue. Reading only that boolean turns "nothing was written" into "all done".
    const writes = stubTransactionGroup();
    const only = new FakeRow('only', writes, false, true);
    only.DisplayOrder = 3;
    const page = asPageNode(new FakeRow('page', writes), [asQuestionNode(only)]);

    const service = new BuilderStateService();

    expect(await service.persistQuestionOrder(page)).toBe(false);
    expect(writes).toEqual([]);
    expect(only.DisplayOrder).toBe(3);
  });

  it('hands the rows back even when the enlist loop stops early', async () => {
    // The abandoned-group path: rows 1..k-1 are already enlisted when row k refuses. Releasing
    // only on the happy path would leave those rows bound to a group nobody will ever submit, so
    // the author's next edit to any of them would vanish — a page they were told they could not
    // delete quietly becoming read-only.
    const writes = stubTransactionGroup();
    const survivor = new FakeRow('survivor', writes);
    const blocked = new FakeRow('blocked', writes, false, true);
    const node = asQuestionNode(new FakeRow('question', writes), [survivor, blocked]);
    const service = new BuilderStateService();

    expect(await service.deleteQuestion(node)).toBe(false);

    expect(survivor.TransactionGroup).toBeNull();
    expect(blocked.TransactionGroup).toBeNull();
    writes.length = 0;
    expect(await service.save(survivor as unknown as mjBizAppsFormsFormQuestionEntity)).toBe(true);
    expect(writes).toEqual(['SAVE survivor@0']);
  });
});
