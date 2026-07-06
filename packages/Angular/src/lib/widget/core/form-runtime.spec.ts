import { describe, it, expect } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { FormRuntime } from './form-runtime';

/** A small two-page form with a conditional follow-up + a required field. */
function makeDefinition(): PublishedFormDefinition {
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Test',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [
          {
            id: 'q-color',
            type: 'SingleChoice',
            prompt: 'Favorite color',
            isRequired: true,
            displayOrder: 1,
            options: [
              { id: 'o1', label: 'Blue', value: 'blue', displayOrder: 1 },
              { id: 'o2', label: 'Other', value: 'other', displayOrder: 2 },
            ],
          },
          {
            id: 'q-other',
            type: 'ShortText',
            prompt: 'Which color?',
            isRequired: true,
            displayOrder: 2,
            options: [],
            conditionalRule: { show: { all: [{ questionId: 'q-color', op: 'equals', value: 'other' }] } },
          },
          {
            id: 'q-note',
            type: 'Statement',
            prompt: 'Thanks!',
            isRequired: false,
            displayOrder: 3,
            options: [],
          },
        ],
      },
    ],
  };
}

describe('FormRuntime', () => {
  it('hides a conditional question until its trigger is met', () => {
    const rt = new FormRuntime(makeDefinition());
    const page = rt.visiblePages()[0];
    expect(rt.visibleQuestions(page).map((q) => q.id)).toEqual(['q-color', 'q-note']);

    rt.setValue('q-color', 'other');
    expect(rt.visibleQuestions(page).map((q) => q.id)).toEqual(['q-color', 'q-other', 'q-note']);
  });

  it('excludes Statement questions from the answerable set', () => {
    const rt = new FormRuntime(makeDefinition());
    expect(rt.visibleAnswerableQuestions().some((q) => q.type === 'Statement')).toBe(false);
  });

  it('computes progress over visible answerable questions', () => {
    const rt = new FormRuntime(makeDefinition());
    expect(rt.progress()).toBe(0); // q-color unanswered, q-other hidden
    rt.setValue('q-color', 'blue');
    expect(rt.progress()).toBe(1); // only q-color is answerable while q-other is hidden
  });

  it('is invalid while a required visible question is empty', () => {
    const rt = new FormRuntime(makeDefinition());
    expect(rt.isFormValid()).toBe(false);
    rt.setValue('q-color', 'blue');
    expect(rt.isFormValid()).toBe(true);
  });

  it('re-requires the conditional question once it becomes visible', () => {
    const rt = new FormRuntime(makeDefinition());
    rt.setValue('q-color', 'other');
    expect(rt.isFormValid()).toBe(false); // q-other now visible + required + empty
    rt.setValue('q-other', 'teal');
    expect(rt.isFormValid()).toBe(true);
  });

  it('builds wire answers only for visible answered questions', () => {
    const rt = new FormRuntime(makeDefinition());
    rt.setValue('q-color', 'blue');
    const inputs = rt.buildAnswerInputs();
    expect(inputs).toEqual([{ questionId: 'q-color', textValue: 'blue' }]);
  });
});
