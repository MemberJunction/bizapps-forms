/**
 * `Forms.RunAutomations` — the `BaseWorkHandler` the `forms.run-automations` subscription names
 * (spec #303 §5). What it decides is the OUTCOME of a delivery; what running the steps means is
 * `FormAutomationEngine.RunForResponse`, stood in for here and specced on its own.
 *
 * The last block delivers through the work-queue engine's OWN resolution path (`ResolveWorkHandler`
 * + `BoundWorkHandler`, what `WorkQueueHost` does), which only finds this handler if Forms and the
 * engine share one copy of `@memberjunction/global`'s class registry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { WorkContext, WorkMessage } from '@memberjunction/work-queue-core';
import { BoundWorkHandler, ResolveWorkHandler, SharedProviderSource } from '@memberjunction/work-queue-engine';
import { makeFakeProvider } from '../../testing/index.js';
import type { ResponseSubmittedPayload } from '../response-submitted.js';

const engine = vi.hoisted(() => ({
  calls: [] as { request: Record<string, unknown>; provider: unknown; user: unknown }[],
  closes: [] as { request: Record<string, unknown>; user: unknown }[],
  next: async (): Promise<unknown> => ({ dispatch: 'configured', results: [], legacy: [], retry: false, stopped: false }),
}));
vi.mock('../../engines/FormAutomationEngine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../engines/FormAutomationEngine.js')>();
  return {
    ...actual,
    FormAutomationEngine: {
      Instance: {
        RunForResponse: async (request: Record<string, unknown>, provider: unknown, user: unknown) => {
          engine.calls.push({ request, provider, user });
          return engine.next();
        },
        CloseOpenRuns: async (request: Record<string, unknown>, _provider: unknown, user: unknown) => {
          engine.closes.push({ request, user });
          return ['step-a', 'step-b'];
        },
      },
    },
  };
});

const principal = vi.hoisted(() => ({ value: { ID: 'principal-1', Name: 'Forms Automation Service' } as unknown }));
vi.mock('../../automation/service-principal.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../automation/service-principal.js')>()),
  resolveAutomationPrincipal: () => principal.value,
}));

const logged = vi.hoisted(() => [] as string[]);
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (m: string) => logged.push(m),
  LogStatus: (m: string) => logged.push(m),
}));

const { RunAutomationsHandler } = await import('../RunAutomationsHandler.js');
const { FormAutomationError } = await import('../../engines/automation-errors.js');

const SYSTEM = { ID: 'system-1', Name: 'System' } as unknown as UserInfo;
const RESPONSE = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = 'DDDDDDDD-0000-4000-8000-00000000000D';

function payload(overrides: Partial<ResponseSubmittedPayload> = {}): ResponseSubmittedPayload {
  return {
    ResponseID: RESPONSE,
    FormVersionID: '22222222-2222-4222-8222-222222222222',
    FormDistributionID: '33333333-3333-4333-8333-333333333333',
    Trigger: 'OnComplete',
    PartialSaveKey: null,
    ...overrides,
  };
}

function message(body: unknown = payload()): WorkMessage<ResponseSubmittedPayload> {
  return {
    MessageID: MESSAGE_ID,
    Topic: 'forms.response-submitted',
    Attributes: {},
    Payload: body as ResponseSubmittedPayload,
    PublishedAt: '2026-10-12T10:00:00.000Z',
  };
}

function context(overrides: Partial<WorkContext> = {}): WorkContext {
  return {
    SubscriptionName: 'forms.run-automations',
    DeliveryID: 'delivery-1',
    Attempt: 2,
    MaxAttempts: 5,
    IsReplay: false,
    Signal: new AbortController().signal,
    Heartbeat: async () => true,
    Log: { Info: () => undefined, Warn: () => undefined, Error: () => undefined },
    ...overrides,
  };
}

/** The delivery's provider, able to hand out isolated instances (distinct objects sharing its tables). */
function deliveryProvider() {
  const db = makeFakeProvider({});
  const instances: unknown[] = [];
  Object.assign(db.provider, {
    CreateIndependentInstance: async () => {
      const own = Object.create(db.provider) as DatabaseProviderBase;
      Object.assign(own, { ReleaseIndependentInstance: async () => undefined });
      instances.push(own);
      return own;
    },
  });
  return { provider: db.provider, instances };
}

