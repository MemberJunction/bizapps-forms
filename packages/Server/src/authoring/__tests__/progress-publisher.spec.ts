import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The publisher has exactly two jobs and both are easy to get silently wrong.
 *
 *   1. Carry IDENTITY on every push. MJ 6.x's `statusUpdates` filter requires `ownerUserId` to
 *      match the subscribing connection's authenticated user and fails closed, so a publish that
 *      omits it is accepted, delivered to nobody, and indistinguishable from a network problem.
 *   2. Survive having no PubSub engine. `buildSchemaSync` creates it during boot, so a build that
 *      starts before then finds none — and must not throw a form away over it.
 */
// `vi.hoisted` because `vi.mock` is lifted above every other statement in the file — a plain
// `const` above it is still in the temporal dead zone when the factory runs.
const { publishStatusUpdate, engineRef } = vi.hoisted(() => ({
  publishStatusUpdate: vi.fn(),
  engineRef: { value: { marker: 'pubsub' } as object | null },
}));

vi.mock('@memberjunction/server', () => ({
  publishStatusUpdate,
  PubSubManager: {
    get Instance() {
      return {
        get PubSubEngine() {
          return engineRef.value;
        },
      };
    },
  },
}));

import { StatusUpdateProgressPublisher } from '../progress-publisher';
import type { GenerateFormProgressEvent } from '@mj-biz-apps/forms-entities';

const event: GenerateFormProgressEvent = {
  resolver: 'FormsGenerate',
  type: 'GenerateFormProgress',
  formId: 'form-1',
  stage: 'page',
  step: 2,
  total: 4,
  label: 'Filled in Travel',
};

describe('StatusUpdateProgressPublisher', () => {
  beforeEach(() => {
    publishStatusUpdate.mockReset();
    engineRef.value = { marker: 'pubsub' };
  });

  it('publishes with BOTH the session and the owning user', () => {
    new StatusUpdateProgressPublisher().publish('session-1', 'user-1', event);
    expect(publishStatusUpdate).toHaveBeenCalledTimes(1);
    const [pubSub, params] = publishStatusUpdate.mock.calls[0];
    expect(pubSub).toEqual({ marker: 'pubsub' });
    expect(params.sessionId).toBe('session-1');
    // The load-bearing one: without it 6.x delivers nothing, silently.
    expect(params.ownerUserId).toBe('user-1');
  });

  it('sends the event as JSON in the message field', () => {
    new StatusUpdateProgressPublisher().publish('session-1', 'user-1', event);
    const parsed = JSON.parse(publishStatusUpdate.mock.calls[0][1].message);
    // Both discriminators travel, because `statusUpdates` is a channel shared with every other
    // resolver on the server and the client filters on the pair.
    expect(parsed.resolver).toBe('FormsGenerate');
    expect(parsed.type).toBe('GenerateFormProgress');
    expect(parsed.step).toBe(2);
  });

  it('drops the event without throwing when the engine is not up yet', () => {
    engineRef.value = null;
    expect(() => new StatusUpdateProgressPublisher().publish('s', 'u', event)).not.toThrow();
    expect(publishStatusUpdate).not.toHaveBeenCalled();
  });
});
