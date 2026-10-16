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
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';

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
  FormAutomationEventID: string | null = null;
  LatestResult: { CompleteMessage: string } | null = null;
  /** The Status of every save, in order — what the row went through. */
  saves: string[] = [];
  newRecordCalls = 0;
  loadedId: string | null = null;
  /** Make a save of this Status fail: `false` as a refused save, `'throw'` as a dropped connection. */
  failSave: { status: string; how: false | 'throw' } | null = null;
  /** True, as BaseEntity's does. */
  NewRecord(): boolean {
    this.newRecordCalls += 1;
    return true;
  }
  async Load(id: string): Promise<boolean> {
    this.loadedId = id;
    this.ID = id;
    return true;
  }
  async Save(): Promise<boolean> {
    this.saves.push(String(this.Status));
    if (this.failSave && this.failSave.status === this.Status) {
      if (this.failSave.how === 'throw') {
        throw new Error('ECONNRESET while saving');
      }
      this.LatestResult = { CompleteMessage: 'save refused' };
      return false;
    }
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

/** Every `RunAction` call this file's mock has captured, so a test can assert on `Provider`. */
const runActionCalls: Array<{ Provider?: unknown }> = [];
/** Make the engine's RunAction throw, as a dropped connection would. */
const engineState = { throws: false };

// The global provider must never be reached by this dispatcher — every read/write is supposed to
// run on `ctx.provider` (bizapps-forms#260). Throwing here, rather than quietly returning
// `state.runRow` as before, is what makes a stray `new Metadata()` call fail LOUDLY instead of
// happening to still work because the fake behind it was too permissive.
const logged = vi.hoisted(() => [] as string[]);
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    async GetEntityObject<T>(): Promise<T> {
      throw new Error('global provider used');
    }
  }
  return { ...actual, Metadata, LogError: (m: string) => logged.push(m) };
});

vi.mock('@memberjunction/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/actions')>();
  return {
    ...actual,
    ActionEngineServer: {
      Instance: {
        Config: async () => undefined,
        Actions: [{ ID: 'act-1', Name: 'Forms: Upsert Respondent Person' }],
        RunAction: async (params: { Provider?: unknown }) => {
          runActionCalls.push(params);
          if (engineState.throws) {
            throw new Error('ECONNRESET');
          }
          return state.actionResult;
        },
      },
    },
  };
});

const { dispatchAutomation } = await import('../dispatch-automation.js');

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

/** Stands in for the isolated provider `withIsolatedProvider` hands the dispatcher in production. */
function fakeProvider(): DatabaseProviderBase {
  return {
    GetEntityObject: async <T,>(): Promise<T> => state.runRow as unknown as T,
  } as unknown as DatabaseProviderBase;
}

function context() {
  return {
    responseId: 'resp-1',
    formId: 'form-1',
    formVersionId: 'ver-1',
    distributionId: 'dist-1',
    answers: new CanonicalAnswers([]),
    principal: { Name: 'Forms Automation Service' } as unknown as UserInfo,
    allowedEntities: null,
    questionTypes: new Map(),
    provider: fakeProvider(),
    attempt: 1,
    respondentVerified: false,
    automationEventId: 'msg-1' as string | null,
  };
}

beforeEach(() => {
  state.runRow = new FakeRunRow();
  state.actionResult = { Success: true };
  runActionCalls.length = 0;
  engineState.throws = false;
  logged.length = 0;
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

  it('the Action target runs on ctx.provider, never the global provider', async () => {
    const ctx = context();

    await dispatchAutomation(automation, ctx);

    expect(runActionCalls).toHaveLength(1);
    expect(runActionCalls[0].Provider).toBe(ctx.provider);
  });
});

/**
 * Whether a failure is worth another run of the outbox event (#303): the drain retries a final
 * submit only when some step failed in a way that could succeed next time.
 */
