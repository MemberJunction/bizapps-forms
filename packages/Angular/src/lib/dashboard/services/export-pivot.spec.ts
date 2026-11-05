import { describe, it, expect } from 'vitest';
import type { ExportDataRow } from '@memberjunction/export-engine';
import type { FormsResponseListRow, FormsStoredAnswer } from '@mj-biz-apps/forms-entities';
import { buildExportColumns, buildExportMatrix } from './export-pivot';
import { q } from '../../shared/testing/entity-row-fixtures';

/**
 * A cell of the matrix by column key. `ExportDataRow` is `Record<string, unknown> | unknown[]` —
 * the engine also accepts positional rows — and these tests only ever build keyed ones, so the
 * array arm is asserted away rather than cast away.
 */
function cell(row: ExportDataRow | undefined, key: string): unknown {
  expect(row).toBeDefined();
  expect(Array.isArray(row)).toBe(false);
  return row && !Array.isArray(row) ? row[key] : undefined;
}

function stored(questionId: string, columns: Partial<FormsStoredAnswer>): FormsStoredAnswer {
  return { ID: `a-${questionId}`, QuestionID: questionId, TextValue: null, NumericValue: null, DateValue: null, BooleanValue: null, JSONValue: null, FileID: null, ...columns };
}

/** A `Forms.ListResponses` row as the export reads it: with its answers attached. */
function row(responseId: string, answers: FormsStoredAnswer[]): FormsResponseListRow {
  return {
    ResponseID: responseId,
    Status: 'Complete',
    FormVersionID: 'v1',
    StartedAt: '2026-08-18T09:00:00.000Z',
    SubmittedAt: '2026-08-18T09:02:00.000Z',
    RespondentPersonID: null,
    Respondent: 'Ada Lovelace',
    AnsweredCount: answers.length,
    Answers: answers,
  };
}

describe('buildExportColumns', () => {
  it('emits the fixed response columns, then one per question in form order', () => {
    const questions = [q('q-text', 'LongText'), q('q-rating', 'Rating')];
    expect(buildExportColumns(questions).map((c) => c.name)).toEqual(['responseId', 'status', 'startedAt', 'submittedAt', 'respondent', 'q-text', 'q-rating']);
  });

  it('labels each question column by its prompt', () => {
    const col = buildExportColumns([q('q-text', 'LongText')]).find((c) => c.name === 'q-text');
    expect(col?.displayName).toBe('Prompt q-text');
  });
});

describe('buildExportMatrix', () => {
  it('pivots one row per response, one cell per question, with the server-derived respondent and Date instants', () => {
    const matrix = buildExportMatrix([row('r1', [stored('q-text', { TextValue: 'Loved it' })])], [q('q-text', 'LongText')]);
    expect(matrix[0]).toMatchObject({
      responseId: 'r1',
      respondent: 'Ada Lovelace',
      submittedAt: new Date('2026-08-18T09:02:00.000Z'),
      'q-text': 'Loved it',
    });
  });

  it('matches answers to columns whatever GUID casing the server read them in', () => {
    const id = 'aaaaaaaa-0000-4000-8000-000000000001';
    const matrix = buildExportMatrix([row('r1', [stored(id.toUpperCase(), { TextValue: 'x' })])], [q(id, 'LongText')]);
    expect(cell(matrix[0], id)).toBe('x');
  });

  it('leaves the cell blank for a question a response never answered', () => {
    const matrix = buildExportMatrix([row('r1', [])], [q('q-text', 'LongText')]);
    expect(cell(matrix[0], 'q-text')).toBe('');
  });

  it('exports a file answer as its file id — a joinable key, and the only evidence in the sheet', () => {
    const matrix = buildExportMatrix([row('r1', [stored('q-file', { FileID: 'file-77' })])], [q('q-file', 'FileUpload')]);
    // renderAnswer blanks a file answer for the UI (a bare GUID means nothing on screen),
    // but the sheet has no FormUpload join and the id is how an analyst rejoins MJ: Files.
    expect(cell(matrix[0], 'q-file')).toBe('file-77');
  });

  it('label-maps a choice answer, as the detail view does', () => {
    const choice = q('q-colour', 'SingleChoice', 0, [{ id: 'o1', label: 'Green', value: 'g', displayOrder: 1 }]);
    const matrix = buildExportMatrix([row('r1', [stored('q-colour', { TextValue: 'g' })])], [choice]);
    expect(cell(matrix[0], 'q-colour')).toBe('Green');
  });

  it('writes no column the questions do not name — no AI score, no rationale', () => {
    const matrix = buildExportMatrix([row('r1', [stored('q-text', { TextValue: 'x' })])], [q('q-text', 'LongText')]);
    expect(Object.keys(matrix[0])).toEqual(['responseId', 'status', 'startedAt', 'submittedAt', 'respondent', 'q-text']);
  });
});
