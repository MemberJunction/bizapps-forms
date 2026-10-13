/**
 * The bounded read of raw answer rows behind the profile, written-answer and Matrix sections: it
 * must never load more than its cap, must page without skipping or repeating, and must SAY when the
 * cap cut it short rather than present a sample as the whole.
 */
import { describe, expect, it } from 'vitest';
import type { EntityInfo, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { INSIGHT_ANSWER_PAGE_SIZE, MAX_INSIGHT_ANSWER_ROWS, readInsightAnswers, type InsightAnswerRow, type InsightAnswerSource } from '../insight-answers.js';
import { FormReportingError } from '../reporting-errors.js';

const SYSTEM = { ID: 'system' } as unknown as UserInfo;
const QUESTION = '0f0f0f0f-0000-4000-8000-000000000101';
const SCOPE = { formId: '0f0f0f0f-0000-4000-8000-000000000001' };

interface StubOptions {
  total: number;
  /** The most rows the stub hands back per page, whatever was asked (an entity-level limit). */
  pageLimit?: number;
  failPage?: boolean;
}

/** A provider over `total` synthetic answer rows that records every read. */
function stub({ total, pageLimit = Number.POSITIVE_INFINITY, failPage = false }: StubOptions) {
  const reads: RunViewParams[] = [];
  const provider: InsightAnswerSource = {
    EntityByName: () => ({ SchemaName: '__mj_BizAppsForms', BaseView: 'vwFormResponses' }) as unknown as EntityInfo,
    QuoteSchemaAndView: (schema: string, view: string) => `[${schema}].[${view}]`,
    RunView: (async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
      reads.push(params);
      if (params.ResultType === 'count_only') {
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: total, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
      }
      if (failPage) {
        return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'Invalid object name vwFormResponses' } as RunViewResult<T>;
      }
      const start = params.StartRow ?? 0;
      const size = Math.min(params.MaxRows ?? total, pageLimit, Math.max(0, total - start));
      const rows: InsightAnswerRow[] = Array.from({ length: size }, (_, i) => ({
        ID: `a${start + i}`,
        ResponseID: `r${start + i}`,
        QuestionID: QUESTION,
        TextValue: 'x',
        JSONValue: null,
        FileID: null,
      }));
      return { Success: true, Results: rows as unknown as T[], RowCount: rows.length, TotalRowCount: total, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    }) as InsightAnswerSource['RunView'],
  };
  return { provider, reads };
}

describe('readInsightAnswers', () => {
  it('reads every row of a form under the cap, in ID order, page by page, without overlap', async () => {
    const total = INSIGHT_ANSWER_PAGE_SIZE * 2 + 7;
    const { provider, reads } = stub({ total });

    const result = await readInsightAnswers(provider, SCOPE, [QUESTION], SYSTEM);

    expect(result.capped).toBe(false);
    expect(result.rows).toHaveLength(total);
    expect(new Set(result.rows.map((r) => r.ID)).size).toBe(total);
    const pages = reads.filter((r) => r.ResultType === 'simple');
    expect(pages.map((p) => [p.StartRow, p.MaxRows, p.OrderBy])).toEqual([
      [0, INSIGHT_ANSWER_PAGE_SIZE, 'ID'],
      [INSIGHT_ANSWER_PAGE_SIZE, INSIGHT_ANSWER_PAGE_SIZE, 'ID'],
      [INSIGHT_ANSWER_PAGE_SIZE * 2, 7, 'ID'],
    ]);
  });

  it('stops at the cap and says so', async () => {
    const { provider, reads } = stub({ total: MAX_INSIGHT_ANSWER_ROWS + 1 });

    const result = await readInsightAnswers(provider, SCOPE, [QUESTION], SYSTEM);

    expect(result.capped).toBe(true);
    expect(result.rows).toHaveLength(MAX_INSIGHT_ANSWER_ROWS);
    expect(reads.filter((r) => r.ResultType === 'simple')).toHaveLength(MAX_INSIGHT_ANSWER_ROWS / INSIGHT_ANSWER_PAGE_SIZE);
  });

  it('continues from what a short page returned, and reports the shortfall when the page bound runs out', async () => {
    const { provider } = stub({ total: INSIGHT_ANSWER_PAGE_SIZE * 2, pageLimit: 1000 });

    const result = await readInsightAnswers(provider, SCOPE, [QUESTION], SYSTEM);

    // Ten pages of 1000 — no row skipped, none repeated — and the remaining rows flagged, not hidden.
    expect(result.rows.map((r) => r.ID)).toEqual(Array.from({ length: 10_000 }, (_, i) => `a${i}`));
    expect(result.capped).toBe(false);
    const short = await readInsightAnswers(stub({ total: MAX_INSIGHT_ANSWER_ROWS, pageLimit: 1000 }).provider, SCOPE, [QUESTION], SYSTEM);
    expect(short.rows).toHaveLength(10 * 1000);
    expect(short.capped).toBe(true);
  });

  it('reads as the given user, Complete responses of the form only, and only GUID question ids', async () => {
    const { provider, reads } = stub({ total: 1 });

    await readInsightAnswers(provider, { ...SCOPE, formVersionId: '0f0f0f0f-0000-4000-8000-000000000002' }, [QUESTION, "x') OR 1=1 --"], SYSTEM);

    const filter = String(reads[0].ExtraFilter);
    expect(filter).toBe(
      `QuestionID IN ('${QUESTION}') AND ResponseID IN (SELECT ID FROM [__mj_BizAppsForms].[vwFormResponses] WHERE FormID='${SCOPE.formId}' AND Status='Complete' AND FormVersionID='0f0f0f0f-0000-4000-8000-000000000002')`,
    );
  });

  it('reads nothing when no question needs its rows', async () => {
    const { provider, reads } = stub({ total: 5 });

    expect(await readInsightAnswers(provider, SCOPE, [], SYSTEM)).toEqual({ rows: [], capped: false });
    expect(reads).toEqual([]);
  });

  it('fails with a fixed message, the provider text kept for the log', async () => {
    const { provider } = stub({ total: 3, failPage: true });

    const err = await readInsightAnswers(provider, SCOPE, [QUESTION], SYSTEM).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(FormReportingError);
    expect(err).toMatchObject({ fault: true, message: `The answers of form ${SCOPE.formId} could not be read.`, logDetail: 'Invalid object name vwFormResponses' });
  });
});
