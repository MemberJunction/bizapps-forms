/**
 * Unit tests for the session-response lookup behind dedupe + partial upsert/promotion.
 */
import { describe, expect, it } from 'vitest';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { findSessionResponse } from '../response-lookup.service';

const USER = { ID: 'anon' } as unknown as UserInfo;

/** A minimal IRunViewProvider that records the ExtraFilter and returns canned rows. */
function makeProvider(options: {
  success?: boolean;
  rows?: Array<{ ID: string }>;
  capture?: (params: RunViewParams) => void;
}) {
  return {
    RunView: async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
      options.capture?.(params);
      return {
        Success: options.success ?? true,
        Results: (options.rows ?? []) as unknown as T[],
        RowCount: options.rows?.length ?? 0,
        TotalRowCount: options.rows?.length ?? 0,
        ExecutionTime: 0,
        ErrorMessage: '',
      } as RunViewResult<T>;
    },
    RunViews: async () => [],
  };
}

describe('findSessionResponse', () => {
  it('returns the matching row and filters by version + session + status', async () => {
    let captured: RunViewParams | undefined;
    const provider = makeProvider({ rows: [{ ID: 'resp-1' }], capture: (p) => (captured = p) });

    const result = await findSessionResponse(
      provider,
      { formVersionId: 'ver-1', sessionId: 'sess-1' },
      'Complete',
      USER,
    );

    expect(result.ok).toBe(true);
    expect(result.response?.ID).toBe('resp-1');
    expect(captured?.ExtraFilter).toContain("FormVersionID='ver-1'");
    expect(captured?.ExtraFilter).toContain("AnonymousSessionID='sess-1'");
    expect(captured?.ExtraFilter).toContain("Status='Complete'");
    expect(captured?.MaxRows).toBe(1);
  });

  it('returns ok with no response when nothing matches', async () => {
    const provider = makeProvider({ rows: [] });
    const result = await findSessionResponse(provider, { formVersionId: 'v', sessionId: 's' }, 'Partial', USER);
    expect(result.ok).toBe(true);
    expect(result.response).toBeUndefined();
  });

  it('reports NOT ok when the lookup query fails (so callers can fail closed)', async () => {
    const provider = makeProvider({ success: false });
    const result = await findSessionResponse(provider, { formVersionId: 'v', sessionId: 's' }, 'Complete', USER);
    expect(result.ok).toBe(false);
  });

  it('never correlates a blank session id (returns no match without querying a real row)', async () => {
    const provider = makeProvider({ rows: [{ ID: 'should-not-be-returned' }] });
    const result = await findSessionResponse(provider, { formVersionId: 'v', sessionId: '' }, 'Partial', USER);
    expect(result.ok).toBe(true);
    expect(result.response).toBeUndefined();
  });

  it('escapes single quotes in the session id (no filter injection)', async () => {
    let captured: RunViewParams | undefined;
    const provider = makeProvider({ capture: (p) => (captured = p) });
    await findSessionResponse(provider, { formVersionId: 'v', sessionId: "a'b" }, 'Partial', USER);
    expect(captured?.ExtraFilter).toContain("AnonymousSessionID='a''b'");
  });
});
