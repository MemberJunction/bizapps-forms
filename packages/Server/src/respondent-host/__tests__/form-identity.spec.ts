import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { mjBizAppsFormsFormEntityType } from '@mj-biz-apps/forms-entities';
import { loadFormIdentity, type FormIdentitySource } from '../form-identity';
import type { RedeemRunViewProvider } from '../redeem.service';

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

/** Only `.ID` is ever touched by the flow. */
const SYSTEM_USER = { ID: 'system-user-id' } as unknown as UserInfo;

/** The slice of the distribution row the identity is derived from. */
const SOURCE: FormIdentitySource = {
  FormID: 'form-1',
  Form: 'Customer Satisfaction Survey',
  Slug: 'customer-survey',
};

/** A RunView provider fake returning one partial Form row (or a failure / empty set). */
function fakeProvider(opts: {
  success?: boolean;
  rows?: Partial<mjBizAppsFormsFormEntityType>[];
}): { provider: RedeemRunViewProvider; lastParams: () => RunViewParams | undefined } {
  let captured: RunViewParams | undefined;
  const provider: RedeemRunViewProvider = {
    async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
      captured = params;
      const success = opts.success ?? true;
      return {
        Success: success,
        Results: (opts.rows ?? []) as unknown as T[],
        RowCount: opts.rows?.length ?? 0,
        TotalRowCount: opts.rows?.length ?? 0,
        ExecutionTime: 0,
        ErrorMessage: success ? '' : 'forced failure',
      } as RunViewResult<T>;
    },
  };
  return { provider, lastParams: () => captured };
}

beforeEach(() => {
  logged.length = 0;
});

describe('loadFormIdentity', () => {
  it('names the form from the distribution row itself — no read is needed for the name', async () => {
    const { provider } = fakeProvider({ rows: [{ Description: null }] });
    const identity = await loadFormIdentity(provider, SYSTEM_USER, SOURCE);
    expect(identity.name).toBe('Customer Satisfaction Survey');
  });

  it('reads the description from the Form row, by primary key, asking only for that column', async () => {
    const { provider, lastParams } = fakeProvider({
      rows: [{ Description: 'Tell us how we did. Takes two minutes.' }],
    });
    const identity = await loadFormIdentity(provider, SYSTEM_USER, SOURCE);
    expect(identity.description).toBe('Tell us how we did. Takes two minutes.');
    const params = lastParams();
    expect(params?.EntityName).toBe('MJ_BizApps_Forms: Forms');
    expect(params?.ExtraFilter).toBe("ID='form-1'");
    expect(params?.Fields).toEqual(['Description']);
    expect(params?.ResultType).toBe('simple');
  });

  it('treats a null or whitespace-only description as absent', async () => {
    const nullRow = await loadFormIdentity(fakeProvider({ rows: [{ Description: null }] }).provider, SYSTEM_USER, SOURCE);
    expect(nullRow.description).toBeUndefined();
    const blankRow = await loadFormIdentity(fakeProvider({ rows: [{ Description: '   ' }] }).provider, SYSTEM_USER, SOURCE);
    expect(blankRow.description).toBeUndefined();
  });

  it('trims the description', async () => {
    const identity = await loadFormIdentity(
      fakeProvider({ rows: [{ Description: '  Two minutes.  ' }] }).provider,
      SYSTEM_USER,
      SOURCE,
    );
    expect(identity.description).toBe('Two minutes.');
  });

  // The description is the SECOND line of an unfurl card. Losing it must never cost the respondent
  // the form — but it must never be lost silently either (design rule: no swallowed errors).
  it('degrades to name-only and logs with context when the Form read fails', async () => {
    const identity = await loadFormIdentity(fakeProvider({ success: false }).provider, SYSTEM_USER, SOURCE);
    expect(identity).toEqual({ name: 'Customer Satisfaction Survey' });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('customer-survey');
    expect(logged[0]).toContain('form-1');
    expect(logged[0]).toContain('forced failure');
  });

  it('degrades to name-only and logs when the Form row is missing', async () => {
    const identity = await loadFormIdentity(fakeProvider({ rows: [] }).provider, SYSTEM_USER, SOURCE);
    expect(identity).toEqual({ name: 'Customer Satisfaction Survey' });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('form-1');
  });
});
