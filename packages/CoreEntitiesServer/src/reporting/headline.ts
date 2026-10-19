/**
 * The headline figures of a response summary, from the `Forms: Response Completion Stats` row.
 *
 * The rules (forms-ng `reporting-aggregations.ts` `buildSummary`, now in the query and here):
 *  - the HEADLINE count is Complete responses only — a Partial is an in-progress autosave, not a
 *    response, and must never inflate the number a form owner sees;
 *  - the completion rate is Complete divided by every STARTED response (Complete, Partial and
 *    Disqualified), so the drop-off signal survives. The dashboard called every non-Complete row
 *    "partial"; the server reports Partial and Disqualified separately, and their sum is that figure;
 *  - the typical completion time is the MEDIAN over Complete responses whose StartedAt-to-SubmittedAt
 *    gap is 0 to 24 hours (`PLAUSIBLE_SESSION_SECONDS`, applied in the query): anything outside is a
 *    broken StartedAt, not a sitting, and one such row moved a mean to "twenty-four years".
 */
import type { FormsResponseSummaryStats } from '@mj-biz-apps/forms-entities';
import type { CompletionStatsRow } from './report-queries.js';

export function buildSummaryStats(row: CompletionStatsRow): FormsResponseSummaryStats {
  return {
    TotalResponses: row.CompleteCount,
    CompleteResponses: row.CompleteCount,
    PartialResponses: row.PartialCount,
    DisqualifiedResponses: row.DisqualifiedCount,
    CompletionRate: row.StartedCount > 0 ? row.CompleteCount / row.StartedCount : 0,
    TypicalCompletionSeconds: row.MedianCompletionSeconds,
    LastSubmittedAt: row.LastSubmittedAt ? row.LastSubmittedAt.toISOString() : null,
  };
}
