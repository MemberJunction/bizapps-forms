import { describe, expect, it } from 'vitest';
import type {
  PublishedFormDefinition,
  PublishedFormPage,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { parsePublishedDefinition } from '../snapshot-parser';
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

describe('requiredness on the server, after the require verb was removed (C1)', () => {
  /**
   * A published snapshot is a frozen JSON blob that no migration rewrites, so forms published
   * before RULES_SIMPLIFICATION_PLAN Phase 1 still carry `require` groups. This is the path
   * those forms take now, end to end: raw snapshot -> parse -> validate. It goes through
   * `parsePublishedDefinition` deliberately rather than hand-building a definition, because the
   * strip is the parser's doing and a hand-built fixture could not express the legacy shape at
   * all now that the key is off the type.
   */
  function legacySnapshot(extraRule: Record<string, unknown> = {}): string {
    return JSON.stringify(
      definition([
        {
          id: 'p1',
          displayOrder: 0,
          questions: [
            question('q1'),
            {
              ...question('q2'),
              conditionalRule: {
                ...extraRule,
                require: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] },
              },
            },
          ],
        },
      ]),
    );
  }

  describe('happy', () => {
    it('a legacy require group no longer makes an optional question required', () => {
      // Before the removal this submission was rejected: q1 answered 'Other' armed q2's require
      // group, and q2 is blank. The static Required toggle is the whole truth now, and it is off.
      const parsed = parsePublishedDefinition(legacySnapshot());
      expect(parsed).toBeDefined();

      const outcome = validateSubmission(parsed!, [{ questionId: 'q1', textValue: 'Other' }], 'complete');

      expect(outcome.errors).toEqual([]);
    });

    it('the parse drops the key rather than the question', () => {
      const parsed = parsePublishedDefinition(legacySnapshot());
      const q2 = parsed!.pages[0].questions[1];

      expect(q2.id).toBe('q2');
      expect(q2.conditionalRule).toEqual({});
    });
  });

  describe('edge', () => {
    it('a show rule on the same item survives the strip', () => {
      // The worst way to get this wrong is to reject the whole rule: q2's show gate would
      // vanish and the question would be visible to everyone.
      const parsed = parsePublishedDefinition(
        legacySnapshot({ show: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] } }),
      );

      expect(parsed!.pages[0].questions[1].conditionalRule).toEqual({
        show: { all: [{ questionId: 'q1', op: 'equals', value: 'Other' }] },
      });
    });
  });

  describe('worst', () => {
    it('hidden dominates required: a question hidden by show is never required (invariant 2)', () => {
      // The invariant that outlived the verb. It reads on the static flag now, and it is the
      // one that actually matters in production: a required question the respondent cannot see
      // is an unsubmittable form with no visible cause.
      const hiddenButRequired: PublishedFormPage[] = [
        {
          id: 'p1',
          displayOrder: 0,
          questions: [
            question('q1'),
            question('q2', {
              isRequired: true,
              conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'never' }] } },
            }),
          ],
        },
      ];

      const outcome = validateSubmission(
        definition(hiddenButRequired),
        [{ questionId: 'q1', textValue: 'something-else' }],
        'complete',
      );

      expect(outcome.errors).toEqual([]);
    });

    it('a required question that IS visible still fails the submission', () => {
      // The other half of the same invariant — without this, "hidden dominates" would be
      // indistinguishable from "requiredness stopped being enforced at all".
      const shownAndRequired: PublishedFormPage[] = [
        {
          id: 'p1',
          displayOrder: 0,
          questions: [
            question('q1'),
            question('q2', {
              isRequired: true,
              conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'yes' }] } },
            }),
          ],
        },
      ];

      const outcome = validateSubmission(
        definition(shownAndRequired),
        [{ questionId: 'q1', textValue: 'yes' }],
        'complete',
      );

      expect(outcome.errors.map((e) => e.questionId)).toEqual(['q2']);
    });
  });
});

