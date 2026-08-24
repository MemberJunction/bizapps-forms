import { describe, it, expect } from 'vitest';
import {
  parseFormBlueprint,
  extractJSON,
  conditionsOf,
  formQuestionTypeSchema,
  CHOICE_QUESTION_TYPES,
} from './form-blueprint';
import { FORM_QUESTION_TYPES, questionTypeBehavior } from '@mj-biz-apps/forms-entities';

describe('parseFormBlueprint', () => {
  it('parses a valid blueprint object', () => {
    const bp = parseFormBlueprint({
      name: 'RSVP',
      pages: [{ questions: [{ type: 'Email', prompt: 'Email' }] }],
    });
    expect(bp.name).toBe('RSVP');
    expect(bp.pages[0].questions[0].type).toBe('Email');
  });

  it('rejects a question type outside the contract taxonomy', () => {
    // Was `Signature`, which the taxonomy has since grown to include — a rejection test whose
    // example became valid stops testing rejection and starts asserting nothing. `Payment` is a
    // type we have deliberately NOT implemented, so it is a stable stand-in for "not a type".
    expect(() =>
      parseFormBlueprint({
        name: 'Bad',
        pages: [{ questions: [{ type: 'Payment', prompt: 'Pay here' }] }],
      }),
    ).toThrow();
  });

  it('rejects a form with no pages', () => {
    expect(() => parseFormBlueprint({ name: 'Empty', pages: [] })).toThrow();
  });

  it('rejects a page with no questions', () => {
    expect(() => parseFormBlueprint({ name: 'Empty page', pages: [{ questions: [] }] })).toThrow();
  });

  it('parses JSON wrapped in a markdown fence + prose', () => {
    const text = 'Here is your form:\n```json\n{"name":"X","pages":[{"questions":[{"type":"ShortText","prompt":"Q"}]}]}\n```\nEnjoy!';
    const bp = parseFormBlueprint(text);
    expect(bp.name).toBe('X');
  });
});

describe('extractJSON', () => {
  it('strips a json fence', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('extracts the first balanced object from prose', () => {
    expect(extractJSON('prefix {"a":1} suffix')).toBe('{"a":1}');
  });
  it('returns the trimmed string when no braces are present', () => {
    expect(extractJSON('  no json here  ')).toBe('no json here');
  });
});

describe('taxonomy', () => {
  // Both assertions now check that the blueprint DERIVES from the contract rather than pinning
  // the numbers it derived to. Pinning is what let the enum sit at 15 while the contract moved
  // to 25: the test kept passing and the AI Designer quietly could not author the new types.
  it('offers exactly the contract\'s question types', () => {
    expect([...formQuestionTypeSchema.options].sort()).toEqual([...FORM_QUESTION_TYPES].sort());
  });

  it('treats every option-carrying type as a choice type, not just the original three', () => {
    const expected = FORM_QUESTION_TYPES.filter((t) => questionTypeBehavior(t).optionMode !== 'none');
    expect([...CHOICE_QUESTION_TYPES].sort()).toEqual([...expected].sort());
    // The ones the hand-written set missed, named explicitly so a regression is legible.
    for (const type of ['Ranking', 'Matrix', 'PictureChoice'] as const) {
      expect(CHOICE_QUESTION_TYPES.has(type), type).toBe(true);
    }
  });
});

// --- Extended blueprint: keys, rules, screens, theme -------------------------------

/** A two-page blueprint with one keyed question per page, for the rule tests to reference. */
function twoPageBlueprint(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Conference RSVP',
    pages: [
      {
        title: 'Attendance',
        questions: [
          { key: 'attending', type: 'YesNo', prompt: 'Will you attend?' },
          { key: 'diet', type: 'ShortText', prompt: 'Dietary needs' },
        ],
      },
      {
        title: 'Travel',
        questions: [{ key: 'hotel', type: 'YesNo', prompt: 'Need a hotel?' }],
      },
    ],
    ...overrides,
  };
}

/** `{ show: { all: [ ... ] } }` over one condition, the shape the Designer emits. */
function showsWhenAnswered(questionKey: string): Record<string, unknown> {
  return { show: { all: [{ questionKey, op: 'isAnswered' }] } };
}

