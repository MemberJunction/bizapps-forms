/**
 * Pipeline tests covering the four required scenarios (PHASE1_DECOMPOSITION WP-B
 * "Done"): scope-denied, quota-exceeded, turnstile-fail, and happy-path Save +
 * (mocked) hook fire — plus server-side re-validation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
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
  type CreatePermissions,
} from './fakes';

const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';
const FORM_RESPONSE_ANSWER_ENTITY = 'MJ_BizApps_Forms: Form Response Answers';

/** A submission that satisfies the default required ShortText question. */
function validSubmission(overrides?: Partial<PipelineSubmission>): PipelineSubmission {
  return {
    distributionSlug: 'public-1',
    formVersionId: 'ver-1',
    answers: [{ questionId: 'q-name', textValue: 'Ada Lovelace' }],
    ...overrides,
  };
}

/** Build a pipeline context around a fake provider, with hooks captured. */
function makeContext(
  perms: CreatePermissions,
  options: {
    captcha?: boolean;
    maxResponses?: number | null;
    responseCount?: number;
    formResponseCount?: number;
    fireHooks?: PipelineContext['fireHooks'];
    fetchImpl?: typeof fetch;
  } = {},
): { ctx: PipelineContext; saved: () => ReturnType<typeof makeFakeProvider>['saved'] } {
  const definition = makeDefinition(
    options.captcha
      ? { settings: { anonymousAllowed: true, captchaRequired: true } }
      : undefined,
  );
  const distribution = makeDistribution({
    CaptchaRequired: false,
    MaxResponses: options.maxResponses ?? null,
    ResponseCount: options.responseCount ?? 0,
  });
  const fake = makeFakeProvider({
    distribution,
    version: makeVersion(definition),
    createPermissions: perms,
    formResponseCount: options.formResponseCount,
  });
  const ctx: PipelineContext = {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: 'sess-abc',
    fetchImpl: options.fetchImpl,
    fireHooks: options.fireHooks,
  };
  return { ctx, saved: () => fake.saved };
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
  delete process.env.FORMS_TURNSTILE_SECRET;
});

