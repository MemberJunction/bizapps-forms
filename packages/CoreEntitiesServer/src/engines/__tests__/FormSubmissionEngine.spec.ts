/**
 * `FormSubmissionEngine` — the parts that are new with #303 Task 8 and are not a carried-over
 * pipeline stage (those keep their own specs under `__tests__/submission/`):
 *  - `GetRespondentForm`: the allowlisted projection (#302), the captcha the link demands, the resume
 *    snapshot, and ONE fixed sentence for every refusal — a form that is not Published included (DW15);
 *  - `SaveResponse`: the form must be Published; the quota DECISION is the conditional UPDATE inside
 *    the transaction (a slot the pre-check saw free but a concurrent save took is refused, and nothing
 *    is written); the form-level quota is checked under a lock on the form row; a failure anywhere in
 *    the transaction leaves no response, no answers and no slot taken; the ending is the server's.
 * The concurrency itself (DW9) and the response-plus-message rollback on a real database (DW10) are
 * proven against SQL Server in `FormSubmissionEngine.integration.spec.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { respondentFormDefinitionSchema, type PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import {
  FORM_UNAVAILABLE_MESSAGE,
  FormSubmissionEngine,
  QUOTA_REACHED_MESSAGE,
  RespondentFormUnavailableError,
  SUBMIT_FAILED_MESSAGE,
  type RespondentFormView,
} from '../FormSubmissionEngine.js';
import { resetPublicSubmitConfigForTests } from '../../submission/config.js';
import { FormsRateLimiter } from '../../submission/rate-limit.js';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
  type FakeProviderConfig,
} from '../../testing/index.js';
import { recordingQueue, saveThroughEngine, type EngineSaveContext } from './submission/harness.js';

const SYSTEM = { ID: 'system-user', Name: 'System' } as unknown as UserInfo;
const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';

/** A screener with a scored question, a knockout and two endings — everything #302 must keep home. */
function screener(): PublishedFormDefinition {
  return makeDefinition({
    settings: { anonymousAllowed: true, captchaRequired: false, confirmationMessage: 'Thanks!', onSubmitMode: 'Configured' },
    pages: [
      {
        id: 'page-1',
        displayOrder: 1,
        conditionalRule: {
          jump: [{ when: { all: [{ questionId: 'q-age', op: 'equals', value: 'under' }] }, target: { kind: 'ending', id: 'end-ko' } }],
        },
        questions: [
          {
            id: 'q-age',
            type: 'SingleChoice',
            prompt: 'Age band',
            isRequired: true,
            displayOrder: 1,
            options: [
              { id: 'o-under', label: 'Under 18', value: 'under', displayOrder: 1 },
              { id: 'o-adult', label: '18+', value: 'adult', displayOrder: 2 },
            ],
            scoring: { points: { under: 0, adult: 5 } },
          },
        ],
      },
    ],
    endScreens: [
      {
        id: 'end-ko',
        screenType: 'Ending',
        title: 'Not eligible',
        body: 'This study is for adults.',
        displayOrder: 1,
        isDisqualification: true,
      },
      {
        id: 'end-ok',
        screenType: 'Ending',
        title: 'You are in',
        body: 'We will be in touch.',
        displayOrder: 2,
        isDefault: true,
        redirectURL: 'javascript:alert(1)',
        socialLinks: [{ platform: 'linkedin', url: 'https://linkedin.example/forms' }],
      },
    ],
  });
}

function fakeFor(config: Partial<FakeProviderConfig> = {}, definition: PublishedFormDefinition = screener()) {
  return makeFakeProvider({
    distribution: makeDistribution(),
    version: makeVersion(definition),
    createPermissions: respondentPermissions(),
    ...config,
  });
}

function ctxFor(fake: ReturnType<typeof makeFakeProvider>): EngineSaveContext {
  return { provider: fake.provider, contextUser: makeContextUser(), elevatedUser: SYSTEM, sessionId: 'sess-1', queue: recordingQueue() };
}

const ADULT = { distributionSlug: 'public-1', formVersionId: 'ver-1', clientResponseId: '11111111-2222-4333-8444-555555555555', answers: [{ questionId: 'q-age', textValue: 'adult' }] };

function getForm(fake: ReturnType<typeof makeFakeProvider>, user: UserInfo = makeContextUser(), origin?: string): Promise<RespondentFormView> {
  return FormSubmissionEngine.Instance.GetRespondentForm('public-1', { sessionId: 'sess-1', origin }, fake.provider, user, { systemUser: SYSTEM });
}

