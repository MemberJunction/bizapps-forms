/**
 * `FormAutomationEngine.RunForResponse` — what the `Forms.RunAutomations` work-queue handler runs for
 * each `forms.response-submitted` message (spec #303 §5, §12; DW11).
 *
 * Dispatch itself (`dispatchAutomation`) and the legacy hooks are stood in for: their own specs
 * cover what one target does. These pin the decisions around them — which steps a message runs,
 * that the plan comes from the published SNAPSHOT, that a redelivered final submit runs no step
 * twice, where each step runs, and when a failure is worth another delivery.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { PublishedFormAutomation, PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { makeDefinition, makeFakeProvider, type FakeRow } from '../../testing/index.js';
import type { DispatchContext } from '../../automation/dispatch-automation.js';

const dispatched = vi.hoisted(
  () =>
    [] as {
      id: string;
      openRunId?: string;
      ctx: { provider: unknown; attempt: number; respondentVerified: boolean; principal: unknown; workQueueMessageId: string | null };
    }[],
);
const failures = vi.hoisted(() => new Map<string, Error>());
/** When set, called per dispatch — how a spec makes a step leave a row, as the real dispatcher does. */
const onDispatch = vi.hoisted(() => ({ hook: null as null | ((id: string, openRunId: string | undefined, failed: Error | undefined) => void) }));
vi.mock('../../automation/dispatch-automation.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../automation/dispatch-automation.js')>()),
  dispatchAutomation: async (automation: PublishedFormAutomation, ctx: DispatchContext, openRunId?: string) => {
    dispatched.push({ id: automation.id, ctx, openRunId });
    const failure = failures.get(automation.id);
    onDispatch.hook?.(automation.id, openRunId, failure);
    if (failure) {
      throw failure;
    }
  },
}));

const legacyFired = vi.hoisted(() => [] as string[]);
vi.mock('../../automation/legacy-hooks.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../automation/legacy-hooks.js')>()),
  runLegacyOnSubmitHooks: async (ctx: { responseId: string }) => {
    legacyFired.push(ctx.responseId);
    return [];
  },
}));

vi.mock('@memberjunction/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/actions')>()),
  ActionEngineServer: { Instance: { Config: async () => undefined } },
}));

const logged = vi.hoisted(() => [] as string[]);
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (m: string) => logged.push(m),
  LogStatus: (m: string) => logged.push(m),
}));

const { FormAutomationEngine, FormAutomationError } = await import('../FormAutomationEngine.js');
const { DEAD_LETTERED_RUN_PREFIX } = await import('../automation-run.js');

/**
 * The delivered message (its Work Queue `MessageID` is the event's identity), and another message of
 * the same response — an earlier or later save. Upper-case on purpose: SQL Server hands GUIDs back
 * upper-case, and the comparison must fold.
 */
const MSG = 'AAAAAAAA-0000-4000-8000-00000000000A';
const OTHER = 'BBBBBBBB-0000-4000-8000-00000000000B';

const RESPONSES = 'MJ_BizApps_Forms: Form Responses';
const ANSWERS = 'MJ_BizApps_Forms: Form Response Answers';
const VERSIONS = 'MJ_BizApps_Forms: Form Versions';
const RUNS = 'MJ_BizApps_Forms: Form Automation Runs';
const LIVE_AUTOMATIONS = 'MJ_BizApps_Forms: Form Automations';

const RESPONSE = '11111111-1111-4111-8111-111111111111';
const PRINCIPAL = { ID: 'principal-1', Name: 'Forms Automation Service' } as unknown as UserInfo;
const READER = { ID: 'system-1', Name: 'System' } as unknown as UserInfo;

function step(id: string, overrides: Partial<PublishedFormAutomation> = {}): PublishedFormAutomation {
  return {
    id,
    name: id,
    targetType: 'Action',
    actionId: 'act-1',
    trigger: 'OnComplete',
    executionMode: 'Sync',
    displayOrder: 1,
    continueOnError: true,
    isActive: true,
    ...overrides,
  };
}

