/**
 * Unit tests for the response-analyzer model seam:
 *  - {@link coerceAnalyzedAnswers} — the tolerant JSON boundary.
 *  - {@link AIPromptResponseAnalyzerModel} — the default `analyze()` that runs the named MJ AI
 *    Prompt, with `AIEngine`/`AIPromptRunner` mocked out so it runs offline.
 *
 * The real-world failure `coerceAnalyzedAnswers` guards against: the Gemini model's JSON output is
 * truncated mid-array by a low output-token cap on the shared (core-owned) AI Model
 * Vendor row, so `attemptJSONRepair` can't fix it and a strict parse throws — dropping
 * ALL scores. The salvage path recovers the complete leading answers instead.
 */
import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { AIPromptParams } from '@memberjunction/ai-core-plus';
import type { ActionDataProvider } from '../shared/action-provider';
import type { AnalyzedAnswer } from './response-analyzer-model';

/** What `AIPromptRunner.ExecutePrompt` returns — captured so the test can inspect its `params`. */
const executePrompt = vi.fn<
  (params: AIPromptParams) => Promise<{ success: boolean; result?: unknown; rawResult?: string }>
>(async () => ({ success: true, result: { answers: [{ score: 80, rationale: 'Clear.' }] } }));

vi.mock('@memberjunction/ai-prompts', () => ({
  AIPromptRunner: vi.fn().mockImplementation(() => ({ ExecutePrompt: executePrompt })),
}));

// `AIEngine.Instance.Prompts` is filled in AFTER the dynamic import below resolves the real
// RESPONSE_ANALYZER_PROMPT_NAME, so this mock never hand-copies a second literal of that constant —
// the getter reads it lazily, by which time the import has completed.
const engineState: { prompts: { Name: string }[] } = { prompts: [] };
vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: {
    Instance: {
      Config: vi.fn(async () => undefined),
      get Prompts() {
        return engineState.prompts;
      },
    },
  },
}));

const { coerceAnalyzedAnswers, AIPromptResponseAnalyzerModel, RESPONSE_ANALYZER_PROMPT_NAME } =
  await import('./response-analyzer-model');
engineState.prompts = [{ Name: RESPONSE_ANALYZER_PROMPT_NAME }];

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

describe('AIPromptResponseAnalyzerModel.analyze', () => {
  it('hands the resolved provider to the prompt run (#260)', async () => {
    const fakeUser = { Name: 'tester' } as unknown as UserInfo;
    const fakeProvider = { name: 'fake-provider' } as unknown as ActionDataProvider;

    const analyzed = await new AIPromptResponseAnalyzerModel().analyze(
      [{ questionPrompt: 'What worked?', text: 'Great venue' }],
      'Feedback Form',
      fakeUser,
      fakeProvider,
    );

    expect(analyzed).toEqual([{ score: 80, rationale: 'Clear.' }]);
    expect(executePrompt).toHaveBeenCalledOnce();
    // The one thing this test exists to pin: the provider `analyze()` was called with reaches the
    // prompt run's AIPromptParams — identity, not just a structurally-equal copy — so an isolated
    // provider (a later task's #260 fix) actually participates in the prompt call rather than the
    // run silently falling back to whatever provider AIPromptRunner defaults to.
    const capturedParams = executePrompt.mock.calls[0][0];
    expect(capturedParams.provider).toBe(fakeProvider);
  });
});
