import { describe, it, expect, vi } from 'vitest';
import { BuilderStateService } from './builder-state.service';
import type { mjBizAppsFormsFormQuestionEntity } from '@mj-biz-apps/forms-entities';

/**
 * A stand-in for the one `BaseEntity` behaviour that caused the bug: `Save()` RE-READS the record
 * from the row it gets back, so any field written while a save is in flight is discarded the
 * moment that save returns.
 *
 * That is not a quirk of this fake — it is what made an author's typing vanish in the running
 * Explorer, and modelling it is the only way a unit test can hold the fix.
 */
class RaceyEntity {
  public Settings: string | null = null;
  public saves = 0;
  /** What a `Save()` would have persisted, in call order. */
  public persisted: Array<string | null> = [];

  public LatestResult = { CompleteMessage: '' };

  public async Save(): Promise<boolean> {
    this.saves++;
    const snapshot = this.Settings;
    // The round trip. Anything written during it is about to be lost.
    await new Promise((r) => setTimeout(r, 10));
    this.persisted.push(snapshot);
    this.Settings = snapshot;
    return true;
  }
}

/** The service only ever calls `Save()` / `Delete()` on what it is handed. */
function serviceWith(): { service: BuilderStateService; entity: RaceyEntity } {
  const service = new BuilderStateService();
  return { service, entity: new RaceyEntity() };
}

function asEntity(e: RaceyEntity): mjBizAppsFormsFormQuestionEntity {
  return e as unknown as mjBizAppsFormsFormQuestionEntity;
}

describe('saveDebounced', () => {
  it('coalesces a burst of edits into ONE save carrying the final value', async () => {
    // THE REGRESSION. Filling a question's four Opinion-scale settings fires four `change`
    // events in quick succession. With a direct save per edit, the second value was lost from
    // both the input and the database — verified by hand in the Explorer before this fix.
    vi.useFakeTimers();
    const { service, entity } = serviceWith();

    entity.Settings = '{"min":1}';
    service.saveDebounced(asEntity(entity));
    entity.Settings = '{"min":1,"max":5}';
    service.saveDebounced(asEntity(entity));
    entity.Settings = '{"min":1,"max":5,"labelMin":"Whenever"}';
    service.saveDebounced(asEntity(entity));
    entity.Settings = '{"min":1,"max":5,"labelMin":"Whenever","labelMax":"Today"}';
    service.saveDebounced(asEntity(entity));

    await vi.runAllTimersAsync();
    await service.flushPendingSaves();
    vi.useRealTimers();

    expect(entity.saves).toBe(1);
    expect(entity.persisted).toEqual(['{"min":1,"max":5,"labelMin":"Whenever","labelMax":"Today"}']);
  });

  it('flush runs a save still sitting on its timer', async () => {
    // What publish depends on: an edit made a moment before pressing Publish must be on disk.
    const { service, entity } = serviceWith();
    entity.Settings = '{"terms":"Be excellent"}';
    service.saveDebounced(asEntity(entity));

    await service.flushPendingSaves();

    expect(entity.saves).toBe(1);
    expect(entity.persisted).toEqual(['{"terms":"Be excellent"}']);
  });

  it('never runs two saves of the same entity at once', async () => {
    // The chain, not the debounce, is what guarantees this: a flush arriving mid-write must queue
    // behind the write rather than start a second one.
    const { service, entity } = serviceWith();
    let concurrent = 0;
    let peak = 0;
    entity.Save = async () => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return true;
    };

    service.saveDebounced(asEntity(entity));
    const first = service.flushPendingSaves();
    service.saveDebounced(asEntity(entity));
    const second = service.flushPendingSaves();
    await Promise.all([first, second]);

    expect(peak).toBe(1);
  });

  it('leaves nothing pending after a flush', async () => {
    const { service, entity } = serviceWith();
    service.saveDebounced(asEntity(entity));
    await service.flushPendingSaves();
    // A second flush with nothing queued must be a no-op rather than a re-save.
    await service.flushPendingSaves();
    expect(entity.saves).toBe(1);
  });

  it('flushing with nothing queued resolves immediately', async () => {
    const { service } = serviceWith();
    await expect(service.flushPendingSaves()).resolves.toBeUndefined();
  });

  it('keeps saves for different entities independent', async () => {
    const service = new BuilderStateService();
    const a = new RaceyEntity();
    const b = new RaceyEntity();
    a.Settings = 'a';
    b.Settings = 'b';
    service.saveDebounced(asEntity(a));
    service.saveDebounced(asEntity(b));

    await service.flushPendingSaves();

    expect(a.persisted).toEqual(['a']);
    expect(b.persisted).toEqual(['b']);
  });
});

