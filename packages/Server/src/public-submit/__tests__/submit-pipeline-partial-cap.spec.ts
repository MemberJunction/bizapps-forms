/**
 * The per-version Partial-row cap — the durable bound on partial-write abuse when the
 * client-controlled `x-session-id` (and thus the session-keyed rate limiter) is rotated per
 * request. Only a partial submit that would CREATE a new row is capped; complete submits and
 * updates to an existing partial are not.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { runSubmitPipeline, resetSubmitInFlightForTests, type PipelineContext, type PipelineSubmission } from '../submit-pipeline';
import { FormsRateLimiter } from '../rate-limit.service';
import { resetPublicSubmitConfigForTests } from '../config';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
} from './fakes';

/** A partial submission satisfying the shape guard (required-field checks are relaxed for partials). */
function partialSubmission(): PipelineSubmission {
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
function makeContext(partialCount: number): { ctx: PipelineContext; saved: () => unknown[] } {
  const fake = makeFakeProvider({
    distribution: makeDistribution(),
    version: makeVersion(makeDefinition()),
    createPermissions: respondentPermissions(),
    formResponseCount: partialCount,
  });
  const ctx: PipelineContext = {
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
  resetSubmitInFlightForTests();
  process.env.FORMS_MAX_PARTIALS_PER_VERSION = '3';
});

describe('submit pipeline partial-row cap', () => {
  it('refuses a NEW partial once the per-version cap is reached, and writes nothing', async () => {
    const { ctx, saved } = makeContext(3); // already at the cap of 3
    const result = await runSubmitPipeline(ctx, partialSubmission());

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toMatch(/not accepting new drafts/i);
    expect(saved()).toHaveLength(0);
  });

  it('allows a new partial while under the cap', async () => {
    const { ctx, saved } = makeContext(2); // below the cap of 3
    const result = await runSubmitPipeline(ctx, partialSubmission());

    expect(result.success).toBe(true);
    expect(saved().length).toBeGreaterThan(0);
  });
});
