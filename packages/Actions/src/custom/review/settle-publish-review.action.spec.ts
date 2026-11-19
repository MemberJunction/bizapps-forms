/**
 * **Forms: Settle Publish Review** — the workflow's settle step. The action is a boundary over
 * `FormPublishReview.SettleReview`; these pin how each outcome of that call reaches the workflow.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';

const settle = vi.hoisted(() => ({ fn: vi.fn(), refusal: null as Error | null }));
vi.mock('@mj-biz-apps/forms-core-entities-server', () => ({
  FormPublishReview: {
    Instance: {
      // A plain async function for the refusal case: a refusal is an ordinary throw, not a mock result.
      SettleReview: async (...args: unknown[]) => {
        if (settle.refusal) throw settle.refusal;
        return settle.fn(...args);
      },
    },
  },
  resolveActionProvider: (params: { Provider?: unknown }) => params.Provider,
  requireDatabaseProvider: (provider: unknown) => provider,
}));

const { SettlePublishReviewAction } = await import('./settle-publish-review.action');

const USER = { ID: 'author-1' } as UserInfo;
const VERSION_ID = 'c3c3c3c3-0000-4000-8000-000000000003';

function params(formVersionId?: string): RunActionParams {
  const p = new RunActionParams();
  p.ContextUser = USER;
  p.Params = [];
  if (formVersionId !== undefined) {
    const param = new ActionParam();
    param.Name = 'FormVersionID';
    param.Value = formVersionId;
    param.Type = 'Input';
    p.Params.push(param);
  }
  return p;
}

function run(p: RunActionParams) {
  return (new SettlePublishReviewAction() as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string; Message?: string }> }).InternalRunAction(p);
}

beforeEach(() => {
  settle.fn.mockReset();
  settle.refusal = null;
});

describe('Forms: Settle Publish Review', () => {
  it('settles the version and reports the outcome', async () => {
    settle.fn.mockResolvedValue({ settled: true, formVersionId: VERSION_ID, outcome: 'Published', alreadySettled: false, retiredVersionIds: [] });
    const p = params(VERSION_ID);

    const result = await run(p);

    expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS' });
    expect(p.Params.find((x) => x.Name === 'Outcome')?.Value).toBe('Published');
    expect(settle.fn).toHaveBeenCalledWith(VERSION_ID, undefined, USER);
  });

  it('fails as NOT_DECIDED while the approver has not decided, so nothing downstream runs on it', async () => {
    settle.fn.mockResolvedValue({ settled: false, reason: 'The approver has not decided yet.' });

    expect(await run(params(VERSION_ID))).toMatchObject({ Success: false, ResultCode: 'NOT_DECIDED' });
  });

  it('requires FormVersionID', async () => {
    expect(await run(params())).toMatchObject({ Success: false, ResultCode: 'MISSING_PARAMETERS' });
    expect(settle.fn).not.toHaveBeenCalled();
  });

  it('reports a refusal as FAILED with its reason', async () => {
    settle.refusal = new Error('Form version x is Draft, not waiting for approval');

    const result = await run(params(VERSION_ID));

    expect(result).toMatchObject({ Success: false, ResultCode: 'FAILED' });
    expect(result.Message).toMatch(/not waiting for approval/);
  });
});
