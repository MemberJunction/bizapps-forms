/**
 * A response that has an owner keeps it (issue #78).
 *
 * `FormResponse.AnonymousSessionID` is the record of which anonymous session a partial belongs
 * to, and the gate that reads it used to be OPT-IN: the caller chose which lookup ran by deciding
 * whether to send the `x-session-id` header. Sending it went through the session-keyed lookup and
 * was correctly refused another session's row; OMITTING it went through the client-id lookup,
 * which had no session predicate at all — so a caller who had observed a `responseId` could take
 * over the row, seal it `Complete`, blank its `AnonymousSessionID`, and replace its answers.
 *
 * A second route reached the same place without any lookup: a caller presenting a DIFFERENT
 * session id missed every lookup, fell through to CREATE, collided on the primary key it had just
 * supplied, and the duplicate-key recovery adopted the victim's row with no ownership check of
 * its own. The header was therefore not a gate in either direction — omitting it and forging it
 * both worked.
 *
 * These tests drive the whole pipeline, because the invariant is about the pipeline's OUTCOME and
 * not about which of its lookups fired: any future path that reaches a foreign row has to be
 * refused here too, whether or not it is one of the two that exist today.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { runSubmitPipeline, type PipelineContext, type PipelineSubmission } from '../submit-pipeline';
import { FormsRateLimiter } from '../rate-limit.service';
import { resetPublicSubmitConfigForTests } from '../config';
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

/**
 * The victim's row id. It has to be a REAL uuid: persistence only adopts a client id as the
 * primary key when it is one (`isValidUuid`), and the primary-key collision is what carries the
 * wrong-session attack. A test using a non-uuid id would pass against the vulnerable code.
 */
const VICTIM_RESPONSE_ID = 'a1b2c3d4-1111-4222-8333-444455556666';
const VICTIM_SESSION = 'victim-session';

/** The victim's in-flight partial, exactly as the widget writes one: owned, and id-proofed. */
function victimPartial(overrides?: Partial<ExistingResponseRow>): ExistingResponseRow {
  return {
    ID: VICTIM_RESPONSE_ID,
    Status: 'Partial',
    FormVersionID: 'ver-1',
    AnonymousSessionID: VICTIM_SESSION,
    SourceMetadata: JSON.stringify({ clientResponseId: VICTIM_RESPONSE_ID }),
    ...overrides,
  };
}

interface Scenario {
  /** The caller's `x-session-id`, as `UserPayload.sessionId` ('' when the header is absent). */
  sessionId: string;
  /** Rows the lookups can see. */
  existingResponses?: ExistingResponseRow[];
  /** Rows that exist only for primary-key/Load purposes (the concurrent-insert race window). */
  concurrentlyCreated?: ExistingResponseRow[];
}

function build(scenario: Scenario): { ctx: PipelineContext; fake: FakeProvider } {
  const definition = makeDefinition();
  const fake = makeFakeProvider({
    distribution: makeDistribution(),
    version: makeVersion(definition),
    createPermissions: respondentPermissions(),
    existingResponses: scenario.existingResponses,
    concurrentlyCreated: scenario.concurrentlyCreated,
  });
  return {
    ctx: {
      provider: fake.provider,
      contextUser: makeContextUser(),
      elevatedUser: makeContextUser(),
      sessionId: scenario.sessionId,
    },
    fake,
  };
}

function submission(overrides?: Partial<PipelineSubmission>): PipelineSubmission {
  return {
    distributionSlug: 'public-1',
    formVersionId: 'ver-1',
    answers: [{ questionId: 'q-name', textValue: 'attacker@example.com' }],
    ...overrides,
  };
}

/** Every write the pipeline made against the victim's row. Must stay empty on a refusal. */
function writesToVictimRow(fake: FakeProvider): unknown[] {
  return fake.saved.filter((r) => r.entityName === FORM_RESPONSE_ENTITY && r.values.ID === VICTIM_RESPONSE_ID);
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
  delete process.env.FORMS_TURNSTILE_SECRET;
});

