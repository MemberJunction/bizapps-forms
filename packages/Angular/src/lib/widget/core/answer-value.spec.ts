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

describe('toAnswerInputs — the types added with element parity', () => {
  it('routes every new type by its declared column, not by a name in a switch', () => {
    const questions = [
      q('web', 'Website'),
      q('scale', 'OpinionScale'),
      q('consent', 'Checkbox'),
      q('legal', 'Legal'),
      q('pic', 'PictureChoice'),
      q('rank', 'Ranking'),
      q('sign', 'Signature'),
    ];
    const answers = new Map<string, AnswerValue>([
      ['web', 'https://example.com'],
      ['scale', 7],
      ['consent', true],
      ['legal', false],
      ['pic', 'workshop'],
      ['rank', ['a', 'b']],
      ['sign', 'file-sig'],
    ]);
    expect(toAnswerInputs(questions, answers)).toEqual([
      { questionId: 'web', textValue: 'https://example.com' },
      { questionId: 'scale', numericValue: 7 },
      { questionId: 'consent', booleanValue: true },
      { questionId: 'legal', booleanValue: false },
      { questionId: 'pic', textValue: 'workshop' },
      { questionId: 'rank', jsonValue: ['a', 'b'] },
      { questionId: 'sign', fileId: 'file-sig' },
    ]);
  });

  it('sends a composite through as the object it is', () => {
    // The old `default: textValue: String(value)` branch is exactly what this replaces: an
    // Address would have been persisted as the literal string "[object Object]", as a complete
    // answer, with nothing anywhere reporting a problem.
    const questions = [q('addr', 'Address'), q('grid', 'Matrix')];
    const answers = new Map<string, AnswerValue>([
      ['addr', { line1: '1 High St', city: 'Leeds' }],
      ['grid', { venue: 'great' }],
    ]);
    expect(toAnswerInputs(questions, answers)).toEqual([
      { questionId: 'addr', jsonValue: { line1: '1 High St', city: 'Leeds' } },
      { questionId: 'grid', jsonValue: { venue: 'great' } },
    ]);
  });

  it('skips a composite whose every part is blank', () => {
    // What a focused-then-abandoned Address control leaves in the map. Sending it would write a
    // Complete answer row full of empty strings that every reader then has to treat as an
    // address.
    const questions = [q('addr', 'Address')];
    const answers = new Map<string, AnswerValue>([['addr', { line1: '', city: '' }]]);
    expect(toAnswerInputs(questions, answers)).toEqual([]);
  });

  it('keeps a composite that has any one part filled in', () => {
    const questions = [q('addr', 'Address')];
    const answers = new Map<string, AnswerValue>([['addr', { line1: '', city: 'Leeds' }]]);
    expect(toAnswerInputs(questions, answers)).toEqual([
      { questionId: 'addr', jsonValue: { line1: '', city: 'Leeds' } },
    ]);
  });

  it('skips an empty ranking rather than sending an empty array', () => {
    const questions = [q('rank', 'Ranking')];
    expect(toAnswerInputs(questions, new Map<string, AnswerValue>([['rank', []]]))).toEqual([]);
  });

  it('wraps a bare scalar reaching a json column, which is how a lone multi-select arrives', () => {
    const questions = [q('multi', 'MultiChoice')];
    expect(toAnswerInputs(questions, new Map<string, AnswerValue>([['multi', 'only']]))).toEqual([
      { questionId: 'multi', jsonValue: ['only'] },
    ]);
  });
});
