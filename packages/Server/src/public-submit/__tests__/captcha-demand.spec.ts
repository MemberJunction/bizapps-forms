import { describe, expect, it } from 'vitest';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { readCaptchaDemand, type CaptchaDemandProvider } from '../../respondent-host/captcha-demand';
import { FORM_DISTRIBUTION_ENTITY, FORM_VERSION_ENTITY } from '../entity-names';
import { makeContextUser } from './fakes';

/**
 * The boot-time probe behind the Turnstile readiness check (#122): does anything on this host ask
 * for a captcha? It is the only database read the readiness path makes, it runs once at startup,
 * and a failure in it must cost a logged line — never the boot.
 */
interface Scripted {
  rowsFor: (params: RunViewParams) => unknown[] | Error;
}

function fakeProvider(script: Scripted): { provider: CaptchaDemandProvider; calls: RunViewParams[][] } {
  const calls: RunViewParams[][] = [];
  const provider: CaptchaDemandProvider = {
    RunViews: async <T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> => {
      calls.push(params);
      return params.map((p) => {
        const rows = script.rowsFor(p);
        if (rows instanceof Error) {
          return { Success: false, Results: [], ErrorMessage: rows.message } as unknown as RunViewResult<T>;
        }
        return { Success: true, Results: rows as T[], ErrorMessage: '' } as unknown as RunViewResult<T>;
      });
    },
  };
  return { provider, calls };
}

const user: UserInfo = makeContextUser();

describe('readCaptchaDemand', () => {
  it('asks two bounded questions in one batch: captcha-requiring active links, and published forms', async () => {
    const { provider, calls } = fakeProvider({ rowsFor: () => [] });

    await readCaptchaDemand(provider, user);

    expect(calls).toHaveLength(1);
    const [distributions, versions] = calls[0];
    expect(distributions.EntityName).toBe(FORM_DISTRIBUTION_ENTITY);
    expect(distributions.ExtraFilter).toBe(`Status='Active' AND IsActive=1 AND CaptchaRequired=1`);
    expect(versions.EntityName).toBe(FORM_VERSION_ENTITY);
    // The publisher writes snapshots with JSON.stringify, so this compact spelling is the one that
    // exists; a LIKE keeps the read dialect-neutral (no JSON_VALUE / jsonb operators).
    expect(versions.ExtraFilter).toBe(`Status='Published' AND DefinitionSnapshot LIKE '%"captchaRequired":true%'`);
    for (const p of [distributions, versions]) {
      expect(p.MaxRows).toBe(1);
      expect(p.ResultType).toBe('simple');
    }
  });

  it('reports which side asks for a captcha', async () => {
    const { provider } = fakeProvider({
      rowsFor: (p) => (p.EntityName === FORM_DISTRIBUTION_ENTITY ? [{ ID: 'd1' }] : []),
    });

    const read = await readCaptchaDemand(provider, user);

    expect(read).toEqual({ ok: true, demand: { activeDistributions: true, publishedForms: false } });
  });

  it('reports no demand on a host where nothing asks for a captcha', async () => {
    const { provider } = fakeProvider({ rowsFor: () => [] });

    expect(await readCaptchaDemand(provider, user)).toEqual({
      ok: true,
      demand: { activeDistributions: false, publishedForms: false },
    });
  });

  // RunView does not throw; it answers Success:false. Half an answer is no answer: the check that
  // consumes this must not conclude "no demand" from a read that never ran.
  it('fails with the entity and the provider message when either read fails', async () => {
    const { provider } = fakeProvider({
      rowsFor: (p) => (p.EntityName === FORM_VERSION_ENTITY ? new Error('login failed') : []),
    });

    const read = await readCaptchaDemand(provider, user);

    expect(read.ok).toBe(false);
    expect(read.ok === false && read.error).toContain(FORM_VERSION_ENTITY);
    expect(read.ok === false && read.error).toContain('login failed');
  });

  // `UserCache.GetSystemUser()` is DECLARED `(): UserInfo` but its own doc comment says it returns
  // undefined when the cache has not been refreshed or the row is absent — the type is an
  // `as UserInfo` assertion over a value core admits may not be there. The middleware disbelieves
  // that type three lines below, writing `this.systemUser()?.Name`. So this probe must not accept
  // the assertion either: no context user means the read cannot be trusted to be scoped, and a
  // verdict is not invented from a read that should not have run.
  it('refuses to read at all when there is no context user, instead of trusting the type', async () => {
    const { provider, calls } = fakeProvider({ rowsFor: () => [{ ID: 'd1' }] });

    const read = await readCaptchaDemand(provider, undefined);

    expect(read.ok).toBe(false);
    expect(read.ok === false && read.error).toMatch(/system user/i);
    expect(calls, 'no query should be issued without a context user').toHaveLength(0);
  });

  // This runs inside server boot. A thrown error here would be a boot failure for every app the
  // host serves, over a read whose only purpose is a warning line.
  it('turns a throwing provider into a failure result instead of propagating', async () => {
    const provider: CaptchaDemandProvider = {
      RunViews: async () => {
        throw new Error('pool closed');
      },
    };

    const read = await readCaptchaDemand(provider, user);

    expect(read.ok).toBe(false);
    expect(read.ok === false && read.error).toContain('pool closed');
  });
});
