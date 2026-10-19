import { beforeEach, describe, expect, it } from 'vitest';
import { resolveResponseOutcome, type PublishedFormDefinition, type PublishedFormQuestion } from '@mj-biz-apps/forms-entities';
import { saveThroughEngine, recordingQueue, type EngineSaveContext, type EngineSaveSubmission } from './harness.js';
import { FormsRateLimiter } from '../../../submission/rate-limit.js';
import { resetPublicSubmitConfigForTests } from '../../../submission/config.js';
import {
  makeContextUser,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
} from '../../../testing/index.js';

/**
 * WHAT THE SERVER SCORES OVER (RULES_AND_BRANCHING_PLAN C4).
 *
 * The widget submits only the questions it is showing, so a well-behaved client never exercises
 * this. That is exactly why it belongs here: the mutation is reachable without the widget, and
 * the score decides which ending screen — which copy, which redirect, which score-gated
 * automations — the respondent gets. Whatever the server counts must be what the widget counted,
 * or the two disagree about the same submission and only the server's half is attacker-movable.
 */

function question(id: string, extra?: Partial<PublishedFormQuestion>): PublishedFormQuestion {
  return { id, type: 'ShortText', prompt: id, isRequired: false, displayOrder: 0, options: [], ...extra };
}

/** A form where one scored question is revealed only by answering `gate` with "Yes". */
function scoredDefinition(): PublishedFormDefinition {
  return {
    formId: 'form-1',
    formVersionId: 'ver-1',
    name: 'Assessment',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false, confirmationMessage: 'Default thanks.' },
    styleTokens: { cssVariables: {} },
    pages: [
      {
        id: 'page-1',
        displayOrder: 1,
        questions: [
          question('gate', { displayOrder: 1 }),
          question('bonus', {
            displayOrder: 2,
            conditionalRule: { show: { all: [{ questionId: 'gate', op: 'equals', value: 'Yes' }] } },
            scoring: { points: { Gold: 100 } },
          }),
        ],
      },
    ],
    automations: [],
    endScreens: [
      {
        id: 'end-high',
        screenType: 'Ending',
        title: 'Qualified',
        displayOrder: 1,
        conditionalRule: { show: { all: [{ source: 'score', op: 'greaterThan', value: 50 }] } },
      },
      { id: 'end-low', screenType: 'Ending', title: 'Not qualified', displayOrder: 2, isDefault: true },
    ],
  };
}

function contextFor(definition: PublishedFormDefinition): EngineSaveContext {
  const fake = makeFakeProvider({
    distribution: makeDistribution({ CaptchaRequired: false, MaxResponses: null, ResponseCount: 0 }),
    version: makeVersion(definition),
    createPermissions: respondentPermissions(),
  });
  return {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: 'sess-score',
  };
}

function submit(definition: PublishedFormDefinition, answers: Array<{ questionId: string; textValue: string }>) {
  return saveThroughEngine(contextFor(definition), {
    distributionSlug: 'slug-1',
    formVersionId: 'ver-1',
    answers,
  });
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
});

describe('the score the server bands on', () => {
  describe('happy', () => {
    it('counts a scored question the respondent could actually see', async () => {
      const result = await submit(scoredDefinition(), [
        { questionId: 'gate', textValue: 'Yes' },
        { questionId: 'bonus', textValue: 'Gold' },
      ]);

      expect(result.success).toBe(true);
      expect(result.confirmationMessage).toBe('Qualified');
    });

    it('bands low when nothing scored', async () => {
      const result = await submit(scoredDefinition(), [{ questionId: 'gate', textValue: 'No' }]);

      expect(result.confirmationMessage).toBe('Not qualified');
    });
  });

  describe('worst', () => {
    it('ignores an answer to a question hidden by its own show rule', async () => {
      // The submission claims 100 points from `bonus`, which `gate: No` hides. The server drops
      // that answer before persisting it — so counting it toward the score handed the caller an
      // ending screen their own answers do not earn, chosen by a value they controlled.
      const result = await submit(scoredDefinition(), [
        { questionId: 'gate', textValue: 'No' },
        { questionId: 'bonus', textValue: 'Gold' },
      ]);

      expect(result.success).toBe(true);
      expect(result.confirmationMessage).toBe('Not qualified');
    });
  });
});

/**
 * DW13, the server half: the ending a live submit returns is the screen `resolveResponseOutcome`
 * picks for the same answers — the one function the author's Preview resolves through in the widget
 * (forms-ng `widget/preview.spec.ts` pins that half). So a score-gated ending cannot differ between
 * what an author previews and what a respondent gets (#75).
 */
describe('the ending a submit returns is the one Preview resolves (DW13)', () => {
  it.each([
    [[{ questionId: 'gate', textValue: 'Yes' }, { questionId: 'bonus', textValue: 'Gold' }]],
    [[{ questionId: 'gate', textValue: 'No' }]],
    [[{ questionId: 'gate', textValue: 'No' }, { questionId: 'bonus', textValue: 'Gold' }]],
  ])('answers %j', async (answers) => {
    const definition = scoredDefinition();
    const result = await submit(definition, answers);
    const preview = resolveResponseOutcome(definition, new Map(answers.map((a) => [a.questionId, a.textValue])));
    expect(result.success).toBe(true);
    expect(result.ending?.id).toBe(preview.outcome.screen?.id);
  });
});
