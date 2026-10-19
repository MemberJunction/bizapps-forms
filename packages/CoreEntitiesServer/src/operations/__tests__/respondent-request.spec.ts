/**
 * The wire-to-contract answer mapping `Forms.SaveResponse` applies (moved from forms-server's
 * `input-mapping.spec.ts`, whose GraphQL mapping it replaces — #303 Task 8), and the caller read off
 * the request-identity store.
 */
import { describe, expect, it, vi } from 'vitest';
import type { FormsAnswerInput } from '@mj-biz-apps/forms-entities';

const logStatus = vi.hoisted(() => vi.fn());
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogStatus: (...args: unknown[]) => logStatus(...args),
}));
import { respondentCallerFromRequest, toAnswerInput, toClientMeta } from '../respondent-request.js';
import { runWithRequestIdentity } from '../../shared/request-identity.js';

/** A wire answer as a client may send it: every unused typed field an explicit `null`. */
function wireAnswer(overrides: Partial<FormsAnswerInput>): FormsAnswerInput {
  return {
    QuestionID: 'q1',
    TextValue: null,
    NumericValue: null,
    DateValue: null,
    BooleanValue: null,
    JSONValue: null,
    FileID: null,
    ...overrides,
  };
}

describe('toAnswerInput (JSONValue null-safety)', () => {
  it('does NOT throw when JSONValue is null (regression: null.trim() 500ed every submit)', () => {
    expect(() => toAnswerInput(wireAnswer({ TextValue: 'hello' }))).not.toThrow();
    const mapped = toAnswerInput(wireAnswer({ TextValue: 'hello' }));
    expect(mapped.jsonValue).toBeUndefined();
    expect(mapped.textValue).toBe('hello');
    expect(mapped.questionId).toBe('q1');
  });

  it('parses a JSON-text JSONValue into an array (MultiChoice)', () => {
    expect(toAnswerInput(wireAnswer({ JSONValue: JSON.stringify(['none', 'vegan']) })).jsonValue).toEqual(['none', 'vegan']);
  });

  it('drops malformed/blank JSONValue to undefined rather than throwing', () => {
    expect(toAnswerInput(wireAnswer({ JSONValue: '{not json' })).jsonValue).toBeUndefined();
    expect(toAnswerInput(wireAnswer({ JSONValue: '   ' })).jsonValue).toBeUndefined();
  });

  it('logs a JSONValue that does not parse, naming the question and never the value', () => {
    logStatus.mockClear();
    toAnswerInput(wireAnswer({ QuestionID: 'q-multi', JSONValue: '{"secret": not json' }));
    const line = String(logStatus.mock.calls.at(-1)?.[0]);
    expect(line).toContain('q-multi');
    expect(line).not.toContain('secret');
  });

  it('carries every other typed column through untouched', () => {
    const mapped = toAnswerInput(
      wireAnswer({ NumericValue: 7, DateValue: '2026-10-13', BooleanValue: false, FileID: 'file-1' }),
    );
    expect(mapped).toMatchObject({ numericValue: 7, dateValue: '2026-10-13', booleanValue: false, fileId: 'file-1' });
  });
});

describe('toClientMeta', () => {
  it('keeps the two text fields and nothing else; none for absent', () => {
    expect(toClientMeta({ Referrer: 'https://a.example', UserAgent: 'UA' })).toEqual({ referrer: 'https://a.example', userAgent: 'UA' });
    expect(toClientMeta(undefined)).toBeUndefined();
  });
});

describe('respondentCallerFromRequest', () => {
  it('reads the session header, address hash and origin from the request-identity store', () => {
    const caller = runWithRequestIdentity({ ipHash: 'hash-1', origin: 'https://site.example', sessionId: 'sess-9' }, () =>
      respondentCallerFromRequest(),
    );
    expect(caller).toEqual({ sessionId: 'sess-9', ipHash: 'hash-1', origin: 'https://site.example' });
  });

  it('is an anonymous caller with a blank session outside any request', () => {
    expect(respondentCallerFromRequest()).toEqual({ sessionId: '', ipHash: undefined, origin: undefined });
  });
});
