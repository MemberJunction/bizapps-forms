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
import { SCREENED_OUT_MESSAGE } from '@mj-biz-apps/forms-entities';
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
  type SavedRecord,
} from './fakes';

const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';

/**
 * The victim's row id. It has to be a REAL uuid: persistence only adopts a client id as the
 * primary key when it is one (`isValidUuid`), and the primary-key collision is what carries the
 * wrong-session attack. A test using a non-uuid id would pass against the vulnerable code.
 */
const VICTIM_RESPONSE_ID = 'a1b2c3d4-1111-4222-8333-444455556666';
const VICTIM_SESSION = 'victim-session';

/**
 * A row the widget has already SEALED, exactly as one sits in the table after a submit: terminal,
 * owned, and carrying the client-id proof `findResponseById` matches on.
 *
 * Named apart from {@link victimPartial} because the two describe different exposures — a partial
 * can be taken over (#78), a sealed row can only be read about (#100/#101) — and the tests below
 * are about the second.
 */
function victimSealed(
  status: 'Complete' | 'Disqualified',
  overrides?: Partial<ExistingResponseRow>,
): ExistingResponseRow {
  return victimPartial({ Status: status, ...overrides });
}

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
function writesToVictimRow(fake: FakeProvider): SavedRecord[] {
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

  it('will not report a foreign row’s status back through the already-sealed short-circuit', async () => {
    // A TERMINAL victim row takes a different branch: persistence loads it, sees it is sealed, and
    // returns an idempotent no-op — the row's own id and status, with nothing written. That is the
    // right answer for the respondent who owns it and a status oracle for anybody else, so
    // ownership is settled before that branch rather than at the write it never reaches.
    const sealed = victimPartial({ Status: 'Complete' });
    const { ctx, fake } = build({ sessionId: '', concurrentlyCreated: [sealed] });

    const result = await runSubmitPipeline(ctx, submission({ partial: true, clientResponseId: VICTIM_RESPONSE_ID }));

    expect(result.success).toBe(false);
    expect(result.status).toBeUndefined();
    expect(fake.saved).toHaveLength(0);
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

  it('stores an owner in the same form the ownership check reads it back in', async () => {
    // Storing the RAW header let the column hold a value that did not mean what it looked like: a
    // caller sending three spaces created a row that APPEARS owned but folds to "no owner", so
    // anyone holding its id could adopt it. Store what we compare, and the gap cannot exist.
    const { ctx, fake } = build({ sessionId: '  Mixed-Case-Session  ' });

    const result = await runSubmitPipeline(
      ctx,
      submission({ partial: true, clientResponseId: VICTIM_RESPONSE_ID }),
    );

    expect(result.success).toBe(true);
    const written = fake.saved.find((r) => r.entityName === FORM_RESPONSE_ENTITY);
    expect(written?.values.AnonymousSessionID).toBe('mixed-case-session');
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

/**
 * A sealed response's STATUS is not readable by id alone (issues #100 / #101).
 *
 * The residue of #78. PR #94 put the ownership gate at the write seam and at both loads that can
 * return before a write — but `checkDuplicate` runs EARLIER, in the pipeline, and is a genuinely
 * read-only path: it resolves the caller's `responseId` through `findResponseById` (which matches
 * on id + version + the `SourceMetadata.clientResponseId` proof and asks nothing about ownership)
 * and, when the row is terminal, answers `success: true` with the row's own `Status`. So a caller
 * holding an id they do not own learned whether that response was `Complete` or `Disqualified` —
 * which is more than a liveness bit, because it distinguishes "this person submitted" from "this
 * person was screened out".
 *
 * These drive the whole pipeline for the same reason the tests above do: the invariant is about
 * what the CALLER is told, not about which lookup fired.
 */
describe('a sealed response tells its status to nobody but its owner', () => {
  /**
   * The probe from issue #101: a FINAL submit carrying a response id the caller does not own.
   *
   * The stranger's session is a PARAMETER because "not the owner" has three spellings and they are
   * not interchangeable — a wrong header, an absent one, and a blank one all have to land in the
   * same place (issue #78). Defaulting to the forged one keeps the cases below reading as the
   * issue wrote them.
   */
  function probeAsStranger(victimRow: ExistingResponseRow, sessionId = 'attacker-session') {
    const { ctx, fake } = build({ sessionId, existingResponses: [victimRow] });
    return { run: () => runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID })), fake };
  }

  it('refuses a FINAL submit against a foreign SEALED row, and reports no status', async () => {
    // The reported defect, verbatim: `success: true, status: "Complete"` to a caller who arrived
    // with nothing but the id.
    const { run, fake } = probeAsStranger(victimSealed('Complete'));

    const result = await run();

    expect(result.success).toBe(false);
    expect(result.status).toBeUndefined();
    expect(writesToVictimRow(fake)).toHaveLength(0);
  });

  it('answers a foreign SEALED row exactly as it answers a foreign UNSEALED one', async () => {
    // The acceptance criterion, and the reason a status is not enough on its own: whether the row
    // is finished has to be as unknowable as everything else about it. Before the fix the sealed
    // row short-circuited to success while the unsealed one was refused at the write — one probe
    // told the caller which of the two they were holding.
    const sealed = await probeAsStranger(victimSealed('Complete')).run();
    const unsealed = await probeAsStranger(victimPartial()).run();

    expect(sealed.success).toBe(unsealed.success);
    expect(sealed.status).toBe(unsealed.status);
    expect(sealed.errors?.[0].message).toBe(unsealed.errors?.[0].message);
  });

  it('answers a foreign SEALED row no differently when the header is ABSENT than when it is wrong', async () => {
    // Route 2 of issue #78, on the branch this change touches. Every other probe here arrives with
    // a WRONG session; the defect #78 actually reported arrived with NONE, and "an absent
    // credential must never be more permissive than a wrong one" has to hold on a read the same
    // way it holds on a write. It is not idly stated: `responseIsOurs` answers yes when the ROW's
    // owner folds to empty, and a version of it that also answered yes when the CALLER's does —
    // one `||`, and a plausible reading of "blank means unowned" — would hand this row's status to
    // exactly the caller the issue is about while leaving every other test in this file green.
    const absent = probeAsStranger(victimSealed('Complete'), '');
    const blank = probeAsStranger(victimSealed('Complete'), '   ');

    const onAbsent = await absent.run();
    const onBlank = await blank.run();
    const onForged = await probeAsStranger(victimSealed('Complete')).run();

    expect(onAbsent.success).toBe(false);
    expect(onAbsent.status).toBeUndefined();
    expect(onBlank.success).toBe(false);
    expect(onBlank.status).toBeUndefined();
    // And refused by the same answer, so the spelling of the missing credential is not an oracle.
    expect(onAbsent.errors?.[0].message).toBe(onForged.errors?.[0].message);
    expect(onBlank.errors?.[0].message).toBe(onForged.errors?.[0].message);
    expect(writesToVictimRow(absent.fake)).toHaveLength(0);
    expect(writesToVictimRow(blank.fake)).toHaveLength(0);
  });

  it('does not let a stranger tell `Complete` from `Disqualified`', async () => {
    // The one bit issue #101 is actually about. `Disqualified` took a visibly different path
    // (`terminalRepeatFields`) from `Complete` (`confirmationFields`), so the two answers differed
    // in status AND in copy — for a response the caller could only name, never own.
    const completed = await probeAsStranger(victimSealed('Complete')).run();
    const screenedOut = await probeAsStranger(victimSealed('Disqualified')).run();

    expect(completed.status).toBe(screenedOut.status);
    expect(completed.confirmationMessage).toBe(screenedOut.confirmationMessage);
    expect(completed.errors?.[0].message).toBe(screenedOut.errors?.[0].message);
  });
});

/**
 * ...and still tells its OWNER, which is the whole point of the short-circuit.
 *
 * `checkDuplicate` exists so a re-fired final submit returns the original response id instead of
 * writing a second terminal row, and so a respondent who was screened out on their first attempt
 * is not congratulated on their retry. Both survive the fix, and these pin them: they are green
 * before it and after it, which is what makes them the guard rather than the proof.
 */
describe('the idempotent resubmit its owner is entitled to', () => {
  it('gives a headerless client its own sealed row back, by id', async () => {
    // The flow the by-id branch exists for: no session to key on, so the 122-bit client id in
    // `SourceMetadata` is the only capability there is — and for an UNOWNED row it still is.
    const ownSealed = victimSealed('Complete', { AnonymousSessionID: '' });
    const { ctx, fake } = build({ sessionId: '', existingResponses: [ownSealed] });

    const result = await runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(result.success).toBe(true);
    expect(result.responseId).toBe(VICTIM_RESPONSE_ID);
    expect(result.status).toBe('Complete');
    expect(fake.saved).toHaveLength(0);
  });

  it('gives the OWNING session its own sealed row back, by id', async () => {
    const { ctx, fake } = build({ sessionId: VICTIM_SESSION, existingResponses: [victimSealed('Complete')] });

    const result = await runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(result.success).toBe(true);
    expect(result.responseId).toBe(VICTIM_RESPONSE_ID);
    expect(result.status).toBe('Complete');
    expect(fake.saved).toHaveLength(0);
  });

  it('tells a screened-out respondent they were screened out, not that they were recorded', async () => {
    // The distinction the fix must NOT flatten for the owner. A retry of a disqualified submission
    // gets the knockout copy; being told "thanks, your response has been recorded" would be untrue
    // of the row and of them.
    const ownScreenedOut = victimSealed('Disqualified', { AnonymousSessionID: '' });
    const { ctx } = build({ sessionId: '', existingResponses: [ownScreenedOut] });

    const result = await runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(result.success).toBe(true);
    expect(result.status).toBe('Disqualified');
    expect(result.confirmationMessage).toBe(SCREENED_OUT_MESSAGE);
  });

  it('recognises a re-`load()`ed widget’s retry from the session, with a brand-new client id', async () => {
    // The flow that makes a session predicate on the by-id lookup the wrong instrument: the widget
    // mints a fresh `clientResponseId` on every `load()`, so a retry after one never matches by id
    // at all. The session branch recognises it, and the fix leaves that branch alone.
    //
    // A re-`load()` WITHIN one widget instance, precisely — which is what holding `sessionId`
    // fixed models. `FormsGraphQLApiService` mints its session per SERVICE instance and
    // `mj-form.component` mints the client id per `load()`, so a full page reload rotates BOTH and
    // is recognised by neither branch; it writes a fresh row, as it did before this change.
    const { ctx } = build({
      sessionId: VICTIM_SESSION,
      existingResponses: [victimSealed('Complete')],
    });

    const result = await runSubmitPipeline(
      ctx,
      submission({ clientResponseId: 'c3d4e5f6-1111-4222-8333-444455556668' }),
    );

    expect(result.success).toBe(true);
    expect(result.responseId).toBe(VICTIM_RESPONSE_ID);
    expect(result.status).toBe('Complete');
  });

  it('refuses a re-fire that presents an owned row’s id under a DIFFERENT session', async () => {
    // The cost of the fix, pinned so it is a decision rather than a discovery. Issue #100 asks that
    // "same client, same id, session blank or changed" keep short-circuiting, and it does whenever
    // the row is unowned (the case above). When the row HAS an owner, that request is the same one
    // issue #78 established must be refused — an absent or wrong credential is not a credential —
    // and the two asks cannot both be honoured: answering it IS the disclosure #101 is about.
    //
    // So the read now agrees with the write instead of contradicting it: this caller is already
    // refused on every partial save and every write. No real widget reaches it — session and client
    // id are minted together, so an id only ever travels with the session that created it.
    const { ctx, fake } = build({
      sessionId: 'a-different-session',
      existingResponses: [victimSealed('Complete')],
    });

    const result = await runSubmitPipeline(ctx, submission({ clientResponseId: VICTIM_RESPONSE_ID }));

    expect(result.success).toBe(false);
    expect(result.status).toBeUndefined();
    expect(writesToVictimRow(fake)).toHaveLength(0);
  });
});