function handler(provider: DatabaseProviderBase) {
  const h = new RunAutomationsHandler();
  h.BindExecutionContext({ ContextUser: SYSTEM, Provider: provider });
  return h;
}

beforeEach(() => {
  engine.calls.length = 0;
  engine.closes.length = 0;
  engine.next = async () => ({ dispatch: 'configured', results: [], legacy: [], retry: false, stopped: false });
  principal.value = { ID: 'principal-1', Name: 'Forms Automation Service' };
  logged.length = 0;
});

describe('a delivery that runs', () => {
  it('runs the response for its trigger, as the principal, read as the host user, on an isolated instance — and completes', async () => {
    const { provider, instances } = deliveryProvider();
    const ctx = context();

    const outcome = await handler(provider).Handle(message(), ctx);

    expect(outcome).toEqual({ Kind: 'Complete' });
    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0].request).toMatchObject({ responseId: RESPONSE, trigger: 'OnComplete', attempt: 2, signal: ctx.Signal });
    // The event the redelivery rule is scoped to: the message's own id, folded to one case.
    expect(engine.calls[0].request.eventMessageId).toBe(MESSAGE_ID.toLowerCase());
    expect(engine.calls[0].request.principal).toBe(principal.value);
    expect(engine.calls[0].user).toBe(SYSTEM);
    expect(instances).toEqual([engine.calls[0].provider]);
  });

  it('runs a partial save for its own trigger', async () => {
    const { provider } = deliveryProvider();

    await handler(provider).Handle(message(payload({ Trigger: 'OnPartial', PartialSaveKey: '3' })), context());

    expect(engine.calls[0].request).toMatchObject({ trigger: 'OnPartial' });
  });
});

describe('the outcome', () => {
  it('asks for another delivery when a step failed in a way that might not repeat', async () => {
    const { provider } = deliveryProvider();
    engine.next = async () => ({
      dispatch: 'configured',
      results: [{ automationId: 'a1', name: 'Bind applicant', status: 'Failed', retryable: true, message: 'ECONNRESET' }],
      legacy: [],
      retry: true,
      stopped: false,
    });

    const outcome = await handler(provider).Handle(message(), context());

    expect(outcome.Kind).toBe('Retry');
    expect(outcome.Kind === 'Retry' && outcome.Reason).toMatch(/Bind applicant/);
  });

  it('asks for another delivery when it was stopped before every step started', async () => {
    const { provider } = deliveryProvider();
    engine.next = async () => ({ dispatch: 'configured', results: [], legacy: [], retry: false, stopped: true });

    expect((await handler(provider).Handle(message(), context())).Kind).toBe('Retry');
  });

  it('dead-letters what no retry can fix (a response that does not exist, a snapshot that cannot be read)', async () => {
    const { provider } = deliveryProvider();
    engine.next = async () => {
      throw new FormAutomationError(`Response ${RESPONSE} does not exist, so it has no automations to run.`);
    };

    const outcome = await handler(provider).Handle(message(), context());

    expect(outcome).toEqual({ Kind: 'DeadLetter', Reason: `Response ${RESPONSE} does not exist, so it has no automations to run.` });
  });

  it('retries what might clear (a failed read), with the engine\'s sentence — never provider text', async () => {
    const { provider } = deliveryProvider();
    engine.next = async () => {
      throw new FormAutomationError(`Response ${RESPONSE} could not be read for its automations.`, {
        fault: true,
        retryable: true,
        logDetail: 'Login failed for user sa',
      });
    };

    const outcome = await handler(provider).Handle(message(), context());

    expect(outcome.Kind).toBe('Retry');
    expect(JSON.stringify(outcome)).not.toContain('Login failed');
  });

  it('retries an unexpected failure, and logs it — no isolated instance could be made, say', async () => {
    const provider = makeFakeProvider({}).provider; // cannot create an independent instance

    const outcome = await handler(provider).Handle(message(), context());

    expect(outcome.Kind).toBe('Retry');
    expect(engine.calls).toEqual([]);
    expect(logged.join('\n')).toMatch(/delivery-1/);
  });

  it('dead-letters a payload that is not a forms.response-submitted payload, running nothing', async () => {
    const { provider } = deliveryProvider();

    const outcome = await handler(provider).Handle(message({ ResponseID: 'nope' }), context());

    expect(outcome.Kind).toBe('DeadLetter');
    expect(engine.calls).toEqual([]);
  });

  it('retries — never runs as anyone else — while the automation principal cannot be resolved', async () => {
    const { provider } = deliveryProvider();
    principal.value = null;

    const outcome = await handler(provider).Handle(message(), context());

    expect(outcome.Kind).toBe('Retry');
    expect(outcome.Kind === 'Retry' && outcome.Reason).toMatch(/principal/);
    expect(engine.calls).toEqual([]);
  });
});

