import { describe, expect, it } from 'vitest';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

import type { DefinitionRunViewProvider } from '../definition-loader.service';
import { FORM_RESPONSE_ANSWER_ENTITY, FORM_RESPONSE_ENTITY } from '../entity-names';
import { loadResumeSnapshot } from '../resume-snapshot.service';
import { makeContextUser } from './fakes';

const ROW_ID = '9DA322E6-0000-4000-8000-000000000001';

interface FakeRows {
  responses?: Record<string, unknown>[];
  answers?: Record<string, unknown>[];
  failFor?: string;
}

/** A provider that answers the two reads this service makes, and records what it was asked. */
function fakeProvider(rows: FakeRows): { provider: DefinitionRunViewProvider; filters: string[] } {
  const filters: string[] = [];
  const provider: DefinitionRunViewProvider = {
    RunView: async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
      filters.push(String(params.ExtraFilter ?? ''));
      const fail = rows.failFor === params.EntityName;
      const data =
        params.EntityName === FORM_RESPONSE_ENTITY ? (rows.responses ?? []) : (rows.answers ?? []);
      return {
        Success: !fail,
        Results: (fail ? [] : data) as T[],
        ErrorMessage: fail ? 'boom' : '',
        UserViewRunID: '',
        RowCount: data.length,
        TotalRowCount: data.length,
        ExecutionTime: 0,
      } as unknown as RunViewResult<T>;
    },
  };
  return { provider, filters };
}

const user: UserInfo = makeContextUser();

describe('loadResumeSnapshot', () => {
  it('returns the draft and its stored answers for a session scoped to it', async () => {
    const { provider } = fakeProvider({
      responses: [{ ID: ROW_ID, Status: 'Partial', FormVersionID: 'ver-1', StartedAt: '2026-09-03T10:00:00.000Z' }],
      answers: [{ QuestionID: 'q-name', TextValue: 'Ada' }],
    });

    const snapshot = await loadResumeSnapshot(provider, ROW_ID, user);

    expect(snapshot).toEqual({
      responseId: ROW_ID,
      status: 'Partial',
      formVersionId: 'ver-1',
      startedAt: '2026-09-03T10:00:00.000Z',
      answers: [{ QuestionID: 'q-name', TextValue: 'Ada' }],
    });
  });

  it('returns a sealed draft too, so the widget can show the sealed screen at mount', async () => {
    const { provider } = fakeProvider({
      responses: [{ ID: ROW_ID, Status: 'Complete', FormVersionID: 'ver-1' }],
      answers: [],
    });

    const snapshot = await loadResumeSnapshot(provider, ROW_ID, user);

    expect(snapshot?.status).toBe('Complete');
    expect(snapshot?.answers).toEqual([]);
  });

  it('returns undefined when the row filter answers zero rows — the public-link case', async () => {
    // A public-link session's scope is a DISTRIBUTION id, which is the primary key of a different
    // table, so it matches no response row under `MJ Forms: Respondent Own Response`.
    const { provider } = fakeProvider({ responses: [] });

    expect(await loadResumeSnapshot(provider, 'a-distribution-id', user)).toBeUndefined();
  });

  it('returns undefined, and never throws, when the response read fails', async () => {
    const { provider } = fakeProvider({ failFor: FORM_RESPONSE_ENTITY, responses: [{ ID: ROW_ID }] });

    expect(await loadResumeSnapshot(provider, ROW_ID, user)).toBeUndefined();
  });

  it('returns undefined rather than a LOSSY snapshot when the answers cannot be read', async () => {
    // Half a draft is worse than none: the respondent would type over answers that are still
    // stored, and the reconcile would then delete what they did not re-enter.
    const { provider } = fakeProvider({
      responses: [{ ID: ROW_ID, Status: 'Partial', FormVersionID: 'ver-1' }],
      failFor: FORM_RESPONSE_ANSWER_ENTITY,
    });

    expect(await loadResumeSnapshot(provider, ROW_ID, user)).toBeUndefined();
  });

  it('asks for the scoped id explicitly, so a misconfigured grant yields nothing rather than a stranger', async () => {
    const { provider, filters } = fakeProvider({
      responses: [{ ID: ROW_ID, Status: 'Partial', FormVersionID: 'ver-1' }],
      answers: [],
    });

    await loadResumeSnapshot(provider, ROW_ID, user);

    expect(filters[0]).toContain(`ID='${ROW_ID}'`);
    expect(filters[1]).toContain(`ResponseID='${ROW_ID}'`);
  });

  it('does not query at all for a blank scope', async () => {
    const { provider, filters } = fakeProvider({});

    expect(await loadResumeSnapshot(provider, '   ', user)).toBeUndefined();
    expect(filters).toHaveLength(0);
  });

  it('drops an unreadable start time rather than failing the resume over it', async () => {
    const { provider } = fakeProvider({
      responses: [{ ID: ROW_ID, Status: 'Partial', FormVersionID: 'ver-1', StartedAt: 'not-a-date' }],
      answers: [],
    });

    const snapshot = await loadResumeSnapshot(provider, ROW_ID, user);

    expect(snapshot?.startedAt).toBeUndefined();
    expect(snapshot?.responseId).toBe(ROW_ID);
  });
});
