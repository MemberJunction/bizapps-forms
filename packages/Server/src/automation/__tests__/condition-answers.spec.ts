/**
 * What an automation's `ConditionalRule` actually compares against.
 *
 * This module's header names the failure it exists to prevent: a map whose keys or values do not
 * match what the rules use makes "automations configured correctly simply never fire, with nothing
 * logged". The casing half of that is covered. These pin the VALUE half for the `date` column.
 *
 * A `Time` answer is stored as the clock on the epoch date in UTC (`14:30` →
 * `1970-01-01T14:30:00Z`, see `answer-date.ts`), and `CanonicalAnswers` hands it on as the ISO
 * instant — which the evaluator reads on the DATE scale, while a rule an author writes for a Time
 * question (`"12:00"`) is on the TIME scale. Two scales never compare, so every such rule
 * evaluated false. Visibility rules were unaffected because they read the wire value (`14:30`)
 * rather than the stored one, which is exactly the fork `forms-entities` exists to close.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateConditionalRule,
  type PublishedFormDefinition,
  type PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { buildConditionAnswers } from '../condition-answers';
import { CanonicalAnswers } from '@mj-biz-apps/forms-entities';

const TIME_Q = 'a11c0de0-1000-4000-8000-000000000020';
const DATE_Q = 'a11c0de0-1000-4000-8000-000000000019';

function question(id: string, type: PublishedFormQuestion['type'], prompt: string): PublishedFormQuestion {
  return { id, type, prompt, isRequired: false, displayOrder: 1, options: [] };
}

function definition(): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'When',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    endScreens: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        questions: [question(DATE_Q, 'Date', 'Which day'), question(TIME_Q, 'Time', 'What time')],
      },
    ],
  };
}

/** A stored row exactly as persistence writes it and SQL Server returns it (ids UPPERCASE). */
function storedRow(questionId: string, dateValue: Date) {
  return {
    QuestionID: questionId.toUpperCase(),
    TextValue: null,
    NumericValue: null,
    DateValue: dateValue,
    BooleanValue: null,
    JSONValue: null,
    FileID: null,
  };
}

const answersFor = (rows: ReturnType<typeof storedRow>[]) =>
  buildConditionAnswers(definition(), new CanonicalAnswers(rows));

/** `14:30` as persistence stores it: the clock on the epoch date, UTC. */
const timeAnswer1430 = () => storedRow(TIME_Q, new Date(Date.UTC(1970, 0, 1, 14, 30, 0)));

describe('buildConditionAnswers — a Time answer is compared on the clock scale', () => {
  it('hands the evaluator the clock reading, not the stored epoch instant', () => {
    const map = answersFor([timeAnswer1430()]);
    expect(map.get(TIME_Q)).toBe('14:30');
  });

  it('fires a greaterThan rule an author wrote against a clock', () => {
    const rule = { show: { all: [{ questionId: TIME_Q, op: 'greaterThan' as const, value: '12:00' }] } };
    expect(evaluateConditionalRule(rule, answersFor([timeAnswer1430()]))).toBe(true);
  });

  it('fires an equals rule, which is what the epoch date exists to make possible', () => {
    const rule = { show: { all: [{ questionId: TIME_Q, op: 'equals' as const, value: '14:30' }] } };
    expect(evaluateConditionalRule(rule, answersFor([timeAnswer1430()]))).toBe(true);
  });

  it('does not fire a rule the answer genuinely fails', () => {
    const rule = { show: { all: [{ questionId: TIME_Q, op: 'lessThan' as const, value: '12:00' }] } };
    expect(evaluateConditionalRule(rule, answersFor([timeAnswer1430()]))).toBe(false);
  });

  it('keeps seconds when the answer carried them', () => {
    const map = answersFor([storedRow(TIME_Q, new Date(Date.UTC(1970, 0, 1, 14, 30, 15)))]);
    expect(map.get(TIME_Q)).toBe('14:30:15');
  });

  it('treats midnight as a real answer rather than an absent one', () => {
    const map = answersFor([storedRow(TIME_Q, new Date(Date.UTC(1970, 0, 1, 0, 0, 0)))]);
    expect(map.get(TIME_Q)).toBe('00:00');
  });
});

describe('buildConditionAnswers — a Date answer is unchanged', () => {
  // The control. `Date` already agreed on both paths, and must keep agreeing: its canonical form
  // is an ISO instant and the rules an author writes for it are calendar dates, both on the date
  // scale.
  it('still hands the evaluator the ISO instant', () => {
    const map = answersFor([storedRow(DATE_Q, new Date('2026-09-01T00:00:00Z'))]);
    expect(map.get(DATE_Q)).toBe('2026-09-01T00:00:00.000Z');
  });

  it('still fires a calendar-date rule', () => {
    const rule = { show: { all: [{ questionId: DATE_Q, op: 'greaterThan' as const, value: '2026-08-01' }] } };
    const answers = answersFor([storedRow(DATE_Q, new Date('2026-09-01T00:00:00Z'))]);
    expect(evaluateConditionalRule(rule, answers)).toBe(true);
  });
});

describe('a Time answer that did not come from the date column', () => {
  // `collapseAnswer`'s precedence is TextValue → NumericValue → DateValue, and exactly-one-populated
  // is an invariant rather than a database constraint — so a Time question's row CAN arrive holding
  // free text. Converting on "does this string parse as a date" rather than "did this come from the
  // date column" hands that text to V8's very lenient parser: `new Date('2026')` is valid, and the
  // answer silently became `00:00`, which an author's `equals: "00:00"` rule would then match.
  // A stored Time is always the full ISO instant `canonicalizeDate` produces, so that is the shape
  // to require.
  const textRow = (text: string) => ({
    QuestionID: TIME_Q.toUpperCase(),
    TextValue: text,
    NumericValue: null,
    DateValue: null,
    BooleanValue: null,
    JSONValue: null,
    FileID: null,
  });

  it('does not invent a clock from date-ish free text', () => {
    for (const text of ['2026', 'Dec 25', '2026-09-01', 'March']) {
      const map = buildConditionAnswers(definition(), new CanonicalAnswers([textRow(text)]));
      expect(map.get(TIME_Q), text).toBe(text);
    }
  });

  it('does not let free text satisfy a clock rule it never meant', () => {
    const rule = { show: { all: [{ questionId: TIME_Q, op: 'equals' as const, value: '00:00' }] } };
    const answers = buildConditionAnswers(definition(), new CanonicalAnswers([textRow('2026')]));
    expect(evaluateConditionalRule(rule, answers)).toBe(false);
  });

  it('still reads a real stored Time, which is always a full ISO instant', () => {
    const map = answersFor([timeAnswer1430()]);
    expect(map.get(TIME_Q)).toBe('14:30');
  });
});
