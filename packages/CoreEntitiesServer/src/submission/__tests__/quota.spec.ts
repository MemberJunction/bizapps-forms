/**
 * The quota checks fail CLOSED — a fault refuses the submission — but a fault must not pass for a
 * full form. The respondent can only be told "quota reached"; the operator has to be told what
 * actually happened, against which form or link, or a broken count is indistinguishable from a
 * popular one. A genuine "no slot left" (the UPDATE matched nothing, and said so) is not a fault and
 * logs nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logError = vi.hoisted(() => vi.fn());
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (...args: unknown[]) => logError(...args),
}));
import type { DatabaseProviderBase, RunViewResult, UserInfo } from '@memberjunction/core';

import { consumeDistributionSlot, formQuotaReached } from '../quota.js';

const USER = { ID: 'system-user' } as unknown as UserInfo;

/** Just the provider surface the quota checks touch. */
function provider(opts: { affected?: Record<string, unknown>[]; count?: Partial<RunViewResult> }): DatabaseProviderBase {
  const stub = {
    PlatformKey: 'sqlserver',
    EntityByName: (name: string) => ({ SchemaName: '__mj_BizAppsForms', BaseTable: name.split(': ').pop() }),
    QuoteIdentifier: (name: string) => `[${name}]`,
    QuoteSchemaAndView: (schema: string, table: string) => `[${schema}].[${table}]`,
    Dialect: { AffectedRowCountSQL: (sql: string) => sql },
    ExecuteSQL: async () => opts.affected ?? [],
    RunView: async () => ({ Success: true, TotalRowCount: 0, Results: [], ...opts.count }),
  };
  return stub as unknown as DatabaseProviderBase;
}

beforeEach(() => logError.mockReset());

describe('consumeDistributionSlot', () => {
  it('takes the slot when the UPDATE reports one row', async () => {
    expect(await consumeDistributionSlot(provider({ affected: [{ AffectedRows: 1 }] }), 'dist-1', USER)).toBe(true);
    expect(logError).not.toHaveBeenCalled();
  });

  it('refuses quietly when the UPDATE matched nothing — the cap is genuinely reached', async () => {
    expect(await consumeDistributionSlot(provider({ affected: [{ AffectedRows: 0 }] }), 'dist-1', USER)).toBe(false);
    expect(logError).not.toHaveBeenCalled();
  });

  it.each([
    ['no row at all', []],
    ['no affected-row column', [{ Something: 1 }]],
    ['a value that is not a number', [{ AffectedRows: 'n/a' }]],
  ])('refuses, and LOGS the fault with the link id, when the count is unreadable (%s)', async (_label, rows) => {
    expect(await consumeDistributionSlot(provider({ affected: rows }), 'dist-1', USER)).toBe(false);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(String(logError.mock.calls[0][0])).toContain('dist-1');
  });
});

describe('formQuotaReached', () => {
  it('reports the quota from a readable count, logging nothing', async () => {
    expect(await formQuotaReached(provider({ count: { TotalRowCount: 2 } }), 'form-1', { quota: 3 }, USER)).toBe(false);
    expect(await formQuotaReached(provider({ count: { TotalRowCount: 3 } }), 'form-1', { quota: 3 }, USER)).toBe(true);
    expect(logError).not.toHaveBeenCalled();
  });

  it('refuses, and LOGS the database error with the form id, when the count fails', async () => {
    const failing = provider({ count: { Success: false, ErrorMessage: 'connection reset by peer' } });
    expect(await formQuotaReached(failing, 'form-1', { quota: 3 }, USER)).toBe(true);
    expect(logError).toHaveBeenCalledTimes(1);
    const message = String(logError.mock.calls[0][0]);
    expect(message).toContain('form-1');
    expect(message).toContain('connection reset by peer');
  });
});