describe('runSubmitPipeline', () => {
  it('rejects when the anonymous session lacks CanCreate on responses (scope denied)', async () => {
    const perms = respondentPermissions();
    perms[FORM_RESPONSE_ENTITY] = false;
    const { ctx, saved } = makeContext(perms);

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toMatch(/not authorized/i);
    expect(saved()).toHaveLength(0);
  });

  it('rejects on privilege accretion (create access on a definition entity)', async () => {
    const perms = respondentPermissions();
    perms['MJ_BizApps_Forms: Forms'] = true;
    const { ctx } = makeContext(perms);

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toMatch(/privilege accretion/i);
  });

  it('rejects when the distribution quota is already reached (quota exceeded)', async () => {
    const { ctx, saved } = makeContext(respondentPermissions(), {
      maxResponses: 3,
      responseCount: 3,
    });

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toMatch(/no longer accepting/i);
    expect(saved()).toHaveLength(0);
  });

  it('rejects when the form-level quota count is reached', async () => {
    const definition = makeDefinition({
      settings: { anonymousAllowed: true, captchaRequired: false, quota: 2 },
    });
    const fake = makeFakeProvider({
      distribution: makeDistribution(),
      version: makeVersion(definition),
      createPermissions: respondentPermissions(),
      formResponseCount: 2,
    });
    const ctx: PipelineContext = {
      provider: fake.provider,
      contextUser: makeContextUser(),
      sessionId: 'sess-q',
    };

    const result = await runSubmitPipeline(ctx, validSubmission());
    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toMatch(/no longer accepting/i);
  });

  it('lets a PARTIAL save through on a captcha-required form', async () => {
    // The widget deliberately withholds the token from autosaves: a Turnstile token is
    // single-use, so spending it on a background save leaves the real submit with nothing. The
    // pipeline verified unconditionally anyway, so on any captcha-enabled form every autosave and
    // every submit-point checkpoint failed — silently, because autosave is fail-soft. The
    // respondent's in-progress answers were never actually being saved.
    process.env.FORMS_TURNSTILE_SECRET = 'test-secret';
    resetPublicSubmitConfigForTests();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

    const { ctx, saved } = makeContext(respondentPermissions(), { captcha: true, fetchImpl });

    const result = await runSubmitPipeline(ctx, validSubmission({ partial: true }));

    expect(result.success).toBe(true);
    expect(result.status).toBe('Partial');
    expect(saved().map((r) => r.entityName)).toContain(FORM_RESPONSE_ENTITY);
    // Never even asked Cloudflare: there is no token to verify and nothing to spend.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('still requires the captcha for the FINAL submit', async () => {
    // The partial exemption must not become a bypass: `partial: false` is the state that counts.
    process.env.FORMS_TURNSTILE_SECRET = 'test-secret';
    resetPublicSubmitConfigForTests();
    const failingFetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['missing-input-response'] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const { ctx, saved } = makeContext(respondentPermissions(), { captcha: true, fetchImpl: failingFetch });

    const result = await runSubmitPipeline(ctx, validSubmission({ partial: false }));

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toMatch(/captcha/i);
    expect(saved()).toHaveLength(0);
  });

  it('rejects when captcha is required but verification fails (turnstile fail)', async () => {
    process.env.FORMS_TURNSTILE_SECRET = 'test-secret';
    resetPublicSubmitConfigForTests();
    const failingFetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const { ctx, saved } = makeContext(respondentPermissions(), { captcha: true, fetchImpl: failingFetch });

    const result = await runSubmitPipeline(ctx, validSubmission({ turnstileToken: 'bad-token' }));

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toMatch(/captcha/i);
    expect(saved()).toHaveLength(0);
  });

  it('saves the response + answers and fires on-submit hooks (happy path)', async () => {
    const fired: HookFireResult[] = [];
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => {
      fired.push({ name: 'Forms: Upsert Respondent Person', status: 'fired' });
      return fired;
    });
    const { ctx, saved } = makeContext(respondentPermissions(), { fireHooks });

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(true);
    expect(result.status).toBe('Complete');
    expect(result.confirmationMessage).toBe('Thanks!');
    expect(result.responseId).toBeTruthy();
    // one response row + one answer row
    const entityNames = saved().map((r) => r.entityName);
    expect(entityNames).toContain(FORM_RESPONSE_ENTITY);
    expect(entityNames).toContain(FORM_RESPONSE_ANSWER_ENTITY);
    expect(fireHooks).toHaveBeenCalledOnce();
  });

  it('does NOT fire hooks for a partial save', async () => {
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
    const { ctx } = makeContext(respondentPermissions(), { fireHooks });

    const result = await runSubmitPipeline(ctx, validSubmission({ partial: true, answers: [] }));

    expect(result.success).toBe(true);
    expect(result.status).toBe('Partial');
    expect(fireHooks).not.toHaveBeenCalled();
  });

  it('enforces required fields server-side (re-validation)', async () => {
    const { ctx, saved } = makeContext(respondentPermissions());

    const result = await runSubmitPipeline(ctx, validSubmission({ answers: [] }));

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.questionId === 'q-name')).toBe(true);
    expect(saved()).toHaveLength(0);
  });

  it('rejects a submission whose formVersionId does not match the published version', async () => {
    const { ctx } = makeContext(respondentPermissions());

    const result = await runSubmitPipeline(ctx, validSubmission({ formVersionId: 'stale-version' }));

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toMatch(/version-mismatch/);
  });

  // Regression: every anonymous submission failed with version-mismatch because this
  // comparison was case-sensitive. The widget echoes back the `formVersionId` embedded
  // in the published snapshot, which carries the client-minted (lowercase) GUID, while
  // SQL Server returns the column uppercased. Two spellings of the same uniqueidentifier
  // are the same version — a GUID is case-insensitive by definition.
  it('accepts a formVersionId that differs from the published version only by case', async () => {
    const { ctx, saved } = makeContext(respondentPermissions());

    const result = await runSubmitPipeline(ctx, validSubmission({ formVersionId: 'VER-1' }));

    expect(result.errors ?? []).toEqual([]);
    expect(result.success).toBe(true);
    expect(saved().length).toBeGreaterThan(0);
  });

  it('rate-limits repeated submissions from the same session+distribution', async () => {
    process.env.FORMS_RATELIMIT_MAX = '2';
    resetPublicSubmitConfigForTests();
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
    const { ctx } = makeContext(respondentPermissions(), { fireHooks });

    const first = await runSubmitPipeline(ctx, validSubmission());
    const second = await runSubmitPipeline(ctx, validSubmission());
    const third = await runSubmitPipeline(ctx, validSubmission());

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(third.success).toBe(false);
    expect(third.errors?.[0].message).toMatch(/too many/i);
    delete process.env.FORMS_RATELIMIT_MAX;
  });
});