beforeEach(() => {
  delete process.env.FORMS_TURNSTILE_SECRET;
  resetPublicSubmitConfigForTests();
  FormsRateLimiter.Instance.resetForTests();
  FormSubmissionEngine.Instance.ResetInFlightForTests();
});

describe('GetRespondentForm', () => {
  it('serves the allowlisted projection: no scoring, no ending screens, no knockout condition (#302)', async () => {
    const view = await getForm(fakeFor());

    expect(view.formVersionId).toBe('ver-1');
    const json = JSON.stringify(view.definition);
    expect(json).not.toContain('scoring');
    expect(json).not.toContain('endScreens');
    expect(json).not.toContain('Not eligible');
    expect(json).not.toContain('end-ko');
    expect(json).not.toContain('"under"}'); // the knockout's condition value is not shipped
    expect(respondentFormDefinitionSchema.safeParse(view.definition).success).toBe(true);
    expect(view.definition.pages[0].questions[0].options.map((o) => o.value)).toEqual(['under', 'adult']);
    expect(view.resume).toBeUndefined();
  });

  it('reports the captcha the LINK demands, not only the form', async () => {
    const view = await getForm(fakeFor({ distribution: makeDistribution({ CaptchaRequired: true }) }));
    expect(view.captchaRequired).toBe(true);
    expect(view.definition.captchaRequired).toBe(true);
  });

  it('refuses a form whose Status is not Published, with the one fixed sentence (DW15)', async () => {
    for (const formStatus of ['Closed', 'Draft']) {
      const refused = getForm(fakeFor({ formStatus }));
      await expect(refused).rejects.toBeInstanceOf(RespondentFormUnavailableError);
      await expect(refused).rejects.toThrow(FORM_UNAVAILABLE_MESSAGE);
    }
  });

  it('refuses a closed link and a foreign embedding page with the same sentence', async () => {
    await expect(getForm(fakeFor({ distribution: makeDistribution({ Status: 'Closed' }) }))).rejects.toThrow(FORM_UNAVAILABLE_MESSAGE);
    const allowlisted = fakeFor({ distribution: makeDistribution({ AllowedOrigins: 'https://customer.example' }) });
    await expect(getForm(allowlisted, makeContextUser(), 'https://attacker.example')).rejects.toThrow(FORM_UNAVAILABLE_MESSAGE);
  });

  it("turns an unexpected throw into the same sentence, marked as the system's fault, never the exception's words", async () => {
    const fake = fakeFor();
    const throwing = Object.create(fake.provider, {
      RunView: { value: async () => { throw new RangeError('Invalid time value'); } },
    }) as typeof fake.provider;

    const refused = FormSubmissionEngine.Instance.GetRespondentForm('public-1', { sessionId: '' }, throwing, makeContextUser(), { systemUser: SYSTEM });

    await expect(refused).rejects.toMatchObject({ message: FORM_UNAVAILABLE_MESSAGE, fault: true });
  });

  it("hands a resume session its own draft's snapshot", async () => {
    const draftId = '22222222-3333-4444-8555-666666666666';
    const fake = fakeFor({
      existingResponses: [{ ID: draftId, Status: 'Partial', FormVersionID: 'ver-1', AnonymousSessionID: '', FormDistributionID: 'dist-1' }],
    });
    const resumeUser = { ...makeContextUser(), MagicLinkScope: { ResourceID: draftId } } as unknown as UserInfo;

    const view = await getForm(fake, resumeUser);

    expect(view.resume?.responseId).toBe(draftId);
    expect(view.resume?.status).toBe('Partial');
  });
});

describe('SaveResponse — the form must be Published', () => {
  it('refuses a save to an archived form and writes nothing', async () => {
    const fake = fakeFor({ formStatus: 'Closed' });

    const result = await saveThroughEngine(ctxFor(fake), ADULT);

    expect(result.success).toBe(false);
    expect(result.errors[0].message).toBe(FORM_UNAVAILABLE_MESSAGE);
    expect(JSON.stringify(result)).not.toContain('form-not-published');
    expect(fake.saved).toHaveLength(0);
  });
});

