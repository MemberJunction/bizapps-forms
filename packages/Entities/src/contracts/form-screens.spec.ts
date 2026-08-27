import { describe, it, expect } from 'vitest';
import { endingMessage, endingRedirectUrl, resolveEndingScreen } from './form-screens';
import type { AnswerValue } from './conditional-rule';
import type { PublishedFormScreen } from './form-definition';

function ending(overrides: Partial<PublishedFormScreen> = {}): PublishedFormScreen {
  return {
    id: 'e1',
    screenType: 'Ending',
    title: 'Thanks',
    displayOrder: 0,
    ...overrides,
  };
}

const noAnswers: ReadonlyMap<string, AnswerValue> = new Map();

describe('resolveEndingScreen', () => {
  it('returns undefined when the form has no endings', () => {
    expect(resolveEndingScreen([], noAnswers)).toBeUndefined();
  });

  it('takes the first conditional ending whose rule matches', () => {
    const answers = new Map<string, AnswerValue>([['q1', 'yes']]);
    const yes = ending({
      id: 'yes',
      displayOrder: 0,
      conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'yes' }] } },
    });
    const no = ending({
      id: 'no',
      displayOrder: 1,
      conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'no' }] } },
    });
    expect(resolveEndingScreen([no, yes], answers)?.id).toBe('yes');
  });

  it('respects display order among matching conditionals, not array order', () => {
    const answers = new Map<string, AnswerValue>([['q1', 'yes']]);
    const rule = { show: { all: [{ questionId: 'q1', op: 'equals' as const, value: 'yes' }] } };
    const second = ending({ id: 'second', displayOrder: 1, conditionalRule: rule });
    const first = ending({ id: 'first', displayOrder: 0, conditionalRule: rule });
    expect(resolveEndingScreen([second, first], answers)?.id).toBe('first');
  });

  it('falls back to the explicit default when no condition matches', () => {
    const conditional = ending({
      id: 'cond',
      displayOrder: 0,
      conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'yes' }] } },
    });
    const fallback = ending({ id: 'fallback', displayOrder: 1, isDefault: true });
    expect(resolveEndingScreen([conditional, fallback], noAnswers)?.id).toBe('fallback');
  });

  it('treats a lone unconditional ending as the default even without the flag', () => {
    // An author who made exactly one plain ending plainly meant it to show, and nothing else
    // could be intended by an ending with no condition and no flag.
    expect(resolveEndingScreen([ending({ id: 'only' })], noAnswers)?.id).toBe('only');
  });

  it('does NOT let an unconditional ending swallow a matching conditional one', () => {
    // The reason this is not `evaluateConditionalRule` applied uniformly: there, "no rule" means
    // ALWAYS VISIBLE, so the plain ending would win every time and the author's conditions would
    // never be consulted — silently, since both are configured and neither errors.
    const answers = new Map<string, AnswerValue>([['q1', 'vip']]);
    const plain = ending({ id: 'plain', displayOrder: 0 });
    const vip = ending({
      id: 'vip',
      displayOrder: 1,
      conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] } },
    });
    expect(resolveEndingScreen([plain, vip], answers)?.id).toBe('vip');
  });

  it('returns undefined when every ending is conditional and none match', () => {
    const only = ending({
      conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'yes' }] } },
    });
    expect(resolveEndingScreen([only], noAnswers)).toBeUndefined();
  });
});

describe('endingMessage', () => {
  it('joins the resolved screen title and body', () => {
    expect(endingMessage(ending({ title: 'All set', body: 'We will be in touch.' }), {})).toBe(
      'All set\n\nWe will be in touch.',
    );
  });

  it('uses the title alone when there is no body', () => {
    expect(endingMessage(ending({ title: 'All set' }), {})).toBe('All set');
  });

  it('falls back to the form-wide confirmation message when there is no screen', () => {
    expect(endingMessage(undefined, { confirmationMessage: 'Got it, thanks.' })).toBe('Got it, thanks.');
  });

  it('never returns blank, because a blank confirmation reads as a failed submit', () => {
    expect(endingMessage(undefined, {})).toBe('Thanks — your response has been recorded.');
    expect(endingMessage(undefined, { confirmationMessage: '   ' })).toBe(
      'Thanks — your response has been recorded.',
    );
  });
});

describe('endingRedirectUrl', () => {
  it("prefers the resolved ending's own URL over the form-wide one", () => {
    // The point of per-ending redirects: qualified respondents go to a booking page while
    // everyone else lands on a thank-you.
    expect(
      endingRedirectUrl(ending({ redirectURL: 'https://book.example.com' }), {
        redirectUrl: 'https://example.com/thanks',
      }),
    ).toBe('https://book.example.com');
  });

  it('falls back to the form-wide redirect', () => {
    expect(endingRedirectUrl(ending(), { redirectUrl: 'https://example.com/thanks' })).toBe(
      'https://example.com/thanks',
    );
  });

  it('returns undefined when neither is set, so the widget shows a screen', () => {
    expect(endingRedirectUrl(ending(), {})).toBeUndefined();
    expect(endingRedirectUrl(undefined, {})).toBeUndefined();
    expect(endingRedirectUrl(ending({ redirectURL: '  ' }), { redirectUrl: '  ' })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// RULES_AND_BRANCHING_PLAN Phase C — disqualification exclusion + score bands.
// ---------------------------------------------------------------------------

describe('resolveEndingScreen vs disqualification screens (C3)', () => {
  it('never falls back to a disqualification screen, ruleless or default-flagged', () => {
    const dqNoRule = ending({ id: 'dq', isDisqualification: true });
    const dqDefault = ending({ id: 'dq-def', isDisqualification: true, isDefault: true });
    const plain = ending({ id: 'plain', displayOrder: 5 });
    // Alone, a disqualify screen is not a usable ending at all.
    expect(resolveEndingScreen([dqNoRule], noAnswers)).toBeUndefined();
    expect(resolveEndingScreen([dqDefault], noAnswers)).toBeUndefined();
    // Beside a real ending, the real ending wins both fallback arms.
    expect(resolveEndingScreen([dqNoRule, plain], noAnswers)?.id).toBe('plain');
    expect(resolveEndingScreen([dqDefault, plain], noAnswers)?.id).toBe('plain');
  });

  it('a disqualification never wins the conditional arm either, however well it matches', () => {
    const answers = new Map<string, AnswerValue>([['q1', 'fail']]);
    const dq = ending({
      id: 'dq',
      isDisqualification: true,
      conditionalRule: { show: { all: [{ questionId: 'q1', op: 'equals', value: 'fail' }] } },
    });
    const fallback = ending({ id: 'fallback', displayOrder: 9 });
    expect(resolveEndingScreen([dq, fallback], answers)?.id).toBe('fallback');
  });
});

describe('score-banded endings (C4)', () => {
  const pass = ending({
    id: 'pass',
    displayOrder: 0,
    conditionalRule: { show: { all: [{ source: 'score', op: 'greaterThan', value: 70 }] } },
  });
  const fail = ending({ id: 'fail', displayOrder: 1, isDefault: true });

  it('routes by the supplied score', () => {
    expect(resolveEndingScreen([pass, fail], noAnswers, { score: 85 })?.id).toBe('pass');
    expect(resolveEndingScreen([pass, fail], noAnswers, { score: 40 })?.id).toBe('fail');
  });

  it('with no score supplied a band never fires — the default wins', () => {
    expect(resolveEndingScreen([pass, fail], noAnswers)?.id).toBe('fail');
  });
});
