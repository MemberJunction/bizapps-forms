/**
 * What lands in `FormResponseAnswer.DateValue`, and what never does.
 *
 * `applyAnswerValue` did `answer.DateValue = new Date(input.dateValue)` with no validity check.
 * For a `Time` question the widget sends `14:30` — the wire format the contract now fixes — and
 * `new Date('14:30')` is an Invalid Date. It reached `Save()`, the provider called `toISOString()`
 * on it, and the `RangeError: Invalid time value` came back as the whole submit's failure with no
 * question attached (#116). These pin the stored shape and the refusal that replaces the throw.
 *
 * At the `persistSubmission` seam rather than a unit around the mapping, because the thing that
 * was wrong was what got WRITTEN: the fake records every field the entity is given, so the
 * assertion is on the value that would have gone to the database.
 */
import { describe, expect, it } from 'vitest';
import type { FormAnswerInput, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

import { persistSubmission, type PersistenceInputs } from '../persistence.service';
import { expectPersistFailure, makeContextUser, makeFakeProvider, respondentPermissions, type FakeProvider } from './fakes';

const ANSWER_ENTITY = 'MJ_BizApps_Forms: Form Response Answers';

const TIME_QUESTION: PublishedFormQuestion = {
  id: 'q-time',
  type: 'Time',
  prompt: 'What time suits you',
  isRequired: false,
  displayOrder: 1,
  options: [],
};

const DATE_QUESTION: PublishedFormQuestion = {
  id: 'q-date',
  type: 'Date',
  prompt: 'Which day',
  isRequired: false,
  displayOrder: 2,
  options: [],
};

function inputs(question: PublishedFormQuestion, dateValue: string): PersistenceInputs {
  return {
    formId: 'form-1',
    formVersionId: 'ver-1',
    distributionId: 'dist-1',
    complete: true,
    sessionId: 'session-1',
    sourceMetadata: {},
    answers: [{ question, input: { questionId: question.id, dateValue } }],
  };
}

/**
 * An answer as it ACTUALLY arrives from the resolver: every typed column the answer does not use
 * is present and `null`, not absent. `input-mapping.spec.ts` models the same shape, and its own
 * regression title records what happens when a mapper forgets it — "null.trim() 500ed every
 * submit", for `jsonValue`. The fixtures above spell answers as `{ questionId, dateValue }`, a
 * shape no caller produces, which is why nothing here caught the same bug for `dateValue`.
 */
function wireInputs(
  question: PublishedFormQuestion,
  populated: Partial<Record<'textValue' | 'numericValue' | 'dateValue' | 'booleanValue', unknown>>,
): PersistenceInputs {
  return {
    formId: 'form-1',
    formVersionId: 'ver-1',
    distributionId: 'dist-1',
    complete: true,
    sessionId: 'session-1',
    sourceMetadata: {},
    answers: [
      {
        question,
        input: {
          questionId: question.id,
          textValue: null,
          numericValue: null,
          dateValue: null,
          booleanValue: null,
          jsonValue: null,
          fileId: null,
          ...populated,
        } as FormAnswerInput,
      },
    ],
  };
}

const SHORT_TEXT_QUESTION: PublishedFormQuestion = {
  id: 'q-text',
  type: 'ShortText',
  prompt: 'Your name',
  isRequired: false,
  displayOrder: 3,
  options: [],
};

function provider(): FakeProvider {
  return makeFakeProvider({ createPermissions: respondentPermissions() });
}

const savedAnswers = (fake: FakeProvider): Record<string, unknown>[] =>
  fake.saved.filter((r) => r.entityName === ANSWER_ENTITY).map((r) => r.values as Record<string, unknown>);

const storedDateValues = (fake: FakeProvider): unknown[] => savedAnswers(fake).map((v) => v.DateValue);

describe('a Time answer', () => {
  describe('happy', () => {
    it('is stored as the clock reading on the epoch date, in UTC', async () => {
      const fake = provider();
      const result = await persistSubmission(fake.provider, inputs(TIME_QUESTION, '14:30'), makeContextUser());

      expect(result.outcome).toBe('saved');
      const [stored] = storedDateValues(fake);
      expect(stored).toBeInstanceOf(Date);
      expect((stored as Date).toISOString()).toBe('1970-01-01T14:30:00.000Z');
    });
  });

  describe('worst', () => {
    it('is refused with a message naming the question when it cannot be stored — never written as an Invalid Date', async () => {
      // Validation refuses this first on every real path. Persistence checks again because it is
      // the last thing before the driver, and a caller can put `dateValue` on a question whose
      // type validation never looks at that column for.
      const fake = provider();
      const result = expectPersistFailure(
        await persistSubmission(fake.provider, inputs(TIME_QUESTION, 'garbage'), makeContextUser()),
      );

      expect(result.message).toContain('What time suits you');
      expect(result.message).not.toContain('Invalid time value');
      expect(storedDateValues(fake)).toEqual([]);
    });
  });
});

describe('a Time answer re-saved over a stored row (the autosave path)', () => {
  // `rewriteAnswer` is a second caller of the same mapping — an autosave that re-hits the row a
  // question already has. It has to refuse the same way; a guard on the create path alone would
  // leave the Invalid Date reachable from every autosave after the first.
  const EXISTING_ID = '11111111-1111-4111-8111-111111111111';
  const withStoredRow = (): FakeProvider =>
    makeFakeProvider({
      createPermissions: respondentPermissions(),
      existingResponses: [{ ID: EXISTING_ID, Status: 'Partial', FormVersionID: 'ver-1', AnonymousSessionID: 'session-1' }],
      existingAnswers: [{ ID: 'a-1', QuestionID: TIME_QUESTION.id }],
    });
  const resave = (dateValue: string): PersistenceInputs => ({
    ...inputs(TIME_QUESTION, dateValue),
    complete: false,
    existingResponseId: EXISTING_ID,
  });

  it('overwrites the stored row with the epoch-date instant', async () => {
    const fake = withStoredRow();
    const result = await persistSubmission(fake.provider, resave('09:05'), makeContextUser());

    expect(result.outcome).toBe('saved');
    expect((storedDateValues(fake)[0] as Date).toISOString()).toBe('1970-01-01T09:05:00.000Z');
  });

  it('refuses an unstorable value by name instead of writing an Invalid Date over the row', async () => {
    const fake = withStoredRow();
    const result = expectPersistFailure(await persistSubmission(fake.provider, resave('garbage'), makeContextUser()));

    expect(result.message).toContain('What time suits you');
    expect(storedDateValues(fake)).toEqual([]);
  });
});

describe('a Date answer', () => {
  it('is stored exactly as before: UTC midnight of the calendar day', async () => {
    const fake = provider();
    const result = await persistSubmission(fake.provider, inputs(DATE_QUESTION, '2026-09-01'), makeContextUser());

    expect(result.outcome).toBe('saved');
    expect((storedDateValues(fake)[0] as Date).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('is refused, naming the question, rather than stored as an Invalid Date', async () => {
    const fake = provider();
    const result = expectPersistFailure(
      await persistSubmission(fake.provider, inputs(DATE_QUESTION, 'not-a-date'), makeContextUser()),
    );

    expect(result.message).toContain('Which day');
    expect(storedDateValues(fake)).toEqual([]);
  });
});

describe('an answer whose dateValue arrives as null (the shape the resolver really sends)', () => {
  // `applyAnswerValue` gated the date column on `!== undefined`, and `null !== undefined`. So an
  // answer that populates a DIFFERENT column — every text, numeric, boolean and choice answer —
  // carried `dateValue: null` into `dateAnswerInstant`, which does `text.trim()`. The result was
  // `TypeError: Cannot read properties of null (reading 'trim')`, surfaced to an anonymous
  // respondent as INTERNAL_SERVER_ERROR on the public write path. Before this PR the same line
  // was `new Date(input.dateValue)`, and `new Date(null)` is the epoch — wrong, but not a crash.
  //
  // The sibling column already learned this: `parseJsonValue` carries a `raw == null` guard, and
  // `input-mapping.spec.ts` titles its test "regression: null.trim() 500ed every submit".
  it('does not throw, and writes no date, for a ShortText answer', async () => {
    const fake = provider();
    const result = await persistSubmission(
      fake.provider,
      wireInputs(SHORT_TEXT_QUESTION, { textValue: 'hello world' }),
      makeContextUser(),
    );

    expect(result.outcome).toBe('saved');
    // The answer row WAS saved (so the assertion is not vacuous) and carries the text...
    expect(savedAnswers(fake)).toHaveLength(1);
    expect(savedAnswers(fake)[0].TextValue).toBe('hello world');
    // ...while the date column was never written at all. Not written and written-as-null are the
    // same row: a new record defaults to null, and `rewriteAnswer` nulls every column first.
    expect(storedDateValues(fake)[0] ?? null).toBeNull();
  });

  it('does not throw for a Date question whose answer was cleared', async () => {
    const fake = provider();
    const result = await persistSubmission(fake.provider, wireInputs(DATE_QUESTION, {}), makeContextUser());

    expect(result.outcome).toBe('saved');
    expect(savedAnswers(fake)).toHaveLength(1);
    expect(storedDateValues(fake)[0] ?? null).toBeNull();
  });

  it('still stores a real clock when dateValue IS populated in that same shape', async () => {
    const fake = provider();
    const result = await persistSubmission(
      fake.provider,
      wireInputs(TIME_QUESTION, { dateValue: '14:30' }),
      makeContextUser(),
    );

    expect(result.outcome).toBe('saved');
    expect((storedDateValues(fake)[0] as Date).toISOString()).toBe('1970-01-01T14:30:00.000Z');
  });
});

describe('every typed column treats an explicit null as "not supplied"', () => {
  // With the transport types widened to admit the `null` they really carry, `!== undefined` is no
  // longer merely redundant on the other branches — it is wrong. The date column was fixed first
  // because it CRASHED; `jsonValue` corrupts instead, which is quieter: `JSON.stringify(null)` is
  // the four-character string `'null'`, and `collapseAnswer` then reads that row as an ANSWERED
  // question holding null. Absent and null mean the same thing to every reader, so every branch
  // now tests the same way.
  it('does not turn a null jsonValue into the four-character string "null"', async () => {
    const fake = provider();
    const result = await persistSubmission(
      fake.provider,
      wireInputs(SHORT_TEXT_QUESTION, { textValue: 'hello' }),
      makeContextUser(),
    );

    expect(result.outcome).toBe('saved');
    const [saved] = savedAnswers(fake);
    expect(saved.TextValue).toBe('hello');
    expect(saved.JSONValue ?? null).toBeNull();
  });

  it('leaves every unused typed column unwritten', async () => {
    const fake = provider();
    await persistSubmission(fake.provider, wireInputs(SHORT_TEXT_QUESTION, { textValue: 'x' }), makeContextUser());
    const [saved] = savedAnswers(fake);

    for (const column of ['NumericValue', 'DateValue', 'BooleanValue', 'JSONValue', 'FileID'] as const) {
      expect(saved[column] ?? null, column).toBeNull();
    }
  });
});