describe('SaveResponse — the quota is decided by the conditional UPDATE, inside the transaction', () => {
  it('takes the slot through the conditional-UPDATE procedure, in the save transaction (SQL Server)', async () => {
    // The UPDATE and its @@ROWCOUNT live in spFormDistributionConsumeResponseSlot (#338); its shape
    // is pinned by guarded-write-sprocs.migration.spec.ts.
    const fake = fakeFor({ distribution: makeDistribution({ MaxResponses: 5, ResponseCount: 2 }) });

    const result = await saveThroughEngine(ctxFor(fake), ADULT);

    expect(result.success).toBe(true);
    const slot = fake.statements.find((s) => /spFormDistributionConsumeResponseSlot/.test(s.sql));
    expect(slot?.inTransaction).toBe(true);
    expect(slot?.sql).toBe("EXEC [__mj_BizAppsForms].[spFormDistributionConsumeResponseSlot] @ID = 'dist-1'");
    expect(fake.distribution?.ResponseCount).toBe(3);
  });

  it('refuses — and rolls back the response it already wrote — when the UPDATE matches no row', async () => {
    // The pre-check read a free slot; a concurrent save took it before this one's UPDATE ran. The
    // UPDATE is the decision: zero rows is the quota refusal, and nothing of this save survives.
    const fake = fakeFor({
      distribution: makeDistribution({ MaxResponses: 1, ResponseCount: 0 }),
      sql: [{ match: /spFormDistributionConsumeResponseSlot/, rows: [{ AffectedRows: 0 }] }],
    });
    const ctx = ctxFor(fake);

    const result = await saveThroughEngine(ctx, ADULT);

    expect(result.success).toBe(false);
    expect(result.errors[0].message).toBe(QUOTA_REACHED_MESSAGE);
    expect(fake.saved.map((r) => r.entityName)).not.toContain(FORM_RESPONSE_ENTITY);
    expect(fake.transactions).toEqual(['begin', 'rollback']);
  });

  it('takes no slot for a partial save or a knockout', async () => {
    const fake = fakeFor({ distribution: makeDistribution({ MaxResponses: 5, ResponseCount: 0 }) });
    const ctx = ctxFor(fake);

    await saveThroughEngine(ctx, { ...ADULT, partial: true });
    await saveThroughEngine(ctx, { ...ADULT, clientResponseId: '33333333-2222-4333-8444-555555555555', answers: [{ questionId: 'q-age', textValue: 'under' }] });

    expect(fake.statements.filter((s) => /spFormDistributionConsumeResponseSlot|UPDATE/.test(s.sql))).toHaveLength(0);
    expect(fake.distribution?.ResponseCount).toBe(0);
  });

  it('checks the form-level quota under a lock on the form row, and refuses when it is reached', async () => {
    const definition = screener();
    definition.settings.quota = 10;
    const fake = fakeFor({ formResponseCount: 10 }, definition);

    const result = await saveThroughEngine(ctxFor(fake), ADULT);

    expect(result.success).toBe(false);
    expect(result.errors[0].message).toBe(QUOTA_REACHED_MESSAGE);
    const lock = fake.statements.find((s) => /spFormLockRowForQuota/.test(s.sql));
    expect(lock?.sql).toBe("EXEC [__mj_BizAppsForms].[spFormLockRowForQuota] @ID = 'form-1'");
    expect(lock?.inTransaction).toBe(true);
    expect(fake.saved).toHaveLength(0);
  });

  it('lets a retry of a response a concurrent final already sealed through on the LAST slot (review finding 5)', async () => {
    // Both finals missed the sealed-repeat lookup; the first then took the last slot and committed.
    // The second is a retry of the SAME response — the idempotent no-op persistence answers — so the
    // completion it would be counted against is its own.
    const definition = screener();
    definition.settings.quota = 1;
    const id = '66666666-2222-4333-8444-555555555555';
    const fake = fakeFor(
      {
        formResponseCount: 1,
        concurrentlyCreated: [{ ID: id, Status: 'Complete', FormVersionID: 'ver-1', AnonymousSessionID: 'sess-1', SourceMetadata: `{"clientResponseId":"${id}"}` }],
      },
      definition,
    );

    const result = await saveThroughEngine(ctxFor(fake), { ...ADULT, clientResponseId: id });

    expect(result.success).toBe(true);
    expect(result.responseId).toBe(id);
    expect(result.status).toBe('Complete');
  });

  it('still refuses a NEW completion when the quota is reached', async () => {
    const definition = screener();
    definition.settings.quota = 1;
    const fake = fakeFor(
      {
        formResponseCount: 1,
        concurrentlyCreated: [{ ID: '66666666-2222-4333-8444-000000000000', Status: 'Complete', FormVersionID: 'ver-1', AnonymousSessionID: 'sess-1' }],
      },
      definition,
    );

    const result = await saveThroughEngine(ctxFor(fake), ADULT);

    expect(result.errors[0]?.message).toBe(QUOTA_REACHED_MESSAGE);
  });

  it('takes no lock at all for a form without a form-level quota', async () => {
    const fake = fakeFor();
    await saveThroughEngine(ctxFor(fake), ADULT);
    expect(fake.statements.some((s) => /spFormLockRowForQuota|UPDLOCK/.test(s.sql))).toBe(false);
  });
});

