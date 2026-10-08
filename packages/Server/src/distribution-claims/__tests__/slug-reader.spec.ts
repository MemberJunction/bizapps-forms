import { describe, expect, it, vi } from 'vitest';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { createSlugReader, type SlugRunView } from '../claims.service';

const user = { ID: 'u1' } as UserInfo;

function makeRunView(result: Partial<RunViewResult<{ Slug: string }>>) {
  const RunView = vi.fn(async (_params: RunViewParams, _user?: UserInfo) => result as RunViewResult<never>);
  return { RunView } satisfies SlugRunView;
}

describe('createSlugReader', () => {
  it("reads this form's slugs, simple, under the caller, with the id quoted", async () => {
    const rv = makeRunView({ Success: true, Results: [{ Slug: 'a' }, { Slug: 'b' }] });
    const out = await createSlugReader(rv)("f'1", user);
    const [params, passedUser] = rv.RunView.mock.calls[0];
    expect(params.ExtraFilter).toBe("FormID='f''1' AND Slug IS NOT NULL");
    expect(params.ResultType).toBe('simple');
    expect(params.Fields).toEqual(['Slug']);
    expect(params.EntityName).toBe('MJ_BizApps_Forms: Form Distributions');
    expect(passedUser).toBe(user);
    expect(out).toEqual({ ok: true, slugs: ['a', 'b'] });
  });

  it('maps a failed view to an error result', async () => {
    const out = await createSlugReader(makeRunView({ Success: false, ErrorMessage: 'boom', Results: [] }))('f1', user);
    expect(out).toEqual({ ok: false, error: 'boom' });
  });
});
