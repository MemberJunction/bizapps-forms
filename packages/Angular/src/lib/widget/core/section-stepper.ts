/**
 * Which sections a respondent steps through in Scroll mode.
 *
 * Scroll used to stack every section on one surface with a single Submit. That left branching
 * with nowhere to go: a `Go to` could only make questions vanish from a page the respondent was
 * already reading — retroactive removal, above and below the cursor, taking their typed answers
 * with it. A section is a STEP now, so a jump has a real destination and the questions it skips
 * are simply never reached.
 *
 * Pure and framework-free, matching {@link clampCursor} in `stepper.ts` — the component owns the
 * reactive cursor and routes every write through the clamp; this owns only the question of what
 * the cursor is counting.
 */
import { type PublishedFormPage, type PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

/**
 * The visible sections that actually render something, in order.
 *
 * NOT simply "every visible page". A page whose questions are all hidden by their own `show`
 * rules still passes the flow walk — the page itself is reachable, its contents are not — and as
 * one item in a long scroll an empty heading was merely odd. As a whole STEP it is a screen with
 * a title, nothing to answer and a Next button: a dead end the respondent has to work out how to
 * leave, and one they meet mid-form with no idea whether something failed to load.
 *
 * "Renders something" deliberately counts display-only questions. A section holding nothing but
 * a Statement collects no answers and never reaches `visibleAnswerableQuestions`, but it is copy
 * the author wrote for the respondent to READ. Dropping it would delete their instructions on
 * the grounds that nobody can type into them.
 *
 * @param pages the sections the flow walk says are reachable (`FormRuntime.visiblePages`)
 * @param rendered every question the walk renders, form-wide (`FormRuntime.renderedQuestions`)
 */
export function steppableSections(
  pages: readonly PublishedFormPage[],
  rendered: readonly PublishedFormQuestion[],
): PublishedFormPage[] {
  const renderedIds = new Set(rendered.map((question) => question.id));
  return pages.filter((page) => page.questions.some((question) => renderedIds.has(question.id)));
}