describe('an owned response cannot be taken over', () => {
  it('refuses a caller who OMITS x-session-id (the gate is not opt-in)', async () => {
    // The reported defect. A blank session skipped the ownership-keyed lookup entirely and took
    // the client-id lookup, which matched on (ID, version, Partial, SourceMetadata proof) and
    // asked nothing about who owned the row.
    const { ctx, fake } = build({ sessionId: '', existingResponses: [victimPartial()] });

    const result = await runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(result.success).toBe(false);
    expect(writesToVictimRow(fake)).toHaveLength(0);
  });

  it('refuses a caller presenting a DIFFERENT x-session-id', async () => {
    // No lookup matches this caller, so nothing here is a lookup's business: the pipeline falls
    // through to CREATE, persistence adopts the supplied id as the primary key, and the insert
    // collides with the row already at it. The duplicate-key recovery is the second way into a
    // foreign row and the reason the gate cannot live in front of the lookups.
    const { ctx, fake } = build({ sessionId: 'attacker-session', existingResponses: [victimPartial()] });

    const result = await runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(result.success).toBe(false);
    expect(writesToVictimRow(fake)).toHaveLength(0);
  });

  it('refuses a caller whose x-session-id is present but blank', async () => {
    // The header is not a credential just by being there. Whitespace is no more an owner than an
    // absent header is, and the two have to land in the same place — a normalization that treats
    // '   ' as a distinct session would make it a bypass rather than a typo.
    const { ctx, fake } = build({ sessionId: '   ', existingResponses: [victimPartial()] });

    const result = await runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(result.success).toBe(false);
    expect(writesToVictimRow(fake)).toHaveLength(0);
  });

  it('keeps a caller holding a real session on their OWN response, not the one they asked for', async () => {
    // Ownership is per ROW, not a badge the caller carries: a session that legitimately owns one
    // partial must not license writing to a different one. This caller is not refused, because
    // they have a row of their own — the session-key fallback resolves it and the write lands
    // there. That is the right outcome and worth pinning: the interesting assertion is not "an
    // error came back" but "the victim's row was never the target".
    const ownRow: ExistingResponseRow = {
      ID: 'b2c3d4e5-1111-4222-8333-444455556667',
      Status: 'Partial',
      FormVersionID: 'ver-1',
      AnonymousSessionID: 'attacker-session',
    };
    const { ctx, fake } = build({
      sessionId: 'attacker-session',
      existingResponses: [victimPartial(), ownRow],
    });

    const result = await runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(result.responseId).toBe(ownRow.ID);
    expect(result.responseId).not.toBe(VICTIM_RESPONSE_ID);
    expect(writesToVictimRow(fake)).toHaveLength(0);
  });

  it('refuses a caller who reaches the row through the concurrent-insert race window', async () => {
    // Same recovery path, arrived at honestly: the row is invisible to every SELECT (a concurrent
    // request committed it after ours ran) and is discovered only by the primary key. Ownership
    // still decides, because the check reads the row we actually loaded rather than the query
    // that failed to find it.
    const { ctx, fake } = build({ sessionId: '', concurrentlyCreated: [victimPartial()] });

    const result = await runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(result.success).toBe(false);
    expect(writesToVictimRow(fake)).toHaveLength(0);
  });

  it('leaves the victim’s answers untouched when it refuses', async () => {
    // The damage the issue reported was not the status flip on its own — it was that the row came
    // back holding the attacker's answers and none of the victim's. Nothing may be written at all.
    const { ctx, fake } = build({ sessionId: '', existingResponses: [victimPartial()] });

    await runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(fake.saved).toHaveLength(0);
    expect(fake.deleted).toHaveLength(0);
  });

  it('refuses with the SAME message however the caller got it wrong (no oracle)', async () => {
    // A refusal that varied by cause would report which gate was hit, and so confirm what the
    // caller was probing for. Absent header and forged header are one answer.
    const missing = build({ sessionId: '', existingResponses: [victimPartial()] });
    const forged = build({ sessionId: 'attacker-session', existingResponses: [victimPartial()] });

    const onMissing = await runSubmitPipeline(missing.ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));
    const onForged = await runSubmitPipeline(forged.ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(onMissing.success).toBe(false);
    expect(onForged.success).toBe(false);
    expect(onMissing.errors?.[0].message).toBe(onForged.errors?.[0].message);
    // And it names neither the owner nor the fact that there is one.
    expect(onMissing.errors?.[0].message).not.toMatch(new RegExp(VICTIM_SESSION, 'i'));
    expect(onMissing.errors?.[0].message).not.toMatch(/session/i);
  });

  it('reports the refusal rather than answering success for a write it discarded', async () => {
    // The vulnerable version answered `success: true, status: "Complete"`. Even with the write
    // now refused, answering success would leave a caller believing a submission had been
    // recorded that does not exist.
    const { ctx } = build({ sessionId: '', existingResponses: [victimPartial()] });

    const result = await runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(result.success).toBe(false);
    expect(result.status).toBeUndefined();
    expect(result.errors?.[0].message).toBeTruthy();
  });
});

