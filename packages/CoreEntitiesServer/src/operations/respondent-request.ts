/**
 * What the two respondent operations take from the HTTP request rather than from their input — and
 * the one place that maps the wire's answers onto the contracts' shape (#303 Task 8).
 *
 * A Remote Operation is handed no `AppContext` and no request, so the caller's address hash, origin
 * and `x-session-id` come from the request-identity store `RequestIdentityMiddleware` (forms-server)
 * enters pre-auth. Outside a request (a test, an in-process `.Execute()`), all three are absent,
 * which every gate already treats as "no address / no origin / no session".
 */
import { LogStatus } from '@memberjunction/core';
import type { FormAnswerInput, FormsAnswerInput, FormsClientMeta, ClientMeta, JSONValue } from '@mj-biz-apps/forms-entities';
import { currentRequestIdentity } from '../shared/request-identity.js';
import type { RespondentCaller } from '../submission/save-request.js';

/** The current request's caller, as the respondent engine reads it. */
export function respondentCallerFromRequest(): RespondentCaller {
  const identity = currentRequestIdentity();
  return { sessionId: identity?.sessionId ?? '', ipHash: identity?.ipHash, origin: identity?.origin };
}

/**
 * One wire answer as the contracts' `FormAnswerInput`. `JSONValue` travels as JSON TEXT and is parsed
 * here; malformed JSON becomes "no JSON value" rather than a throw — the validator then judges the
 * question as unanswered, exactly as the retired GraphQL mapping did (now logged). Call only on an
 * answer {@link answerColumnRefusal} admitted. `null` and absent both mean
 * "this answer does not use this column" (a client may send an explicit null for any of them).
 */
export function toAnswerInput(answer: FormsAnswerInput): FormAnswerInput {
  return {
    questionId: answer.QuestionID,
    textValue: answer.TextValue,
    numericValue: answer.NumericValue,
    dateValue: answer.DateValue,
    booleanValue: answer.BooleanValue,
    jsonValue: parseJsonValue(answer.JSONValue, answer.QuestionID),
    fileId: answer.FileID,
  };
}

/**
 * The type each answer column must carry — what the retired GraphQL input enforced per field
 * (`String`, `Float`, `Boolean`, `ID`). A Remote Operation's input is only `JSON.parse`d, so without
 * this an object or array `TextValue` on a ShortText question, or `"nope"` as a `BooleanValue`,
 * reached `validateAnswers` — which judges VALUES, not wire types — and was stored as an answer.
 * `null` and absent always pass: they mean "this answer does not use this column".
 */
const ANSWER_COLUMN_RULES: readonly { column: keyof FormsAnswerInput; accepts: (value: unknown) => boolean; must: string }[] = [
  { column: 'TextValue', accepts: (v) => typeof v === 'string', must: 'TextValue must be text' },
  { column: 'NumericValue', accepts: (v) => typeof v === 'number' && Number.isFinite(v), must: 'NumericValue must be a finite number' },
  { column: 'DateValue', accepts: (v) => typeof v === 'string', must: 'DateValue must be text' },
  { column: 'BooleanValue', accepts: (v) => typeof v === 'boolean', must: 'BooleanValue must be true or false' },
  { column: 'JSONValue', accepts: (v) => typeof v === 'string', must: 'JSONValue must be JSON text' },
  { column: 'FileID', accepts: (v) => typeof v === 'string', must: 'FileID must be text' },
];

/**
 * Why this wire answer's columns do not carry the types they store, or `null` when they all do.
 * Only the first problem is named: the caller sent a malformed request, not a respondent's mistake.
 */
export function answerColumnRefusal(answer: FormsAnswerInput): string | null {
  const fields = answer as unknown as Record<string, unknown>;
  for (const rule of ANSWER_COLUMN_RULES) {
    const value = fields[rule.column];
    if (value !== undefined && value !== null && !rule.accepts(value)) {
      return rule.must;
    }
  }
  return null;
}

/** The client telemetry, or none. */
export function toClientMeta(meta: FormsClientMeta | undefined | null): ClientMeta | undefined {
  if (!meta || typeof meta !== 'object') {
    return undefined;
  }
  return { referrer: textOrUndefined(meta.Referrer), userAgent: textOrUndefined(meta.UserAgent) };
}

function parseJsonValue(raw: string | null | undefined, questionId: string): JSONValue | undefined {
  if (raw == null || typeof raw !== 'string' || raw.trim() === '') {
    return undefined;
  }
  try {
    return JSON.parse(raw) as JSONValue;
  } catch {
    // Not a refusal — the validator then judges the question unanswered, as the retired mapping did —
    // but logged, with the question and NEVER the value: it is the respondent's answer, and
    // `JSON.parse`'s own message quotes the text it choked on, so it is deliberately not appended.
    LogStatus(`[Forms] Forms.SaveResponse: the JSONValue of the answer to question ${questionId} is not valid JSON; treated as no JSON value.`);
    return undefined;
  }
}

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
