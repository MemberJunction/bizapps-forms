/**
 * A resumed session writing to the draft its JWT is scoped to (#138).
 *
 * The row it writes to is owned by a session that no longer exists — the first sitting's
 * `x-session-id` died with the tab — so every one of these submissions is, from the header's point
 * of view, a stranger touching somebody else's response. What makes it legitimate is the scope
 * claim, which the server minted and the browser cannot forge.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { resetPublicSubmitConfigForTests } from '../config';
import { FormsRateLimiter } from '../rate-limit.service';
import {
  runSubmitPipeline,
  resetSubmitInFlightForTests,
  type PipelineContext,
  type PipelineSubmission,
} from '../submit-pipeline';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
  type ExistingResponseRow,
} from './fakes';

const ROW_ID = '9da322e6-0000-4000-8000-000000000001';
const OTHER_ROW_ID = '33910b9e-0000-4000-8000-000000000002';
/** The session that created the row, in the first sitting. It is gone by the time we resume. */
const FIRST_SITTING = 'sess-first';
/** The session the resumed widget mints on load. Different, and that is the whole point. */
const SECOND_SITTING = 'sess-second';

function partialSubmission(overrides?: Partial<PipelineSubmission>): PipelineSubmission {
  return {
    distributionSlug: 'public-1',
    formVersionId: 'ver-1',
    partial: true,
    answers: [{ questionId: 'q-name', textValue: 'Ada' }],
    ...overrides,
  };
}

function draftRow(overrides?: Partial<ExistingResponseRow>): ExistingResponseRow {
  return {
    ID: ROW_ID,
    Status: 'Partial',
    FormVersionID: 'ver-1',
    AnonymousSessionID: FIRST_SITTING,
    ...overrides,
  };
}

/**
 * A pipeline context for a RESUMED session: a fresh session header, and a scope claim naming the
 * draft. `formResponseCount` is the per-version draft ceiling the fake reports.
 */
function resumedContext(args: {
  rows: ExistingResponseRow[];
  scopeResourceId?: string;
  sessionId?: string;
  partialCount?: number;
}): { ctx: PipelineContext; saved: () => { entityName: string; values: Record<string, unknown> }[] } {
  const fake = makeFakeProvider({
    distribution: makeDistribution(),
    version: makeVersion(makeDefinition()),
    createPermissions: respondentPermissions(),
    existingResponses: args.rows,
    formResponseCount: args.partialCount ?? 0,
  });
  const ctx: PipelineContext = {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: args.sessionId ?? SECOND_SITTING,
    scopeResourceId: args.scopeResourceId ?? ROW_ID,
  };
  return { ctx, saved: () => fake.saved };
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
  resetSubmitInFlightForTests();
  delete process.env.FORMS_MAX_PARTIALS_PER_VERSION;
});

describe('a response-scoped session', () => {
  it('updates the scoped row in place, under a session that does not own it', async () => {
    const { ctx } = resumedContext({ rows: [draftRow()] });

    const result = await runSubmitPipeline(ctx, partialSubmission());

    expect(result.success).toBe(true);
    expect(result.responseId).toBe(ROW_ID);
  });

  it('leaves the first sitting as the recorded owner', async () => {
    // The owner column is WRITE-ONCE. If a resumed save re-stamped it, a takeover by a caller with
    // no header would blank the ownership record on its way past — permanently.
    const { ctx, saved } = resumedContext({ rows: [draftRow()] });

    await runSubmitPipeline(ctx, partialSubmission());

    const responseWrites = saved().filter((s) => s.entityName.endsWith('Form Responses'));
    for (const write of responseWrites) {
      if (write.values.AnonymousSessionID !== undefined) {
        expect(write.values.AnonymousSessionID).toBe(FIRST_SITTING);
      }
    }
  });

  it('resolves a draft whose form version has since been republished', async () => {
    // Decision 7: a typo-fix republish must not strand every open draft. Every OTHER lookup in the
    // pipeline pins FormVersionID, so without the scoped branch this row is invisible.
    const { ctx } = resumedContext({ rows: [draftRow({ FormVersionID: 'ver-RETIRED' })] });

    const result = await runSubmitPipeline(ctx, partialSubmission());

    expect(result.success).toBe(true);
    expect(result.responseId).toBe(ROW_ID);
  });

  it('does not charge a resumed autosave against the per-version draft ceiling', async () => {
    // The bug this pins: `partialCapExceeded` runs whenever no existing partial was resolved. A
    // resumed save that missed the lookup was counted as a NEW draft and refused on a saturated
    // form — while adding no row at all.
    process.env.FORMS_MAX_PARTIALS_PER_VERSION = '3';
    resetPublicSubmitConfigForTests();
    const { ctx } = resumedContext({ rows: [draftRow()], partialCount: 99 });

    const result = await runSubmitPipeline(ctx, partialSubmission());

    expect(result.success).toBe(true);
    expect(result.responseId).toBe(ROW_ID);
  });

  it('refuses a responseId hint the scope does not cover, and writes nothing', async () => {
    const { ctx, saved } = resumedContext({ rows: [draftRow()] });

    const result = await runSubmitPipeline(ctx, partialSubmission({ clientResponseId: OTHER_ROW_ID }));

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toContain('could not be saved');
    expect(saved()).toHaveLength(0);
  });

  it('accepts the hint when it agrees with the scope, whatever its casing', async () => {
    // The resumed widget adopts the row id from resumeJSON, so the two normally agree — and the
    // two sides spell a GUID differently, so the comparison must not be case-sensitive.
    const { ctx } = resumedContext({ rows: [draftRow()] });

    const result = await runSubmitPipeline(ctx, partialSubmission({ clientResponseId: ROW_ID.toUpperCase() }));

    expect(result.success).toBe(true);
    expect(result.responseId).toBe(ROW_ID);
  });
});

describe('an ordinary public-link session', () => {
  it('is unchanged when its scope claim is the distribution it is submitting to', async () => {
    // The public path must take no new branch and pay for no extra read: `scopeNamesDistribution`
    // settles it against the distribution already in hand.
    const distribution = makeDistribution();
    const fake = makeFakeProvider({
      distribution,
      version: makeVersion(makeDefinition()),
      createPermissions: respondentPermissions(),
    });
    const ctx: PipelineContext = {
      provider: fake.provider,
      contextUser: makeContextUser(),
      elevatedUser: makeContextUser(),
      sessionId: 'sess-public',
      scopeResourceId: distribution.ID,
    };

    const result = await runSubmitPipeline(ctx, partialSubmission({ clientResponseId: OTHER_ROW_ID }));

    // The hint is honoured as it always was — the refusal above applies only to a SCOPED session.
    expect(result.success).toBe(true);
  });

  it('is unchanged when it carries no scope claim at all', async () => {
    const { ctx } = resumedContext({ rows: [], scopeResourceId: '', sessionId: 'sess-public' });

    const result = await runSubmitPipeline(ctx, partialSubmission());

    expect(result.success).toBe(true);
  });
});
