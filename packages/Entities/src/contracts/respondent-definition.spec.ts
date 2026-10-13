import { describe, expect, it } from 'vitest';
import type { ConditionalRule } from './conditional-rule';
import type { PublishedFormDefinition } from './form-definition';
import {
  PUBLISHED_DEFINITION_KEY_DECISIONS,
  RESPONDENT_SETTING_KEYS,
  respondentFormDefinitionSchema,
  toRespondentDefinition,
} from './respondent-definition';
import { FORM_QUESTION_TYPES } from './question-types';
import type { PublishedFormPage, PublishedFormQuestion } from './form-definition';
import { settleVisibility } from './visibility';

/**
 * #302: the respondent payload was `{ ...definition, automations: [] }` — a DENYLIST, so every key a
 * later change added to the published snapshot shipped to every anonymous respondent by default.
 * Scoring tables, knockout endings, quota and redirect settings all reached the browser.
 * `toRespondentDefinition` builds the projection field by field instead; these pin what it may and
 * may not carry.
 */

/** A published definition with EVERY top-level key populated — a new key must be added here too. */
function fullDefinition(): Required<PublishedFormDefinition> {
  const knockoutJump: ConditionalRule = {
    jump: [
      { when: { all: [{ questionId: 'age', op: 'lessThan', value: 18 }] }, target: { kind: 'ending', id: 'end-ko' } },
      { when: { all: [{ questionId: 'age', op: 'greaterThan', value: 99 }] }, target: { kind: 'ending', id: 'end-thanks' } },
    ],
  };
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Eligibility',
    description: 'Check you qualify',
    renderMode: 'OneQuestion',
    settings: {
      anonymousAllowed: true,
      captchaRequired: true,
      quota: 100,
      opensAt: '2026-01-01T00:00:00Z',
      closesAt: '2027-01-01T00:00:00Z',
      confirmationMessage: 'Thanks!',
      redirectUrl: 'https://example.com/after',
      onSubmitMode: 'Configured',
    },
    styleTokens: { cssVariables: { '--mjf-accent': '#123456' }, customCSS: '.x{}', logoURL: '/forms/asset/logo' },
    pages: [
      {
        id: 'p1',
        title: 'About you',
        description: 'A few questions',
        displayOrder: 0,
        isPartialSubmitPoint: true,
        conditionalRule: { show: { any: [{ questionId: 'age', op: 'isAnswered' }, { source: 'score', op: 'greaterThan', value: 5 }] } },
        questions: [
          {
            id: 'age',
            type: 'Number',
            prompt: 'Your age',
            helpText: 'In years',
            isRequired: true,
            displayOrder: 0,
            validationRule: { min: 0, max: 130 },
            settings: { placeholder: 'e.g. 30' },
            options: [],
            conditionalRule: knockoutJump,
          },
          {
            id: 'colour',
            type: 'SingleChoice',
            prompt: 'Colour',
            isRequired: false,
            displayOrder: 1,
            scoring: { points: { red: 5, blue: 1 } },
            options: [
              { id: 'o1', label: 'Red', value: 'red', displayOrder: 0, isDefault: true },
              { id: 'o2', label: 'Blue', value: 'blue', displayOrder: 1 },
            ],
            // Folds to "shown once age is answered": the score half is never true while visibility
            // is decided, so only the other half of the `any` can show it.
            conditionalRule: {
              show: { any: [{ source: 'score', op: 'greaterThan', value: 3 }, { questionId: 'age', op: 'isAnswered' }] },
            },
          },
        ],
      },
    ],
    automations: [
      {
        id: 'a1',
        name: 'Upsert',
        targetType: 'Action',
        actionId: 'act',
        trigger: 'OnComplete',
        executionMode: 'Sync',
        displayOrder: 0,
        continueOnError: true,
        isActive: true,
      },
    ],
    welcomeScreen: {
      id: 'w1',
      screenType: 'Welcome',
      title: 'Hello',
      body: 'Welcome aboard',
      buttonLabel: 'Start',
      mediaURL: '/forms/asset/hero',
      displayOrder: 0,
    },
    endScreens: [
      { id: 'end-ko', screenType: 'Ending', title: 'Not eligible', displayOrder: 0, isDisqualification: true },
      {
        id: 'end-thanks',
        screenType: 'Ending',
        title: 'Thanks',
        displayOrder: 1,
        isDefault: true,
        conditionalRule: { show: { all: [{ source: 'score', op: 'greaterThan', value: 10 }] } },
      },
    ],
  };
}

