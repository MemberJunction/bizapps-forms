/**
 * Which on-submit work a completed submission actually does — pinned at the pipeline level.
 *
 * Nothing pinned this branch before. `legacy-automation-parity.spec.ts` proves the two LISTS agree
 * and `automation-plan.spec.ts` proves the plan is ordered correctly, but the choice between them
 * was an inline `automations.length > 0` test that no test exercised. That is how the overload in
 * bizapps-forms#47 survived: a form that configured nothing and a form that deliberately wanted
 * nothing were the same snapshot, and the pipeline silently fired all four legacy hooks for both.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveThroughEngine, recordingQueue, type EngineSaveContext, type EngineSaveSubmission } from './harness.js';
import { resetPublicSubmitConfigForTests } from '../../../submission/config.js';
import type { FormSettings, PublishedFormAutomation } from '@mj-biz-apps/forms-entities';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
} from '../../../testing/index.js';

function validSubmission(): EngineSaveSubmission {
  return {
    distributionSlug: 'public-1',
    formVersionId: 'ver-1',
    answers: [{ questionId: 'q-name', textValue: 'Ada Lovelace' }],
  };
}

/** A published form whose on-submit configuration is exactly what the test names. */
function contextFor(
  onSubmitMode: FormSettings['onSubmitMode'],
  automations: PublishedFormAutomation[],
  queue: EngineSaveContext['queue'],
): EngineSaveContext {
  const definition = makeDefinition({
    settings: { anonymousAllowed: true, captchaRequired: false, confirmationMessage: 'Thanks!', onSubmitMode },
    automations,
  });
  const fake = makeFakeProvider({
    distribution: makeDistribution({ CaptchaRequired: false, MaxResponses: null, ResponseCount: 0 }),
    version: makeVersion(definition),
    createPermissions: respondentPermissions(),
  });
  return {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: 'sess-abc',
    queue,
  };
}

describe('on-submit dispatch', () => {
  beforeEach(() => {
    delete process.env.FORMS_TURNSTILE_SECRET;
    resetPublicSubmitConfigForTests();
  });

  it('fires nothing when a form declares its automations authoritative and lists none', async () => {
    // bizapps-forms#47. This is the behaviour a consumer that owns its own subject identity needs:
    // no `Forms: Upsert Respondent Person`, therefore no second Person row per submission.
    const fireHooks = recordingQueue();

    const result = await saveThroughEngine(contextFor('Configured', [], fireHooks), validSubmission());

    expect(result.success).toBe(true);
    expect(result.status).toBe('Complete');
    expect(fireHooks.published).toHaveLength(0);
  });

  it('still fires the legacy hooks for a form that declares nothing and configures nothing', async () => {
    // Every form in production today. This test is the reason the fix above is safe to ship: it
    // fails the moment "explicitly none" starts leaking into "never configured".
    const fireHooks = recordingQueue();

    const result = await saveThroughEngine(contextFor(undefined, [], fireHooks), validSubmission());

    expect(result.success).toBe(true);
    expect(fireHooks.published).toHaveLength(1);
  });
});
