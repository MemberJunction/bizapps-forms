/**
 * The write ORDER of a cross-section move, which is the whole of its integrity story.
 *
 * There is no transaction here: this is one `PageID` write plus up to N+M `DisplayOrder` writes,
 * one row at a time, any of which the database can refuse. Rolling back is not the answer — the
 * rollback needs writes of its own, which can also fail — so the order is chosen instead, such
 * that every prefix of it leaves a tree that reloads consistently.
 *
 * MEMBERSHIP GOES FIRST AND ALONE. `PageID` is the only write that cannot be re-derived from
 * what is on screen; `DisplayOrder` is re-asserted by the next reorder or by a reload. And
 * because `PageID` is one column on one row written by one `Save()`, a question belongs to
 * exactly one page at every instant — "orphaned between sections" is unrepresentable, and the
 * worst a partial failure can do is leave an order within one page wrong.
 */
import { describe, it, expect } from 'vitest';
import { BuilderStateService } from './builder-state.service';
import type { mjBizAppsFormsFormQuestionEntity } from '@mj-biz-apps/forms-entities';
import type { PageNode, QuestionNode } from './builder-models';

/** What a row's `Save()` actually persisted, in call order across the whole fixture. */
interface WriteLog {
  entries: Array<{ id: string; pageId: string | null; displayOrder: number }>;
}

class FakeQuestionEntity {
  public PageID: string | null = null;
  public DisplayOrder = 0;
  public LatestResult = { CompleteMessage: 'refused by the fake' };

  public constructor(
    public readonly ID: string,
    private readonly log: WriteLog,
    /** Return false to model a refusal on this row. */
    private readonly accept: () => boolean = () => true,
  ) {}

  public async Save(): Promise<boolean> {
    if (!this.accept()) {
      return false;
    }
    this.log.entries.push({ id: this.ID, pageId: this.PageID, displayOrder: this.DisplayOrder });
    return true;
  }
}

const asEntity = (e: FakeQuestionEntity): mjBizAppsFormsFormQuestionEntity =>
  e as unknown as mjBizAppsFormsFormQuestionEntity;

function node(entity: FakeQuestionEntity): QuestionNode {
  return { entity: asEntity(entity), options: [] };
}

/** A page whose entity only needs an ID for this method. */
function page(id: string, questions: QuestionNode[]): PageNode {
  return { entity: { ID: id } as PageNode['entity'], questions };
}

/**
 * pA holds a1 a2 a3 (DisplayOrder 0 1 2), pB holds b1 b2 (0 1), and `a2` has ALREADY been moved
 * in memory into pB at `index` — which is the precondition the method is documented to require.
 */
function fixture(index: number, accept: () => boolean = () => true) {
  const log: WriteLog = { entries: [] };
  const make = (id: string, pageId: string, order: number): FakeQuestionEntity => {
    const e = new FakeQuestionEntity(id, log, accept);
    e.PageID = pageId;
    e.DisplayOrder = order;
    return e;
  };
  const a1 = node(make('a1', 'pA', 0));
  const a2 = node(make('a2', 'pA', 1));
  const a3 = node(make('a3', 'pA', 2));
  const b1 = node(make('b1', 'pB', 0));
  const b2 = node(make('b2', 'pB', 1));

  const destinationQuestions = [b1, b2];
  destinationQuestions.splice(index, 0, a2);

  return {
    log,
    moved: a2,
    source: page('pA', [a1, a3]),
    destination: page('pB', destinationQuestions),
    service: new BuilderStateService(),
  };
}

