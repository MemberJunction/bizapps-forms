/**
 * The boot WIRING of the database readiness report (F1): `ConfigureExpressApp` probes
 * `READ_COMMITTED_SNAPSHOT` once on SQL Server, never on PostgreSQL, logs each reason under the
 * `[Forms]` prefix, logs a failed probe instead of swallowing it, and refuses to boot only when the
 * operator opted in. The verdict text is covered by `host-readiness.spec.ts`; this pins that the
 * probe runs at startup, through the provider's `ExecuteSQL`.
 *
 * `LogError` is captured with `vi.mock` + `vi.hoisted`, not `vi.spyOn` — see `redeem.service.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logError, executeSql, provider } = vi.hoisted(() => {
  const executeSql = vi.fn();
  return {
    logError: vi.fn(),
    executeSql,
    provider: { PlatformKey: 'sqlserver', ExecuteSQL: executeSql },
  };
});

vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {},
  configInfo: { magicLink: { enabled: true, grantableRoleNames: ['Form Respondent'] } },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: {
    Users: [],
    Instance: { GetSystemUser: () => ({ ID: 'system-user-id' }), UserByName: () => undefined },
  },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    static Provider: unknown = provider;
    EntityByName(): unknown {
      return undefined;
    }
  }
  return { ...actual, Metadata, LogStatus: () => undefined, LogError: logError, LogErrorEx: () => undefined };
});

vi.mock('@mj-biz-apps/forms-core-entities-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mj-biz-apps/forms-core-entities-server')>();
  return { ...actual, requireDatabaseProvider: (p: unknown) => p };
});

vi.mock('../captcha-demand', () => ({ readCaptchaDemand: async () => ({ ok: true, demand: undefined }) }));
vi.mock('../host-readiness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../host-readiness')>();
  return { ...actual, assessRespondentReadiness: () => [] };
});

import express from 'express';
import { RespondentHostMiddleware } from '../RespondentHostMiddleware';

const FLAG = 'FORMS_REQUIRE_READ_COMMITTED_SNAPSHOT';

function rcsiLogs(): string[] {
  return logError.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('READ_COMMITTED_SNAPSHOT'));
}

function probeReturns(on: boolean): void {
  executeSql.mockResolvedValue([{ IsOn: on ? 1 : 0, DatabaseName: 'MJ_Host' }]);
}

beforeEach(() => {
  logError.mockReset();
  executeSql.mockReset();
  provider.PlatformKey = 'sqlserver';
  delete process.env[FLAG];
});

afterEach(() => {
  delete process.env[FLAG];
});

describe('RespondentHostMiddleware boot — database readiness', () => {
  it('probes once on SQL Server and logs one error line when READ_COMMITTED_SNAPSHOT is off', async () => {
    probeReturns(false);

    await new RespondentHostMiddleware().ConfigureExpressApp(express());

    expect(executeSql).toHaveBeenCalledTimes(1);
    expect(String(executeSql.mock.calls[0][0])).toContain('is_read_committed_snapshot_on');
    const lines = rcsiLogs();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[Forms]');
    expect(lines[0]).toContain('ALTER DATABASE [MJ_Host]');
  });

  it('logs nothing when READ_COMMITTED_SNAPSHOT is on', async () => {
    probeReturns(true);

    await new RespondentHostMiddleware().ConfigureExpressApp(express());

    expect(executeSql).toHaveBeenCalledTimes(1);
    expect(rcsiLogs()).toEqual([]);
  });

  it('does not probe on PostgreSQL', async () => {
    provider.PlatformKey = 'postgresql';

    await new RespondentHostMiddleware().ConfigureExpressApp(express());

    expect(executeSql).not.toHaveBeenCalled();
    expect(rcsiLogs()).toEqual([]);
  });

  it('logs a failed probe with what it was doing, and reports the state as unknown', async () => {
    executeSql.mockRejectedValue(new Error('permission denied on sys.databases'));

    await expect(new RespondentHostMiddleware().ConfigureExpressApp(express())).resolves.toBeUndefined();

    const all = logError.mock.calls.map((c) => String(c[0]));
    expect(all.some((l) => l.includes('Could not read READ_COMMITTED_SNAPSHOT') && l.includes('permission denied'))).toBe(true);
    expect(rcsiLogs().some((l) => l.includes('could not be read'))).toBe(true);
  });

  it('refuses to boot, naming the flag, when the operator opted in and the setting is off', async () => {
    process.env[FLAG] = 'true';
    probeReturns(false);

    await expect(new RespondentHostMiddleware().ConfigureExpressApp(express())).rejects.toThrow(FLAG);
  });
});
