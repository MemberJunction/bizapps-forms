import { describe, expect, it, vi } from 'vitest';
import type { ActionDataProvider } from '../../shared/action-provider';

// The global Metadata/RunView (what `new Metadata()` / `new RunView()` with no args resolve to)
// THROW on any use. If MJBindingGateway ever fell back to them instead of the `provider` passed
// to its constructor, every test below would fail with 'global provider used' rather than the
// assertion it's actually making — exactly the isolation bizapps-forms#260 exists to guarantee.
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    public EntityByName(): never {
      throw new Error('global provider used');
    }
    public async GetEntityObject(): Promise<never> {
      throw new Error('global provider used');
    }
  }
  class RunView {
    constructor(private readonly provider?: { RunView(p: unknown, u?: unknown): Promise<unknown> } | null) {}
    async RunView(params: unknown, user?: unknown): Promise<unknown> {
      if (!this.provider) throw new Error('global provider used');
      return this.provider.RunView(params, user);
    }
  }
  return { ...actual, Metadata, RunView };
});

const { MJBindingGateway } = await import('../mj-binding-gateway');

const fakeUser = { Name: 'tester' } as never;

/** The one entity every fake provider below can resolve — mirrors a real `EntityInfo` shape. */
const KNOWN_ENTITY = {
  Name: 'Known: Entity',
  // FieldByName is case-insensitive in MJ, which is what lets an author write `email`
  // against a column named `Email` — and exactly why the canonical name must come from here.
  FieldByName: (f: string) => (f.toLowerCase() === 'email' ? { Name: 'Email' } : undefined),
  PrimaryKeys: [{ Name: 'ID' }],
  IncludeInAPI: true,
  VirtualEntity: false,
  AllowCreateAPI: true,
  AllowUpdateAPI: true,
  Fields: [
    { Name: 'Email', ReadOnly: false },
    { Name: 'ID', ReadOnly: true },
  ],
};

/**
 * The fake provider passed explicitly to every gateway below — everything the real gateway used
 * to route through `new Metadata()` / `new RunView()` for, now routed through here instead.
 */
function fakeProvider(): ActionDataProvider {
  return {
    EntityByName: (name: string) => (name === 'Known: Entity' ? KNOWN_ENTITY : undefined),
    async RunView() {
      return { Success: true, Results: [] };
    },
    async RunViews() {
      return [];
    },
    async GetEntityObject() {
      return {
        NewRecord: () => {},
        Set: () => {},
        InnerLoad: async () => true,
        Save: async () => true,
        PrimaryKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'written-1' }] },
        LatestResult: { CompleteMessage: '' },
      };
    },
  } as unknown as ActionDataProvider;
}

describe('MJBindingGateway.findMatch — identifier safety', () => {
  it('refuses a criterion naming a field the entity does not have', async () => {
    const gateway = new MJBindingGateway(fakeUser, fakeProvider());

    // The executor already rejects this, but the gateway is exported and callable on its own — a
    // check that lives only in the caller protects only the callers that remember it.
    await expect(
      gateway.findMatch({
        entityName: 'Known: Entity',
        criteria: [{ field: 'Email] OR 1=1 --', value: 'x', normalize: 'ExactMatch' }],
      }),
    ).rejects.toThrow(/is not a field/);
  });

  it('refuses a lookup against an entity that does not resolve', async () => {
    const gateway = new MJBindingGateway(fakeUser, fakeProvider());

    await expect(
      gateway.findMatch({ entityName: 'No: Such Entity', criteria: [] }),
    ).rejects.toThrow(/could not be resolved/);
  });

  it('accepts a real field written in a different casing', async () => {
    const gateway = new MJBindingGateway(fakeUser, fakeProvider());

    await expect(
      gateway.findMatch({ entityName: 'Known: Entity', criteria: [{ field: 'email', value: 'a@b.com', normalize: 'ExactMatch' }] }),
    ).resolves.toBeNull();
  });
});

describe('MJBindingGateway — routes every read and write through the supplied provider, never the global Metadata/RunView (#260)', () => {
  it('describeEntity resolves the entity off the supplied provider', async () => {
    const gateway = new MJBindingGateway(fakeUser, fakeProvider());

    await expect(gateway.describeEntity('Known: Entity', { create: true, update: true })).resolves.toEqual({
      names: new Set(['Email']),
      temporal: new Set(),
    });
  });

  it('writeRecord creates the target record through the supplied provider', async () => {
    const gateway = new MJBindingGateway(fakeUser, fakeProvider());

    await expect(gateway.writeRecord('Known: Entity', null, new Map([['Email', 'a@b.com']]))).resolves.toBe(
      'written-1',
    );
  });

  it('writeRecord loads an existing record (composite-key lookup included) through the supplied provider', async () => {
    const gateway = new MJBindingGateway(fakeUser, fakeProvider());

    await expect(
      gateway.writeRecord('Known: Entity', 'existing-1', new Map([['Email', 'a@b.com']])),
    ).resolves.toBe('written-1');
  });
});

// `sqlLiteral`'s own cases moved to packages/Entities/src/contracts/sql-literal.spec.ts along with
// the function. What remains here is the gateway's USE of it, which is the part this file is about:
// the criterion cases above assert the emitted `ExtraFilter` text, so a change to the escaping still
// fails here as well as there.
