/**
 * When a page marked `isPartialSubmitPoint` counts as PASSED.
 *
 * The obvious definition — "the respondent pressed Next on that page" — exists in only one of
 * the two render modes. `Scroll` now steps by SECTION, so it has a real Next; `OneQuestion`
 * steps by QUESTION, so it crosses a page boundary without ever being on a page as such.
 * Defining the trigger per mode would mean two rules, one of which does nothing in half the
 * forms, and an author would have no way to know which they were getting.
 *
 * So the rule stays stated in terms of ANSWERS, which both modes have: a submit-point page is
 * passed once the respondent has answered something on a LATER page. In `Scroll` that is now
 * true the moment they answer anything on the next section, which is a stricter and more
 * literal reading of "moved past" than the single-screen version could manage.
 *
 * Pure and framework-free; the widget owns the "already banked" bookkeeping.
 */
import type { PublishedFormPage } from '@mj-biz-apps/forms-entities';

/**
 * Ids of submit-point pages the respondent has moved past, in page order.
 *
 * Pages are read in the order given — the published snapshot is already densely ordered by
 * `displayOrder`, so re-sorting here would just be a second opinion about the same thing.
 */
export function passedSubmitPoints(
  pages: readonly PublishedFormPage[],
  answeredQuestionIds: ReadonlySet<string>,
): string[] {
  const lastAnsweredPage = lastPageWithAnAnswer(pages, answeredQuestionIds);
  if (lastAnsweredPage < 0) {
    return [];
  }
  const passed: string[] = [];
  for (let i = 0; i < pages.length && i < lastAnsweredPage; i++) {
    if (pages[i].isPartialSubmitPoint) {
      passed.push(pages[i].id);
    }
  }
  return passed;
}

/** Index of the last page carrying at least one answered question, or -1. */
function lastPageWithAnAnswer(
  pages: readonly PublishedFormPage[],
  answeredQuestionIds: ReadonlySet<string>,
): number {
  for (let i = pages.length - 1; i >= 0; i--) {
    if (pages[i].questions.some((q) => answeredQuestionIds.has(q.id))) {
      return i;
    }
  }
  return -1;
}