/** The published definition: configured dispatch, with `automations`. */
function configured(automations: PublishedFormAutomation[]): PublishedFormDefinition {
  return makeDefinition({ settings: { ...makeDefinition().settings, onSubmitMode: 'Configured' }, automations });
}

function world(options: {
  definition?: PublishedFormDefinition;
  snapshot?: string | null;
  status?: string;
  /** `FormAutomationRun` rows already there: [automation id, status, WorkQueueMessageID, error message?]. */
  runs?: [string, string, string | null, string?][];
  liveAutomations?: FakeRow[];
  failRunViewFor?: string;
} = {}) {
  const definition = options.definition ?? configured([step('a1')]);
  const db = makeFakeProvider({
    tables: {
      [RESPONSES]: [
        { ID: RESPONSE, FormID: 'form-1', FormVersionID: 'ver-1', FormDistributionID: 'dist-1', Status: options.status ?? 'Complete' },
      ],
      [ANSWERS]: [{ ID: 'ans-1', ResponseID: RESPONSE, QuestionID: 'q-name', TextValue: 'Ada' }],
      [VERSIONS]: [
        {
          ID: 'ver-1',
          FormID: 'form-1',
          Status: 'Published',
          DefinitionSnapshot: options.snapshot === undefined ? JSON.stringify(definition) : options.snapshot,
        },
      ],
      [RUNS]: (options.runs ?? []).map(([id, status, messageId, error], i) => ({
        ID: `run-${i}`,
        FormAutomationID: id,
        FormResponseID: RESPONSE,
        Status: status,
        WorkQueueMessageID: messageId,
        ErrorMessage: error ?? null,
      })),
      [LIVE_AUTOMATIONS]: options.liveAutomations ?? [],
    },
    failRunViewFor: options.failRunViewFor,
  });
  // An isolated instance: a distinct object sharing the fake's tables and transaction log.
  const instances: unknown[] = [];
  Object.assign(db.provider, {
    CreateIndependentInstance: async () => {
      const own = Object.create(db.provider) as DatabaseProviderBase;
      Object.assign(own, { ReleaseIndependentInstance: async () => undefined });
      instances.push(own);
      return own;
    },
  });
  return { db, instances };
}

function run(db: { provider: DatabaseProviderBase }, request: Partial<Parameters<typeof FormAutomationEngine.Instance.RunForResponse>[0]> = {}) {
  return FormAutomationEngine.Instance.RunForResponse(
    { responseId: RESPONSE, trigger: 'OnComplete', principal: PRINCIPAL, ...request },
    db.provider,
    READER,
  );
}

beforeEach(() => {
  dispatched.length = 0;
  failures.clear();
  onDispatch.hook = null;
  legacyFired.length = 0;
  logged.length = 0;
});

describe('which steps a message runs', () => {
  const steps = [
    step('on-complete'),
    step('on-partial', { trigger: 'OnPartial', displayOrder: 2 }),
    step('either', { trigger: 'OnCompleteOrPartial', displayOrder: 3 }),
  ];

  it('a final submit runs OnComplete and OnCompleteOrPartial steps, never OnPartial ones', async () => {
    const { db } = world({ definition: configured(steps) });

    await run(db);

    expect(dispatched.map((d) => d.id)).toEqual(['on-complete', 'either']);
  });

  it('a partial save runs OnPartial and OnCompleteOrPartial steps, never OnComplete ones', async () => {
    const { db } = world({ definition: configured(steps), status: 'Partial' });

    await run(db, { trigger: 'OnPartial' });

    expect(dispatched.map((d) => d.id)).toEqual(['on-partial', 'either']);
  });

  it('runs the PUBLISHED steps, not the live rows: a step edited or added since publish does not change this response', async () => {
    const { db } = world({
      definition: configured([step('published-step')]),
      liveAutomations: [{ ID: 'added-after-publish', FormID: 'form-1', Trigger: 'OnComplete', IsActive: true }],
    });

    await run(db);

    expect(dispatched.map((d) => d.id)).toEqual(['published-step']);
  });

  it('stamps every run with an unverified respondent and the delivery attempt', async () => {
    const { db } = world();

    await run(db, { attempt: 4 });

    expect(dispatched[0].ctx).toMatchObject({ attempt: 4, respondentVerified: false });
  });

  it('dispatches as the automation principal — never as the user that read the response', async () => {
    const { db } = world();

    await run(db);

    expect(dispatched[0].ctx.principal).toBe(PRINCIPAL);
  });
});

