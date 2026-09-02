import { afterEach, describe, it, expect, vi } from 'vitest';
import { Metadata } from '@memberjunction/core';
import { BuilderStateService } from './builder-state.service';
import type {
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
} from '@mj-biz-apps/forms-entities';

/**
 * A save/delete that REFUSES, the way `BaseEntity` actually refuses: by returning false with the
 * reason on `LatestResult`, never by throwing. That shape is the whole reason these failures went
 * unnoticed — a `try/catch` around the call would catch nothing.
 */
class RefusingEntity {
  public LatestResult = { CompleteMessage: 'The DELETE statement conflicted with a FK constraint.' };
  public async Save(): Promise<boolean> {
    return false;
  }
  public async Delete(): Promise<boolean> {
    return false;
  }
}

/** The ordinary case: a save that works. */
class AcceptingEntity {
  public LatestResult = { CompleteMessage: '' };
  public async Save(): Promise<boolean> {
    return true;
  }
}

function asQuestion(e: RefusingEntity | AcceptingEntity): mjBizAppsFormsFormQuestionEntity {
  return e as unknown as mjBizAppsFormsFormQuestionEntity;
}

function asOption(e: RefusingEntity): mjBizAppsFormsFormQuestionOptionEntity {
  return e as unknown as mjBizAppsFormsFormQuestionOptionEntity;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a mutation the database refuses', () => {
  it('is reported to the author, not only to the console', async () => {
    // THE DEFECT. Every failure was logged with `LogError` and nothing else, so an author saw a
    // Delete button that did nothing and had no way to learn why. The autosave path is worse
    // still: a refused save meant the edit they just typed was gone, silently.
    const service = new BuilderStateService();
    expect(service.lastFailure()).toBeNull();

    const saved = await service.save(asQuestion(new RefusingEntity()));

    expect(saved).toBe(false);
    expect(service.lastFailure()).toContain('conflicted with a FK constraint');
  });

  it('names which operation failed, so the message is actionable', async () => {
    const service = new BuilderStateService();
    await service.save(asQuestion(new RefusingEntity()));
    expect(service.lastFailure()).toMatch(/^Could not save\./);
  });

  it('reports a refused DELETE too — the case an author sees as a dead button', async () => {
    // Removing an option is a transaction now (it renumbers the survivors with it), so the
    // service asks for a group before it asks the row to delete itself. A unit test has no
    // provider behind `Metadata`, hence the stub — the row still refuses BEFORE it enlists, so
    // nothing is ever submitted and the reported message is the row's own.
    vi.spyOn(Metadata.prototype, 'CreateTransactionGroup').mockImplementation(
      async () =>
        ({
          Submit: async () => true,
          TransactionNotifications$: { subscribe: () => ({ unsubscribe: () => undefined }) },
        }) as unknown as Awaited<ReturnType<Metadata['CreateTransactionGroup']>>,
    );
    const service = new BuilderStateService();
    const option = asOption(new RefusingEntity());
    await service.deleteOption(option, [option]);
    expect(service.lastFailure()).toContain('Could not delete option');
  });

  it('reports a refused AUTOSAVE, which is the one that loses work', async () => {
    // The worst case, and the quietest: an author types, the debounced save is refused, and
    // nothing anywhere says so. They find out at Publish, if at all.
    const service = new BuilderStateService();
    service.saveDebounced(asQuestion(new RefusingEntity()));

    await service.flushPendingSaves();

    expect(service.lastFailure()).toContain('Could not save');
  });

  it('stays until dismissed, rather than vanishing on the next keystroke', async () => {
    const service = new BuilderStateService();
    await service.save(asQuestion(new RefusingEntity()));

    // A later SUCCESS must not silently clear it: the earlier write still failed, and the author
    // has not seen the message yet.
    await service.save(asQuestion(new AcceptingEntity()));
    expect(service.lastFailure()).not.toBeNull();

    service.dismissFailure();
    expect(service.lastFailure()).toBeNull();
  });

  it('starts clean', () => {
    expect(new BuilderStateService().lastFailure()).toBeNull();
  });
});
