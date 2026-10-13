/**
 * `rulesMayRead` — whether leaving an answer out of a payload can change what a rule decides.
 *
 * #303 Task 8 fix round 4 (re-review R3-1/R3-2, controller ruling). The widget's autosave leaves out
 * a field the server cannot store. When a rule READS that field, its absence is itself an answer the
 * rule judges: a show rule hides the question that depends on it (and the server then deletes that
 * question's saved draft row), and an `isNotAnswered` knockout fires on an answer the respondent did
 * give. So a field may be left out only when no rule the server applies can read it.
 */
import { describe, expect, it } from 'vitest';
import type { ConditionalRule } from './conditional-rule';
import type { PublishedFormDefinition, PublishedFormQuestion } from './form-definition';
import { toRespondentDefinition } from './respondent-definition';
import { rulesMayRead } from './rule-sources';

function question(id: string, extra: Partial<PublishedFormQuestion> = {}): PublishedFormQuestion {
  return { id, type: 'Number', prompt: id, isRequired: false, displayOrder: 1, options: [], ...extra };
}

/** A full published form: `a` and `b`, with whatever rules a case adds. */
function form(overrides: {
  b?: Partial<PublishedFormQuestion>;
  a?: Partial<PublishedFormQuestion>;
  pageRule?: ConditionalRule;
  endingRule?: ConditionalRule;
  automationRule?: ConditionalRule;
} = {}): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'Rules',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        conditionalRule: overrides.pageRule,
        questions: [question('a', { displayOrder: 1, ...overrides.a }), question('b', { displayOrder: 2, ...overrides.b })],
      },
    ],
    endScreens: [
      { id: 'done', screenType: 'Ending', title: 'Done', displayOrder: 1, conditionalRule: overrides.endingRule },
      { id: 'ko', screenType: 'Ending', title: 'Not eligible', displayOrder: 2, isDisqualification: true },
    ],
    automations: overrides.automationRule
      ? [
          {
            id: 'auto',
            name: 'Notify',
            targetType: 'Action',
            actionId: 'act',
            trigger: 'OnPartial',
            executionMode: 'Async',
            displayOrder: 1,
            conditionalRule: overrides.automationRule,
            continueOnError: true,
            isActive: true,
          },
        ]
      : [],
  };
}

const readsA = { all: [{ questionId: 'a', op: 'greaterThan' as const, value: 0 }] };

describe('rulesMayRead — a full published definition', () => {
  it('is false when no rule reads the field, so it may be left out', () => {
    expect(rulesMayRead(form(), ['a'])).toBe(false);
  });

  it('is false when nothing is left out', () => {
    expect(rulesMayRead(form({ b: { conditionalRule: { show: readsA } } }), [])).toBe(false);
  });

  it.each<[string, Parameters<typeof form>[0]]>([
    ["a question's show rule (all)", { b: { conditionalRule: { show: readsA } } }],
    ["a question's show rule (any)", { b: { conditionalRule: { show: { any: [{ questionId: 'a', op: 'isAnswered' }] } } } }],
    ["a question's jump", { b: { conditionalRule: { jump: [{ when: readsA, target: { kind: 'submit' } }] } } }],
    ["a page's show rule", { pageRule: { show: readsA } }],
    ['a knockout jump', { pageRule: { jump: [{ when: { all: [{ questionId: 'a', op: 'isNotAnswered' }] }, target: { kind: 'ending', id: 'ko' } }] } }],
    ["an ending's rule", { endingRule: { show: readsA } }],
    ["an automation's condition", { automationRule: { show: readsA } }],
  ])('is true when %s reads the field', (_where, overrides) => {
    expect(rulesMayRead(form(overrides), ['a'])).toBe(true);
    expect(rulesMayRead(form(overrides), ['b'])).toBe(false);
  });

  it('is true for a SCORED field when any rule reads the score — leaving it out lowers the total', () => {
    const scoreGate = { show: { all: [{ source: 'score' as const, op: 'greaterThan' as const, value: 5 }] } };
    const scored = { scoring: { points: { '1': 10 } } };
    expect(rulesMayRead(form({ a: scored, endingRule: scoreGate }), ['a'])).toBe(true);
    // An unscored field cannot move the total; a scored one with nothing reading the total is inert.
    expect(rulesMayRead(form({ a: scored, endingRule: scoreGate }), ['b'])).toBe(false);
    expect(rulesMayRead(form({ a: scored }), ['a'])).toBe(false);
  });
});

describe('rulesMayRead — the respondent projection cannot vouch for a field', () => {
  // The projection the widget holds (#302) drops knockout jumps, every ending, score conditions,
  // scoring and automations — exactly the rules a left-out field could still trip on the server.
  it('reads every field as a possible rule source, because the rules that could read it were removed', () => {
    const knockout = form({ pageRule: { jump: [{ when: { all: [{ questionId: 'a', op: 'isNotAnswered' }] }, target: { kind: 'ending', id: 'ko' } }] } });
    const projection = toRespondentDefinition(knockout);
    // The knockout is gone from what the widget holds...
    expect(JSON.stringify(projection)).not.toContain('isNotAnswered');
    expect('endScreens' in projection).toBe(false);
    // ...so the widget must not take its absence as proof that nothing reads `a`, or `b`.
    expect(rulesMayRead(projection, ['a'])).toBe(true);
    expect(rulesMayRead(toRespondentDefinition(form()), ['b'])).toBe(true);
    expect(rulesMayRead(projection, [])).toBe(false);
  });
});
