/**
 * `Forms.GetRespondentForm` and `Forms.SaveResponse` through `ExecuteServer` — the path MJ's
 * `ExecuteRemoteOperation` resolver and an in-process `.Execute()` both take: `Authorize`, then
 * `InternalExecute`, wrapped into a `RemoteOpResult`.
 *
 * DW17 for both: an Authorize refusal, an input refusal and a happy path — and, the case the two
 * respondent operations exist to get right, a magic-link session whose scope is a DIFFERENT link
 * getting FORBIDDEN. Both are unscoped (no `RequiredScope`), so `Authorize` is the whole gate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { respondentFormDefinitionSchema, type PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

const SYSTEM = { ID: 'system-user', Name: 'System' };
vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { GetSystemUser: () => SYSTEM } },
}));

const { GetRespondentFormServerOperation, LoadGetRespondentFormOperation } = await import('../GetRespondentFormServerOperation.js');
const { SaveResponseServerOperation, LoadSaveResponseOperation } = await import('../SaveResponseServerOperation.js');
const { FormsRateLimiter } = await import('../../submission/rate-limit.js');
const { resetPublicSubmitConfigForTests } = await import('../../submission/config.js');
const { FormSubmissionEngine } = await import('../../engines/FormSubmissionEngine.js');
const { runWithRequestIdentity } = await import('../../shared/request-identity.js');
const testing = await import('../../testing/index.js');

const DIST = 'dist-1';
const RESUMED = '44444444-5555-4666-8777-888888888888';
const FOREIGN_RESPONSE = '99999999-5555-4666-8777-888888888888';

/** A form that configures no automations, so a submit owes the queue nothing (no Work Queue here). */
function definition(): PublishedFormDefinition {
  return testing.makeDefinition({
    settings: { anonymousAllowed: true, captchaRequired: false, confirmationMessage: 'Thanks!', onSubmitMode: 'Configured' },
    endScreens: [{ id: 'end-1', screenType: 'Ending', title: 'Done', displayOrder: 1, isDefault: true }],
  });
}

function db() {
  return testing.makeFakeProvider({
    distribution: testing.makeDistribution(),
    version: testing.makeVersion(definition()),
    createPermissions: testing.respondentPermissions(),
    existingResponses: [
      { ID: RESUMED, Status: 'Partial', FormVersionID: 'ver-1', AnonymousSessionID: '', FormDistributionID: DIST },
      { ID: FOREIGN_RESPONSE, Status: 'Partial', FormVersionID: 'ver-other', AnonymousSessionID: '', FormDistributionID: 'dist-other' },
    ],
  });
}

/** A respondent session — a magic-link user whose scope claim names `resourceId`. */
function respondent(resourceId: string | undefined): UserInfo {
  return { ...testing.makeContextUser(), IsMagicLinkAnonymous: true, MagicLinkScope: resourceId ? { ResourceID: resourceId } : undefined } as unknown as UserInfo;
}

function context(fake: ReturnType<typeof db>, user: UserInfo) {
  return { provider: fake.provider, user, emitProgress: () => undefined };
}

function getForm(fake: ReturnType<typeof db>, user: UserInfo, slug: unknown = 'public-1') {
  return new GetRespondentFormServerOperation().ExecuteServer({ Slug: slug as string }, context(fake, user));
}

const SAVE = {
  Slug: 'public-1',
  FormVersionID: 'ver-1',
  Mode: 'final' as const,
  ClientResponseID: '11111111-2222-4333-8444-555555555555',
  Answers: [{ QuestionID: 'q-name', TextValue: 'Ada Lovelace' }],
};

function save(fake: ReturnType<typeof db>, user: UserInfo, input: Record<string, unknown> = SAVE) {
  return new SaveResponseServerOperation().ExecuteServer(input as unknown as typeof SAVE, context(fake, user));
}

beforeEach(() => {
  delete process.env.FORMS_TURNSTILE_SECRET;
  resetPublicSubmitConfigForTests();
  FormsRateLimiter.Instance.resetForTests();
  FormSubmissionEngine.Instance.ResetInFlightForTests();
});

