/**
 * The page completion funnel, from the `Forms: Page Funnel Reach` rows.
 *
 * A page is REACHED when a response (any status: drop-off is a fact about the people who abandoned)
 * answered at least one of its questions — so a page with no answerable question can never be
 * reached, and is not a step at all. Including one broke the funnel on the commonest form shape: a
 * welcome page first made every retention after it 0%, and one in the middle showed a 100% drop-off
 * at a page behaving as designed. A page that asks real questions nobody answered stays: that is a
 * genuine total drop-off. Answerability comes from the contracts' type table, not a SQL copy of it.
 */
import { isAnswerableQuestionType, isFormQuestionType, type FormsFunnelStep } from '@mj-biz-apps/forms-entities';
import type { FunnelReachRow } from './report-queries.js';

/** Whether a page's comma-separated question types include one that collects an answer. */
function asksSomething(questionTypes: string | null): boolean {
  return (questionTypes ?? '')
    .split(',')
    .map((type) => type.trim())
    .some((type) => isFormQuestionType(type) && isAnswerableQuestionType(type));
}

export function buildFunnel(rows: readonly FunnelReachRow[]): FormsFunnelStep[] {
  const pages = rows.filter((row) => asksSomething(row.QuestionTypes)).sort((a, b) => a.DisplayOrder - b.DisplayOrder);
  const firstReached = pages[0]?.ReachedCount ?? 0;
  return pages.map((page, index) => {
    const previous = index > 0 ? pages[index - 1].ReachedCount : 0;
    return {
      PageID: page.PageID,
      // Numbered by its place among the steps shown, so the reader's "Page 2" is the second bar.
      Title: page.Title || `Page ${index + 1}`,
      DisplayOrder: page.DisplayOrder,
      Reached: page.ReachedCount,
      Retention: firstReached > 0 ? page.ReachedCount / firstReached : 0,
      DropOff: previous > 0 ? Math.max(0, (previous - page.ReachedCount) / previous) : 0,
    };
  });
}