describe('the flows that have to keep working', () => {
  it('lets a genuinely headerless client adopt its OWN row', async () => {
    // The blank-session flow the client-id lookup exists for. The row has no owner, so the
    // 122-bit id in `SourceMetadata` is the only capability there is — and it still is.
    const unowned = victimPartial({ AnonymousSessionID: '' });
    const { ctx, fake } = build({ sessionId: '', existingResponses: [unowned] });

    const result = await runSubmitPipeline(
      ctx,
      submission({ partial: true, clientResponseId: VICTIM_RESPONSE_ID }),
    );

    expect(result.success).toBe(true);
    expect(result.responseId).toBe(VICTIM_RESPONSE_ID);
    expect(writesToVictimRow(fake)).toHaveLength(1);
  });

  it('lets the owning session keep writing to its own row', async () => {
    const { ctx, fake } = build({ sessionId: VICTIM_SESSION, existingResponses: [victimPartial()] });

    const result = await runSubmitPipeline(
      ctx,
      submission({ partial: true, clientResponseId: VICTIM_RESPONSE_ID }),
    );

    expect(result.success).toBe(true);
    expect(result.responseId).toBe(VICTIM_RESPONSE_ID);
  });

  it('matches the owner case-insensitively, as the SQL predicate does', async () => {
    // `AnonymousSessionID='…'` runs under a case-insensitive collation, so the lookup that
    // approves the write folds case. A stricter comparison at the write would refuse a request
    // the lookup had just resolved — the same class of case-skew that broke the respondent path
    // in 0.2.1.
    const { ctx } = build({
      sessionId: VICTIM_SESSION.toUpperCase(),
      existingResponses: [victimPartial()],
    });

    const result = await runSubmitPipeline(
      ctx,
      submission({ partial: true, clientResponseId: VICTIM_RESPONSE_ID }),
    );

    expect(result.success).toBe(true);
    expect(result.responseId).toBe(VICTIM_RESPONSE_ID);
  });

  it('never rewrites the owner an existing row already carries', async () => {
    // Ownership is stamped at creation and never again. The vulnerable version assigned the
    // caller's session on every adopting write, which is what blanked `AnonymousSessionID` on the
    // way past and made a takeover permanent — the real respondent could not resume a row that no
    // longer recorded them.
    const { ctx, fake } = build({ sessionId: VICTIM_SESSION, existingResponses: [victimPartial()] });

    await runSubmitPipeline(ctx, submission({ partial: true, clientResponseId: VICTIM_RESPONSE_ID }));

    const written = fake.saved.find((r) => r.entityName === FORM_RESPONSE_ENTITY);
    expect(written?.values.AnonymousSessionID).toBe(VICTIM_SESSION);
  });

  it('stamps the caller’s session on a row it creates', async () => {
    // The other half of write-once: a row with no owner yet gets one, so the very next request
    // from anybody else is refused.
    const { ctx, fake } = build({ sessionId: 'first-caller' });

    const result = await runSubmitPipeline(
      ctx,
      submission({ partial: true, clientResponseId: VICTIM_RESPONSE_ID }),
    );

    expect(result.success).toBe(true);
    const written = fake.saved.find((r) => r.entityName === FORM_RESPONSE_ENTITY);
    expect(written?.values.AnonymousSessionID).toBe('first-caller');
  });
});
