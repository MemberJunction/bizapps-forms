import { describe, expect, it } from 'vitest';
import type { FormAnswerInputType } from '../graphql-types';
import { toAnswerInputs } from '../input-mapping';

/** A GraphQL answer as it actually arrives: omitted typed fields are coerced to `null`. */
function gqlAnswer(overrides: Partial<FormAnswerInputType>): FormAnswerInputType {
  return {
    questionId: 'q1',
    textValue: null,
    numericValue: null,
    dateValue: null,
    booleanValue: null,
    jsonValue: null,
    fileId: null,
    ...overrides,
  } as FormAnswerInputType;
}

describe('toAnswerInputs (parseJsonValue null-safety)', () => {
  it('does NOT throw when jsonValue is null (regression: null.trim() 500ed every submit)', () => {
    expect(() => toAnswerInputs([gqlAnswer({ textValue: 'hello' })])).not.toThrow();
    const [mapped] = toAnswerInputs([gqlAnswer({ textValue: 'hello' })]);
    expect(mapped.jsonValue).toBeUndefined();
    expect(mapped.textValue).toBe('hello');
  });

  it('parses a JSON-string jsonValue into an array (MultiChoice)', () => {
    const [mapped] = toAnswerInputs([gqlAnswer({ jsonValue: JSON.stringify(['none', 'vegan']) })]);
    expect(mapped.jsonValue).toEqual(['none', 'vegan']);
  });

  it('drops malformed/blank jsonValue to undefined rather than throwing', () => {
    expect(toAnswerInputs([gqlAnswer({ jsonValue: '{not json' })])[0].jsonValue).toBeUndefined();
    expect(toAnswerInputs([gqlAnswer({ jsonValue: '   ' })])[0].jsonValue).toBeUndefined();
  });
});