describe('blueprint validation rules', () => {
  it('accepts a question gated by an earlier question on the same page', () => {
    const bp = twoPageBlueprint();
    const pages = bp.pages as Array<{ questions: Array<Record<string, unknown>> }>;
    pages[0].questions[1].conditionalRule = showsWhenAnswered('attending');
    expect(() => parseFormBlueprint(bp)).not.toThrow();
  });

  it('accepts a question gated by a question on an earlier page', () => {
    const bp = twoPageBlueprint();
    const pages = bp.pages as Array<{ questions: Array<Record<string, unknown>> }>;
    pages[1].questions[0].conditionalRule = showsWhenAnswered('diet');
    expect(() => parseFormBlueprint(bp)).not.toThrow();
  });

  it('rejects a rule referencing a key no question declares', () => {
    const bp = twoPageBlueprint();
    const pages = bp.pages as Array<{ questions: Array<Record<string, unknown>> }>;
    pages[1].questions[0].conditionalRule = showsWhenAnswered('nonexistent');
    // The message names the bad key AND the declared ones: this text is fed straight back to
    // the Designer as ValidationError, so it has to be actionable, not just present.
    expect(() => parseFormBlueprint(bp)).toThrow(/nonexistent/);
    expect(() => parseFormBlueprint(bp)).toThrow(/attending/);
  });

  it('rejects a question gated by a LATER question', () => {
    const bp = twoPageBlueprint();
    const pages = bp.pages as Array<{ questions: Array<Record<string, unknown>> }>;
    pages[0].questions[0].conditionalRule = showsWhenAnswered('hotel');
    expect(() => parseFormBlueprint(bp)).toThrow(/comes later in the form/);
  });

  it('rejects a question gated by itself', () => {
    const bp = twoPageBlueprint();
    const pages = bp.pages as Array<{ questions: Array<Record<string, unknown>> }>;
    pages[0].questions[0].conditionalRule = showsWhenAnswered('attending');
    expect(() => parseFormBlueprint(bp)).toThrow(/comes later in the form/);
  });

  it('rejects a duplicate question key', () => {
    const bp = twoPageBlueprint();
    const pages = bp.pages as Array<{ questions: Array<Record<string, unknown>> }>;
    pages[1].questions[0].key = 'attending';
    expect(() => parseFormBlueprint(bp)).toThrow(/Duplicate question key/);
  });

  it('rejects a page gated by a question on that same page', () => {
    const bp = twoPageBlueprint();
    const pages = bp.pages as Array<Record<string, unknown>>;
    pages[1].conditionalRule = showsWhenAnswered('hotel');
    expect(() => parseFormBlueprint(bp)).toThrow(/not on an earlier page/);
  });

  it('accepts a page gated by a question on an earlier page', () => {
    const bp = twoPageBlueprint();
    const pages = bp.pages as Array<Record<string, unknown>>;
    pages[1].conditionalRule = showsWhenAnswered('attending');
    expect(() => parseFormBlueprint(bp)).not.toThrow();
  });

  it('lets an ending reference ANY question, including the last one', () => {
    // Deliberately the opposite of the question rule: an ending is resolved once the form is
    // answered, so restricting it to a prefix would hide the final page from it.
    const bp = twoPageBlueprint({
      screens: {
        endings: [
          { title: 'See you there', conditionalRule: showsWhenAnswered('hotel') },
          { title: 'Thanks', isDefault: true },
        ],
      },
    });
    expect(() => parseFormBlueprint(bp)).not.toThrow();
  });

  it('still rejects an ending referencing an unknown key', () => {
    const bp = twoPageBlueprint({
      screens: { endings: [{ title: 'Bye', conditionalRule: showsWhenAnswered('ghost') }] },
    });
    expect(() => parseFormBlueprint(bp)).toThrow(/ghost/);
  });
});

describe('blueprint screens, theme and validation', () => {
  it('round-trips a welcome screen, endings, image prompts and a theme', () => {
    const bp = parseFormBlueprint(
      twoPageBlueprint({
        screens: {
          welcome: { title: 'Welcome', body: 'Two minutes.', buttonLabel: 'Start', imagePrompt: 'a lecture hall' },
          endings: [{ title: 'Done', redirectURL: 'https://example.com', isDefault: true }],
        },
        theme: { brandAdjectives: ['warm', 'professional'], brandURL: 'https://example.com' },
      }),
    );
    expect(bp.screens?.welcome?.buttonLabel).toBe('Start');
    expect(bp.screens?.welcome?.imagePrompt).toBe('a lecture hall');
    expect(bp.screens?.endings?.[0].redirectURL).toBe('https://example.com');
    expect(bp.theme?.brandAdjectives).toEqual(['warm', 'professional']);
  });

  it('round-trips a question validation rule', () => {
    const bp = twoPageBlueprint();
    const pages = bp.pages as Array<{ questions: Array<Record<string, unknown>> }>;
    pages[0].questions[1].validationRule = { maxLength: 200, pattern: '^[a-z ]+$' };
    expect(parseFormBlueprint(bp).pages[0].questions[1].validationRule?.maxLength).toBe(200);
  });

  it('round-trips an option image prompt', () => {
    const bp = parseFormBlueprint({
      name: 'Pick one',
      pages: [
        {
          questions: [
            {
              type: 'PictureChoice',
              prompt: 'Which venue?',
              options: [
                { label: 'Rooftop', imagePrompt: 'a rooftop bar at dusk' },
                { label: 'Hall', imageURL: 'https://cdn.example.com/hall.png' },
              ],
            },
          ],
        },
      ],
    });
    expect(bp.pages[0].questions[0].options?.[0].imagePrompt).toBe('a rooftop bar at dusk');
    expect(bp.pages[0].questions[0].options?.[1].imageURL).toBe('https://cdn.example.com/hall.png');
  });

  it('still parses a blueprint with none of the new fields', () => {
    // The starter templates and every previously-stored blueprint are this shape. Everything
    // added above is optional, and a regression here breaks the no-AI template path too.
    const bp = parseFormBlueprint({
      name: 'RSVP',
      pages: [{ questions: [{ type: 'Email', prompt: 'Email' }] }],
    });
    expect(bp.screens).toBeUndefined();
    expect(bp.theme).toBeUndefined();
  });
});

describe('conditionsOf', () => {
  it('flattens both combinators, and yields nothing for an absent rule', () => {
    expect(conditionsOf(undefined)).toEqual([]);
    expect(conditionsOf({})).toEqual([]);
    const both = conditionsOf({
      show: {
        all: [{ questionKey: 'a', op: 'isAnswered' }],
        any: [{ questionKey: 'b', op: 'equals', value: 'x' }],
      },
    });
    expect(both.map((c) => c.questionKey)).toEqual(['a', 'b']);
  });
});
