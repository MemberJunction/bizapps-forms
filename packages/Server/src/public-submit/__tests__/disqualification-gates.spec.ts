import { beforeEach, describe, expect, it } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { runSubmitPipeline, type PipelineContext } from '../submit-pipeline';
import { FormsRateLimiter } from '../rate-limit.service';
import { resetPublicSubmitConfigForTests } from '../config';
import {
  makeContextUser,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
} from './fakes';

/**
 * WHERE THE KNOCKOUT SITS AMONG THE GATES (RULES_AND_BRANCHING_PLAN C3).
 *
 * `Disqualified` is a third terminal status, and `persistence.service` was taught about it while
 * the two gates in front of persistence were not. Both of them run on completion only, both of
 * them can refuse a submission outright, and neither has anything to do with a respondent who is
 * being screened out:
 *
 *   - QUOTA counts completions. A knockout is never counted (`countsCompletion` says so), so a
 *     full form refusing one is refusing a response that would not have consumed a slot — and
 *     refusing it means no `Disqualified` row is written at all.
 *   - DEDUPE recognises only `Complete`, so a retry of an already-recorded knockout is not
 *     recognised as the repeat it is and falls through to the gate above.
 *
 * Resolving the knockout BEFORE the gates is what makes both cases fall out: it is a pure
 * function of the answers, so nothing forces it to run after the I/O.
 */

function knockoutDefinition(): PublishedFormDefinition {
  return {
    formId: 'form-1',
    formVersionId: 'ver-1',
    name: 'Screener',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false, confirmationMessage: 'Default thanks.' },
    styleTokens: { cssVariables: {} },
    pages: [
      {
        id: 'page-1',
        displayOrder: 1,
        questions: [
          {
            id: 'age',
            type: 'ShortText',
            prompt: 'Are you 18 or older?',
            isRequired: true,
            displayOrder: 1,
            options: [],
            // The knockout is a `Go to` on the QUESTION naming the screen, not a rule living on
            // the screen (QUESTION_LEVEL_LOGIC_PLAN decision 4). What makes it a knockout rather
            // than an early completion is the screen's own `isDisqualification` flag below.
            conditionalRule: {
              jump: [
                {
                  when: { all: [{ questionId: 'age', op: 'equals', value: 'No' }] },
                  target: { kind: 'ending', id: 'end-ko' },
                },
              ],
            },
          },
        ],
      },
    ],
    automations: [],
    endScreens: [
      {
        id: 'end-ko',
        screenType: 'Ending',
        title: 'Not eligible',
        displayOrder: 1,
        isDisqualification: true,
      },
      { id: 'end-ok', screenType: 'Ending', title: 'Thanks', displayOrder: 2, isDefault: true },
    ],
  };
}

/**
 * `clientIpHash` is supplied by default and deliberately: `rateLimitGatesFor` OMITS the per-IP
 * and completion ceilings entirely when no address resolves, so a context without one cannot
 * exercise them — a test of the completion budget would pass against a gate that never ran.
 */
function contextFor(
  definition: PublishedFormDefinition,
  quota: { maxResponses: number | null; responseCount: number },
  clientIpHash = 'ip-hash-ko',
): { ctx: PipelineContext; saved: () => ReturnType<typeof makeFakeProvider>['saved'] } {
  const fake = makeFakeProvider({
    distribution: makeDistribution({
      CaptchaRequired: false,
      MaxResponses: quota.maxResponses,
      ResponseCount: quota.responseCount,
    }),
    version: makeVersion(definition),
    createPermissions: respondentPermissions(),
  });
  return {
    ctx: {
      provider: fake.provider,
      contextUser: makeContextUser(),
      elevatedUser: makeContextUser(),
      sessionId: 'sess-ko',
      clientIpHash,
      fireHooks: async () => {},
    },
    saved: () => fake.saved,
  };
}

function submit(ctx: PipelineContext, answer: string) {
  return runSubmitPipeline(ctx, {
    distributionSlug: 'slug-1',
    formVersionId: 'ver-1',
    answers: [{ questionId: 'age', textValue: answer }],
  });
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  delete process.env.FORMS_MAX_PARTIALS_PER_VERSION;
  delete process.env.FORMS_COMPLETION_MAX;
  delete process.env.FORMS_KNOCKOUT_MAX;
  resetPublicSubmitConfigForTests();
});