describe('SaveResponse — one transaction', () => {
  it('a failure part-way through leaves no response, no answers and no slot taken', async () => {
    const fake = fakeFor({ distribution: makeDistribution({ MaxResponses: 5, ResponseCount: 0 }), failSaveFor: 'MJ_BizApps_Forms: Form Response Answers' });

    const result = await saveThroughEngine(ctxFor(fake), ADULT);

    expect(result.success).toBe(false);
    expect(fake.saved).toHaveLength(0);
    expect(fake.distribution?.ResponseCount).toBe(0);
    expect(fake.transactions).toEqual(['begin', 'rollback']);
  });
});

describe('SaveResponse — an abusive payload is cheap to refuse, and counted (fix round 2)', () => {
  /** An array nested `depth` levels deep, built without recursion. */
  function nested(depth: number): unknown[] {
    let value: unknown[] = [];
    for (let i = 1; i < depth; i++) {
      value = [value];
    }
    return value;
  }

  it('refuses a 20000-deep answer after charging the rate limit — no crash, no stack trace, the question named', async () => {
    process.env.FORMS_RATELIMIT_MAX = '1';
    resetPublicSubmitConfigForTests();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const ctx = ctxFor(fakeFor());
      const abusive = await saveThroughEngine(ctx, {
        ...ADULT,
        answers: [{ questionId: 'q-age', jsonValue: nested(20_000) as never }],
      });

      expect(abusive.success).toBe(false);
      expect(abusive.errors).toEqual([{ questionId: 'q-age', message: 'That answer is nested too deeply.' }]);
      // A refusal, not a fault: nothing was logged as an error, let alone a stack overflow.
      expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Maximum call stack|threw/);
      // ...and it spent the caller's budget: the next save from the same session is rate-limited.
      const next = await saveThroughEngine(ctx, ADULT);
      expect(next.errors[0].message).toMatch(/too many/i);
    } finally {
      errors.mockRestore();
      delete process.env.FORMS_RATELIMIT_MAX;
      resetPublicSubmitConfigForTests();
    }
  });

  it('charges an AUTOSAVE refused by the pre-scan to the autosave bucket, then refuses it (re-review coverage note)', async () => {
    process.env.FORMS_AUTOSAVE_RATELIMIT_MAX = '1';
    resetPublicSubmitConfigForTests();
    try {
      const ctx = ctxFor(fakeFor());
      const abusive = await saveThroughEngine(ctx, { ...ADULT, partial: true, answers: [{ questionId: 'q-age', jsonValue: nested(20_000) as never }] });
      expect(abusive.errors).toEqual([{ questionId: 'q-age', message: 'That answer is nested too deeply.' }]);
      const next = await saveThroughEngine(ctx, { ...ADULT, partial: true });
      expect(next.errors[0].message).toMatch(/too many/i);
    } finally {
      delete process.env.FORMS_AUTOSAVE_RATELIMIT_MAX;
      resetPublicSubmitConfigForTests();
    }
  });

  it('refuses a number the decimal(18,4) column cannot hold, naming the question, before the transaction', async () => {
    const definition = makeDefinition({
      pages: [{ id: 'p', displayOrder: 1, questions: [{ id: 'q-n', type: 'Number', prompt: 'n', isRequired: true, displayOrder: 1, options: [] }] }],
    });
    const fake = fakeFor({}, definition);

    const result = await saveThroughEngine(ctxFor(fake), { ...ADULT, answers: [{ questionId: 'q-n', numericValue: 1e300 }] });

    expect(result.errors).toEqual([{ questionId: 'q-n', message: expect.stringMatching(/^Enter a number between/) }]);
    expect(fake.transactions).toEqual([]);
  });
});

