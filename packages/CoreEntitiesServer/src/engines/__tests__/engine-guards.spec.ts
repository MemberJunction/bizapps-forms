import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeProvider } from '../../testing/index.js';

const logged = vi.hoisted(() => ({ errors: [] as string[], statuses: [] as string[] }));
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (m: string) => logged.errors.push(m),
  LogStatus: (m: string) => logged.statuses.push(m),
}));

const { runEngineUnitOfWork, saveAsEngine } = await import('../engine-guards.js');

beforeEach(() => {
  logged.errors.length = 0;
  logged.statuses.length = 0;
});

/** An entity whose Save records whether the engine flag was up while it ran. */
function entity(outcome: 'ok' | 'refused' | 'throws') {
  const seen: boolean[] = [];
  const e = {
    AuthorizedByEngine: false,
    async Save(): Promise<boolean> {
      seen.push(e.AuthorizedByEngine);
      if (outcome === 'throws') {
        throw new Error('connection lost');
      }
      return outcome === 'ok';
    },
  };
  return { e, seen };
}

describe('saveAsEngine — only THIS save is privileged', () => {
  it('raises the engine flag for the save and lowers it after', async () => {
    const { e, seen } = entity('ok');

    expect(await saveAsEngine(e)).toBe(true);

    expect(seen).toEqual([true]);
    expect(e.AuthorizedByEngine).toBe(false);
  });

  it('lowers the flag after a refused save, and reports the refusal', async () => {
    const { e } = entity('refused');

    expect(await saveAsEngine(e)).toBe(false);
    expect(e.AuthorizedByEngine).toBe(false);
  });

  it('lowers the flag when the save throws, and rethrows', async () => {
    const { e } = entity('throws');

    await expect(saveAsEngine(e)).rejects.toThrow('connection lost');
    expect(e.AuthorizedByEngine).toBe(false);
  });
});

describe('runEngineUnitOfWork — one transaction, one log line', () => {
  it('commits the work as one transaction and returns its result', async () => {
    const db = makeFakeProvider({});

    expect(await runEngineUnitOfWork(db.provider, 'ctx', async () => 42)).toBe(42);
    expect(db.transactions).toEqual(['begin', 'commit']);
    expect([...logged.errors, ...logged.statuses]).toEqual([]);
  });

  it('logs a failure with its context when it is the outermost unit, and rethrows', async () => {
    const db = makeFakeProvider({});

    await expect(
      runEngineUnitOfWork(db.provider, 'publishing form-1 (user u1)', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(db.transactions).toEqual(['begin', 'rollback']);
    expect(logged.errors).toEqual(['publishing form-1 (user u1): boom']);
  });

  it('logs a refusal over the draft (fault === false) as a status, not an error', async () => {
    const db = makeFakeProvider({});
    const refusal = Object.assign(new Error('broken rule'), { fault: false });

    await expect(runEngineUnitOfWork(db.provider, 'ctx', async () => Promise.reject(refusal))).rejects.toBe(refusal);
    expect(logged.statuses).toEqual(['ctx: broken rule']);
    expect(logged.errors).toEqual([]);
  });

  it('leaves the log to the outer unit when nested — one failure, one line', async () => {
    const db = makeFakeProvider({});

    await expect(
      runEngineUnitOfWork(db.provider, 'outer', () =>
        runEngineUnitOfWork(db.provider, 'inner', async () => {
          throw new Error('boom');
        }),
      ),
    ).rejects.toThrow('boom');
    expect(logged.errors).toEqual(['outer: boom']);
    expect(db.transactions).toEqual(['begin', 'begin:nested', 'rollback:nested', 'rollback']);
  });
});
