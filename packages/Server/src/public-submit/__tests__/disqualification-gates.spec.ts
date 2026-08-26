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
        conditionalRule: { show: { all: [{ questionId: 'age', op: 'equals', value: 'No' }] } },
      },
      { id: 'end-ok', screenType: 'Ending', title: 'Thanks', displayOrder: 2, isDefault: true },
    ],
  };
}

function contextFor(
  definition: PublishedFormDefinition,
  quota: { maxResponses: number | null; responseCount: number },
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
