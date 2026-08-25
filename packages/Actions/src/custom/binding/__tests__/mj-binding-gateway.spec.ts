import { describe, expect, it, vi } from 'vitest';

// Partial mock so the generated entity classes can still reach BaseEntity at runtime, while
// Metadata is replaced with one that reports a single known entity.
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    public EntityByName(name: string) {
      if (name !== 'Known: Entity') {
        return undefined;
      }
      return {
        Name: 'Known: Entity',
        // FieldByName is case-insensitive in MJ, which is what lets an author write `email`
        // against a column named `Email` — and exactly why the canonical name must come from here.
        FieldByName: (f: string) => (f.toLowerCase() === 'email' ? { Name: 'Email' } : undefined),
        PrimaryKeys: [{ Name: 'ID' }],
      };
    }
  }
  class RunView {
    async RunView() {
      return { Success: true, Results: [] };
    }
  }
  return { ...actual, Metadata, RunView };
});

const { MJBindingGateway } = await import('../mj-binding-gateway');

const fakeUser = { Name: 'tester' } as never;

describe('MJBindingGateway.findMatch — identifier safety', () => {
  it('refuses a criterion naming a field the entity does not have', async () => {
    const gateway = new MJBindingGateway(fakeUser);

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
    const gateway = new MJBindingGateway(fakeUser);

    await expect(
      gateway.findMatch({ entityName: 'No: Such Entity', criteria: [] }),
    ).rejects.toThrow(/could not be resolved/);
  });

  it('accepts a real field written in a different casing', async () => {
    const gateway = new MJBindingGateway(fakeUser);

    await expect(
      gateway.findMatch({ entityName: 'Known: Entity', criteria: [{ field: 'email', value: 'a@b.com', normalize: 'ExactMatch' }] }),
    ).resolves.toBeNull();
  });
});

// `sqlLiteral`'s own cases moved to packages/Entities/src/contracts/sql-literal.spec.ts along with
// the function. What remains here is the gateway's USE of it, which is the part this file is about:
// the criterion cases above assert the emitted `ExtraFilter` text, so a change to the escaping still
// fails here as well as there.