/** Every key, at any depth, of a JSON value. */
function allKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => allKeys(item, into));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      allKeys(child, into);
    }
  }
  return into;
}

/** Every condition anywhere in the projection. */
function conditionsIn(value: unknown, into: Array<{ source?: string }> = []): Array<{ source?: string }> {
  if (Array.isArray(value)) {
    value.forEach((item) => conditionsIn(item, into));
  } else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('op' in record) {
      into.push(record as { source?: string });
    }
    Object.values(record).forEach((child) => conditionsIn(child, into));
  }
  return into;
}

describe('toRespondentDefinition', () => {
  it('records a decision for EVERY top-level PublishedFormDefinition key', () => {
    // The compile-time half: `PUBLISHED_DEFINITION_KEY_DECISIONS` is a `Record<keyof
    // PublishedFormDefinition, …>`, and `fullDefinition()` is `Required<PublishedFormDefinition>`,
    // so adding a key to the interface fails the build in both places until someone decides
    // whether respondents may see it. This is the runtime half, for the reviewer reading the diff.
    expect(Object.keys(PUBLISHED_DEFINITION_KEY_DECISIONS).sort()).toEqual(Object.keys(fullDefinition()).sort());
    expect(PUBLISHED_DEFINITION_KEY_DECISIONS).toEqual({
      formId: 'kept',
      formVersionId: 'kept',
      name: 'kept',
      description: 'kept',
      renderMode: 'kept',
      settings: 'reduced',
      styleTokens: 'kept',
      pages: 'reduced',
      automations: 'excluded',
      welcomeScreen: 'reduced',
      endScreens: 'excluded',
    });
  });

  it('carries no scoring, no ending screens, no automations, no quota, no redirect and no submit mode', () => {
    const keys = allKeys(toRespondentDefinition(fullDefinition()));
    for (const forbidden of ['scoring', 'points', 'endScreens', 'automations', 'quota', 'redirectUrl', 'redirectURL', 'onSubmitMode', 'isDisqualification', 'isDefault', 'anonymousAllowed']) {
      // `isDefault` on an OPTION is a render hint and is allowed; on an ENDING it is not. The only
      // `isDefault` that may appear is an option's — checked separately below.
      if (forbidden === 'isDefault') {
        continue;
      }
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
    const projection = toRespondentDefinition(fullDefinition());
    expect(projection.pages[0].questions[1].options[0].isDefault).toBe(true);
    expect(JSON.stringify(projection)).not.toContain('end-ko');
    expect(JSON.stringify(projection)).not.toContain('end-thanks');
  });

  it('carries no score condition and no knockout condition anywhere', () => {
    const projection = toRespondentDefinition(fullDefinition());
    expect(conditionsIn(projection).filter((c) => c.source === 'score')).toEqual([]);
    const targets = projection.pages.flatMap((p) => p.questions).flatMap((q) => q.conditionalRule?.jump ?? []).map((j) => j.target);
    expect(targets.some((t) => t.kind === 'ending')).toBe(false);
  });

  it('keeps what the widget needs to render', () => {
    const projection = toRespondentDefinition(fullDefinition());
    expect(projection).toMatchObject({
      formId: 'f1',
      formVersionId: 'v1',
      name: 'Eligibility',
      description: 'Check you qualify',
      renderMode: 'OneQuestion',
      captchaRequired: true,
      confirmationMessage: 'Thanks!',
      styleTokens: { cssVariables: { '--mjf-accent': '#123456' }, customCSS: '.x{}', logoURL: '/forms/asset/logo' },
      welcomeScreen: { id: 'w1', screenType: 'Welcome', title: 'Hello', body: 'Welcome aboard', buttonLabel: 'Start', mediaURL: '/forms/asset/hero', displayOrder: 0 },
    });
    const [age, colour] = projection.pages[0].questions;
    expect(age).toEqual({
      id: 'age',
      type: 'Number',
      prompt: 'Your age',
      helpText: 'In years',
      isRequired: true,
      displayOrder: 0,
      validationRule: { min: 0, max: 130 },
      settings: { placeholder: 'e.g. 30' },
      options: [],
      // The knockout jump is gone; the jump to an ordinary ending ends the form the same way but
      // names no screen — `submit` is as terminal in the walk as `ending`.
      conditionalRule: {
        jump: [{ when: { all: [{ questionId: 'age', op: 'greaterThan', value: 99 }] }, target: { kind: 'submit' } }],
      },
    });
    expect(colour.options.map((o) => o.value)).toEqual(['red', 'blue']);
    expect(projection.pages[0]).toMatchObject({ id: 'p1', title: 'About you', description: 'A few questions', isPartialSubmitPoint: true });
  });

  it('folds a score condition the way the walk reads it — never true while visibility is decided', () => {
    // Visibility is decided with no score (`EvalExtras`), so a score condition there is a constant
    // `false`. Dropping it would change the answer — an `any` group of only score conditions is
    // false, an empty one is vacuously TRUE — so the projection keeps the verdict and loses the
    // threshold. The proof is behavioural: the projection settles to the same questions.
    const published = fullDefinition();
    const projection = toRespondentDefinition(published);
    for (const answers of [new Map(), new Map([['age', 30]]), new Map<string, number | string>([['age', 30], ['colour', 'red']])]) {
      expect(settleVisibility(projection, answers).rendered.map((q) => q.id)).toEqual(
        settleVisibility(published, answers).rendered.map((q) => q.id),
      );
    }
  });

  it('keeps an ordinary ending jump terminal, so the respondent is not asked what the server never asks', () => {
    const published = fullDefinition();
    const projection = toRespondentDefinition(published);
    const answers = new Map([['age', 120]]);
    expect(settleVisibility(projection, answers).rendered.map((q) => q.id)).toEqual(
      settleVisibility(published, answers).rendered.map((q) => q.id),
    );
  });

  it('omits the welcome screen and optional copy when the published form has none', () => {
    const { welcomeScreen: _w, description: _d, ...rest } = fullDefinition();
    const projection = toRespondentDefinition({ ...rest, settings: { anonymousAllowed: true, captchaRequired: false } });
    expect('welcomeScreen' in projection).toBe(false);
    expect('description' in projection).toBe(false);
    expect('confirmationMessage' in projection).toBe(false);
    expect(projection.captchaRequired).toBe(false);
  });

  it('round-trips through its zod schema, which is what the widget will parse with', () => {
    const projection = toRespondentDefinition(fullDefinition());
    expect(respondentFormDefinitionSchema.parse(JSON.parse(JSON.stringify(projection)))).toEqual(projection);
  });

  it('has a schema that strips anything the projection does not carry', () => {
    const projection = toRespondentDefinition(fullDefinition());
    const smuggled = { ...projection, automations: [{ id: 'x' }], endScreens: [{ id: 'y' }] };
    const parsed = respondentFormDefinitionSchema.parse(smuggled);
    expect('automations' in parsed).toBe(false);
    expect('endScreens' in parsed).toBe(false);
  });

  it('has a schema that refuses a malformed projection', () => {
    const projection = toRespondentDefinition(fullDefinition());
    expect(() => respondentFormDefinitionSchema.parse({ ...projection, captchaRequired: 'yes' })).toThrow();
    expect(() => respondentFormDefinitionSchema.parse({ ...projection, pages: [{ id: 'p', displayOrder: 0, questions: [{ id: 'q' }] }] })).toThrow();
  });
});

/**
 * #303 review: per-question `settings` used to ship verbatim — an open JSON bag inside an otherwise
 * typed allowlist, writable by the AI designer and by paste. Only the keys the widget renders with
 * now ship, per question type.
 */
describe('toRespondentDefinition — question settings', () => {
  it('records a decision for EVERY question type, naming exactly the keys the widget renders with', () => {
    // `Record<FormQuestionType, …>` fails the build for a new type; this table is what a reviewer
    // reads, and the forms-ng spec `question-settings.spec.ts` fails when the builder offers a key
    // that is not listed here — so a new setting cannot reach respondents, or be silently dropped,
    // without someone deciding.
    expect(Object.keys(RESPONDENT_SETTING_KEYS).sort()).toEqual([...FORM_QUESTION_TYPES].sort());
    const nonEmpty = Object.fromEntries(Object.entries(RESPONDENT_SETTING_KEYS).filter(([, keys]) => keys.length > 0));
    expect(nonEmpty).toEqual({
      ShortText: ['placeholder'],
      Email: ['placeholder'],
      Phone: ['placeholder'],
      Website: ['placeholder'],
      Date: ['placeholder'],
      Time: ['placeholder'],
      Number: ['placeholder'],
      LongText: ['placeholder', 'rows'],
      Rating: ['max'],
      OpinionScale: ['min', 'max', 'labelMin', 'labelMax'],
      Checkbox: ['placeholder'],
      Legal: ['terms'],
      FileUpload: ['accept'],
      Doodle: ['penColor', 'penWidth', 'penControls'],
    });
  });

  it('ships only the listed keys for the question type, and no bag at all when none survive', () => {
    const published = fullDefinition();
    const [age, colour] = published.pages[0].questions;
    age.settings = { placeholder: 'e.g. 30', internalNote: 'scored by HR', max: 99 };
    colour.settings = { weighting: 3 };

    const [projectedAge, projectedColour] = toRespondentDefinition(published).pages[0].questions;
    expect(projectedAge.settings).toEqual({ placeholder: 'e.g. 30' });
    expect('settings' in projectedColour).toBe(false);
  });
});

/**
 * #303 review: a question whose show rule can never pass (it read only the score, which visibility
 * never has) still shipped its prompt and options. No respondent can see it, so the projection no
 * longer carries it — except as a copy-less stub where a jump lands on it, because removing a jump
 * target changes where the walk goes.
 */
describe('toRespondentDefinition — items no respondent can ever see', () => {
  const q = (id: string, overrides: Partial<PublishedFormQuestion> = {}): PublishedFormQuestion => ({
    id,
    type: 'ShortText',
    prompt: `Prompt ${id}`,
    isRequired: false,
    displayOrder: 0,
    options: [],
    ...overrides,
  });
  const scoreGated = { show: { all: [{ source: 'score' as const, op: 'greaterThan' as const, value: 3 }] } };

  function formWith(pages: PublishedFormPage[]): PublishedFormDefinition {
    return { ...fullDefinition(), pages, endScreens: [] };
  }

  it('drops a never-visible question, its prompt and its options', () => {
    const published = formWith([
      {
        id: 'p1',
        displayOrder: 0,
        questions: [
          q('a', { displayOrder: 0 }),
          q('secret', {
            displayOrder: 1,
            type: 'SingleChoice',
            prompt: 'Secret bonus question',
            options: [{ id: 'o', label: 'Hidden option', value: 'x', displayOrder: 0 }],
            conditionalRule: scoreGated,
          }),
          q('b', { displayOrder: 2 }),
        ],
      },
    ]);
    const projection = toRespondentDefinition(published);
    expect(projection.pages[0].questions.map((question) => question.id)).toEqual(['a', 'b']);
    expect(JSON.stringify(projection)).not.toContain('Secret bonus question');
    expect(JSON.stringify(projection)).not.toContain('Hidden option');
  });

  it('keeps a never-visible jump target as a stub with no copy, so the walk lands where it did', () => {
    const published = formWith([
      {
        id: 'p1',
        displayOrder: 0,
        questions: [
          q('a', {
            displayOrder: 0,
            conditionalRule: {
              jump: [{ when: { all: [{ questionId: 'a', op: 'equals', value: 'skip' }] }, target: { kind: 'question', id: 'secret' } }],
            },
          }),
          q('b', { displayOrder: 1 }),
          q('secret', { displayOrder: 2, prompt: 'Secret', helpText: 'help', conditionalRule: scoreGated, isRequired: true }),
          q('c', { displayOrder: 3 }),
        ],
      },
    ]);
    const projection = toRespondentDefinition(published);
    const stub = projection.pages[0].questions.find((question) => question.id === 'secret');
    expect(stub).toBeDefined();
    expect(stub?.prompt).toBe('');
    expect(stub?.helpText).toBeUndefined();
    expect(stub?.isRequired).toBe(false);
    for (const answers of [new Map([['a', 'skip']]), new Map([['a', 'stay']])]) {
      expect(settleVisibility(projection, answers).rendered.map((question) => question.id)).toEqual(
        settleVisibility(published, answers).rendered.map((question) => question.id),
      );
    }
  });

  it('drops a never-visible page with everything on it, and a page that is left with nothing to show', () => {
    const published = formWith([
      { id: 'p1', displayOrder: 0, questions: [q('a')] },
      { id: 'p-gated', displayOrder: 1, title: 'Gated section', conditionalRule: scoreGated, questions: [q('g', { prompt: 'Gated prompt' })] },
      { id: 'p-emptied', displayOrder: 2, title: 'Emptied section', questions: [q('h', { conditionalRule: scoreGated })] },
      { id: 'p4', displayOrder: 3, questions: [q('z')] },
    ]);
    const projection = toRespondentDefinition(published);
    expect(projection.pages.map((page) => page.id)).toEqual(['p1', 'p4']);
    expect(JSON.stringify(projection)).not.toContain('Gated');
    expect(JSON.stringify(projection)).not.toContain('Emptied');
    for (const answers of [new Map(), new Map([['a', 'x'], ['z', 'y']])]) {
      expect(settleVisibility(projection, answers).rendered.map((question) => question.id)).toEqual(
        settleVisibility(published, answers).rendered.map((question) => question.id),
      );
    }
  });

  // #303 Task 8 carry from the Task 2 review. The widget banks a checkpoint by POSITION: a page marked
  // `isPartialSubmitPoint` counts as passed once the respondent has answered something on a LATER
  // page (`passedSubmitPoints`), whether or not the checkpoint page itself showed anything. Dropping a
  // page no respondent can see therefore dropped its checkpoint with it, and an author's "save
  // progress here" stopped banking once the widget read the projection.
  it('keeps the checkpoint of a page it drops, as a copy-less stub in the same position', () => {
    const published = formWith([
      { id: 'p1', displayOrder: 0, questions: [q('a')] },
      {
        id: 'p-gated',
        displayOrder: 1,
        title: 'Gated section',
        isPartialSubmitPoint: true,
        conditionalRule: scoreGated,
        questions: [q('g', { prompt: 'Gated prompt' })],
      },
      {
        id: 'p-emptied',
        displayOrder: 2,
        title: 'Emptied section',
        description: 'Emptied description',
        isPartialSubmitPoint: true,
        questions: [q('h', { conditionalRule: scoreGated, prompt: 'Emptied prompt' })],
      },
      { id: 'p4', displayOrder: 3, questions: [q('z')] },
    ]);
    const projection = toRespondentDefinition(published);

    expect(projection.pages.map((page) => [page.id, page.isPartialSubmitPoint === true])).toEqual([
      ['p1', false],
      ['p-gated', true],
      ['p-emptied', true],
      ['p4', false],
    ]);
    for (const stub of projection.pages.slice(1, 3)) {
      expect(stub.questions).toEqual([]);
      expect(stub.title).toBeUndefined();
      expect(stub.description).toBeUndefined();
    }
    const json = JSON.stringify(projection);
    expect(json).not.toContain('Gated');
    expect(json).not.toContain('Emptied');
    // And the walk is still the published walk.
    for (const answers of [new Map(), new Map([['a', 'x'], ['z', 'y']])]) {
      expect(settleVisibility(projection, answers).rendered.map((question) => question.id)).toEqual(
        settleVisibility(published, answers).rendered.map((question) => question.id),
      );
    }
  });
});
