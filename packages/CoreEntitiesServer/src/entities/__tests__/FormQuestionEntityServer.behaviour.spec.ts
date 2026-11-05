/**
 * `FormQuestionEntityServer.Delete` over a fake generated base whose `Options` collection records
 * how it was loaded. MJ's delete graph — which deletes a loaded collection's children before the
 * parent, in one transaction — is MJ's to test; what this class adds, and what is pinned here, is
 * that the collection is loaded BEFORE that graph is built, whoever loaded the question.
 */
import { describe, expect, it, vi } from 'vitest';
import type { FakeEntityBase } from './fake-entity-base.js';

/** The two members of `RelatedRecordCollection` the subclass touches. */
interface FakeOptionsCollection {
  IsLoaded: boolean;
  loads: boolean[];
  loadError: Error | null;
  Load(force?: boolean): Promise<void>;
}

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: vi.fn() };
});

vi.mock('@mj-biz-apps/forms-entities', async () => {
  const actual = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
  const { FakeEntityBase } = await import('./fake-entity-base.js');
  class FakeQuestionBase extends FakeEntityBase {
    public Options: FakeOptionsCollection = {
      IsLoaded: false,
      loads: [],
      loadError: null,
      Load: async (force?: boolean) => {
        this.events.push('load-options');
        this.Options.loads.push(force === true);
        if (this.Options.loadError) {
          throw this.Options.loadError;
        }
        this.Options.IsLoaded = true;
      },
    };
  }
  return { ...actual, mjBizAppsFormsFormQuestionEntity: FakeQuestionBase };
});

const { FormQuestionEntityServer } = await import('../FormQuestionEntityServer.js');

type Subject = InstanceType<typeof FormQuestionEntityServer> & FakeEntityBase & { ID: string; Options: FakeOptionsCollection };
const Construct = FormQuestionEntityServer as unknown as new () => Subject;

function question(): Subject {
  return new Construct().load({ ID: 'q-1', Prompt: 'Your name' });
}

describe('deleting a question deletes its options with it (§7)', () => {
  it('loads the options collection BEFORE the delete, so MJ\'s delete graph includes them', async () => {
    const q = question();
    expect(await q.Delete()).toBe(true);
    expect(q.events).toEqual(['load-options', 'delete']);
  });

  it('forces the load, so a collection that was only appended to cannot block the delete', async () => {
    const q = question();
    await q.Delete();
    expect(q.Options.loads).toEqual([true]);
  });

  it('does not reload a collection the caller already loaded — its pending removals stand', async () => {
    const q = question();
    q.Options.IsLoaded = true;
    await q.Delete();
    expect(q.events).toEqual(['delete']);
  });

  it('a question that was never saved has no stored options to load', async () => {
    const q = new Construct();
    await q.Delete();
    expect(q.events).toEqual(['delete']);
  });

  it('when the options cannot be read, deletes NOTHING and says why', async () => {
    const q = question();
    q.Options.loadError = new Error('read refused');
    expect(await q.Delete()).toBe(false);
    expect(q.events).toEqual(['load-options']);
    expect(q.LatestResult?.CompleteMessage).toMatch(/q-1[\s\S]*read refused[\s\S]*Nothing was deleted/);
  });
});