/**
 * Redelivery is EVENT-scoped by exact identity (spec #303 §12, Task 7 fix round 4): a run belongs to
 * the delivered message's event iff its `WorkQueueMessageID` is that message's `MessageID` (GUID case
 * folded). Terminal runs for the event (Succeeded, Failed, Skipped) are not repeated; open ones
 * (Running, Pending) are re-run on their row. One rule for OnComplete, OnPartial and both.
 */
describe('a redelivered message (at-least-once delivery, DW11)', () => {
  it('a final message never skips a step because a PARTIAL-save run of it succeeded earlier', async () => {
    const { db } = world({ definition: configured([step('both', { trigger: 'OnCompleteOrPartial' })]), runs: [['both', 'Succeeded', OTHER]] });

    await run(db, { eventMessageId: MSG.toLowerCase() });

    expect(dispatched.map((d) => d.id)).toEqual(['both']);
  });

  it('B2 closed: partial save P1 delivered AFTER P2 was published — P2 still runs its OnPartial steps', async () => {
    // P1's rows were written after P2's publish instant, which the old time window counted as P2's.
    const { db } = world({
      definition: configured([step('capture', { trigger: 'OnPartial' })]),
      runs: [['capture', 'Succeeded', OTHER]],
      status: 'Partial',
    });

    await run(db, { trigger: 'OnPartial', eventMessageId: MSG.toLowerCase() });

    expect(dispatched.map((d) => [d.id, d.openRunId])).toEqual([['capture', undefined]]);
  });

  it('the race closed: a partial delivery in flight when the final was published — the final runs its OnCompleteOrPartial step', async () => {
    const { db } = world({
      definition: configured([step('both', { trigger: 'OnCompleteOrPartial' })]),
      runs: [['both', 'Running', OTHER]],
    });

    await run(db, { eventMessageId: MSG.toLowerCase() });

    expect(dispatched.map((d) => [d.id, d.openRunId])).toEqual([['both', undefined]]);
  });

  it('a row with NO message (history from before the column, or the inline path) belongs to no event', async () => {
    const { db } = world({
      definition: configured([step('a1'), step('a2', { displayOrder: 2 })]),
      runs: [
        ['a1', 'Succeeded', null],
        ['a2', 'Pending', null],
      ],
    });

    await run(db, { eventMessageId: MSG.toLowerCase() });

    expect(dispatched.map((d) => [d.id, d.openRunId])).toEqual([
      ['a1', undefined],
      ['a2', undefined],
    ]);
  });

  it('hands the dispatcher the event\'s message id, to write on every row it opens', async () => {
    const { db } = world();

    await run(db, { eventMessageId: MSG.toLowerCase() });

    expect(dispatched[0].ctx).toMatchObject({ workQueueMessageId: MSG.toLowerCase() });
  });

  it('skips the steps already terminal for this event and re-runs the open one on its own row', async () => {
    const { db } = world({
      definition: configured([step('done'), step('failed-for-good', { displayOrder: 2 }), step('open', { displayOrder: 3 })]),
      runs: [
        ['DONE', 'Succeeded', MSG],
        ['failed-for-good', 'Failed', MSG],
        ['open', 'Pending', MSG],
      ],
    });

    const report = await run(db, { eventMessageId: MSG.toLowerCase(), attempt: 2 });

    expect(dispatched.map((d) => [d.id, d.openRunId])).toEqual([['open', 'run-2']]);
    expect(report.results.find((r) => r.automationId === 'done')).toMatchObject({ status: 'Skipped' });
  });

  it('one PERMANENT and one TRANSIENT failure, then the redelivery: only the transient step runs again', async () => {
    const { db } = world({ definition: configured([step('permanent'), step('transient', { displayOrder: 2 })]) });
    failures.set('permanent', Object.assign(new Error('Action reported failure.'), { retryable: false }));
    failures.set('transient', new Error('ECONNRESET'));
    // What the real dispatcher leaves: Failed for a permanent failure, Pending for a transient one.
    onDispatch.hook = (id, openRunId, failed) => {
      const status = !failed ? 'Succeeded' : (failed as { retryable?: boolean }).retryable === false ? 'Failed' : 'Pending';
      const existing = db.tables[RUNS].find((r) => r.ID === openRunId);
      if (existing) {
        existing.Status = status;
      } else {
        db.tables[RUNS].push({ ID: `row-${id}`, FormAutomationID: id, FormResponseID: RESPONSE, Status: status, WorkQueueMessageID: MSG });
      }
    };

    const first = await run(db, { eventMessageId: MSG.toLowerCase() });
    failures.delete('transient');
    dispatched.length = 0;
    const second = await run(db, { eventMessageId: MSG.toLowerCase(), attempt: 2 });

    expect(first.retry).toBe(true);
    expect(dispatched.map((d) => [d.id, d.openRunId])).toEqual([['transient', 'row-transient']]);
    expect(second.retry).toBe(false);
    expect(db.tables[RUNS].map((r) => [r.FormAutomationID, r.Status])).toEqual([
      ['permanent', 'Failed'],
      ['transient', 'Succeeded'],
    ]);
  });

  it('a partial-save redelivery re-runs only the steps not yet terminal for that save', async () => {
    const { db } = world({
      definition: configured([step('p-done', { trigger: 'OnPartial' }), step('p-open', { trigger: 'OnPartial', displayOrder: 2 })]),
      runs: [
        ['p-done', 'Succeeded', MSG],
        ['p-open', 'Running', MSG],
      ],
      status: 'Partial',
    });

    await run(db, { trigger: 'OnPartial', eventMessageId: MSG.toLowerCase() });

    expect(dispatched.map((d) => [d.id, d.openRunId])).toEqual([['p-open', 'run-1']]);
  });

  it('an OnPartial step that succeeded for an EARLIER save runs again for this one — one run per save is the design', async () => {
    const { db } = world({ definition: configured([step('per-save', { trigger: 'OnPartial' })]), runs: [['per-save', 'Succeeded', OTHER]], status: 'Partial' });

    await run(db, { trigger: 'OnPartial', eventMessageId: MSG.toLowerCase() });

    expect(dispatched.map((d) => d.id)).toEqual(['per-save']);
  });

  it('called with no event (the inline submit path, never redelivered): every earlier run is ignored, and its rows carry no message', async () => {
    const { db } = world({ definition: configured([step('a1')]), runs: [['a1', 'Succeeded', MSG]] });

    await run(db);

    expect(dispatched.map((d) => d.id)).toEqual(['a1']);
    expect(dispatched[0].ctx).toMatchObject({ workQueueMessageId: null });
  });
});

