import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, IMetadataProvider } from '@memberjunction/core';
import { withIsolatedProvider } from '../isolated-provider';

const logged: string[] = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: (message: string) => {
      logged.push(message);
    },
  };
});

/** Build a fake isolated instance: a mutable `TransactionDepth` and a releasable handle. */
function makeFakeInstance(overrides?: { releaseError?: Error; transactionDepth?: number }): DatabaseProviderBase {
  return {
    TransactionDepth: overrides?.transactionDepth ?? 0,
    ReleaseIndependentInstance: vi.fn(async () => {
      if (overrides?.releaseError) {
        throw overrides.releaseError;
      }
    }),
  } as unknown as DatabaseProviderBase;
}

/** Build a fake source whose `CreateIndependentInstance` resolves to the given instance. */
function makeFakeSource(instance: DatabaseProviderBase): IMetadataProvider {
  return {
    CreateIndependentInstance: vi.fn(async () => instance),
  } as unknown as IMetadataProvider;
}

beforeEach(() => {
  logged.length = 0;
});

describe('withIsolatedProvider', () => {
  it('passes the instance (not the source) to work, returns its value, and releases the instance exactly once', async () => {
    const instance = makeFakeInstance();
    const source = makeFakeSource(instance);
    const seen: DatabaseProviderBase[] = [];

    const result = await withIsolatedProvider(
      'purpose-1',
      async (provider) => {
        seen.push(provider);
        return 'work-result';
      },
      source,
    );

    expect(result).toBe('work-result');
    expect(seen).toEqual([instance]);
    expect(seen[0]).not.toBe(source);
    expect(instance.ReleaseIndependentInstance).toHaveBeenCalledOnce();
  });

  it('propagates the same error object when work rejects, and still releases the instance', async () => {
    const instance = makeFakeInstance();
    const source = makeFakeSource(instance);
    const workError = new Error('work blew up');

    await expect(
      withIsolatedProvider(
        'purpose-2',
        async () => {
          throw workError;
        },
        source,
      ),
    ).rejects.toBe(workError);

    expect(instance.ReleaseIndependentInstance).toHaveBeenCalledOnce();
  });

  it("returns work's value even when ReleaseIndependentInstance rejects, and logs the release failure naming purpose", async () => {
    const releaseError = new Error('pool gone');
    const instance = makeFakeInstance({ releaseError });
    const source = makeFakeSource(instance);

    const result = await withIsolatedProvider('purpose-3', async () => 'still-returned', source);

    expect(result).toBe('still-returned');
    expect(logged.some((m) => m.includes('purpose-3') && m.includes('pool gone'))).toBe(true);
  });

  it('logs a witness naming purpose and the depth when the instance still has an open transaction at release, and still releases', async () => {
    const instance = makeFakeInstance({ transactionDepth: 2 });
    const source = makeFakeSource(instance);

    await withIsolatedProvider('purpose-4', async () => undefined, source);

    expect(logged.some((m) => m.includes('purpose-4') && m.includes('2'))).toBe(true);
    expect(instance.ReleaseIndependentInstance).toHaveBeenCalledOnce();
  });

  it('rejects with a message naming purpose and the underlying message when CreateIndependentInstance rejects, and never calls work', async () => {
    const underlying = new Error('connection pool exhausted');
    const source = {
      CreateIndependentInstance: vi.fn(async () => {
        throw underlying;
      }),
    } as unknown as IMetadataProvider;
    const work = vi.fn(async () => 'unused');

    await expect(withIsolatedProvider('purpose-5', work, source)).rejects.toThrow(
      /purpose-5.*connection pool exhausted/s,
    );
    expect(work).not.toHaveBeenCalled();
  });

  it('rejects naming purpose and the missing capability when source lacks CreateIndependentInstance, and never calls work', async () => {
    const source = {} as IMetadataProvider;
    const work = vi.fn(async () => 'unused');

    await expect(withIsolatedProvider('purpose-6', work, source)).rejects.toThrow(
      /purpose-6.*cannot create an independent instance/s,
    );
    expect(work).not.toHaveBeenCalled();
  });

  it('rejects (postcondition) when CreateIndependentInstance resolves to the source itself, and never calls work', async () => {
    const source: IMetadataProvider & { CreateIndependentInstance?: () => Promise<unknown> } = {} as IMetadataProvider;
    (source as unknown as { CreateIndependentInstance: () => Promise<unknown> }).CreateIndependentInstance = vi.fn(
      async () => source,
    );
    const work = vi.fn(async () => 'unused');

    await expect(withIsolatedProvider('purpose-7', work, source)).rejects.toThrow(/purpose-7/);
    expect(work).not.toHaveBeenCalled();
  });
});
