import { describe, expect, it } from 'vitest';
import type {
  PublishedFormDefinition,
  PublishedFormPage,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { validateSubmission } from '../validation.service';

/**
 * Server-side enforcement of the rule verbs (RULES_AND_BRANCHING_PLAN C1/C2). The evaluators'
 * own semantics live in the contract specs; THESE prove the server actually consults them —
 * the mutation is reachable without the widget, so a verb enforced only client-side is not
 * enforced at all.
 */

function question(id: string, overrides?: Partial<PublishedFormQuestion>): PublishedFormQuestion {
  return {
    id,
    type: 'ShortText',
    prompt: id,
    isRequired: false,
    displayOrder: 0,
    options: [],
    ...overrides,
  };
}

function definition(pages: PublishedFormPage[]): PublishedFormDefinition {
  return {
    formId: 'form-1',
    formVersionId: 'version-1',
    name: 'Rule verbs fixture',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: {},
    pages,
    automations: [],
    endScreens: [],
  };
}

describe('require-if on the server (C1)', () => {
  const pages: PublishedFormPage[] = [
    {
      id: 'p1',
      displayOrder: 0,
      questions: [
        question('q1'),
        question('q2', {
          conditionalRule: { require: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] } },
        }),
      ],
    },
  ];

  describe('happy', () => {
    it('an unmet require group leaves the question optional', () => {
      const outcome = validateSubmission(definition(pages), [{ questionId: 'q1', textValue: 'Red' }], false);
      expect(outcome.errors).toEqual([]);
    });

    it('a met require group makes the unanswered question an error', () => {
      const outcome = validateSubmission(definition(pages), [{ questionId: 'q1', textValue: 'Other' }], false);
      expect(outcome.errors.map((e) => e.questionId)).toEqual(['q2']);
    });
  });

  describe('edge', () => {
    it('answering the now-required question satisfies it', () => {
      const outcome = validateSubmission(
        definition(pages),
        [
          { questionId: 'q1', textValue: 'Other' },
          { questionId: 'q2', textValue: 'details' },
        ],
        false,
      );
      expect(outcome.errors).toEqual([]);
    });

    it('partial saves never enforce requiredness, conditional or not', () => {
      const outcome = validateSubmission(definition(pages), [{ questionId: 'q1', textValue: 'Other' }], true);
      expect(outcome.errors).toEqual([]);
    });
  });

  describe('worst', () => {
    it('hidden dominates required: a question hidden by show is never required (invariant 2)', () => {
      const hiddenButRequired: PublishedFormPage[] = [
        {
          id: 'p1',
          displayOrder: 0,
          questions: [
            question('q1'),
            question('q2', {
              conditionalRule: {
                show: { all: [{ questionId: 'q1', op: 'equals', value: 'never' }] },
                require: { all: [{ questionId: 'q1', op: 'isAnswered' }] },
              },
            }),
          ],
        },
      ];
      const outcome = validateSubmission(
        definition(hiddenButRequired),
        [{ questionId: 'q1', textValue: 'something-else' }],
        false,
      );
      expect(outcome.errors).toEqual([]);
    });
  });
});

describe('jump-to-page on the server (C2)', () => {
  const pages: PublishedFormPage[] = [
    {
      id: 'p1',
      displayOrder: 0,
      conditionalRule: {
        jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'skip' }] }, toPageId: 'p3' }],
      },
      questions: [question('q1')],
    },
    {
      id: 'p2',
      displayOrder: 1,
      questions: [question('q2', { isRequired: true }), question('q2b')],
    },
    { id: 'p3', displayOrder: 2, questions: [question('q3')] },
  ];

  describe('happy', () => {
    it('a fired jump waives the skipped page, required questions included', () => {
      const outcome = validateSubmission(definition(pages), [{ questionId: 'q1', textValue: 'skip' }], false);
      expect(outcome.errors).toEqual([]);
    });

    it('with no jump the skipped page is reachable and its required question enforced', () => {
      const outcome = validateSubmission(definition(pages), [{ questionId: 'q1', textValue: 'stay' }], false);
      expect(outcome.errors.map((e) => e.questionId)).toEqual(['q2']);
    });
  });

  describe('worst', () => {
    it("a jumped-over page's answers are DROPPED — a client cannot smuggle them through", () => {
      const outcome = validateSubmission(
        definition(pages),
        [
          { questionId: 'q1', textValue: 'skip' },
          { questionId: 'q2b', textValue: 'smuggled' },
          { questionId: 'q3', textValue: 'kept' },
        ],
        false,
      );
      expect(outcome.errors).toEqual([]);
      expect(outcome.answers.map((a) => a.question.id).sort()).toEqual(['q1', 'q3']);
    });
  });
});
