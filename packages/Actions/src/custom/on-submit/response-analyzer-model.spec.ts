/**
 * Unit tests for {@link coerceAnalyzedAnswers} — the tolerant JSON boundary of the
 * response-analyzer model seam.
 *
 * The real-world failure this guards against: the Gemini model's JSON output is
 * truncated mid-array by a low output-token cap on the shared (core-owned) AI Model
 * Vendor row, so `attemptJSONRepair` can't fix it and a strict parse throws — dropping
 * ALL scores. The salvage path recovers the complete leading answers instead.
 */
import { describe, it, expect } from 'vitest';
import { coerceAnalyzedAnswers, type AnalyzedAnswer } from './response-analyzer-model';

describe('coerceAnalyzedAnswers', () => {
  it('returns a fully valid parsed object unchanged (happy path)', () => {
    const parsed = {
      answers: [
        { score: 90, rationale: 'Clear.' },
        { score: 40, rationale: 'Vague.' },
      ],
    };
    expect(coerceAnalyzedAnswers(parsed, undefined)).toEqual(parsed.answers);
  });

  it('parses a valid raw payload when no parsed object is supplied', () => {
    const raw = JSON.stringify({ answers: [{ score: 55, rationale: 'ok' }] });
    const out = coerceAnalyzedAnswers(undefined, raw);
    expect(out).toEqual([{ score: 55, rationale: 'ok' }]);
  });

  it('salvages the complete leading answers from a truncated payload (2 complete + 1 partial → 2)', () => {
    // Third object is cut off mid-value — exactly the observed Gemini truncation.
    const truncated =
      '{"answers":[' +
      '{"questionPrompt":"Q1","score":90,"rationale":"Clear and positive."},' +
      '{"questionPrompt":"Q2","score":55,"rationale":"Somewhat vague."},' +
      '{"questionPrompt":"Q3","score":30,"rationale":"Off to';
    const out = coerceAnalyzedAnswers(undefined, truncated);
    expect(out).toHaveLength(2);
    expect(out[0].score).toBe(90);
    expect(out[1].rationale).toBe('Somewhat vague.');
  });

  it('respects nested braces and string literals containing braces/quotes while salvaging', () => {
    const truncated =
      '{"answers":[' +
      '{"score":70,"rationale":"has a {brace} and a \\"quote\\" inside"},' +
      '{"score":20,"rationale":"trailing cut';
    const out: AnalyzedAnswer[] = coerceAnalyzedAnswers(undefined, truncated);
    expect(out).toHaveLength(1);
    expect(out[0].rationale).toBe('has a {brace} and a "quote" inside');
  });

  it('throws when zero answers can be salvaged (unsalvageable garbage)', () => {
    expect(() => coerceAnalyzedAnswers(undefined, 'not json at all {{{')).toThrow(/valid "answers" array/);
  });

  it('throws when a truncated payload has no complete answer objects', () => {
    const truncated = '{"answers":[{"score":30,"rationale":"cut off mid';
    expect(() => coerceAnalyzedAnswers(undefined, truncated)).toThrow(/valid "answers" array/);
  });

  it('throws when neither parsed nor raw is available', () => {
    expect(() => coerceAnalyzedAnswers(undefined, undefined)).toThrow(/valid "answers" array/);
  });
});
