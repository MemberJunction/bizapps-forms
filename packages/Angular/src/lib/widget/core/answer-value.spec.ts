import { describe, it, expect } from 'vitest';
import type { AnswerValue, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';
import { toAnswerInputs } from './answer-value';

function q(id: string, type: PublishedFormQuestion['type']): PublishedFormQuestion {
  return { id, type, prompt: id, isRequired: false, displayOrder: 1, options: [] };
}

describe('toAnswerInputs', () => {
  it('routes each value into the correct typed column', () => {
    const questions = [
      q('text', 'ShortText'),
      q('num', 'Number'),
      q('rate', 'Rating'),
      q('yn', 'YesNo'),
      q('date', 'Date'),
      q('multi', 'MultiChoice'),
      q('file', 'FileUpload'),
    ];
    const answers = new Map<string, AnswerValue>([
      ['text', 'hello'],
      ['num', 42],
      ['rate', 5],
      ['yn', true],
      ['date', '2026-01-01'],
      ['multi', ['a', 'b']],
      ['file', 'file-123'],
    ]);
    expect(toAnswerInputs(questions, answers)).toEqual([
      { questionId: 'text', textValue: 'hello' },
      { questionId: 'num', numericValue: 42 },
      { questionId: 'rate', numericValue: 5 },
      { questionId: 'yn', booleanValue: true },
      { questionId: 'date', dateValue: '2026-01-01' },
      { questionId: 'multi', jsonValue: ['a', 'b'] },
      { questionId: 'file', fileId: 'file-123' },
    ]);
  });

  it('skips unanswered and Statement questions', () => {
    const questions = [q('a', 'ShortText'), q('s', 'Statement'), q('b', 'ShortText')];
    const answers = new Map<string, AnswerValue>([['a', 'x'], ['s', 'ignored'], ['b', '']]);
    expect(toAnswerInputs(questions, answers)).toEqual([{ questionId: 'a', textValue: 'x' }]);
  });
});
