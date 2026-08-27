/**
 * Unit tests for the session-response lookup behind dedupe + partial upsert/promotion.
 */
import { describe, expect, it } from 'vitest';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
  countPartialResponses,
  findAdoptableResponseById,
  findResponseById,
  findSessionResponse,
} from '../response-lookup.service';

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
      ['Complete', 'Disqualified'],
      USER,
    );

    expect(result.ok).toBe(true);
    expect(result.response?.ID).toBe('resp-1');
    expect(captured?.ExtraFilter).toContain("FormVersionID='ver-1'");
    expect(captured?.ExtraFilter).toContain("AnonymousSessionID='sess-1'");
    // A SET, rendered as an IN list: dedupe asks "already sealed?", which is every terminal
    // status. Asserting the rendered SQL because that string is the whole contract with the
    // database, and a filter that silently matched every status would make dedupe a no-op.
    expect(captured?.ExtraFilter).toContain("Status IN ('Complete', 'Disqualified')");
    expect(captured?.MaxRows).toBe(1);
  });

  it('returns ok with no response when nothing matches', async () => {
    const provider = makeProvider({ rows: [] });
    const result = await findSessionResponse(provider, { formVersionId: 'v', sessionId: 's' }, ['Partial'], USER);
    expect(result.ok).toBe(true);
    expect(result.response).toBeUndefined();
  });

  it('reports NOT ok when the lookup query fails (so callers can fail closed)', async () => {
    const provider = makeProvider({ success: false });
    const result = await findSessionResponse(provider, { formVersionId: 'v', sessionId: 's' }, ['Complete'], USER);
    expect(result.ok).toBe(false);
  });

  it('never correlates a blank session id (returns no match without querying a real row)', async () => {
    const provider = makeProvider({ rows: [{ ID: 'should-not-be-returned' }] });
    const result = await findSessionResponse(provider, { formVersionId: 'v', sessionId: '' }, ['Partial'], USER);
    expect(result.ok).toBe(true);
    expect(result.response).toBeUndefined();
  });

  it('escapes single quotes in the session id (no filter injection)', async () => {
    let captured: RunViewParams | undefined;
    const provider = makeProvider({ capture: (p) => (captured = p) });
    await findSessionResponse(provider, { formVersionId: 'v', sessionId: "a'b" }, ['Partial'], USER);
    expect(captured?.ExtraFilter).toContain("AnonymousSessionID='a''b'");
  });
});

describe('findAdoptableResponseById', () => {
  it('filters by id + version + Partial + the SourceMetadata client-id proof', async () => {
    let captured: RunViewParams | undefined;
    const provider = makeProvider({ rows: [{ ID: 'resp-1' }], capture: (p) => (captured = p) });

    const result = await findAdoptableResponseById(
      provider,
      { responseId: 'resp-1', formVersionId: 'ver-1' },
      USER,
    );

    expect(result.ok).toBe(true);
    expect(result.response?.ID).toBe('resp-1');
    const filter = captured?.ExtraFilter ?? '';
    expect(filter).toContain("ID='resp-1'");
    expect(filter).toContain("FormVersionID='ver-1'");
    // The RESUMABLE set, rendered as an IN list. A draft is "a row a later save may adopt", and
    // that is now one classification in `response-status.ts` rather than a literal repeated in
    // three SQL filters — which is what makes the terminal guard downstream genuinely exhaustive.
    expect(filter).toContain("Status IN ('Partial')");
    expect(filter).toContain('SourceMetadata LIKE');
    expect(filter).toContain('"clientResponseId":"resp-1"');
  });

  it('returns no match (without querying) for a blank response id', async () => {
    const provider = makeProvider({ rows: [{ ID: 'x' }] });
    const result = await findAdoptableResponseById(provider, { responseId: '', formVersionId: 'v' }, USER);
    expect(result.ok).toBe(true);
    expect(result.response).toBeUndefined();
  });

  it('reports NOT ok on a query failure (caller falls back, never adopts unverified)', async () => {
    const provider = makeProvider({ success: false });
    const result = await findAdoptableResponseById(provider, { responseId: 'r', formVersionId: 'v' }, USER);
    expect(result.ok).toBe(false);
  });
});

describe('findResponseById', () => {
  it('matches any status by id + version + client-id proof (idempotent repeat submit)', async () => {
    let captured: RunViewParams | undefined;
    const provider = makeProvider({ rows: [{ ID: 'resp-9' }], capture: (p) => (captured = p) });

    const result = await findResponseById(provider, { responseId: 'resp-9', formVersionId: 'ver-2' }, USER);

    expect(result.response?.ID).toBe('resp-9');
    const filter = captured?.ExtraFilter ?? '';
    expect(filter).toContain("ID='resp-9'");
    expect(filter).not.toContain("Status='Partial'"); // any status
    expect(filter).toContain('SourceMetadata LIKE');
  });
});


describe('countPartialResponses (the durable row ceiling)', () => {
  /**
   * This count IS the ceiling — the rate limiters above it bound a rate, not a total. So what it
   * counts has to be every row an ungated write can create, which is every row a QUOTA will not
   * count. `Complete` rows are quota-bounded; `Partial` and `Disqualified` are not, and counting
   * only the first of those two left a caller answering a knockout able to create rows without
   * limit while the ceiling read zero.
   */
  it('counts every row no quota bounds, not just Partial', async () => {
    let captured: RunViewParams | undefined;
    const provider = makeProvider({ capture: (p) => (captured = p) });

    await countPartialResponses(provider, { formVersionId: 'ver-1' }, USER);

    expect(captured?.ExtraFilter).toContain("FormVersionID='ver-1'");
    expect(captured?.ExtraFilter).toContain("Status IN ('Partial', 'Disqualified')");
    expect(captured?.ResultType).toBe('count_only');
  });

  it('fails CLOSED on a query error, so a database blip cannot become an unbounded hole', async () => {
    const provider = makeProvider({ success: false });
    expect((await countPartialResponses(provider, { formVersionId: 'v' }, USER)).ok).toBe(false);
  });
});
