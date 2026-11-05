import { describe, it, expect } from 'vitest';
import type { FormsAnswerInput, FormsSaveResponseInput } from '@mj-biz-apps/forms-entities';
import type { FormAnswerInput } from '@mj-biz-apps/forms-entities/contracts';
import { ANSWER_FIELD_ON_THE_WIRE, toSaveResponseInput, toWireAnswer, type RespondentSave } from './submission-mapping';

// NOTE: the COMPILE-TIME contract locks live in submission-mapping.ts (checked by ngc and the spec
// typecheck); these are the runtime assertions that the mapping emits exactly those keys.

function save(overrides?: Partial<RespondentSave>): RespondentSave {
  return {
    distributionSlug: 'slug-1',
    formVersionId: 'ver-1',
    mode: 'partial',
    clientResponseId: 'client-id-1',
    startedAt: '2026-01-01T00:00:00Z',
    clientMeta: { referrer: 'r', userAgent: 'ua' },
    answers: [{ questionId: 'q1', textValue: 'hi' }],
    ...overrides,
  };
}

/** Every key `Forms.SaveResponse` takes — the generated input type's. */
const SAVE_INPUT_FIELDS: readonly (keyof FormsSaveResponseInput)[] = [
  'Slug',
  'FormVersionID',
  'Mode',
  'ClientResponseID',
  'StartedAt',
  'TurnstileToken',
  'ClientMeta',
  'Answers',
];

describe('Forms.SaveResponse input mapping', () => {
  it('fills every field of the operation input when the widget has a value for it', () => {
    const wire = toSaveResponseInput(save({ turnstileToken: 'tok', mode: 'final' }));
    expect(new Set(Object.keys(wire))).toEqual(new Set(SAVE_INPUT_FIELDS));
    expect(wire).toEqual({
      Slug: 'slug-1',
      FormVersionID: 'ver-1',
      Mode: 'final',
      ClientResponseID: 'client-id-1',
      StartedAt: '2026-01-01T00:00:00Z',
      TurnstileToken: 'tok',
      ClientMeta: { Referrer: 'r', UserAgent: 'ua' },
      Answers: [{ QuestionID: 'q1', TextValue: 'hi' }],
    });
  });

  it('leaves the optional fields absent rather than undefined-valued when the widget has none', () => {
    const wire = toSaveResponseInput(save({ startedAt: undefined, turnstileToken: undefined, clientMeta: undefined }));
    expect(Object.keys(wire).sort()).toEqual(['Answers', 'ClientResponseID', 'FormVersionID', 'Mode', 'Slug']);
  });

  it('always carries the client response id — the operation requires it (#303 Task 8 deviation 3)', () => {
    expect(toSaveResponseInput(save()).ClientResponseID).toBe('client-id-1');
  });
});

describe('answer mapping', () => {
  it('maps every contract answer field to its wire key', () => {
    const full: Required<FormAnswerInput> = {
      questionId: 'q1',
      textValue: 't',
      numericValue: 2,
      dateValue: '2026-01-01',
      booleanValue: true,
      jsonValue: ['a'],
      fileId: 'f',
    };
    const wire = toWireAnswer(full);
    expect(new Set(Object.keys(wire))).toEqual(new Set(Object.values(ANSWER_FIELD_ON_THE_WIRE)));
    expect(wire).toEqual<FormsAnswerInput>({
      QuestionID: 'q1',
      TextValue: 't',
      NumericValue: 2,
      DateValue: '2026-01-01',
      BooleanValue: true,
      JSONValue: '["a"]',
      FileID: 'f',
    });
  });

  it('writes only the columns the answer uses — the server refuses a column its type does not store', () => {
    expect(toWireAnswer({ questionId: 'q1', numericValue: 7 })).toEqual({ QuestionID: 'q1', NumericValue: 7 });
  });

  it('stringifies a structured jsonValue (the one deliberate wire divergence), and keeps an explicit null', () => {
    expect(toWireAnswer({ questionId: 'q1', jsonValue: { row: ['a', 'b'] } }).JSONValue).toBe(JSON.stringify({ row: ['a', 'b'] }));
    expect(toWireAnswer({ questionId: 'q1', jsonValue: null }).JSONValue).toBeNull();
  });
});
