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
    clientIpHash?: string;
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
    clientIpHash: options.clientIpHash,
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

  // SECURITY REGRESSION (the defect PR #48 diagnosed). `ctx.sessionId` is `UserPayload.sessionId`,
  // which MJ populates from the client-settable `x-session-id` header — so a caller who rotates
  // it lands in a fresh per-session bucket on every request and the per-session cap never trips.
  // Each accepted completion fires on-submit automations (confirmation email to an address the
  // caller chose, an LLM run, entity upserts), so the bypass amplifies. The ceiling therefore has
  // to key on something the caller cannot pick: their resolved IP.
  it('throttles a caller who rotates the session id, because the bucket follows their IP', async () => {
    process.env.FORMS_RATELIMIT_IP_MAX = '2';
    resetPublicSubmitConfigForTests();
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
    const { ctx } = makeContext(respondentPermissions(), { fireHooks, clientIpHash: 'ip-attacker' });

    ctx.sessionId = 'forged-1';
    const first = await runSubmitPipeline(ctx, validSubmission());
    ctx.sessionId = 'forged-2';
    const second = await runSubmitPipeline(ctx, validSubmission());
    ctx.sessionId = 'forged-3';
    const third = await runSubmitPipeline(ctx, validSubmission());

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(third.success).toBe(false);
    expect(third.errors?.[0].message).toMatch(/too many/i);
    // The amplification is what the cap is really for: the rejected request fires nothing.
    expect(fireHooks).toHaveBeenCalledTimes(2);
    delete process.env.FORMS_RATELIMIT_IP_MAX;
  });

  // The other half of the fix, and the reason the ceiling is keyed per (caller, distribution)
  // rather than per distribution: a cap every respondent of a form shares is not an abuse
  // ceiling, it is a shared kill switch. One caller saturating it would take the form offline
  // for everyone filling it in — trading a rate-limit bypass for a cheaper, louder outage.
  it('does not let one saturated caller throttle a different caller on the same form', async () => {
    process.env.FORMS_RATELIMIT_IP_MAX = '2';
    resetPublicSubmitConfigForTests();
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
    const { ctx } = makeContext(respondentPermissions(), { fireHooks, clientIpHash: 'ip-attacker' });

    ctx.sessionId = 'forged-1';
    await runSubmitPipeline(ctx, validSubmission());
    ctx.sessionId = 'forged-2';
    await runSubmitPipeline(ctx, validSubmission());
    ctx.sessionId = 'forged-3';
    const saturated = await runSubmitPipeline(ctx, validSubmission());

    // A real respondent arrives mid-attack, on the same form, from their own address.
    ctx.clientIpHash = 'ip-respondent';
    ctx.sessionId = 'honest-session';
    const bystander = await runSubmitPipeline(ctx, validSubmission());

    expect(saturated.success).toBe(false);
    expect(bystander.success).toBe(true);
    delete process.env.FORMS_RATELIMIT_IP_MAX;
  });

  // Saves and completions cost wildly different things — an autosave upserts one row, a
  // completion fires the confirmation email, the LLM run and the entity upserts — so one
  // counter covering both can only ever be wrong in one direction: tight enough to throttle a
  // respondent who is still typing, or loose enough to be no limit at all on the expensive path.
  it('caps completions on their own budget, without throttling autosaves', async () => {
    process.env.FORMS_RATELIMIT_MAX = '50';
    process.env.FORMS_RATELIMIT_IP_MAX = '50';
    process.env.FORMS_COMPLETION_MAX = '1';
    resetPublicSubmitConfigForTests();
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
    const { ctx } = makeContext(respondentPermissions(), { fireHooks, clientIpHash: 'ip-respondent' });

    const autosaves = [];
    for (let i = 0; i < 4; i++) {
      autosaves.push(await runSubmitPipeline(ctx, validSubmission({ partial: true, answers: [] })));
    }
    const completion = await runSubmitPipeline(ctx, validSubmission());
    const secondCompletion = await runSubmitPipeline(ctx, validSubmission());

    expect(autosaves.every((r) => r.success)).toBe(true);
    expect(completion.success).toBe(true);
    expect(secondCompletion.success).toBe(false);
    expect(secondCompletion.errors?.[0].message).toMatch(/too many/i);
    delete process.env.FORMS_RATELIMIT_MAX;
    delete process.env.FORMS_RATELIMIT_IP_MAX;
    delete process.env.FORMS_COMPLETION_MAX;
  });
});

