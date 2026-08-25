/**
 * Unit tests for the PROVENANCE half of `dispatchAutomation`.
 *
 * `FormAutomationRun.ActionExecutionLogID` and `.AIAgentRunID` have existed since
 * `V202608072330` and the responses dashboard reads both, but nothing ever wrote them — every run
 * in every deployment pointed at nothing. It stayed invisible because the automation runner also
 * lacked permission to write an `MJ: Action Execution Logs` row at all (#60), so a null foreign key
 * looked like a consequence of that rather than a second defect underneath it. These tests pin the
 * stamping so it cannot go quiet again the same way.
 *
 * Only the Action target is driven here. Agent needs a live `AgentRunner` and EntityBinding writes
 * a business record; both are exercised by `smoke/automation-semantics-path.mjs`. What this file
 * covers is the branch where the id exists and has to survive the trip onto the run row —
 * including on failure, which is the case the provenance is worth most in.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PublishedFormAutomation } from '@mj-biz-apps/forms-entities';
import { CanonicalAnswers } from '@mj-biz-apps/forms-entities';
import type { UserInfo } from '@memberjunction/core';

/** The `FormAutomationRun` row the dispatcher opens and closes. */
class FakeRunRow {
  ID = 'run-1';
  FormAutomationID: string | null = null;
  FormResponseID: string | null = null;
  Status: string | null = null;
  AttemptCount: number | null = null;
  StartedAt: Date | null = null;
  CompletedAt: Date | null = null;
  ErrorMessage: string | null = null;
  OutputSummary: string | null = null;
  ActionExecutionLogID: string | null = null;
  AIAgentRunID: string | null = null;
  LatestResult: { CompleteMessage: string } | null = null;
  NewRecord(): void {
    /* no-op for the fake */
  }
  async Save(): Promise<boolean> {
    return true;
  }
}

const state: {
  runRow: FakeRunRow;
  actionResult: { Success: boolean; Message?: string; LogEntry?: { ID: string } };
} = {
  runRow: new FakeRunRow(),
  actionResult: { Success: true },
};

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    async GetEntityObject<T>(): Promise<T> {
      return state.runRow as unknown as T;
    }
  }
  return { ...actual, Metadata };
});

vi.mock('@memberjunction/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/actions')>();
  return {
    ...actual,
    ActionEngineServer: {
      Instance: {
        Config: async () => undefined,
        Actions: [{ ID: 'act-1', Name: 'Forms: Upsert Respondent Person' }],
        RunAction: async () => state.actionResult,
      },
    },
  };
});

const { dispatchAutomation } = await import('../dispatch-automation');

const automation: PublishedFormAutomation = {
  id: 'auto-1',
  name: 'Smoke: upsert person action',
  targetType: 'Action',
  actionId: 'act-1',
  trigger: 'OnComplete',
  executionMode: 'Sync',
  displayOrder: 1,
  continueOnError: true,
  isActive: true,
};

function context() {
  return {
    responseId: 'resp-1',
    formId: 'form-1',
    formVersionId: 'ver-1',
    distributionId: 'dist-1',
    answers: new CanonicalAnswers([]),
    principal: { Name: 'Forms Automation Service' } as unknown as UserInfo,
    allowedEntities: null,
  };
}

beforeEach(() => {
  state.runRow = new FakeRunRow();
  state.actionResult = { Success: true };
});

describe('dispatchAutomation provenance', () => {
  it('stamps the run with the execution log the action engine wrote', async () => {
    state.actionResult = { Success: true, Message: 'done', LogEntry: { ID: 'log-42' } };

    await dispatchAutomation(automation, context());

    expect(state.runRow.Status).toBe('Succeeded');
    expect(state.runRow.ActionExecutionLogID).toBe('log-42');
  });

  it('stamps the execution log on a FAILED run too', async () => {
    state.actionResult = { Success: false, Message: 'action reported failure', LogEntry: { ID: 'log-43' } };

    // The dispatcher rethrows so the runner can decide what the failure means for the plan.
    await expect(dispatchAutomation(automation, context())).rejects.toThrow('action reported failure');

    expect(state.runRow.Status).toBe('Failed');
    // The whole point: a failed run is where the reason lives, so it is the last row that should
    // lose the pointer to it.
    expect(state.runRow.ActionExecutionLogID).toBe('log-43');
  });

  it('leaves the foreign key null when the engine logged nothing', async () => {
    state.actionResult = { Success: true, Message: 'done' };

    await dispatchAutomation(automation, context());

    // Null, not undefined: the column is nullable and MJ validates the field, so writing
    // `undefined` would leave the value MJ read at NewRecord() rather than clearing it.
    expect(state.runRow.ActionExecutionLogID).toBeNull();
    expect(state.runRow.AIAgentRunID).toBeNull();
  });

  it('still records the summary it always did', async () => {
    state.actionResult = { Success: true, Message: 'Created Person abc.', LogEntry: { ID: 'log-44' } };

    await dispatchAutomation(automation, context());

    expect(state.runRow.OutputSummary).toBe(JSON.stringify({ summary: 'Created Person abc.' }));
  });
});
