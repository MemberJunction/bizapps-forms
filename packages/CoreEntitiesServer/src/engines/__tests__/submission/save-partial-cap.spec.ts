/**
 * The per-version Partial-row cap — the only DURABLE bound on partial-write abuse. The per-caller
 * ceilings are sliding windows in one process's memory, so they bound a rate; a caller pacing
 * themselves under them, or spread across addresses, still accumulates rows forever. Only a
 * partial submit that would CREATE a new row is capped; complete submits and updates to an
 * existing partial are not.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { saveThroughEngine, recordingQueue, type EngineSaveContext, type EngineSaveSubmission } from './harness.js';
import { FormSubmissionEngine } from '../../FormSubmissionEngine.js';
import { FormsRateLimiter } from '../../../submission/rate-limit.js';
import { resetPublicSubmitConfigForTests } from '../../../submission/config.js';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
} from '../../../testing/index.js';

/** A partial submission satisfying the shape guard (required-field checks are relaxed for partials). */
function partialSubmission(): EngineSaveSubmission {
  return {
    distributionSlug: 'public-1',
    formVersionId: 'ver-1',
    partial: true,
    answers: [{ questionId: 'q-name', textValue: 'Ada' }],
  };
}

/**
 * Build a pipeline context whose `count_only` FormResponse query reports `partialCount` existing
 * partial rows (the fake returns `formResponseCount` for count_only queries).
 */
function makeContext(partialCount: number): { ctx: EngineSaveContext; saved: () => unknown[] } {
  const fake = makeFakeProvider({
    distribution: makeDistribution(),
    version: makeVersion(makeDefinition()),
    createPermissions: respondentPermissions(),
    formResponseCount: partialCount,
  });
  const ctx: EngineSaveContext = {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: 'sess-abc',
  };
  return { ctx, saved: () => fake.saved };
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
  FormSubmissionEngine.Instance.ResetInFlightForTests();
  process.env.FORMS_MAX_PARTIALS_PER_VERSION = '3';
});

describe('submit pipeline partial-row cap', () => {
  it('refuses a NEW partial once the per-version cap is reached, and writes nothing', async () => {
    const { ctx, saved } = makeContext(3); // already at the cap of 3
    const result = await saveThroughEngine(ctx, partialSubmission());

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toMatch(/not accepting new drafts/i);
    expect(saved()).toHaveLength(0);
  });

  it('allows a new partial while under the cap', async () => {
    const { ctx, saved } = makeContext(2); // below the cap of 3
    const result = await saveThroughEngine(ctx, partialSubmission());

    expect(result.success).toBe(true);
    expect(saved().length).toBeGreaterThan(0);
  });
});