/**
 * A partial-save message delivered after its response was completed is STALE (controller ruling,
 * Task 7 fix round 2): the completion has its own message, and running the partial's steps now
 * would at best repeat work and at worst write rows the final event would count as its own. It runs
 * nothing, writes nothing, and says so once.
 */
describe('a stale partial-save delivery', () => {
  it('runs nothing and writes no run row when the response is already Complete — and logs one status line naming it', async () => {
    const { db } = world({ definition: configured([step('p', { trigger: 'OnPartial' }), step('both', { trigger: 'OnCompleteOrPartial' })]), status: 'Complete' });
    const rowsBefore = db.tables[RUNS].length;

    const report = await run(db, { trigger: 'OnPartial', eventMessageId: MSG.toLowerCase() });

    expect(dispatched).toEqual([]);
    expect(db.tables[RUNS]).toHaveLength(rowsBefore);
    expect(report).toMatchObject({ stale: true, retry: false, results: [] });
    expect(logged.filter((line) => line.includes(RESPONSE))).toHaveLength(1);
  });

  it('a partial-save delivery for a response still Partial runs as usual', async () => {
    const { db } = world({ definition: configured([step('p', { trigger: 'OnPartial' })]), status: 'Partial' });

    const report = await run(db, { trigger: 'OnPartial', eventMessageId: MSG.toLowerCase() });

    expect(dispatched.map((d) => d.id)).toEqual(['p']);
    expect(report.stale).toBe(false);
  });
});