describe('a host with no system user (review minor 12)', () => {
  // The respondent role cannot read `Forms`, so reading the form's status as the respondent would
  // call every form "not published". It is a configuration error: the engine refuses to run without
  // the system user and says so — the save as a system failure, the read as the fixed sentence.
  it('fails a save as a system failure, never as an unpublished form', async () => {
    const fake = fakeFor();
    const result = await FormSubmissionEngine.Instance.SaveResponse(
      { distributionSlug: 'public-1', formVersionId: 'ver-1', mode: 'final', answers: [], caller: { sessionId: '' } },
      fake.provider,
      makeContextUser(),
      { queue: recordingQueue() },
    );
    expect(result.errors[0].message).toBe(SUBMIT_FAILED_MESSAGE);
    expect(fake.saved).toHaveLength(0);
  });

  it("refuses the read as the system's fault", async () => {
    const read = FormSubmissionEngine.Instance.GetRespondentForm('public-1', { sessionId: '' }, fakeFor().provider, makeContextUser(), {});
    await expect(read).rejects.toMatchObject({ message: FORM_UNAVAILABLE_MESSAGE, fault: true });
  });
});

describe('SaveResponse — the verdict is judged on what will be stored (review minors 3, 7)', () => {
  it('never pairs a Complete row with knockout copy when a concurrent final sealed the row first', async () => {
    // These PARTIAL answers trip the knockout, but a concurrent final already sealed the row Complete:
    // the response describes the row, so it gets the completion ending — never the knockout screen.
    const id = '55555555-2222-4333-8444-555555555555';
    const fake = fakeFor({
      concurrentlyCreated: [{ ID: id, Status: 'Complete', FormVersionID: 'ver-1', AnonymousSessionID: '', SourceMetadata: `{"clientResponseId":"${id}"}` }],
    });

    const result = await saveThroughEngine(ctxFor(fake), { ...ADULT, clientResponseId: id, partial: true, answers: [{ questionId: 'q-age', textValue: 'under' }] });

    expect(result.status).toBe('Complete');
    expect(result.ending?.isDisqualification).not.toBe(true);
    expect(result.ending?.id).toBe('end-ok');
  });

  it('judges the knockout without a file answer that lenient provenance stripped', async () => {
    process.env.FORMS_UPLOAD_PROVENANCE = 'lenient';
    try {
      const definition = makeDefinition({
        pages: [
          {
            id: 'page-1',
            displayOrder: 1,
            conditionalRule: {
              jump: [{ when: { all: [{ questionId: 'q-file', op: 'isAnswered' }] }, target: { kind: 'ending', id: 'end-ko' } }],
            },
            questions: [
              { id: 'q-name', type: 'ShortText', prompt: 'Name', isRequired: true, displayOrder: 1, options: [] },
              { id: 'q-file', type: 'FileUpload', prompt: 'CV', isRequired: false, displayOrder: 2, options: [] },
            ],
          },
        ],
        endScreens: [{ id: 'end-ko', screenType: 'Ending', title: 'No', displayOrder: 1, isDisqualification: true }],
      });
      const fake = fakeFor({}, definition);

      // `file-forged` is in nobody's upload ledger: lenient mode strips it, so it is not an answer —
      // and an answer that is not stored cannot screen the respondent out.
      const result = await saveThroughEngine(ctxFor(fake), {
        ...ADULT,
        answers: [
          { questionId: 'q-name', textValue: 'Ada' },
          { questionId: 'q-file', fileId: 'file-forged' },
        ],
      });

      expect(result.status).toBe('Complete');
    } finally {
      delete process.env.FORMS_UPLOAD_PROVENANCE;
    }
  });
});

describe('SaveResponse — the ending is the server’s', () => {
  it('returns the completion ending with its content, dropping an unsafe redirect', async () => {
    const result = await saveThroughEngine(ctxFor(fakeFor()), ADULT);

    expect(result.outcome).toBe('ended');
    expect(result.ending).toEqual({
      id: 'end-ok',
      title: 'You are in',
      body: 'We will be in touch.',
      buttonLabel: undefined,
      mediaURL: undefined,
      redirectURL: undefined,
      socialLinks: [{ platform: 'linkedin', url: 'https://linkedin.example/forms' }],
      isDisqualification: false,
    });
    expect(result.redirectUrl).toBeUndefined();
    expect(result.confirmationMessage).toBe('You are in\n\nWe will be in touch.');
  });

  it('seals a final knockout Disqualified and returns the knockout screen', async () => {
    const result = await saveThroughEngine(ctxFor(fakeFor()), { ...ADULT, answers: [{ questionId: 'q-age', textValue: 'under' }] });

    expect(result.status).toBe('Disqualified');
    expect(result.outcome).toBe('ended');
    expect(result.ending).toMatchObject({ id: 'end-ko', isDisqualification: true });
    expect(result.confirmationMessage).toBe('Not eligible\n\nThis study is for adults.');
  });
});