describe('flushPendingSaves cannot hang the caller forever', () => {
  /**
   * An entity that queues another save from inside its own save — the shape that turns the
   * drain loop into an infinite one. Contrived here, but the loop's exit condition is
   * "saveChains is empty", and nothing stopped a chain from being non-empty on every check.
   */
  class SelfRequeueingEntity {
    public saves = 0;
    public LatestResult = { CompleteMessage: '' };
    public service: BuilderStateService | null = null;

    public async Save(): Promise<boolean> {
      this.saves++;
      // Re-arm while the drain is still running.
      this.service?.saveDebounced(this as unknown as mjBizAppsFormsFormQuestionEntity);
      return true;
    }
  }

  it('terminates under sustained re-queueing, and says so when it gave up', async () => {
    // `flushPendingSaves` is awaited on the PUBLISH path, so an unbounded loop here does not just
    // spin — it hangs Publish with no error and no way out but a reload.
    //
    // Fake timers are what make this deterministic AND what make it a faithful reproduction: a
    // re-queue goes through `saveDebounced`'s timer, so with `runAllTimersAsync` draining them
    // the drain loop sees a non-empty chain map on every single check — exactly the state a
    // steady stream of edits during a publish produces, with none of the flakiness of racing a
    // real 400ms debounce.
    vi.useFakeTimers();
    try {
      const service = new BuilderStateService();
      const entity = new SelfRequeueingEntity();
      entity.service = service;
      service.saveDebounced(entity as unknown as mjBizAppsFormsFormQuestionEntity);

      const flushed = service.flushPendingSaves();
      // Let every re-queued timer fire while the drain is running.
      const pump = (async () => {
        for (let i = 0; i < 200; i++) {
          await vi.advanceTimersByTimeAsync(400);
        }
      })();

      await expect(Promise.all([flushed, pump])).resolves.toBeTruthy();
      expect(entity.saves).toBeGreaterThan(0);
      // Honest about what this proves: the drain ends whenever the edit stream does, so this is
      // a bound on the number of passes rather than a reproduction of a real hang. The cap exists
      // because publish AWAITS this method, and a loop whose exit depends on input it does not
      // control should not be the thing standing between an author and their form.
      //
      // Two sources of saves, and the bound has to name both: one per pumped tick, plus one per
      // drain pass, because the drain now walks the TIMER map on every pass rather than once
      // before the loop. That change is the point — a timer armed after a single up-front drain
      // was invisible to it, so the flush reported "nothing pending" with an edit still pending.
      // 50 is `MAX_FLUSH_PASSES` in the service, written out rather than imported: exporting a
      // private cap so a test can read it would make the cap part of the module's interface.
      expect(entity.saves).toBeLessThanOrEqual(1 + 200 + 50);
      // The half of this test's name that it never actually checked. Giving up silently is the
      // failure mode that matters here: the caller is about to publish, and a flush that came
      // back quiet is the only thing telling it the database matches what it is about to share.
      expect(service.lastFailure()).toMatch(/still being saved/i);
    } finally {
      vi.useRealTimers();
    }
  });
});