describe('persistCrossPageMove', () => {
  describe('happy', () => {
    it('writes membership FIRST, in one row write, before renumbering anything', async () => {
      const { service, moved, source, destination, log } = fixture(1);

      expect(await service.persistCrossPageMove(moved, source, destination)).toBe(true);

      expect(log.entries[0]).toEqual({ id: 'a2', pageId: 'pB', displayOrder: 1 });
    });

    it('renumbers the destination and then the source, and never the moved row twice', async () => {
      // `persistQuestionOrder` skips a row whose DisplayOrder already matches its index, and the
      // membership write set the moved row to its final index — so it is skipped here. That
      // reads like an omission unless it is asserted.
      const { service, moved, source, destination, log } = fixture(1);

      await service.persistCrossPageMove(moved, source, destination);

      expect(log.entries.map((e) => e.id)).toEqual(['a2', 'b2', 'a3']);
      expect(log.entries.filter((e) => e.id === 'a2')).toHaveLength(1);
    });

    it('leaves both pages numbered 0..n-1 with no collision', async () => {
      const { service, moved, source, destination } = fixture(1);

      await service.persistCrossPageMove(moved, source, destination);

      expect(destination.questions.map((q) => q.entity.DisplayOrder)).toEqual([0, 1, 2]);
      expect(source.questions.map((q) => q.entity.DisplayOrder)).toEqual([0, 1]);
      expect(destination.questions.map((q) => q.entity.PageID)).toEqual(['pB', 'pB', 'pB']);
    });
  });

  describe('edge', () => {
    it('appends to the end of the destination', async () => {
      const { service, moved, source, destination, log } = fixture(2);

      expect(await service.persistCrossPageMove(moved, source, destination)).toBe(true);

      expect(log.entries[0]).toEqual({ id: 'a2', pageId: 'pB', displayOrder: 2 });
      expect(destination.questions.map((q) => q.entity.ID)).toEqual(['b1', 'b2', 'a2']);
    });

    it('writes PageID even when DisplayOrder happens not to change', async () => {
      // THE TRAP. Moving a question from index 1 of one section to index 1 of another leaves
      // DisplayOrder untouched, so `persistQuestionOrder` would skip it and PageID would never
      // reach the database — the question snaps back to its old section on the next reload.
      const { service, moved, source, destination, log } = fixture(1);
      expect(moved.entity.DisplayOrder).toBe(1);

      await service.persistCrossPageMove(moved, source, destination);

      expect(log.entries.some((e) => e.id === 'a2' && e.pageId === 'pB')).toBe(true);
    });
  });

  describe('worst', () => {
    it('writes nothing else when the membership write is refused', async () => {
      // Fail at (1): disk is exactly the pre-move state, so the move simply did not happen.
      const { service, moved, source, destination, log } = fixture(1, () => false);

      expect(await service.persistCrossPageMove(moved, source, destination)).toBe(false);

      expect(log.entries).toEqual([]);
    });

    it('reports a refusal to the author rather than swallowing it', async () => {
      const { service, moved, source, destination } = fixture(1, () => false);

      await service.persistCrossPageMove(moved, source, destination);

      expect(service.lastFailure()).toContain('refused by the fake');
    });

    it('reports false when a renumber fails after membership stuck', async () => {
      // Fail during (2)/(3): membership is on disk, so the question belongs to exactly one page.
      let calls = 0;
      const { service, moved, source, destination } = fixture(1, () => {
        calls += 1;
        return calls === 1;
      });

      expect(await service.persistCrossPageMove(moved, source, destination)).toBe(false);
    });

    it('refuses a question the caller has not moved in memory yet', async () => {
      const { service, moved, source, destination } = fixture(1);
      destination.questions = destination.questions.filter((q) => q !== moved);

      await expect(service.persistCrossPageMove(moved, source, destination)).rejects.toThrow(
        /not in destination page/,
      );
    });

    it('refuses a question still sitting in the source page', async () => {
      const { service, moved, source, destination } = fixture(1);
      source.questions.push(moved);

      await expect(service.persistCrossPageMove(moved, source, destination)).rejects.toThrow(
        /still in source page/,
      );
    });

    it('refuses a same-page "move", which is persistQuestionOrder\'s job', async () => {
      const { service, moved, source, destination } = fixture(1);

      await expect(service.persistCrossPageMove(moved, source, source)).rejects.toThrow(
        /same page/,
      );
      expect(destination.questions).toContain(moved);
    });
  });
});
