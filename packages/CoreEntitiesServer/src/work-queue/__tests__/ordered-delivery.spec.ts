/**
 * The Ordered subscription and the handler together, on MJ's reference transport
 * (`InMemoryTransport`: "full Database-transport semantics, held in process memory"), which keeps a
 * key blocked behind a dead letter exactly as the database's claim procedure does.
 *
 * The question the controller asked (Task 7 fix round 3): can a partial save that keeps failing
 * block its response's FINAL message? It must not — a partial never dead-letters — so once the
 * partial's retries run out, the final is delivered.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { InMemoryTransport, type ReceivedDelivery, type WorkContext } from '@memberjunction/work-queue-core';
import { BuildMessages, BuildSubscriptionBinding, BuildTopicBinding, ManualClock } from '@memberjunction/work-queue-core/testing';
import { makeFakeProvider } from '../../testing/index.js';
import { responseSubmittedRequest, type ResponseSubmittedPayload } from '../response-submitted.js';

const handled = vi.hoisted(() => [] as string[]);
vi.mock('../../engines/FormAutomationEngine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../engines/FormAutomationEngine.js')>();
  return {
    ...actual,
    FormAutomationEngine: {
      Instance: {
        // Every partial-save run fails transiently; the final succeeds.
        RunForResponse: async (request: { trigger: string }) => {
          handled.push(request.trigger);
          return request.trigger === 'OnPartial'
            ? { dispatch: 'configured', results: [{ automationId: 's', name: 's', status: 'Failed', retryable: true }], legacy: [], retry: true, stopped: false, stale: false }
            : { dispatch: 'configured', results: [], legacy: [], retry: false, stopped: false, stale: false };
        },
        CloseOpenRuns: async () => ['s'],
      },
    },
  };
});
vi.mock('../../automation/service-principal.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../automation/service-principal.js')>()),
  resolveAutomationPrincipal: () => ({ ID: 'principal-1' }),
}));
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: () => undefined,
  LogStatus: () => undefined,
}));

const { RunAutomationsHandler } = await import('../RunAutomationsHandler.js');

const RESPONSE = '11111111-1111-4111-8111-111111111111';
const MAX_ATTEMPTS = 5;
/** Bounds the drive loop: every delivery this spec publishes settles well inside it. */
const MAX_ROUNDS = 40;

function payload(overrides: Partial<ResponseSubmittedPayload>): ResponseSubmittedPayload {
  return {
    ResponseID: RESPONSE,
    FormVersionID: '22222222-2222-4222-8222-222222222222',
    FormDistributionID: '33333333-3333-4333-8333-333333333333',
    Trigger: 'OnComplete',
    PartialSaveKey: null,
    ...overrides,
  };
}

function provider(): DatabaseProviderBase {
  const db = makeFakeProvider({});
  Object.assign(db.provider, {
    CreateIndependentInstance: async () => Object.assign(Object.create(db.provider), { ReleaseIndependentInstance: async () => undefined }),
  });
  return db.provider;
}

function contextOf(delivery: ReceivedDelivery): WorkContext {
  return {
    SubscriptionName: 'forms.run-automations',
    DeliveryID: delivery.DeliveryID,
    Attempt: delivery.Attempt,
    MaxAttempts: MAX_ATTEMPTS,
    IsReplay: delivery.IsReplay,
    Signal: new AbortController().signal,
    Heartbeat: async () => true,
    Log: { Info: () => undefined, Warn: () => undefined, Error: () => undefined },
  };
}

describe('Ordered by response: a failing partial save cannot block the final', () => {
  it('the partial retries to its limit, completes as abandoned, and the final is then delivered and completed', async () => {
    const clock = new ManualClock();
    const transport = new InMemoryTransport({ Now: clock.Now });
    const topic = BuildTopicBinding('forms.response-submitted');
    const subscription = BuildSubscriptionBinding(topic, 'forms.run-automations', { PartitionMode: 'Ordered', MaxAttempts: MAX_ATTEMPTS });
    const requests = [
      responseSubmittedRequest(payload({ Trigger: 'OnPartial', PartialSaveKey: '1' })),
      responseSubmittedRequest(payload({})),
    ];
    await transport.Publish(topic, BuildMessages(topic, requests, new Date(clock.Now())), [subscription]);
    const consumer = transport.OpenConsumer<ResponseSubmittedPayload>(subscription);
    const handler = new RunAutomationsHandler();
    handler.BindExecutionContext({ ContextUser: { ID: 'system-1' } as unknown as UserInfo, Provider: provider() });

    const settled: string[] = [];
    for (let round = 0; round < MAX_ROUNDS && !settled.includes('OnComplete:Complete'); round++) {
      const [delivery] = await consumer.Receive(1, 0, new AbortController().signal);
      if (!delivery) {
        clock.Advance(60_000); // past any backoff
        continue;
      }
      const outcome = await handler.Handle(delivery.Message, contextOf(delivery));
      settled.push(`${delivery.Message.Payload?.Trigger}:${outcome.Kind}`);
      if (outcome.Kind === 'Complete') {
        await consumer.Complete(delivery);
      } else if (outcome.Kind === 'Retry') {
        await consumer.Retry(delivery, 1, outcome.Reason ?? 'retry');
      } else {
        await consumer.DeadLetter(delivery, outcome.Reason, null);
      }
    }

    expect(settled).toEqual([
      'OnPartial:Retry',
      'OnPartial:Retry',
      'OnPartial:Retry',
      'OnPartial:Retry',
      'OnPartial:Complete',
      'OnComplete:Complete',
    ]);
    expect(transport.Snapshot('forms.run-automations').map((d) => d.Status)).toEqual(['Completed', 'Completed']);
    expect(handled.filter((t) => t === 'OnComplete')).toHaveLength(1);
  });
});