describe('Forms.GetRespondentForm', () => {
  it('is registered under its key, unscoped, with an anchor the server bootstrap calls', () => {
    const op = new GetRespondentFormServerOperation();
    expect(op.OperationKey).toBe('Forms.GetRespondentForm');
    expect((op as { RequiredScope?: string }).RequiredScope).toBeUndefined();
    expect(LoadGetRespondentFormOperation()).toBeUndefined();
  });

  it('serves the allowlisted definition to a session scoped to this link', async () => {
    const result = await getForm(db(), respondent(DIST));

    expect(result.ResultCode).toBe('SUCCESS');
    const output = result.Output!;
    expect(output.FormVersionID).toBe('ver-1');
    expect(output.ResumeJSON).toBeNull();
    expect(output.CaptchaRequired).toBe(false);
    const parsed = respondentFormDefinitionSchema.parse(JSON.parse(output.DefinitionJSON));
    expect(parsed.pages[0].questions[0].id).toBe('q-name');
    expect(output.DefinitionJSON).not.toContain('endScreens');
    expect(output.DefinitionJSON).not.toContain('automations');
  });

  it('serves a resume session scoped to a response of this link, with its snapshot', async () => {
    const result = await getForm(db(), respondent(RESUMED));

    expect(result.ResultCode).toBe('SUCCESS');
    expect(JSON.parse(result.Output!.ResumeJSON!)).toMatchObject({ responseId: RESUMED, status: 'Partial' });
  });

  it('is FORBIDDEN to a magic-link session scoped to a DIFFERENT link (DW17)', async () => {
    const result = await getForm(db(), respondent('dist-other'));
    expect(result.ResultCode).toBe('FORBIDDEN');
    expect(result.Output).toBeUndefined();
  });

  it("is FORBIDDEN to a resume session for another link's response", async () => {
    expect((await getForm(db(), respondent(FOREIGN_RESPONSE))).ResultCode).toBe('FORBIDDEN');
  });

  it('is FORBIDDEN to a session that is not a scoped magic-link session at all', async () => {
    expect((await getForm(db(), respondent(undefined))).ResultCode).toBe('FORBIDDEN');
  });

  it('refuses a request with no slug as an input error', async () => {
    const result = await getForm(db(), respondent(DIST), '   ');
    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toBe('Forms.GetRespondentForm: Slug is required.');
  });

  it('answers a closed form with the one fixed sentence', async () => {
    const fake = testing.makeFakeProvider({
      distribution: testing.makeDistribution(),
      version: testing.makeVersion(definition()),
      createPermissions: testing.respondentPermissions(),
      formStatus: 'Closed',
    });
    const result = await getForm(fake, respondent(DIST));
    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(result.ErrorMessage).toBe('This form is not available.');
  });
});