describe('the event, and giving up', () => {
  it('dead-letters a final message with no usable id — the event a redelivery is scoped to', async () => {
    const { provider } = deliveryProvider();

    for (const bad of ['', 'not-a-guid']) {
      const outcome = await handler(provider).Handle({ ...message(), MessageID: bad }, context());
      expect(outcome.Kind).toBe('DeadLetter');
    }
    expect(engine.calls).toEqual([]);
  });

  it('on the LAST attempt, a run that would retry is dead-lettered instead, and its open rows are closed Failed with the reason', async () => {
    const { provider } = deliveryProvider();
    engine.next = async () => ({
      dispatch: 'configured',
      results: [{ automationId: 'a1', name: 'Bind applicant', status: 'Failed', retryable: true }],
      legacy: [],
      retry: true,
      stopped: false,
    });

    const outcome = await handler(provider).Handle(message(), context({ Attempt: 5, MaxAttempts: 5 }));

    expect(outcome.Kind).toBe('DeadLetter');
    expect(engine.closes).toHaveLength(1);
    expect(engine.closes[0].request).toMatchObject({ responseId: RESPONSE, eventMessageId: MESSAGE_ID.toLowerCase(), closedAs: 'DeadLettered' });
    expect(String(engine.closes[0].request.reason)).toMatch(/5 attempts/);
    expect(engine.closes[0].user).toBe(SYSTEM);
  });

  it('a run dead-lettered for a reason no retry fixes closes its open rows too', async () => {
    const { provider } = deliveryProvider();
    engine.next = async () => {
      throw new FormAutomationError('The published definition of version v cannot be read.', { fault: true });
    };

    const outcome = await handler(provider).Handle(message(), context());

    expect(outcome.Kind).toBe('DeadLetter');
    expect(engine.closes).toHaveLength(1);
  });

  it('a stale partial-save delivery (its response already Complete) completes, retries nothing and closes nothing', async () => {
    const { provider } = deliveryProvider();
    engine.next = async () => ({ dispatch: 'configured', results: [], legacy: [], retry: false, stopped: false, stale: true });

    const outcome = await handler(provider).Handle(message(payload({ Trigger: 'OnPartial', PartialSaveKey: '4' })), context());

    expect(outcome).toEqual({ Kind: 'Complete' });
    expect(engine.closes).toEqual([]);
  });

  it('a retry before the last attempt closes nothing — the open rows are what the redelivery reuses', async () => {
    const { provider } = deliveryProvider();
    engine.next = async () => ({ dispatch: 'configured', results: [], legacy: [], retry: true, stopped: true });

    expect((await handler(provider).Handle(message(), context({ Attempt: 2, MaxAttempts: 5 }))).Kind).toBe('Retry');
    expect(engine.closes).toEqual([]);
  });
});

/**
 * A partial save NEVER dead-letters (controller ruling, Task 7 fix round 3): under the Ordered
 * subscription a dead-lettered partial would block the response's FINAL message until an operator
 * intervened. On its last attempt it closes its open rows as abandoned, logs one error line, and
 * completes — the next save, and in the end the final submit, supersede it.
 */