describe('a knockout against a full form', () => {
  describe('happy', () => {
    it('records the disqualification instead of reporting the quota', async () => {
      const { ctx, saved } = contextFor(knockoutDefinition(), { maxResponses: 5, responseCount: 5 });

      const result = await submit(ctx, 'No');

      expect(result.success).toBe(true);
      expect(result.status).toBe('Disqualified');
      expect(result.confirmationMessage).toBe('Not eligible');
      expect(saved().some((r) => r.entityName.includes('Form Responses'))).toBe(true);
    });
  });

  describe('edge', () => {
    it('still refuses a QUALIFYING respondent once the quota is full', async () => {
      // The knockout exemption must not become a hole in the quota. Only a response that could
      // never have been counted is exempt from the cap that counts them.
      const { ctx } = contextFor(knockoutDefinition(), { maxResponses: 5, responseCount: 5 });

      const result = await submit(ctx, 'Yes');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.message ?? '').toMatch(/no longer accepting/i);
    });

    it('records a knockout normally when there is no quota at all', async () => {
      const { ctx } = contextFor(knockoutDefinition(), { maxResponses: null, responseCount: 0 });

      const result = await submit(ctx, 'No');

      expect(result.status).toBe('Disqualified');
    });
  });
});

describe('retrying a submission that was already disqualified', () => {
  const CLIENT_ID = '11111111-2222-4333-8444-555555555555';

  function contextWithExistingKnockout(quota: { maxResponses: number | null; responseCount: number }) {
    const fake = makeFakeProvider({
      distribution: makeDistribution({
        CaptchaRequired: false,
        MaxResponses: quota.maxResponses,
        ResponseCount: quota.responseCount,
      }),
      version: makeVersion(knockoutDefinition()),
      createPermissions: respondentPermissions(),
      existingResponses: [
        {
          ID: CLIENT_ID,
          Status: 'Disqualified',
          FormVersionID: 'ver-1',
          AnonymousSessionID: 'sess-ko',
          SourceMetadata: JSON.stringify({ clientResponseId: CLIENT_ID }),
        },
      ],
    });
    return {
      ctx: {
        provider: fake.provider,
        contextUser: makeContextUser(),
        elevatedUser: makeContextUser(),
        sessionId: 'sess-ko',
        fireHooks: async () => {},
      } satisfies PipelineContext,
      saved: () => fake.saved,
    };
  }

  describe('happy', () => {
    it('answers idempotently with the original id and status', async () => {
      const { ctx } = contextWithExistingKnockout({ maxResponses: null, responseCount: 0 });

      const result = await runSubmitPipeline(ctx, {
        distributionSlug: 'slug-1',
        formVersionId: 'ver-1',
        clientResponseId: CLIENT_ID,
        answers: [{ questionId: 'age', textValue: 'No' }],
      });

      expect(result.success).toBe(true);
      expect(result.responseId).toBe(CLIENT_ID);
      expect(result.status).toBe('Disqualified');
    });

    it('shows the knockout copy again, never the form confirmation', async () => {
      const { ctx } = contextWithExistingKnockout({ maxResponses: null, responseCount: 0 });

      const result = await runSubmitPipeline(ctx, {
        distributionSlug: 'slug-1',
        formVersionId: 'ver-1',
        clientResponseId: CLIENT_ID,
        answers: [{ questionId: 'age', textValue: 'No' }],
      });

      expect(result.confirmationMessage).toBe('Not eligible');
    });
  });

  describe('edge', () => {
    it('recognises the sealed row from the SESSION when the client id is new', async () => {
      // The client id is NOT stable across a widget reload — `MjFormComponent.load()` mints a
      // fresh one every time — while the session id is. And the mutation is reachable without
      // the widget at all, so "send a new client id" is a one-line way to ask for a second bite.
      // Session dedupe is what closes that, and it only ever looked for `Complete`: a session
      // already sealed as `Disqualified` was not recognised, so the pipeline ran on and wrote a
      // SECOND terminal row for it — repeatably, and consuming a quota slot each time the retry
      // happened to qualify.
      const { ctx, saved } = contextWithExistingKnockout({ maxResponses: null, responseCount: 0 });

      const result = await runSubmitPipeline(ctx, {
        distributionSlug: 'slug-1',
        formVersionId: 'ver-1',
        clientResponseId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        answers: [{ questionId: 'age', textValue: 'Yes' }],
      });

      expect(result.responseId).toBe(CLIENT_ID);
      expect(result.status).toBe('Disqualified');
      expect(saved().filter((r) => r.entityName.includes('Form Responses'))).toHaveLength(0);
    });
  });

  describe('worst', () => {
    it('holds a changed retry to the terminal row, not to the quota', async () => {
      // The distinguishing case. The row is already `Disqualified`, but THESE answers no longer
      // trip the knockout — so nothing downstream knows this submission is terminal, and it ran
      // the full completion gauntlet: the quota gate refused it outright on a full form, and
      // when the quota had room it reached persistence, collided on the primary key, and was
      // rescued there — returning the form's "your response has been recorded" over a row that
      // says the opposite. Recognising the terminal status at DEDUPE is what stops both.
      const { ctx, saved } = contextWithExistingKnockout({ maxResponses: 5, responseCount: 5 });

      const result = await runSubmitPipeline(ctx, {
        distributionSlug: 'slug-1',
        formVersionId: 'ver-1',
        clientResponseId: CLIENT_ID,
        answers: [{ questionId: 'age', textValue: 'Yes' }],
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('Disqualified');
      expect(result.confirmationMessage).not.toBe('Thanks');
      expect(result.confirmationMessage).not.toBe('Default thanks.');
      expect(saved().filter((r) => r.entityName.includes('Form Responses'))).toHaveLength(0);
    });

    it('is not refused by a quota that filled up between the attempts', async () => {
      // The respondent's first attempt succeeded. Other people then filled the form. Their
      // retry — the same submission, same client id — must not come back as a hard refusal for
      // a slot it was never going to take.
      const { ctx, saved } = contextWithExistingKnockout({ maxResponses: 5, responseCount: 5 });

      const result = await runSubmitPipeline(ctx, {
        distributionSlug: 'slug-1',
        formVersionId: 'ver-1',
        clientResponseId: CLIENT_ID,
        answers: [{ questionId: 'age', textValue: 'No' }],
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('Disqualified');
      // Idempotent means idempotent: no second row.
      expect(saved().filter((r) => r.entityName.includes('Form Responses'))).toHaveLength(0);
    });
  });
});

describe('a knockout is still a row, and the row ceiling still applies', () => {
  /**
   * `Disqualified` is terminal, which is what makes it slip past the gates that bound growth:
   * the quota counts completions (a knockout is not one) and the row ceiling counted only
   * `Status='Partial'`. Between them, a caller who answers a knockout could create rows without
   * limit — as a partial, whose ceiling could not see the resulting status, and as a COMPLETE
   * submit, which skips the ceiling by construction and skips the quota because it is not a
   * completion. Neither needs a session or a client id.
   */
  function contextWithRows(existingRows: number) {
    const fake = makeFakeProvider({
      distribution: makeDistribution({ CaptchaRequired: false, MaxResponses: null, ResponseCount: 0 }),
      version: makeVersion(knockoutDefinition()),
      createPermissions: respondentPermissions(),
      formResponseCount: existingRows,
    });
    return {
      ctx: {
        provider: fake.provider,
        contextUser: makeContextUser(),
        elevatedUser: makeContextUser(),
        sessionId: '',
        fireHooks: async () => {},
      } satisfies PipelineContext,
      saved: () => fake.saved,
    };
  }

  function knockoutSubmit(ctx: PipelineContext, partial: boolean) {
    return runSubmitPipeline(ctx, {
      distributionSlug: 'slug-1',
      formVersionId: 'ver-1',
      partial,
      answers: [{ questionId: 'age', textValue: 'No' }],
    });
  }

  describe('worst', () => {
    it('refuses a knockout that would create a row past the ceiling — as a FINAL submit', async () => {
      process.env.FORMS_MAX_PARTIALS_PER_VERSION = '5';
      const { ctx, saved } = contextWithRows(5);

      const result = await knockoutSubmit(ctx, false);

      expect(result.success).toBe(false);
      expect(saved().filter((r) => r.entityName.includes('Form Responses'))).toHaveLength(0);
    });

    it('refuses it as a PARTIAL too', async () => {
      process.env.FORMS_MAX_PARTIALS_PER_VERSION = '5';
      const { ctx, saved } = contextWithRows(5);

      const result = await knockoutSubmit(ctx, true);

      expect(result.success).toBe(false);
      expect(saved().filter((r) => r.entityName.includes('Form Responses'))).toHaveLength(0);
    });
  });

  describe('happy', () => {
    it('records a knockout normally while there is room', async () => {
      process.env.FORMS_MAX_PARTIALS_PER_VERSION = '5';
      const { ctx } = contextWithRows(1);

      expect((await knockoutSubmit(ctx, false)).status).toBe('Disqualified');
    });
  });
});

describe('only a finished submission seals a knockout', () => {
  /**
   * The server judges a knockout on whatever the request carries, and an AUTOSAVE carries a value
   * the respondent has not finished typing. With the seal applied to partials, a respondent
   * answering `18` under `age lessThan 18` who paused for the 1500ms debounce after the `1` had
   * their response sealed `Disqualified` — and sealed is sealed, so correcting it to `18` was
   * impossible: dedupe hands the terminal row straight back.
   *
   * This is the server half of the same defect the widget had. Fixing only the client left the
   * authoritative side still judging half-typed values, which is the half that actually persists.
   *
   * A partial therefore records the answer and stays `Partial`. Enforcement is unaffected: the
   * final submit is what a client cannot avoid, and that pass still seals — a caller that
   * "forgets" it was disqualified is still disqualified the moment it tries to finish.
   */
  describe('happy', () => {
    it('a partial carrying a knockout answer stays Partial', async () => {
      const { ctx, saved } = contextFor(knockoutDefinition(), { maxResponses: null, responseCount: 0 });

      const result = await runSubmitPipeline(ctx, {
        distributionSlug: 'slug-1',
        formVersionId: 'ver-1',
        partial: true,
        answers: [{ questionId: 'age', textValue: 'No' }],
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('Partial');
      // The answer is still recorded — this is about the STATUS, not about dropping progress.
      expect(saved().some((r) => r.entityName.includes('Form Response Answers'))).toBe(true);
    });

    it('the final submit still seals it', async () => {
      const { ctx } = contextFor(knockoutDefinition(), { maxResponses: null, responseCount: 0 });

      const result = await runSubmitPipeline(ctx, {
        distributionSlug: 'slug-1',
        formVersionId: 'ver-1',
        answers: [{ questionId: 'age', textValue: 'No' }],
      });

      expect(result.status).toBe('Disqualified');
    });
  });

  describe('worst', () => {
    it('a half-typed value banked by autosave does not lock the respondent out', async () => {
      // `1` on its way to `18`. The rule fires on it, the autosave carries it, and the respondent
      // must still be able to finish.
      const { ctx } = contextFor(knockoutDefinition(), { maxResponses: null, responseCount: 0 });
      const client = '99999999-8888-4777-8666-555555555555';

      const banked = await runSubmitPipeline(ctx, {
        distributionSlug: 'slug-1',
        formVersionId: 'ver-1',
        partial: true,
        clientResponseId: client,
        answers: [{ questionId: 'age', textValue: 'No' }],
      });
      expect(banked.status).toBe('Partial');

      const corrected = await runSubmitPipeline(ctx, {
        distributionSlug: 'slug-1',
        formVersionId: 'ver-1',
        clientResponseId: client,
        answers: [{ questionId: 'age', textValue: 'Yes' }],
      });

      expect(corrected.status).toBe('Complete');
      expect(corrected.confirmationMessage).toBe('Thanks');
    });
  });
});

describe('a knockout does not spend the completion budget', () => {
  /**
   * Three rate ceilings guard this endpoint, and the tightest — the COMPLETION bucket — is tight
   * precisely because a completion is expensive: it fires on-submit automations, sends
   * confirmation emails, upserts bound records. A knockout does none of that; it is explicitly
   * excluded from every one of them. Charging it to that bucket anyway meant a burst of
   * ineligible respondents behind one NAT locked real completions out of a form for a minute.
   *
   * The knockout is now resolved before any gate charges anything, which is possible because it
   * is pure — it needs the definition and the answers, and nothing else.
   */
  describe('worst', () => {
    it('knockouts past the completion ceiling are still recorded', async () => {
      process.env.FORMS_COMPLETION_MAX = '2';
      process.env.FORMS_KNOCKOUT_MAX = '50';
      resetPublicSubmitConfigForTests();
      const { ctx } = contextFor(knockoutDefinition(), { maxResponses: null, responseCount: 0 });

      for (let i = 0; i < 5; i++) {
        const result = await submit(ctx, 'No');
        expect(result.success, `knockout ${i + 1} was refused`).toBe(true);
        expect(result.status).toBe('Disqualified');
      }
    });

    it('and leave the ceiling intact for real completions', async () => {
      process.env.FORMS_COMPLETION_MAX = '2';
      process.env.FORMS_KNOCKOUT_MAX = '50';
      resetPublicSubmitConfigForTests();
      const { ctx } = contextFor(knockoutDefinition(), { maxResponses: null, responseCount: 0 });

      // Three knockouts would have exhausted a ceiling of two.
      for (let i = 0; i < 3; i++) {
        await submit(ctx, 'No');
      }

      expect((await submit(ctx, 'Yes')).success).toBe(true);
    });
  });

  describe('edge', () => {
    it('a real completion still spends it', async () => {
      process.env.FORMS_COMPLETION_MAX = '1';
      resetPublicSubmitConfigForTests();
      const { ctx } = contextFor(knockoutDefinition(), { maxResponses: null, responseCount: 0 });

      expect((await submit(ctx, 'Yes')).success).toBe(true);
      const second = await submit(ctx, 'Yes');
      expect(second.success).toBe(false);
      expect(second.errors?.[0]?.message ?? '').toMatch(/too many|wait/i);
    });
  });
});

describe('knockouts get their own throttle, not a free pass', () => {
  /**
   * Both neighbouring answers are wrong. Charging knockouts to the COMPLETION bucket let a burst
   * of ineligible respondents behind one address lock real completions out of a form — that
   * bucket is tight because a completion fires automations a knockout never fires. Exempting them
   * entirely was the opposite mistake: each knockout writes a PERMANENT row, so with only the
   * 120/min save ceiling above it, the durable row ceiling fell roughly an order of magnitude
   * faster than it was sized for, and a saturated version stops recording anything at all.
   */
  it('a knockout burst is throttled by its own ceiling', async () => {
    process.env.FORMS_KNOCKOUT_MAX = '2';
    resetPublicSubmitConfigForTests();
    const { ctx } = contextFor(knockoutDefinition(), { maxResponses: null, responseCount: 0 });

    expect((await submit(ctx, 'No')).success).toBe(true);
    expect((await submit(ctx, 'No')).success).toBe(true);
    const third = await submit(ctx, 'No');
    expect(third.success).toBe(false);
    expect(third.errors?.[0]?.message ?? '').toMatch(/too many|wait/i);
  });

  it('and spends none of the completion budget doing it', async () => {
    process.env.FORMS_KNOCKOUT_MAX = '50';
    process.env.FORMS_COMPLETION_MAX = '2';
    // Gate (a) is 5 per (session, distribution) by default, and this sends six requests from one
    // session — without raising it, the sixth is refused by THAT ceiling and the test would be
    // reporting the wrong gate. Isolating one bucket means pinning the ones you are not testing.
    process.env.FORMS_RATELIMIT_MAX = '50';
    resetPublicSubmitConfigForTests();
    const { ctx } = contextFor(knockoutDefinition(), { maxResponses: null, responseCount: 0 });

    for (let i = 0; i < 5; i++) {
      expect((await submit(ctx, 'No')).success, `knockout ${i + 1}`).toBe(true);
    }
    expect((await submit(ctx, 'Yes')).success).toBe(true);
  });

  it('defaults to the completion ceiling when unset', async () => {
    process.env.FORMS_COMPLETION_MAX = '1';
    resetPublicSubmitConfigForTests();
    const { ctx } = contextFor(knockoutDefinition(), { maxResponses: null, responseCount: 0 });

    expect((await submit(ctx, 'No')).success).toBe(true);
    expect((await submit(ctx, 'No')).success).toBe(false);
  });
});
