import { describe, it, expect } from 'vitest';
import {
  answersForFormFilter,
  responsesForFormFilter,
  uploadsForFileIdsFilter,
} from './responses-data.service';

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