describe('where each step runs', () => {
  it('sync steps on the provider it was given, each async step on an isolated instance of its own', async () => {
    const { db, instances } = world({
      definition: configured([step('sync-1'), step('bg-1', { executionMode: 'Async' }), step('bg-2', { executionMode: 'Async' })]),
    });

    await run(db);

    const providerOf = (id: string) => dispatched.find((d) => d.id === id)?.ctx.provider;
    expect(providerOf('sync-1')).toBe(db.provider);
    expect(instances).toHaveLength(2);
    expect(instances).toContain(providerOf('bg-1'));
    expect(instances).toContain(providerOf('bg-2'));
    expect(providerOf('bg-1')).not.toBe(providerOf('bg-2'));
  });
});

describe('whether another delivery could help', () => {
  it('a final submit with a step that failed transiently asks for a retry', async () => {
    const { db } = world({ definition: configured([step('flaky'), step('fine', { displayOrder: 2 })]) });
    failures.set('flaky', new Error('ECONNRESET'));

    expect((await run(db)).retry).toBe(true);
  });

  it('a step that would fail the same way again does not', async () => {
    const { db } = world();
    failures.set('a1', Object.assign(new Error('Action act-1 is not registered.'), { retryable: false }));

    expect((await run(db)).retry).toBe(false);
  });

  it('a partial save asks for one too — the redelivery re-runs only its non-terminal steps', async () => {
    const { db } = world({ definition: configured([step('p', { trigger: 'OnPartial' })]), status: 'Partial' });
    failures.set('p', new Error('ECONNRESET'));

    expect((await run(db, { trigger: 'OnPartial', eventMessageId: MSG.toLowerCase() })).retry).toBe(true);
  });

  it('"stopped" is read off the results: a stop that lands after every step started is no stop', async () => {
    const { db } = world({ definition: configured([step('only')]) });
    const controller = new AbortController();
    onDispatch.hook = () => controller.abort('Shutdown');

    const report = await run(db, { signal: controller.signal, eventMessageId: MSG.toLowerCase() });

    expect(report.stopped).toBe(false);
    expect(report.retry).toBe(false);
  });
});

describe('a form that configures nothing (legacy dispatch)', () => {
  const legacy = makeDefinition({ settings: { ...makeDefinition().settings, onSubmitMode: 'Legacy' }, automations: [] });

  it('fires the four legacy hooks on a final submit', async () => {
    const { db } = world({ definition: legacy });

    const report = await run(db);

    expect(report.dispatch).toBe('legacy');
    expect(legacyFired).toEqual([RESPONSE]);
    expect(dispatched).toEqual([]);
  });

  it('fires nothing on a partial save — the legacy hooks never ran for one', async () => {
    const { db } = world({ definition: legacy, status: 'Partial' });

    await run(db, { trigger: 'OnPartial' });

    expect(legacyFired).toEqual([]);
  });
});