describe('a partial save never dead-letters', () => {
  const partial = () => message(payload({ Trigger: 'OnPartial', PartialSaveKey: '3' }));
  const transientFailure = async () => ({
    dispatch: 'configured',
    results: [{ automationId: 'step-a', name: 'Capture lead', status: 'Failed', retryable: true }],
    legacy: [],
    retry: true,
    stopped: false,
    stale: false,
  });

  it('on its last attempt: closes its open rows as abandoned, logs ONE error line with the response and steps, and completes', async () => {
    const { provider } = deliveryProvider();
    engine.next = transientFailure;

    const outcome = await handler(provider).Handle(partial(), context({ Attempt: 5, MaxAttempts: 5 }));

    expect(outcome).toEqual({ Kind: 'Complete' });
    expect(engine.closes).toHaveLength(1);
    expect(engine.closes[0].request).toMatchObject({ responseId: RESPONSE, closedAs: 'Abandoned' });
    expect(String(engine.closes[0].request.reason)).toMatch(/5 attempts/);
    const errors = logged.filter((line) => line.includes(RESPONSE));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/step-a/);
    expect(errors[0]).toMatch(/step-b/);
  });

  it('before its last attempt it still retries — only non-terminal steps re-run', async () => {
    const { provider } = deliveryProvider();
    engine.next = transientFailure;

    expect((await handler(provider).Handle(partial(), context({ Attempt: 2, MaxAttempts: 5 }))).Kind).toBe('Retry');
    expect(engine.closes).toEqual([]);
  });

  it('a partial that no retry could fix completes too, rather than dead-lettering', async () => {
    const { provider } = deliveryProvider();
    engine.next = async () => {
      throw new FormAutomationError('The published definition of version v cannot be read.', { fault: true });
    };

    expect((await handler(provider).Handle(partial(), context())).Kind).toBe('Complete');
    expect(engine.closes[0].request).toMatchObject({ closedAs: 'Abandoned' });
  });

  it('a partial with no usable message id completes, logging why — it cannot be scoped, and must not block the final', async () => {
    const { provider } = deliveryProvider();

    const outcome = await handler(provider).Handle({ ...partial(), MessageID: '' }, context());

    expect(outcome).toEqual({ Kind: 'Complete' });
    expect(engine.calls).toEqual([]);
    expect(logged.some((line) => line.includes(RESPONSE))).toBe(true);
  });
});

describe('every last-attempt dead letter closes the open rows first (re-review B3)', () => {
  it('an unexpected throw on the final\'s last attempt still closes the event\'s open rows before dead-lettering', async () => {
    const { provider } = deliveryProvider();
    engine.next = async () => {
      throw new Error('socket hang up');
    };

    const outcome = await handler(provider).Handle(message(), context({ Attempt: 5, MaxAttempts: 5 }));

    expect(outcome.Kind).toBe('DeadLetter');
    expect(engine.closes).toHaveLength(1);
    expect(engine.closes[0].request).toMatchObject({ responseId: RESPONSE, closedAs: 'DeadLettered' });
  });
});

describe('a replay', () => {
  it('tells the engine it is one, so the rows its own dead letter closed are run again', async () => {
    const { provider } = deliveryProvider();

    await handler(provider).Handle(message(), context({ IsReplay: true, Attempt: 1 }));

    expect(engine.calls[0].request).toMatchObject({ isReplay: true });
  });
});

describe('delivered through the work-queue engine\'s own resolution (one class registry)', () => {
  it('ResolveWorkHandler finds it under its HandlerKey', () => {
    expect(ResolveWorkHandler('Forms.RunAutomations')).toBeInstanceOf(RunAutomationsHandler);
    // Keys match case-insensitively, as the subscription row's HandlerKey is matched.
    expect(ResolveWorkHandler('forms.runautomations')).toBeInstanceOf(RunAutomationsHandler);
  });

  it('a BoundWorkHandler — what WorkQueueHost runs — binds the host user and provider and gets a Complete', async () => {
    const { provider } = deliveryProvider();
    const bound = new BoundWorkHandler('Forms.RunAutomations', SYSTEM, new SharedProviderSource(provider), ResolveWorkHandler);

    const outcome = await bound.Handle(message() as WorkMessage, context());

    expect(outcome).toEqual({ Kind: 'Complete' });
    expect(engine.calls[0].user).toBe(SYSTEM);
  });
});
