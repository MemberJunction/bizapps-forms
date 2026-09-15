/**
 * Issue #124 — a submission whose answers match no question, or that would store nothing, must
 * be refused BEFORE anything is written: no `FormResponse` row, no `ResponseCount` increment, no
 * hooks. Measured on `next`, such a submission returned `success: true`, wrote a `Complete` row
 * with zero answers, and spent a quota slot a real respondent then could not have.
 *
 * The rules themselves are unit-tested at the validator seam (`validation.service.spec.ts`);
 * these tests prove the pipeline lets nothing through to persistence and that the quota fills
 * only on real responses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { runSubmitPipeline, type PipelineContext, type PipelineSubmission } from '../submit-pipeline';
import { FormsRateLimiter } from '../rate-limit.service';
import { resetPublicSubmitConfigForTests } from '../config';
import type { HookFireResult } from '../on-submit-hooks.service';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
  type FakeProvider,
} from './fakes';

const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';
const FORM_DISTRIBUTION_ENTITY = 'MJ_BizApps_Forms: Form Distributions';

/** A GUID-shaped id that no question in the fixture carries. */
const GHOST_QUESTION_ID = '00000000-0000-4000-8000-00000000dead';

/** Two OPTIONAL questions, so "nothing answered" is reachable without tripping `isRequired`. */
function optionalDefinition(): PublishedFormDefinition {
  return makeDefinition({
    pages: [
      {
        id: 'page-1',
        displayOrder: 1,
        questions: [
          { id: 'q-first', type: 'ShortText', prompt: 'First name', isRequired: false, displayOrder: 1, options: [] },
          { id: 'q-colour', type: 'ShortText', prompt: 'Colour', isRequired: false, displayOrder: 2, options: [] },
        ],
      },
    ],
  });
}

/** A fake provider around the optional form, with the distribution's quota state as given. */
function makeHarness(quota: { maxResponses: number | null; responseCount: number }): {
  ctx: PipelineContext;
  fake: FakeProvider;
  fireHooks: ReturnType<typeof vi.fn>;
} {
  const definition = optionalDefinition();
  const fake = makeFakeProvider({
    distribution: makeDistribution({ MaxResponses: quota.maxResponses, ResponseCount: quota.responseCount }),
    version: makeVersion(definition),
    createPermissions: respondentPermissions(),
  });
  const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
  const ctx: PipelineContext = {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: 'sess-124',
    fireHooks,
  };
  return { ctx, fake, fireHooks };
}

function submission(answers: PipelineSubmission['answers'], overrides?: Partial<PipelineSubmission>): PipelineSubmission {
  return { distributionSlug: 'public-1', formVersionId: 'ver-1', answers, ...overrides };
}

function savedEntities(fake: FakeProvider): string[] {
  return fake.saved.map((r) => r.entityName);
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
});

describe('runSubmitPipeline — answers that match no question (#124)', () => {
  it('refuses an all-unknown answer set: no row, no count, no hooks', async () => {
    const { ctx, fake, fireHooks } = makeHarness({ maxResponses: null, responseCount: 0 });

    const result = await runSubmitPipeline(ctx, submission([{ questionId: GHOST_QUESTION_ID, textValue: 'ghost' }]));

    expect(result.success).toBe(false);
    expect(result.errors?.map((e) => e.questionId)).toEqual([GHOST_QUESTION_ID]);
    expect(fake.saved).toHaveLength(0);
    expect(fireHooks).not.toHaveBeenCalled();
  });

  it('refuses a MIXED set whole rather than keeping the half it can place', async () => {
    const { ctx, fake } = makeHarness({ maxResponses: null, responseCount: 0 });

    const result = await runSubmitPipeline(
      ctx,
      submission([
        { questionId: 'q-first', textValue: 'Ada' },
        { questionId: GHOST_QUESTION_ID, textValue: 'ghost' },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.errors?.map((e) => e.questionId)).toEqual([GHOST_QUESTION_ID]);
    expect(savedEntities(fake)).not.toContain(FORM_RESPONSE_ENTITY);
  });

  it('refuses a final submit that would store nothing, with a message the respondent can act on', async () => {
    const { ctx, fake } = makeHarness({ maxResponses: null, responseCount: 0 });

    const result = await runSubmitPipeline(ctx, submission([]));

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toMatch(/at least one/i);
    expect(fake.saved).toHaveLength(0);
  });

  it('still saves an empty DRAFT — an autosave with nothing typed yet is normal', async () => {
    const { ctx, fake } = makeHarness({ maxResponses: null, responseCount: 0 });

    const result = await runSubmitPipeline(ctx, submission([], { partial: true }));

    expect(result.success).toBe(true);
    expect(result.status).toBe('Partial');
    expect(savedEntities(fake)).toContain(FORM_RESPONSE_ENTITY);
    expect(savedEntities(fake)).not.toContain(FORM_DISTRIBUTION_ENTITY);
  });

  it('fills a MaxResponses quota only with real responses', async () => {
    // One slot left. The empty submission must not take it; the real one must.
    const { ctx, fake } = makeHarness({ maxResponses: 2, responseCount: 1 });

    const empty = await runSubmitPipeline(ctx, submission([{ questionId: GHOST_QUESTION_ID, textValue: 'ghost' }]));
    expect(empty.success).toBe(false);
    expect(savedEntities(fake)).not.toContain(FORM_DISTRIBUTION_ENTITY);

    const real = await runSubmitPipeline(ctx, submission([{ questionId: 'q-first', textValue: 'Ada' }]));
    expect(real.success).toBe(true);
    expect(real.status).toBe('Complete');
    expect(savedEntities(fake)).toContain(FORM_RESPONSE_ENTITY);
    expect(savedEntities(fake)).toContain(FORM_DISTRIBUTION_ENTITY);
  });
});
