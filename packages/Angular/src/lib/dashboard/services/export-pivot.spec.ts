import { describe, it, expect } from 'vitest';
import { buildExportColumns, buildExportMatrix, scoredQuestionIds } from './export-pivot';
import { q, answer } from '../../shared/testing/entity-row-fixtures';
import type { ResponseListRow } from '../../responses/response-models';

function row(responseId: string): ResponseListRow {
  return {
    responseId,
    status: 'Complete',
    startedAt: new Date('2026-08-18T09:00:00Z'),
    submittedAt: new Date('2026-08-18T09:02:00Z'),
    respondent: 'Anonymous',
    answeredCount: 1,
  };
}

describe('scoredQuestionIds', () => {
  it('names only the questions that actually carry a score', () => {
    const ids = scoredQuestionIds([
      answer('r1', 'q-text', { TextValue: 'a', Score: 6 }),
      answer('r1', 'q-rating', { NumericValue: 4 }),
    ]);
    expect([...ids]).toEqual(['q-text']);
  });

  it('treats a form with no AI scoring as having no score columns', () => {
    expect(scoredQuestionIds([answer('r1', 'q1', { TextValue: 'a' })]).size).toBe(0);
  });
});

describe('buildExportColumns', () => {
  it('adds a "— Score" column after each scored question, and none for unscored ones', () => {
    const questions = [q('q-text', 'LongText'), q('q-rating', 'Rating')];
    const names = buildExportColumns(questions, new Set(['q-text'])).map((c) => c.name);
    expect(names).toEqual([
      'responseId',
      'status',
      'startedAt',
      'submittedAt',
      'respondent',
      'q-text',
      'q-text::score',
      'q-rating',
    ]);
  });

  it('labels the score column by its question prompt', () => {
    const col = buildExportColumns([q('q-text', 'LongText')], new Set(['q-text'])).find(
      (c) => c.name === 'q-text::score',
    );
    expect(col?.displayName).toBe('Prompt q-text — Score');
    expect(col?.dataType).toBe('number');
  });
});

describe('buildExportMatrix', () => {
  it('pivots one row per response with the answer and its score', () => {
    const questions = [q('q-text', 'LongText')];
    const matrix = buildExportMatrix(
      [row('r1')],
      questions,
      [answer('r1', 'q-text', { TextValue: 'Loved it', Score: 9 })],
      new Set(['q-text']),
    );
    expect(matrix[0]).toMatchObject({ responseId: 'r1', 'q-text': 'Loved it', 'q-text::score': 9 });
  });

  it('leaves both cells blank for a question a response never answered', () => {
    const matrix = buildExportMatrix([row('r1')], [q('q-text', 'LongText')], [], new Set(['q-text']));
    expect(matrix[0]['q-text']).toBe('');
    expect(matrix[0]['q-text::score']).toBeNull();
  });

  it('omits rationale text — it is prose, and would swamp a spreadsheet column', () => {
    const matrix = buildExportMatrix(
      [row('r1')],
      [q('q-text', 'LongText')],
      [answer('r1', 'q-text', { TextValue: 'x', Score: 3, ScoreRationale: 'a long explanation' })],
      new Set(['q-text']),
    );
    expect(JSON.stringify(matrix)).not.toContain('a long explanation');
  });
});
