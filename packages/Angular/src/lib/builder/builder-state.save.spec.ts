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
