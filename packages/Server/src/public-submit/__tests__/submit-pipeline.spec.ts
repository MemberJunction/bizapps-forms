/**
 * Pipeline tests covering the four required scenarios (PHASE1_DECOMPOSITION WP-B
 * "Done"): scope-denied, quota-exceeded, turnstile-fail, and happy-path Save +
 * (mocked) hook fire — plus server-side re-validation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { runSubmitPipeline, SUBMIT_FAILED_MESSAGE, type PipelineContext, type PipelineSubmission } from '../submit-pipeline';
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

/**
 * Every knob these tests touch, cleared before each one.
 *
 * A test that sets an env var and unsets it on its LAST line unsets nothing when an assertion
 * above that line throws — so one genuine failure silently reconfigures every test after it and
 * reports as a cascade. Clearing up front makes each test independent of whatever its
 * predecessor did or failed to undo, which is the difference between reading a failure and
 * chasing one.
 */
const TUNABLES = [
  'FORMS_TURNSTILE_SECRET',
  'FORMS_RATELIMIT_MAX',
  'FORMS_RATELIMIT_IP_MAX',
  'FORMS_COMPLETION_MAX',
  'FORMS_RATELIMIT_MAX_KEYS',
  'FORMS_RATELIMIT_WINDOW_MS',
] as const;

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  for (const knob of TUNABLES) {
    delete process.env[knob];
  }
  resetPublicSubmitConfigForTests();
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
      elevatedUser: makeContextUser(),
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

  // When no IP could be resolved (middleware not mounted, or a socket already gone) the ceilings
  // have nothing to key on. The tempting fallback — the session id — is blank for any client that
  // omits the header, so every such caller would hash to ONE bucket and any one of them could
  // refuse the form for all the others. That is a worse failure than not limiting, so the
  // ceilings are dropped instead and the pre-existing per-session gate is left to do its job.
  it('does not put unidentifiable callers in a shared bucket', async () => {
    process.env.FORMS_RATELIMIT_IP_MAX = '1';
    process.env.FORMS_COMPLETION_MAX = '1';
    resetPublicSubmitConfigForTests();
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
    const { ctx } = makeContext(respondentPermissions(), { fireHooks });
    ctx.clientIpHash = undefined;

    // BLANK, not merely distinct: MJ sets `sessionId` to '' for any client that omits the
    // header, so this is what two unrelated header-less callers genuinely look like, and it is
    // the case a session-derived fallback collapses onto a single bucket.
    ctx.sessionId = '';
    const first = await runSubmitPipeline(ctx, validSubmission());
    const second = await runSubmitPipeline(ctx, validSubmission());
    const third = await runSubmitPipeline(ctx, validSubmission());

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(third.success).toBe(true);
    delete process.env.FORMS_RATELIMIT_IP_MAX;
    delete process.env.FORMS_COMPLETION_MAX;
  });

  // THE SAME REASONING, APPLIED TO THE GATE THAT WAS ALREADY HERE — and this is the half that was
  // missed. MJ hands the pipeline a BLANK `sessionId` for any client that omits `x-session-id`
  // (curl, a bespoke integration, and this repo's own smoke scripts until `smoke/lib/session.mjs`
  // was written), so every one of those callers hashes to the same key. The per-session gate is
  // the tightest of the four at 5/min, so they do not merely share a bucket, they share the
  // TIGHTEST one: a single script pushes it over and the next unrelated caller is refused with
  // "Too many submissions" — a message about someone else's traffic. That is exactly the shared
  // kill switch the ceiling above is keyed per-caller to avoid, and a gate that cannot tell two
  // callers apart has no business refusing either of them.
  it('does not let one header-less caller throttle another, and still bounds them by address', async () => {
    process.env.FORMS_RATELIMIT_MAX = '1';
    process.env.FORMS_RATELIMIT_IP_MAX = '2';
    resetPublicSubmitConfigForTests();
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
    const { ctx } = makeContext(respondentPermissions(), { fireHooks, clientIpHash: 'ip-script' });

    // Blank, and from an address that DID resolve: the routine shape of a scripted client.
    ctx.sessionId = '';
    const first = await runSubmitPipeline(ctx, validSubmission());
    const second = await runSubmitPipeline(ctx, validSubmission());
    const overCeiling = await runSubmitPipeline(ctx, validSubmission());

    // A different header-less caller, on their own address, arriving after the first has spent
    // everything the shared bucket had.
    ctx.clientIpHash = 'ip-other-script';
    const bystander = await runSubmitPipeline(ctx, validSubmission());

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(bystander.success).toBe(true);
    // Dropping that gate must not leave them unbounded: their ADDRESS still bounds them, which is
    // the identity they cannot rotate. Without this line the test would pass on no gates at all.
    expect(overCeiling.success).toBe(false);
    expect(overCeiling.errors?.[0].message).toMatch(/too many/i);
  });

  // Turnstile ran BEFORE the rate limit, so a request the limiter was about to refuse had already
  // spent an outbound Cloudflare round trip — and, worse, a Turnstile token is single-use (see
  // the partial-save test above), so the refusal consumed the respondent's token. Their retry
  // then failed with "Captcha verification failed" instead of the wait-and-retry message, on a
  // form whose author cared enough to turn a captcha on. The cheap local gate belongs first.
  it('does not spend a Turnstile token on a submission it is going to rate-limit', async () => {
    process.env.FORMS_TURNSTILE_SECRET = 'test-secret';
    process.env.FORMS_RATELIMIT_MAX = '1';
    resetPublicSubmitConfigForTests();
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    ) as unknown as typeof fetch;
    const { ctx } = makeContext(respondentPermissions(), {
      captcha: true,
      fetchImpl,
      clientIpHash: 'ip-respondent',
      fireHooks: vi.fn(async (): Promise<HookFireResult[]> => []),
    });

    const first = await runSubmitPipeline(ctx, validSubmission({ turnstileToken: 'token-1' }));
    const refused = await runSubmitPipeline(ctx, validSubmission({ turnstileToken: 'token-2' }));

    expect(first.success).toBe(true);
    expect(refused.success).toBe(false);
    expect(refused.errors?.[0].message).toMatch(/too many/i);
    // One verification for the accepted submit, none for the refused one.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    delete process.env.FORMS_TURNSTILE_SECRET;
    delete process.env.FORMS_RATELIMIT_MAX;
  });
});