describe('dispatchAutomation — is the failure worth retrying?', () => {
  async function failure(automationOverride: Partial<PublishedFormAutomation> = {}) {
    return dispatchAutomation({ ...automation, ...automationOverride }, context()).then(
      () => {
        throw new Error('expected a rejection');
      },
      (err: unknown) => err as Error & { retryable?: boolean },
    );
  }

  it('an action this host does not have will not appear on a retry', async () => {
    expect((await failure({ actionId: 'act-missing' })).retryable).toBe(false);
  });

  it('an action that ran and reported failure is not re-run: its side effects may already exist', async () => {
    state.actionResult = { Success: false, Message: 'quota exceeded' };

    expect((await failure()).retryable).toBe(false);
  });

  it('a throw from the environment (a dropped connection) is worth another attempt', async () => {
    engineState.throws = true;

    expect((await failure()).retryable).not.toBe(false);
  });

  it('stamps the delivery attempt on the run row', async () => {
    await dispatchAutomation(automation, { ...context(), attempt: 3 });

    expect(state.runRow.AttemptCount).toBe(3);
  });
});

/**
 * The run row is the idempotency record for a delivery's event (spec #303 §12, Task 7 fix round): a
 * re-run re-runs only the steps with no terminal row, on their open row. So what the row SAYS
 * after each outcome is the contract.
 */
describe('dispatchAutomation — the run row as the idempotency record', () => {
  async function failureOf(promise: Promise<unknown>) {
    return promise.then(
      () => {
        throw new Error('expected a rejection');
      },
      (err: unknown) => err as Error & { retryable?: boolean },
    );
  }

  it('a TRANSIENT failure leaves the row Pending — not terminal, so a re-run runs the step again', async () => {
    engineState.throws = true;

    await failureOf(dispatchAutomation(automation, context()));

    expect(state.runRow.saves).toEqual(['Running', 'Pending']);
    expect(state.runRow.ErrorMessage).toMatch(/ECONNRESET/);
  });

  it('a PERMANENT failure closes the row Failed — terminal, so no re-run runs it again', async () => {
    state.actionResult = { Success: false, Message: 'quota exceeded' };

    await failureOf(dispatchAutomation(automation, context()));

    expect(state.runRow.saves).toEqual(['Running', 'Failed']);
  });

  it('stamps a NEW row with the delivered message\'s id — the exact identity a re-run matches on', async () => {
    await dispatchAutomation(automation, context());

    expect(state.runRow.FormAutomationEventID).toBe('msg-1');
  });

  it('a row opened with no message (the inline submit path) carries none', async () => {
    await dispatchAutomation(automation, { ...context(), automationEventId: null });

    expect(state.runRow.FormAutomationEventID).toBeNull();
  });

  it("reuses the event's open row instead of inserting a second one", async () => {
    await dispatchAutomation(automation, { ...context(), attempt: 2 }, 'run-open');

    expect(state.runRow.loadedId).toBe('run-open');
    expect(state.runRow.newRecordCalls).toBe(0);
    expect(state.runRow.AttemptCount).toBe(2);
    expect(state.runRow.saves).toEqual(['Running', 'Succeeded']);
  });

  it.each([false, 'throw'] as const)(
    'a success whose row cannot be closed (%s) is retried a few times, never relabelled Failed, and asks for another delivery',
    async (how) => {
      state.runRow.failSave = { status: 'Succeeded', how };

      const failure = await failureOf(dispatchAutomation(automation, context()));

      expect(runActionCalls).toHaveLength(1);
      expect(state.runRow.saves).toEqual(['Running', 'Succeeded', 'Succeeded', 'Succeeded']);
      expect(state.runRow.saves).not.toContain('Failed');
      expect(failure.retryable).toBe(true);
      expect(logged.join('\n')).toMatch(/succeeded, but its run row could not be closed/);
    },
  );

  it('a row that cannot be opened: the target never runs, and the failure is worth another delivery', async () => {
    state.runRow.failSave = { status: 'Running', how: false };

    const failure = await failureOf(dispatchAutomation(automation, context()));

    expect(runActionCalls).toEqual([]);
    expect(failure.retryable).toBe(true);
  });
});