describe('jump-to-page on the server (C2)', () => {
  const pages: PublishedFormPage[] = [
    {
      id: 'p1',
      displayOrder: 0,
      conditionalRule: {
        jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'skip' }] }, target: { kind: 'page', id: 'p3' } }],
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
      const outcome = validateSubmission(definition(pages), [{ questionId: 'q1', textValue: 'skip' }], 'complete');
      expect(outcome.errors).toEqual([]);
    });

    it('with no jump the skipped page is reachable and its required question enforced', () => {
      const outcome = validateSubmission(definition(pages), [{ questionId: 'q1', textValue: 'stay' }], 'complete');
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
        'complete',
      );
      expect(outcome.errors).toEqual([]);
      expect(outcome.answers.map((a) => a.question.id).sort()).toEqual(['q1', 'q3']);
    });
  });
});

/**
 * Question-level `Go to` on the server (QUESTION_LEVEL_LOGIC_PLAN §4).
 *
 * The page-level cases above pass for a reason that does not generalise: a skipped PAGE
 * disappears from `resolveVisiblePages`, so iterating that resolver's output happens to drop it.
 * A question jump hides questions WITHIN a page the walk already entered, and a terminal jump
 * ends the form mid-page — neither is expressible as "which pages are reachable".
 *
 * This is the plan's own named worst case: the server must not reject a submission naming a
 * field the respondent never saw. On the anonymous path that failure is unrecoverable — every
 * retry sends the identical payload — so it is the one class of validation bug that cannot be
 * worked around by the respondent.
 */
describe('question-level Go to on the server', () => {
  /** One page: a trigger, then two required questions after it. */
  function onePage(target: PublishedFormQuestion['conditionalRule']): PublishedFormPage[] {
    return [
      {
        id: 'p1',
        displayOrder: 0,
        questions: [
          question('q1', { conditionalRule: target }),
          question('q2', { isRequired: true, displayOrder: 1 }),
          question('q3', { isRequired: true, displayOrder: 2 }),
        ],
      },
      { id: 'p2', displayOrder: 1, questions: [question('q4', { isRequired: true })] },
    ];
  }

  const toSubmit = onePage({
    jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'Soham' }] }, target: { kind: 'submit' } }],
  });
  const toQ3 = onePage({
    jump: [
      { when: { all: [{ questionId: 'q1', op: 'equals', value: 'Soham' }] }, target: { kind: 'question', id: 'q3' } },
    ],
  });

  describe('happy', () => {
    it('a jump to Submit waives every required question after it, on its own page and beyond', () => {
      const outcome = validateSubmission(definition(toSubmit), [{ questionId: 'q1', textValue: 'Soham' }], 'complete');
      expect(outcome.errors).toEqual([]);
    });

    it('a jump to a later question waives only what it skipped over', () => {
      const outcome = validateSubmission(
        definition(toQ3),
        [
          { questionId: 'q1', textValue: 'Soham' },
          { questionId: 'q3', textValue: 'answered' },
        ],
        'complete',
      );
      // q2 was jumped over; q3 (the landing point) and q4 are still asked.
      expect(outcome.errors.map((e) => e.questionId)).toEqual(['q4']);
    });
  });

  describe('edge', () => {
    it('an unfired jump leaves every required question in force', () => {
      const outcome = validateSubmission(definition(toSubmit), [{ questionId: 'q1', textValue: 'someone else' }], 'complete');
      expect(outcome.errors.map((e) => e.questionId)).toEqual(['q2', 'q3', 'q4']);
    });
  });

  describe('worst', () => {
    it('a skipped question\'s answer is DROPPED, so a crafted payload cannot revive it', () => {
      const outcome = validateSubmission(
        definition(toQ3),
        [
          { questionId: 'q1', textValue: 'Soham' },
          { questionId: 'q2', textValue: 'smuggled' },
          { questionId: 'q3', textValue: 'answered' },
          { questionId: 'q4', textValue: 'answered' },
        ],
        'complete',
      );
      expect(outcome.errors).toEqual([]);
      expect(outcome.answers.map((a) => a.question.id)).toEqual(['q1', 'q3', 'q4']);
    });

    it('nothing after a terminal jump is persisted, whatever the payload claims', () => {
      const outcome = validateSubmission(
        definition(toSubmit),
        [
          { questionId: 'q1', textValue: 'Soham' },
          { questionId: 'q2', textValue: 'smuggled' },
          { questionId: 'q4', textValue: 'smuggled' },
        ],
        'complete',
      );
      expect(outcome.errors).toEqual([]);
      expect(outcome.answers.map((a) => a.question.id)).toEqual(['q1']);
    });
  });
});
