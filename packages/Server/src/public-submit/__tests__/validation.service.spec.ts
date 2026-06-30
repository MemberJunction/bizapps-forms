import { describe, expect, it } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { validateSubmission } from '../validation.service';

/** A definition where q-other is shown only when q-choice equals 'Other'. */
function conditionalDefinition(): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'Conditional',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          { id: 'q-choice', type: 'SingleChoice', prompt: 'Pick', isRequired: true, displayOrder: 1, options: [] },
          {
            id: 'q-other',
            type: 'ShortText',
            prompt: 'Specify',
            isRequired: true,
            displayOrder: 2,
            conditionalRule: { show: { all: [{ questionId: 'q-choice', op: 'equals', value: 'Other' }] } },
            options: [],
          },
        ],
      },
    ],
  };
}

describe('validateSubmission', () => {
  it('drops a hidden conditional answer and does not require it', () => {
    const outcome = validateSubmission(conditionalDefinition(), [{ questionId: 'q-choice', textValue: 'Yes' }], false);
    expect(outcome.errors).toHaveLength(0);
    expect(outcome.answers.map((a) => a.question.id)).toEqual(['q-choice']);
  });

  it('requires the conditional answer when its trigger condition is met', () => {
    const outcome = validateSubmission(conditionalDefinition(), [{ questionId: 'q-choice', textValue: 'Other' }], false);
    expect(outcome.errors.some((e) => e.questionId === 'q-other')).toBe(true);
  });

  it('keeps a visible conditional answer when both questions are answered', () => {
    const outcome = validateSubmission(
      conditionalDefinition(),
      [
        { questionId: 'q-choice', textValue: 'Other' },
        { questionId: 'q-other', textValue: 'Detail' },
      ],
      false,
    );
    expect(outcome.errors).toHaveLength(0);
    expect(outcome.answers).toHaveLength(2);
  });

  it('enforces a ValidationRule pattern', () => {
    const def: PublishedFormDefinition = {
      formId: 'f',
      formVersionId: 'v',
      name: 'Pattern',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      pages: [
        {
          id: 'p',
          displayOrder: 1,
          questions: [
            {
              id: 'q-zip',
              type: 'ShortText',
              prompt: 'ZIP',
              isRequired: true,
              displayOrder: 1,
              validationRule: { pattern: '\\d{5}', patternMessage: 'Five digits required.' },
              options: [],
            },
          ],
        },
      ],
    };
    const bad = validateSubmission(def, [{ questionId: 'q-zip', textValue: 'abc' }], false);
    expect(bad.errors[0].message).toBe('Five digits required.');

    const good = validateSubmission(def, [{ questionId: 'q-zip', textValue: '12345' }], false);
    expect(good.errors).toHaveLength(0);
  });

  it('skips required enforcement for partial submissions', () => {
    const outcome = validateSubmission(conditionalDefinition(), [], true);
    expect(outcome.errors).toHaveLength(0);
  });
});
