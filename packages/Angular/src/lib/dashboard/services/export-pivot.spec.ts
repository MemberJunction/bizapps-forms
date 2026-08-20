import { describe, it, expect } from 'vitest';
import { buildExportColumns, buildExportMatrix } from './export-pivot';
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

describe('buildExportColumns', () => {
  it('emits the fixed response columns, then one per question in form order', () => {
    const questions = [q('q-text', 'LongText'), q('q-rating', 'Rating')];
    expect(buildExportColumns(questions).map((c) => c.name)).toEqual([
      'responseId',
      'status',
      'startedAt',
      'submittedAt',
      'respondent',
      'q-text',
      'q-rating',
    ]);
  });

  it('labels each question column by its prompt', () => {
    const col = buildExportColumns([q('q-text', 'LongText')]).find((c) => c.name === 'q-text');
    expect(col?.displayName).toBe('Prompt q-text');
  });
});

describe('buildExportMatrix', () => {
  it('pivots one row per response, one cell per question', () => {
    const matrix = buildExportMatrix(
      [row('r1')],
      [q('q-text', 'LongText')],
      [answer('r1', 'q-text', { TextValue: 'Loved it' })],
    );
    expect(matrix[0]).toMatchObject({ responseId: 'r1', 'q-text': 'Loved it' });
  });

  it('leaves the cell blank for a question a response never answered', () => {
    const matrix = buildExportMatrix([row('r1')], [q('q-text', 'LongText')], []);
    expect(matrix[0]['q-text']).toBe('');
  });

  it('exports a file answer as its file id — a joinable key, and the only evidence in the sheet', () => {
    const matrix = buildExportMatrix(
      [row('r1')],
      [q('q-file', 'FileUpload')],
      [answer('r1', 'q-file', { FileID: 'file-77' })],
    );
    // renderAnswer blanks a file answer for the UI (a bare GUID means nothing on screen),
    // but the sheet has no FormUpload join and the id is how an analyst rejoins MJ: Files.
    expect(matrix[0]['q-file']).toBe('file-77');
  });

  it('carries no AI score or rationale into the sheet, even when the rows hold them', () => {
    // `Forms: Analyze Written Responses` scores every ShortText answer, so these columns
    // filled a spreadsheet with numbers like "First name — Score: 100". The data is still
    // on the entity; the export deliberately does not reach for it.
    const matrix = buildExportMatrix(
      [row('r1')],
      [q('q-text', 'LongText')],
      [answer('r1', 'q-text', { TextValue: 'x', Score: 3, ScoreRationale: 'a long explanation' })],
    );
    const serialized = JSON.stringify(matrix);
    expect(serialized).not.toContain('a long explanation');
    expect(serialized).not.toContain('score');
    expect(Object.keys(matrix[0])).toEqual([
      'responseId',
      'status',
      'startedAt',
      'submittedAt',
      'respondent',
      'q-text',
    ]);
  });
});