describe('what it refuses', () => {
  async function failureOf(promise: Promise<unknown>) {
    return promise.then(
      () => {
        throw new Error('expected a rejection');
      },
      (err: unknown) => err as InstanceType<typeof FormAutomationError>,
    );
  }

  it('a response that does not exist: nothing to run, and a retry would not change that', async () => {
    const { db } = world();

    const failure = await failureOf(run(db, { responseId: '22222222-2222-4222-8222-222222222222' }));

    expect(failure).toBeInstanceOf(FormAutomationError);
    expect(failure.retryable).toBe(false);
    expect(dispatched).toEqual([]);
  });

  it('a read that failed is worth retrying — it is not "no response"', async () => {
    const { db } = world({ failRunViewFor: RESPONSES });

    const failure = await failureOf(run(db));

    expect(failure.retryable).toBe(true);
    expect(failure.message).not.toContain('forced runview failure');
  });

  it('a snapshot that cannot be read: refused, not retried, nothing dispatched', async () => {
    const { db } = world({ snapshot: '{"not":"a definition"' });

    const failure = await failureOf(run(db));

    expect(failure.retryable).toBe(false);
    expect(dispatched).toEqual([]);
  });

  it('a final-submit message for a response that is not Complete runs nothing — a Disqualified one never fires side effects', async () => {
    const { db } = world({ status: 'Disqualified' });

    const failure = await failureOf(run(db));

    expect(failure.retryable).toBe(false);
    expect(dispatched).toEqual([]);
  });

  it('an unknown trigger is refused before any read — it is not quietly a partial save', async () => {
    const { db } = world();

    const failure = await failureOf(run(db, { trigger: 'OnSomething' as never }));

    expect(failure.retryable).toBe(false);
    expect(failure.message).toMatch(/trigger/i);
    expect(dispatched).toEqual([]);
  });

  it('a malformed response id is refused before any read', async () => {
    const { db } = world();

    const failure = await failureOf(run(db, { responseId: "x' OR 1=1 --" }));

    expect(failure.retryable).toBe(false);
  });
});

describe('a delivery told to stop', () => {
  it('starts nothing once its signal has aborted', async () => {
    const { db } = world({ definition: configured([step('a1'), step('a2', { displayOrder: 2 })]) });
    const controller = new AbortController();
    controller.abort('Shutdown');

    const report = await run(db, { signal: controller.signal });

    expect(dispatched).toEqual([]);
    expect(report.stopped).toBe(true);
    expect(report.retry).toBe(true);
  });
});

/**
 * A delivery that is dead-lettered closes its event's open rows `Failed` with the reason, so no step
 * is left `Running` forever (review Minor 7; the recovery sweep that used to find them is gone).
 */
describe('CloseOpenRuns — what a dead-lettered or abandoned delivery leaves', () => {
  it("closes the event's Running and Pending rows Failed with the reason, returns their steps, and touches nothing else", async () => {
    const { db } = world({
      runs: [
        ['running-now', 'Running', MSG],
        ['pending-now', 'Pending', MSG],
        ['done-now', 'Succeeded', MSG],
        ['running-earlier', 'Running', OTHER],
      ],
    });

    const closed = await FormAutomationEngine.Instance.CloseOpenRuns(
      { responseId: RESPONSE, eventMessageId: MSG.toLowerCase(), closedAs: 'DeadLettered', reason: 'Gave up after 5 attempts.' },
      db.provider,
      READER,
    );

    expect(closed).toEqual(['running-now', 'pending-now']);
    expect(db.tables[RUNS].map((r) => [r.FormAutomationID, r.Status])).toEqual([
      ['running-now', 'Failed'],
      ['pending-now', 'Failed'],
      ['done-now', 'Succeeded'],
      ['running-earlier', 'Running'],
    ]);
    expect(String(db.tables[RUNS][0].ErrorMessage)).toBe(`${DEAD_LETTERED_RUN_PREFIX}Gave up after 5 attempts.`);
  });

  it('marks a partial save\'s rows as abandoned, not dead-lettered — a replay never reopens them', async () => {
    const { db } = world({ runs: [['p', 'Pending', MSG]] });

    await FormAutomationEngine.Instance.CloseOpenRuns(
      { responseId: RESPONSE, eventMessageId: MSG.toLowerCase(), closedAs: 'Abandoned', reason: 'Gave up after 5 attempts.' },
      db.provider,
      READER,
    );

    expect(String(db.tables[RUNS][0].ErrorMessage)).toMatch(/^Abandoned after the retry limit/);
    expect(String(db.tables[RUNS][0].ErrorMessage).startsWith(DEAD_LETTERED_RUN_PREFIX)).toBe(false);
  });
});

