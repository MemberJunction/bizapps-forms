import { describe, expect, it } from 'vitest';
import { answeredRefusal, describeSaveError } from './delete-refusal';

const FK_ANSWER =
  `Save failed for Pages[0] (MJ_BizApps_Forms: Form Pages): Delete failed for Questions.Removed[0] (MJ_BizApps_Forms: Form Questions): Error executing SQL\n` +
  `    Error: The DELETE statement conflicted with the REFERENCE constraint "FK_FormResponseAnswer_Question". The conflict occurred in database "MJ_ATS_Dev", table "__mj_BizAppsForms.FormResponseAnswer", column 'QuestionID'.\n` +
  `    Query: IF OBJECT_ID('tempdb..#ResultTable') IS NOT NULL DROP TABLE #ResultTable DECLARE @ResultTable TABLE (ID uniqueidentifier)`;

describe('why a builder delete is refused, in words an author can act on', () => {
  it('refuses a question that has answers before anything leaves the canvas', () => {
    expect(answeredRefusal({ kind: 'question', name: 'Short text' }, 217)).toBe(
      '“Short text” can’t be deleted: respondents have given it 217 answers, and those answers stay linked to it.',
    );
    expect(answeredRefusal({ kind: 'question', name: 'Email' }, 1)).toContain('1 answer,');
  });

  it('refuses a section whose questions have answers', () => {
    expect(answeredRefusal({ kind: 'section', name: 'Section 2' }, 40)).toBe(
      'Section 2 can’t be deleted: respondents have given its questions 40 answers, and those answers stay linked to them.',
    );
  });

  it('allows a delete with no answers', () => {
    expect(answeredRefusal({ kind: 'question', name: 'Short text' }, 0)).toBeNull();
  });

  it('turns the answers foreign-key refusal into a sentence, never SQL', () => {
    const text = describeSaveError(FK_ANSWER);
    expect(text).toBe('Respondents have already answered it, and their answers stay linked to it.');
    expect(text).not.toMatch(/SELECT|DECLARE|tempdb|FK_/);
  });

  it('says another record still points at it, for any other reference conflict', () => {
    expect(describeSaveError('Error: The DELETE statement conflicted with the REFERENCE constraint "FK_Thing_Question". Query: DELETE …')).toBe(
      'Other records still point at it.',
    );
  });

  it('drops the SQL from any other database error, keeping the database\'s own sentence', () => {
    expect(describeSaveError('Error executing SQL\n Error: Timeout expired. Query: UPDATE x SET y=1 Parameters: None')).toBe('Timeout expired.');
  });

  it('leaves a plain refusal as it is', () => {
    expect(describeSaveError('You do not have permission to delete this.')).toBe('You do not have permission to delete this.');
  });
});
