import { describe, it, expect } from 'vitest';
import {
  answersForFormFilter,
  definitionForVersionQuery,
  responseDetailQueries,
  responsesForFormFilter,
  uploadsForFileIdsFilter,
} from './responses-data.service';
import { FORMS_ENTITY } from '../shared/entity-names';

describe('answersForFormFilter', () => {
  it('schema-qualifies the vwFormResponses view (regression: "Invalid object name")', () => {
    const filter = answersForFormFilter('ABC-123');
    // MUST be schema-qualified — a bare `vwFormResponses` resolves against dbo and throws.
    expect(filter).toContain('__mj_BizAppsForms.vwFormResponses');
    expect(filter).not.toMatch(/FROM\s+vwFormResponses/);
  });

  it('scopes to the given form id', () => {
    expect(answersForFormFilter('form-9')).toBe(
      "ResponseID IN (SELECT ID FROM __mj_BizAppsForms.vwFormResponses WHERE FormID='form-9')",
    );
  });
});

describe('responsesForFormFilter', () => {
  it('scopes by FormID, not FormVersionID (regression: responses on older versions vanished)', () => {
    const filter = responsesForFormFilter('form-9');
    expect(filter).toBe("FormID='form-9'");
    expect(filter).not.toContain('FormVersionID');
  });
});

describe('uploadsForFileIdsFilter', () => {
  it('builds an IN list over the answers\' file ids', () => {
    expect(uploadsForFileIdsFilter(['f1', 'f2'])).toBe("FileID IN ('f1','f2')");
  });

  it('de-duplicates ids shared by two answers', () => {
    expect(uploadsForFileIdsFilter(['f1', 'f1'])).toBe("FileID IN ('f1')");
  });

  it('returns null for no ids so the caller skips the query rather than emitting IN ()', () => {
    expect(uploadsForFileIdsFilter([])).toBeNull();
  });
});

describe('definitionForVersionQuery', () => {
  it('resolves the version by id and never by status (regression: #82 retires old versions)', () => {
    const query = definitionForVersionQuery('ver-7');

    // Publishing now retires the version it replaces, so most versions carrying responses are
    // Retired. A `Status='Published'` predicate here would blank the question labels on every
    // response submitted before the current version — and would have looked correct right up
    // until the first republish.
    expect(query.ExtraFilter).toBe("ID='ver-7'");
    expect(query.ExtraFilter).not.toContain('Status');
  });

  it('reads the snapshot, and reads it simple — nothing here is mutated', () => {
    const query = definitionForVersionQuery('ver-7');
    expect(query.Fields).toContain('DefinitionSnapshot');
    expect(query.ResultType).toBe('simple');
  });
});

describe('responseDetailQueries', () => {
  const queries = responseDetailQueries('resp-1');

  it('batches the four reads a detail view needs into one RunViews call', () => {
    expect(queries.map((q) => q.EntityName)).toEqual([
      FORMS_ENTITY.FormResponse,
      FORMS_ENTITY.FormResponseAnswer,
      FORMS_ENTITY.FormAutomationRun,
      FORMS_ENTITY.FormEntityBindingRecord,
    ]);
  });

  it('selects the answer value columns, and does not pay for AI scoring it no longer shows', () => {
    const answers = queries.find((q) => q.EntityName === FORMS_ENTITY.FormResponseAnswer);
    expect(answers?.Fields).toEqual(
      expect.arrayContaining(['QuestionID', 'TextValue', 'NumericValue', 'FileID']),
    );
    expect(answers?.Fields).not.toContain('Score');
    expect(answers?.Fields).not.toContain('ScoreRationale');
  });

  it('reads the automation name off the base view rather than a second query', () => {
    const runs = queries.find((q) => q.EntityName === FORMS_ENTITY.FormAutomationRun);
    expect(runs?.Fields).toContain('FormAutomation');
    expect(runs?.Fields).toContain('ActionExecutionLogID');
    expect(runs?.Fields).toContain('AIAgentRunID');
  });

  it('carries the binding ledger fields the "what this did" section renders', () => {
    const binding = queries.find((q) => q.EntityName === FORMS_ENTITY.FormEntityBindingRecord);
    expect(binding?.Fields).toEqual(
      expect.arrayContaining(['TargetEntityID', 'TargetRecordID', 'Outcome', 'WrittenFields']),
    );
  });

  it('scopes every read to the one response', () => {
    expect(queries.map((q) => q.ExtraFilter)).toEqual([
      "ID='resp-1'",
      "ResponseID='resp-1'",
      "FormResponseID='resp-1'",
      "FormResponseID='resp-1'",
    ]);
  });

  it('reads simple rows, never entity objects — nothing here is mutated', () => {
    expect(queries.every((q) => q.ResultType === 'simple')).toBe(true);
  });
});
