import { describe, expect, it } from 'vitest';
import type {
  AnswerValue,
  PublishedFormDefinition,
  PublishedFormQuestion,
  ResumeSnapshot,
  StoredAnswerRow,
} from '@mj-biz-apps/forms-entities';

import { prefillFromResume, type PrefillTarget } from './resume-prefill';

const TEXT_Q = 'aaaaaaaa-0000-4000-8000-00000000000a';
const NUM_Q = 'bbbbbbbb-0000-4000-8000-00000000000b';
const BOOL_Q = 'cccccccc-0000-4000-8000-00000000000c';
const MULTI_Q = 'dddddddd-0000-4000-8000-00000000000d';
const FILE_Q = 'eeeeeeee-0000-4000-8000-00000000000e';
const DATE_Q = 'ffffffff-0000-4000-8000-00000000000f';
const TIME_Q = '11111111-0000-4000-8000-000000000011';
const STATEMENT_Q = '22222222-0000-4000-8000-000000000022';

function question(id: string, type: PublishedFormQuestion['type']): PublishedFormQuestion {
  return { id, type, prompt: type, isRequired: false, displayOrder: 1, options: [] };
}

const DEFINITION: Pick<PublishedFormDefinition, 'pages'> = {
  pages: [
    {
      questions: [
        question(TEXT_Q, 'ShortText'),
        question(NUM_Q, 'Number'),
        question(BOOL_Q, 'YesNo'),
        question(MULTI_Q, 'MultiChoice'),
        question(FILE_Q, 'FileUpload'),
        question(DATE_Q, 'Date'),
        question(TIME_Q, 'Time'),
        question(STATEMENT_Q, 'Statement'),
      ],
      id: 'page-1',
      title: '',
      displayOrder: 1,
    },
  ],
};

function snapshotWith(answers: StoredAnswerRow[]): ResumeSnapshot {
  return { responseId: 'r-1', status: 'Partial', formVersionId: 'v-1', answers };
}

/** Records what prefill wrote, so the assertions are about the answer map rather than a runtime. */
function target(): PrefillTarget & { values: Map<string, AnswerValue> } {
  const values = new Map<string, AnswerValue>();
  return { values, setValue: (id, value) => values.set(id, value) };
}

describe('prefillFromResume', () => {
  it('routes each stored column into the answer its question type expects', () => {
    const t = target();

    const result = prefillFromResume(
      t,
      DEFINITION,
      snapshotWith([
        { QuestionID: TEXT_Q, TextValue: 'Ada' },
        { QuestionID: NUM_Q, NumericValue: 42 },
        { QuestionID: BOOL_Q, BooleanValue: true },
        { QuestionID: MULTI_Q, JSONValue: '["a","b"]' },
        { QuestionID: FILE_Q, FileID: 'file-1' },
      ]),
    );

    expect(t.values.get(TEXT_Q)).toBe('Ada');
    expect(t.values.get(NUM_Q)).toBe(42);
    expect(t.values.get(BOOL_Q)).toBe(true);
    expect(t.values.get(MULTI_Q)).toEqual(['a', 'b']);
    expect(t.values.get(FILE_Q)).toBe('file-1');
    expect(result).toEqual({ applied: 5, dropped: [] });
  });

  it('puts a date and a time back in the spelling their controls accept', () => {
    const t = target();

    prefillFromResume(
      t,
      DEFINITION,
      snapshotWith([
        { QuestionID: DATE_Q, DateValue: '2026-09-01T00:00:00.000Z' },
        { QuestionID: TIME_Q, DateValue: '1970-01-01T14:30:00.000Z' },
      ]),
    );

    expect(t.values.get(DATE_Q)).toBe('2026-09-01');
    expect(t.values.get(TIME_Q)).toBe('14:30');
  });

  it('keeps only answers whose question still exists in this version, and says which it dropped', () => {
    const t = target();

    const result = prefillFromResume(t, DEFINITION, snapshotWith([{ QuestionID: 'gone', TextValue: 'x' }]));

    expect(t.values.size).toBe(0);
    expect(result).toEqual({ applied: 0, dropped: ['gone'] });
  });

  it('matches question ids case-insensitively, because the two sides spell a GUID differently', () => {
    // The snapshot's ids come back from SQL Server uppercased; the published definition carries
    // the lowercase spelling MJ minted. A case-sensitive match would drop EVERY answer of EVERY
    // resumed draft, and would look like a form whose questions had all been deleted.
    const t = target();

    const result = prefillFromResume(t, DEFINITION, snapshotWith([{ QuestionID: TEXT_Q.toUpperCase(), TextValue: 'Ada' }]));

    expect(t.values.get(TEXT_Q)).toBe('Ada');
    expect(result.applied).toBe(1);
  });

  it("drops a value it cannot put back in the control's own spelling, rather than showing a wrong one", () => {
    const t = target();

    const result = prefillFromResume(t, DEFINITION, snapshotWith([{ QuestionID: TIME_Q, DateValue: 'not-a-date' }]));

    expect(t.values.size).toBe(0);
    expect(result.dropped).toEqual([TIME_Q]);
  });

  it('drops a date that carries a time component, which a date control would silently blank', () => {
    const t = target();

    const result = prefillFromResume(t, DEFINITION, snapshotWith([{ QuestionID: DATE_Q, DateValue: '2026-09-01T15:00:00.000Z' }]));

    expect(t.values.size).toBe(0);
    expect(result.dropped).toEqual([DATE_Q]);
  });

  it('drops an answer stored in the column a CHANGED question type no longer uses', () => {
    // The author turned a ShortText into a Number after the draft was saved. Reading "whichever
    // column has something in it" would hand a number control the old string.
    const t = target();

    const result = prefillFromResume(t, DEFINITION, snapshotWith([{ QuestionID: NUM_Q, TextValue: 'Ada' }]));

    expect(t.values.size).toBe(0);
    expect(result.dropped).toEqual([NUM_Q]);
  });

  it('ignores a stored row against a display-only question', () => {
    const t = target();

    const result = prefillFromResume(t, DEFINITION, snapshotWith([{ QuestionID: STATEMENT_Q, TextValue: 'x' }]));

    expect(t.values.size).toBe(0);
    expect(result.dropped).toEqual([STATEMENT_Q]);
  });

  it('is a no-op for a draft with no answers yet', () => {
    const t = target();

    expect(prefillFromResume(t, DEFINITION, snapshotWith([]))).toEqual({ applied: 0, dropped: [] });
  });
});