/**
 * The pipeline's contract is a RESULT, never a throw. Its own comments have said so since the shape
 * guard was written ("never a throw that would yield a blank screen"), and every gate honours it —
 * but an exception from a stage (a bug, a driver throwing instead of returning false, #116's
 * `RangeError: Invalid time value` from a Date it could not parse) escaped to Apollo, which put the
 * exception's own words in `errors[].message` for the widget to render to the respondent (#119).
 */
describe('runSubmitPipeline never throws', () => {
  it('turns an exception from a stage into the authored failure and logs the exception with context', async () => {
    const logged: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
    try {
      const { ctx } = makeContext(respondentPermissions());
      // The definition load is the first stage that touches the provider; make it blow up the way
      // an unexpected bug does — with an Error the pipeline has no branch for.
      const throwing = Object.create(ctx.provider, {
        RunView: { value: async () => { throw new RangeError('Invalid time value'); } },
      }) as PipelineContext['provider'];

      const result = await runSubmitPipeline({ ...ctx, provider: throwing }, validSubmission());

      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toBe(SUBMIT_FAILED_MESSAGE);
      expect(JSON.stringify(result)).not.toContain('Invalid time value');

      const line = logged.find((l) => l.includes('Invalid time value'));
      expect(line, 'the exception must reach the server log').toBeDefined();
      expect(line).toContain('public-1');
      expect(line).toContain('ver-1');
    } finally {
      vi.restoreAllMocks();
    }
  });
});