/**
 * Replaying a dead letter (re-review B1): the operator's remedy must actually run the steps the
 * dead letter closed. Those rows are recognised precisely — `Failed`, carrying this message's id,
 * with the fixed prefix the close-out wrote — and only on a replay.
 */
describe('a replayed dead letter', () => {
  it('dead-letter a final, replay it: its failed steps run once, on their rows', async () => {
    const { db } = world({ definition: configured([step('done'), step('flaky', { displayOrder: 2 })]) });
    failures.set('flaky', new Error('ECONNRESET'));
    onDispatch.hook = (id, openRunId, failed) => {
      const status = failed ? 'Pending' : 'Succeeded';
      const existing = db.tables[RUNS].find((r) => r.ID === openRunId);
      if (existing) {
        Object.assign(existing, { Status: status, ErrorMessage: null });
      } else {
        db.tables[RUNS].push({ ID: `row-${id}`, FormAutomationID: id, FormResponseID: RESPONSE, Status: status, WorkQueueMessageID: MSG });
      }
    };

    await run(db, { eventMessageId: MSG.toLowerCase(), attempt: 5 });
    await FormAutomationEngine.Instance.CloseOpenRuns(
      { responseId: RESPONSE, eventMessageId: MSG.toLowerCase(), closedAs: 'DeadLettered', reason: 'Gave up after 5 attempts.' },
      db.provider,
      READER,
    );
    failures.delete('flaky');
    dispatched.length = 0;

    await run(db, { eventMessageId: MSG.toLowerCase(), attempt: 1, isReplay: true });
    await run(db, { eventMessageId: MSG.toLowerCase(), attempt: 2, isReplay: true });

    expect(dispatched.map((d) => [d.id, d.openRunId])).toEqual([['flaky', 'row-flaky']]);
    expect(db.tables[RUNS].map((r) => [r.FormAutomationID, r.Status])).toEqual([
      ['done', 'Succeeded'],
      ['flaky', 'Succeeded'],
    ]);
  });

  it('without the replay flag, a dead-lettered row stays terminal', async () => {
    const { db } = world({ runs: [['a1', 'Failed', MSG, `${DEAD_LETTERED_RUN_PREFIX}Gave up.`]] });

    await run(db, { eventMessageId: MSG.toLowerCase() });

    expect(dispatched).toEqual([]);
  });

  it('on a replay, a PERMANENT failure (no dead-letter prefix) and ANOTHER message\'s dead-lettered row both stay as they were', async () => {
    const { db } = world({
      definition: configured([step('permanent'), step('old', { displayOrder: 2 })]),
      runs: [
        ['permanent', 'Failed', MSG, 'Action reported failure.'],
        ['old', 'Failed', OTHER, `${DEAD_LETTERED_RUN_PREFIX}Gave up.`],
      ],
    });

    await run(db, { eventMessageId: MSG.toLowerCase(), isReplay: true });

    // `old`'s row belongs to another message, so `old` runs fresh (no row reused); `permanent` does not run.
    expect(dispatched.map((d) => [d.id, d.openRunId])).toEqual([['old', undefined]]);
  });
});
