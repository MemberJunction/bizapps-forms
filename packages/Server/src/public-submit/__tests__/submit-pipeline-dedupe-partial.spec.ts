/**
 * Pipeline tests for the Phase-1 gaps this change closes:
 *   - Task 1: FINAL-submit dedupe (existing Complete row short-circuits; lookup error fails closed).
 *   - Task 4: partial create / idempotent partial update / promote-to-complete, and that
 *             hooks + quota + count do NOT fire on a partial.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  type ExistingResponseRow,
  type FakeProvider,
} from './fakes';

const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';
const FORM_RESPONSE_ANSWER_ENTITY = 'MJ_BizApps_Forms: Form Response Answers';
const SESSION = 'sess-abc';

function validSubmission(overrides?: Partial<PipelineSubmission>): PipelineSubmission {
  return {
    distributionSlug: 'public-1',
    formVersionId: 'ver-1',
    answers: [{ questionId: 'q-name', textValue: 'Ada Lovelace' }],
    ...overrides,
  };
}

interface BuildOptions {
  existingResponses?: ExistingResponseRow[];
  failRunViewFor?: string;
  fireHooks?: PipelineContext['fireHooks'];
}

function build(options: BuildOptions = {}): { ctx: PipelineContext; fake: FakeProvider } {
  const definition = makeDefinition();
  const fake = makeFakeProvider({
    distribution: makeDistribution(),
    version: makeVersion(definition),
    createPermissions: respondentPermissions(),
    existingResponses: options.existingResponses,
    failRunViewFor: options.failRunViewFor,
  });
  const ctx: PipelineContext = {
    provider: fake.provider,
    contextUser: makeContextUser(),
    sessionId: SESSION,
    fireHooks: options.fireHooks,
  };
  return { ctx, fake };
}

function partialRow(): ExistingResponseRow {
  return { ID: 'resp-partial-1', Status: 'Partial', FormVersionID: 'ver-1', AnonymousSessionID: SESSION };
}

function completeRow(): ExistingResponseRow {
  return { ID: 'resp-complete-1', Status: 'Complete', FormVersionID: 'ver-1', AnonymousSessionID: SESSION };
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
  delete process.env.FORMS_TURNSTILE_SECRET;
});

describe('dedupe (Task 1)', () => {
  it('short-circuits a duplicate final submit to the EXISTING response id without a second row', async () => {
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
    const { ctx, fake } = build({ existingResponses: [completeRow()], fireHooks });

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(true);
    expect(result.status).toBe('Complete');
    expect(result.responseId).toBe('resp-complete-1');
    // No new response/answer rows were written, and hooks did not re-fire.
    expect(fake.saved).toHaveLength(0);
    expect(fireHooks).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when the dedupe lookup query errors (never creates a duplicate)', async () => {
    const { ctx, fake } = build({ failRunViewFor: FORM_RESPONSE_ENTITY });

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toMatch(/could not verify/i);
    expect(fake.saved).toHaveLength(0);
  });
});

describe('partial semantics (Task 4)', () => {
  it('creates a Partial row and does NOT fire hooks or count', async () => {
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
    const { ctx, fake } = build({ fireHooks });

    const result = await runSubmitPipeline(ctx, validSubmission({ partial: true }));

    expect(result.success).toBe(true);
    expect(result.status).toBe('Partial');
    expect(result.responseId).toBeTruthy();
    expect(fireHooks).not.toHaveBeenCalled();
    // A response row was saved; the distribution ResponseCount was NOT incremented.
    const savedNames = fake.saved.map((r) => r.entityName);
    expect(savedNames).toContain(FORM_RESPONSE_ENTITY);
    expect(savedNames).not.toContain('MJ_BizApps_Forms: Form Distributions');
  });

  it('updates the SAME Partial row on a re-autosave (idempotent — targets the existing id)', async () => {
    const { ctx, fake } = build({ existingResponses: [partialRow()] });

    const result = await runSubmitPipeline(ctx, validSubmission({ partial: true }));

    expect(result.success).toBe(true);
    expect(result.status).toBe('Partial');
    // The persisted response carries the EXISTING partial id (updated in place, not a new row).
    expect(result.responseId).toBe('resp-partial-1');
    const savedResponse = fake.saved.find((r) => r.entityName === FORM_RESPONSE_ENTITY);
    expect(savedResponse?.values.Status).toBe('Partial');
  });

  it('promotes an existing Partial row to Complete on final submit (no second row) + fires hooks/count', async () => {
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
    const { ctx, fake } = build({ existingResponses: [partialRow()], fireHooks });

    const result = await runSubmitPipeline(ctx, validSubmission({ partial: false }));

    expect(result.success).toBe(true);
    expect(result.status).toBe('Complete');
    expect(result.responseId).toBe('resp-partial-1');
    const savedResponse = fake.saved.find((r) => r.entityName === FORM_RESPONSE_ENTITY);
    expect(savedResponse?.values.Status).toBe('Complete');
    expect(savedResponse?.values.SubmittedAt).toBeInstanceOf(Date);
    // Promotion counts once + fires hooks.
    expect(fake.saved.map((r) => r.entityName)).toContain('MJ_BizApps_Forms: Form Distributions');
    expect(fireHooks).toHaveBeenCalledOnce();
  });

  it('re-inserts answers on an upsert (answers written for the promoted row)', async () => {
    const fireHooks = vi.fn(async (): Promise<HookFireResult[]> => []);
    const { ctx, fake } = build({ existingResponses: [partialRow()], fireHooks });

    await runSubmitPipeline(ctx, validSubmission({ partial: false }));

    const answerSaves = fake.saved.filter((r) => r.entityName === FORM_RESPONSE_ANSWER_ENTITY);
    expect(answerSaves).toHaveLength(1);
    expect(answerSaves[0].values.ResponseID).toBe('resp-partial-1');
  });
});

describe('client-supplied responseId ownership guard (autosave seam)', () => {
  it('adopts a client responseId that belongs to THIS session (threads the same partial)', async () => {
    // Row owned by the current session; client sends its id explicitly as the autosave target.
    const { ctx, fake } = build({ existingResponses: [partialRow()] });

    const result = await runSubmitPipeline(
      ctx,
      validSubmission({ partial: true, clientResponseId: 'resp-partial-1' }),
    );

    expect(result.success).toBe(true);
    expect(result.responseId).toBe('resp-partial-1');
    // Updated in place — the persisted response carries the client-supplied id, not a new one.
    const savedResponse = fake.saved.find((r) => r.entityName === FORM_RESPONSE_ENTITY);
    expect(savedResponse?.values.Status).toBe('Partial');
  });

  it("IGNORES a client responseId owned by ANOTHER session (cannot hijack a foreign partial)", async () => {
    // The only stored Partial belongs to a DIFFERENT anonymous session. The current session
    // supplies that foreign id as its autosave hint — it must be rejected by the ownership guard,
    // and NO existing row adopted (a fresh row is created instead).
    const foreignRow: ExistingResponseRow = {
      ID: 'resp-foreign-1',
      Status: 'Partial',
      FormVersionID: 'ver-1',
      AnonymousSessionID: 'sess-someone-else',
    };
    const { ctx, fake } = build({ existingResponses: [foreignRow] });

    const result = await runSubmitPipeline(
      ctx,
      validSubmission({ partial: true, clientResponseId: 'resp-foreign-1' }),
    );

    expect(result.success).toBe(true);
    // The foreign row was NOT adopted: a brand-new response id was minted for this session.
    expect(result.responseId).not.toBe('resp-foreign-1');
    const savedResponse = fake.saved.find((r) => r.entityName === FORM_RESPONSE_ENTITY);
    expect(savedResponse).toBeDefined();
    // And the foreign row was never updated (its id never appears as a persisted target).
    expect(fake.saved.some((r) => r.values.ID === 'resp-foreign-1')).toBe(false);
  });

  it('falls back to the session-key lookup when the client responseId matches no owned row', async () => {
    // Current session DOES own a partial, but the client sends a stale/unknown id. The guard finds
    // no owned row for that id, then the session-key fallback still resolves the real partial.
    const { ctx } = build({ existingResponses: [partialRow()] });

    const result = await runSubmitPipeline(
      ctx,
      validSubmission({ partial: true, clientResponseId: 'resp-does-not-exist' }),
    );

    expect(result.success).toBe(true);
    expect(result.responseId).toBe('resp-partial-1');
  });
});
