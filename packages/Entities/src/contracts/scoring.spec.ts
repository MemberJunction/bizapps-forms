import { describe, expect, it } from 'vitest';
import type { AnswerValue, ConditionalRule } from './conditional-rule';
import { evaluateConditionalRule } from './conditional-rule';
import { computeScore, parseQuestionScoring, serializeQuestionScoring, type ScorableQuestion } from './scoring';

function answers(record: Record<string, AnswerValue>): Map<string, AnswerValue> {
  return new Map(Object.entries(record));
}

function scored(id: string, points: Record<string, number>): ScorableQuestion {
  return { id, scoring: { points } };
}

describe('computeScore', () => {
  describe('happy', () => {
    it('sums the points of the selected options across questions', () => {
      const questions = [scored('q1', { a: 10, b: 5 }), scored('q2', { yes: 3 })];
      expect(computeScore(questions, answers({ q1: 'a', q2: 'yes' }))).toBe(13);
      expect(computeScore(questions, answers({ q1: 'b' }))).toBe(5);
    });

    it('multi-select sums every selected option', () => {
      const questions = [scored('q1', { a: 1, b: 2, c: 4 })];
      expect(computeScore(questions, answers({ q1: ['a', 'c'] }))).toBe(5);
    });
  });

  describe('edge', () => {
    it('unanswered and unscored questions contribute nothing', () => {
      const questions = [scored('q1', { a: 10 }), { id: 'q2' }];
      expect(computeScore(questions, answers({ q2: 'anything' }))).toBe(0);
    });

    it('an answer with no points entry contributes 0, not an error', () => {
      expect(computeScore([scored('q1', { a: 10 })], answers({ q1: 'other' }))).toBe(0);
    });

    it('negative points subtract — a penalty is a legitimate rubric', () => {
      expect(computeScore([scored('q1', { bad: -5, good: 5 })], answers({ q1: 'bad' }))).toBe(-5);
    });

    it('numeric answers score through their string spelling', () => {
      expect(computeScore([scored('q1', { '5': 2 })], answers({ q1: 5 }))).toBe(2);
    });
  });

  describe('worst', () => {
    it('non-finite and non-numeric point entries contribute 0 — the total is always finite', () => {
      const questions: ScorableQuestion[] = [
        { id: 'q1', scoring: { points: { a: Infinity, b: NaN } } },
        scored('q2', { ok: 1 }),
      ];
      const total = computeScore(questions, answers({ q1: 'a', q2: 'ok' }));
      expect(total).toBe(1);
      expect(Number.isFinite(total)).toBe(true);
    });

    it('prototype-chain names never score', () => {
      expect(computeScore([scored('q1', { real: 1 })], answers({ q1: 'constructor' }))).toBe(0);
    });

    it('a composite (object) answer contributes 0 rather than crashing', () => {
      expect(computeScore([scored('q1', { a: 1 })], answers({ q1: { line1: 'x' } }))).toBe(0);
    });
  });
});

describe('score conditions through the evaluator', () => {
  const band: ConditionalRule = { show: { all: [{ source: 'score', op: 'greaterThan', value: 70 }] } };

  describe('happy', () => {
    it('bands compare against the supplied score', () => {
      expect(evaluateConditionalRule(band, answers({}), { score: 80 })).toBe(true);
      expect(evaluateConditionalRule(band, answers({}), { score: 70 })).toBe(false);
    });
  });

  describe('edge', () => {
    it('an unscored form scores 0, and 0 is a real score a band can read', () => {
      const zeroBand: ConditionalRule = { show: { all: [{ source: 'score', op: 'lessThan', value: 50 }] } };
      const score = computeScore([], answers({}));
      expect(score).toBe(0);
      expect(evaluateConditionalRule(zeroBand, answers({}), { score })).toBe(true);
    });
  });

  describe('worst', () => {
    it('where no score was computed, a score condition never fires — unknown is not zero', () => {
      expect(evaluateConditionalRule(band, answers({}))).toBe(false);
      const lowBand: ConditionalRule = { show: { all: [{ source: 'score', op: 'lessThan', value: 50 }] } };
      expect(evaluateConditionalRule(lowBand, answers({}))).toBe(false);
    });

    it('a question condition with no questionId never fires, even isNotAnswered', () => {
      const malformed: ConditionalRule = { show: { all: [{ op: 'isNotAnswered' }] } };
      expect(evaluateConditionalRule(malformed, answers({}))).toBe(false);
    });
  });
});

describe('parseQuestionScoring', () => {
  describe('happy', () => {
    it('parses points from a JSON string or an object', () => {
      expect(parseQuestionScoring('{"points":{"a":2,"b":1}}')).toEqual({ points: { a: 2, b: 1 } });
      expect(parseQuestionScoring({ points: { a: 2 } })).toEqual({ points: { a: 2 } });
    });
  });

  describe('edge', () => {
    it('keeps only finite numeric entries', () => {
      expect(parseQuestionScoring({ points: { a: 1, b: 'high', c: null, d: Infinity } })).toEqual({
        points: { a: 1 },
      });
    });

    it('the documented LLM-judge use of the column is not scoring', () => {
      expect(parseQuestionScoring('Grade this essay generously.')).toBeUndefined();
      expect(parseQuestionScoring({ judgePrompt: 'Grade this.' })).toBeUndefined();
    });
  });

  describe('worst', () => {
    it('null, blank, arrays, and garbage all mean "does not score"', () => {
      expect(parseQuestionScoring(null)).toBeUndefined();
      expect(parseQuestionScoring(undefined)).toBeUndefined();
      expect(parseQuestionScoring('')).toBeUndefined();
      expect(parseQuestionScoring('[1,2]')).toBeUndefined();
      expect(parseQuestionScoring({ points: [] })).toBeUndefined();
      expect(parseQuestionScoring({ points: {} })).toBeUndefined();
    });
  });
});

describe('serializeQuestionScoring', () => {
  describe('happy', () => {
    it('round-trips through parse', () => {
      const json = serializeQuestionScoring(null, { points: { a: 2 } });
      expect(parseQuestionScoring(json)).toEqual({ points: { a: 2 } });
    });
  });

  describe('edge', () => {
    it('preserves sibling keys the column already holds', () => {
      const existing = '{"judgePrompt":"Grade this."}';
      const withPoints = serializeQuestionScoring(existing, { points: { a: 1 } });
      expect(JSON.parse(withPoints ?? '{}')).toEqual({ judgePrompt: 'Grade this.', points: { a: 1 } });
      const removed = serializeQuestionScoring(withPoints, undefined);
      expect(JSON.parse(removed ?? '{}')).toEqual({ judgePrompt: 'Grade this.' });
    });
  });

  describe('worst', () => {
    it('removing points from an empty column stays null; free text is preserved untouched', () => {
      expect(serializeQuestionScoring(null, undefined)).toBeNull();
      expect(serializeQuestionScoring('not json', undefined)).toBe('not json');
    });
  });
});