describe('Forms.SaveResponse', () => {
  it('is registered under its key, unscoped, with an anchor the server bootstrap calls', () => {
    const op = new SaveResponseServerOperation();
    expect(op.OperationKey).toBe('Forms.SaveResponse');
    expect((op as { RequiredScope?: string }).RequiredScope).toBeUndefined();
    expect(LoadSaveResponseOperation()).toBeUndefined();
  });

  it('saves for a session scoped to this link, and answers in the generated output shape', async () => {
    const fake = db();
    const result = await runWithRequestIdentity({ sessionId: 'sess-op', ipHash: 'ip-1' }, () => save(fake, respondent(DIST)));

    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Output).toEqual({
      Success: true,
      ResponseID: SAVE.ClientResponseID,
      Status: 'Complete',
      Outcome: 'ended',
      Errors: [],
      Ending: { ID: 'end-1', Title: 'Done', Body: null, ButtonLabel: null, MediaURL: null, RedirectURL: null, SocialLinks: [], IsDisqualification: false },
      ConfirmationMessage: 'Done',
    });
    // The session header from the request-identity store keyed the row's owner.
    const response = fake.saved.find((r) => r.entityName === 'MJ_BizApps_Forms: Form Responses');
    expect(response?.values.AnonymousSessionID).toBe('sess-op');
  });

  it('returns a refusal the respondent can act on as a RESULT, each error tied to its question', async () => {
    const result = await save(db(), respondent(DIST), { ...SAVE, Answers: [] });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Output).toMatchObject({ Success: false, ResponseID: null, Status: null, Outcome: 'continue' });
    expect(result.Output!.Errors).toEqual([{ QuestionID: 'q-name', Message: 'This question is required.' }]);
  });

  it('is FORBIDDEN to a magic-link session scoped to a different link, and writes nothing', async () => {
    const fake = db();
    const result = await save(fake, respondent('dist-other'));
    expect(result.ResultCode).toBe('FORBIDDEN');
    expect(fake.saved).toHaveLength(0);
  });

  // Review finding 1 (#303 Task 8 fix round 1). The retired GraphQL input typed every answer column
  // (String / Float / Boolean / ID), so a mistyped column never reached validation. A Remote
  // Operation's input is only JSON.parse'd, and `validateAnswers` let an object or array TextValue on
  // a ShortText question, and a string BooleanValue on a YesNo one, through as stored answers. Each
  // column is now held to the type it stores, in every mode, before the engine sees the answer.
  describe('each answer column must carry the type it stores', () => {
    const probes: [string, Record<string, unknown>, string][] = [
      ['an object TextValue', { TextValue: { evil: 1 } }, 'TextValue must be text'],
      ['an array TextValue', { TextValue: ['a', 'b'] }, 'TextValue must be text'],
      ['a string BooleanValue', { BooleanValue: 'nope' }, 'BooleanValue must be true or false'],
      ['a string NumericValue', { NumericValue: '12' }, 'NumericValue must be a finite number'],
      ['a non-finite NumericValue', { NumericValue: Number.POSITIVE_INFINITY }, 'NumericValue must be a finite number'],
      ['a numeric DateValue', { DateValue: 20261013 }, 'DateValue must be text'],
      ['an object JSONValue', { JSONValue: ['a'] }, 'JSONValue must be JSON text'],
      ['a numeric FileID', { FileID: 7 }, 'FileID must be text'],
    ];
    for (const mode of ['final', 'partial'] as const) {
      for (const [label, column, message] of probes) {
        it(`refuses ${label} in ${mode} mode, naming the question, and writes nothing`, async () => {
          const fake = db();
          const result = await save(fake, respondent(DIST), {
            ...SAVE,
            Mode: mode,
            Answers: [{ QuestionID: 'q-name', ...column }],
          });

          expect(result.ResultCode).toBe('EXECUTION_ERROR');
          expect(result.ErrorMessage).toBe(`Forms.SaveResponse: the answer to question q-name is malformed: ${message}.`);
          expect(fake.saved).toHaveLength(0);
        });
      }
    }

    // Fix round 2: the column must also be the one the QUESTION'S TYPE stores, and only one of them
    // (`contracts/answer-shape.ts`, the rule the widget runs too). A refusal the respondent's field
    // can show, so a RESULT naming the question — and nothing is written.
    for (const [label, column] of [
      ['a ShortText answered with a JSONValue', { JSONValue: '{"a":{"b":"c"}}' }],
      ['an answer filling several columns', { TextValue: 'Ada', NumericValue: 1, BooleanValue: true }],
    ] as const) {
      it(`refuses ${label} as a result naming the question, in both modes`, async () => {
        for (const mode of ['final', 'partial'] as const) {
          const fake = db();
          const result = await save(fake, respondent(DIST), { ...SAVE, Mode: mode, Answers: [{ QuestionID: 'q-name', ...column }] });
          expect(result.ResultCode).toBe('SUCCESS');
          expect(result.Output).toMatchObject({ Success: false, Status: null });
          expect(result.Output!.Errors.map((e) => e.QuestionID)).toEqual(['q-name']);
          expect(fake.saved).toHaveLength(0);
        }
      });
    }

    it('still accepts null and absent for every column it does not use', async () => {
      const result = await save(db(), respondent(DIST), {
        ...SAVE,
        Answers: [{ QuestionID: 'q-name', TextValue: 'Ada', NumericValue: null, DateValue: null, BooleanValue: null, JSONValue: null, FileID: null }],
      });
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Output?.Success).toBe(true);
    });
  });

  it('refuses a malformed request as an input error', async () => {
    const badMode = await save(db(), respondent(DIST), { ...SAVE, Mode: 'complete' });
    expect(badMode.ResultCode).toBe('EXECUTION_ERROR');
    expect(badMode.ErrorMessage).toBe('Forms.SaveResponse: Mode must be one of partial, final.');

    const noAnswerId = await save(db(), respondent(DIST), { ...SAVE, Answers: [{ TextValue: 'x' }] });
    expect(noAnswerId.ErrorMessage).toBe('Forms.SaveResponse: every answer needs a QuestionID.');

    const noClientId = await save(db(), respondent(DIST), { ...SAVE, ClientResponseID: '' });
    expect(noClientId.ErrorMessage).toBe('Forms.SaveResponse: ClientResponseID is required.');
  });
});
