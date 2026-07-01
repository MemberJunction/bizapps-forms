import { describe, it, expect } from 'vitest';
import { answersForFormFilter } from './forms-reporting.service';

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
