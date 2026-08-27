/**
 * What a `Go to` rule passes over, and whether it can fire at all.
 *
 * Two facts about a jump that the builder could not state, both silent in the way that costs an
 * author a testing round rather than a build failure:
 *
 *  - A jump SKIPS questions, required ones included. That is the feature — but an author writing
 *    "if First name is Soham, go to Submit" is entitled to be told this means four questions are
 *    never asked, two of which they had marked required. Untold, the rule reads as a shortcut
 *    and behaves as a deletion, and the first person to find out is the respondent.
 *  - A jump whose destination is no longer AHEAD of it is inert. The picker offers forward
 *    targets only, so this cannot be authored — it is arrived at by REORDERING, after which the
 *    rule still reads perfectly and does nothing whatsoever.
 *
 * ORDER MIRRORS THE RESOLVER. `flattenStops` in `rule-verbs.ts` walks pages in order, each
 * page's questions in order, and gives a page TWO stops — entered and left — with its `Go to`
 * firing at the second. That last part is the one worth restating: a section's rule fires after
 * its own questions, so it never skips them, and a destination inside its own section is
 * backward from it. If that resolver's shape changes, this module lies; `jump-reach.spec.ts`
 * pins the page-exit case for exactly that reason.
 *
 * Pure and Angular-free: two surfaces read it (the Edit logic dialog, and the rule badges on the
 * canvas), and a second implementation of "what does this jump skip" is a second answer that can
 * disagree with the first.
 */
import { isTerminalTarget, type JumpTarget } from '@mj-biz-apps/forms-entities';

/** One question, reduced to what reach needs to know about it. */
export interface ReachItem {
  id: string;
  isRequired?: boolean;
}

/** One section, in document order, holding its questions in document order. */
export interface ReachPage {
  id: string;
  questions: readonly ReachItem[];
}

/** Where a rule sits: on a question, or on the section it belongs to. */
export interface ReachSource {
  kind: 'page' | 'question';
  id: string;
}

export interface JumpReach {
  /** How many questions lie between the rule and its destination. */
  readonly skipped: number;
  /** How many of those are required. */
  readonly required: number;
  /** True when the destination is not ahead of the rule, so it can never fire. */
  readonly inert: boolean;
}

const INERT: JumpReach = { skipped: 0, required: 0, inert: true };

/**
 * What a jump from `source` to `target` passes over.
 *
 * An unresolvable source or destination is reported as INERT rather than as a jump over
 * everything: guessing "the rest of the form" for a deleted id would describe a broken rule as
 * one that silently ends the form for every respondent, which is a far more alarming claim than
 * the truth and would send the author looking in the wrong place.
 */
export function jumpReach(
  pages: readonly ReachPage[],
  source: ReachSource,
  target: JumpTarget,
): JumpReach {
  const questions = pages.flatMap((page) => page.questions);
  const firesAfter = fireIndex(pages, source);
  if (firesAfter === null) {
    return INERT;
  }
  // A terminal target has no ordering to violate — the resolver accepts one wherever it sits —
  // so it always fires, and what it passes over is the whole remainder of the form.
  const landsAt = isTerminalTarget(target) ? questions.length : targetIndex(pages, target);
  if (landsAt === null || landsAt <= firesAfter) {
    return INERT;
  }
  const skipped = questions.slice(firesAfter + 1, landsAt);
  return {
    skipped: skipped.length,
    required: skipped.filter((question) => question.isRequired === true).length,
    inert: false,
  };
}

/**
 * The index of the last question the rule's own item covers, or `null` when it is unknown.
 *
 * `-1` is a real answer, not a failure: a section rule on a section with no questions, sitting
 * at the top of the form, fires before question zero.
 */
function fireIndex(pages: readonly ReachPage[], source: ReachSource): number | null {
  if (source.kind === 'question') {
    const index = pages.flatMap((page) => page.questions).findIndex((q) => q.id === source.id);
    return index < 0 ? null : index;
  }
  const pageIndex = pages.findIndex((page) => page.id === source.id);
  if (pageIndex < 0) {
    return null;
  }
  // The page is LEFT after its last question — see the note on the module.
  return questionsBefore(pages, pageIndex) + pages[pageIndex].questions.length - 1;
}

/** The index a non-terminal target lands on, or `null` when it names nothing. */
function targetIndex(pages: readonly ReachPage[], target: JumpTarget): number | null {
  if (target.kind === 'question') {
    const index = pages.flatMap((page) => page.questions).findIndex((q) => q.id === target.id);
    return index < 0 ? null : index;
  }
  if (target.kind === 'page') {
    const pageIndex = pages.findIndex((page) => page.id === target.id);
    // A page is entered BEFORE its first question, so landing on it is landing on that index.
    return pageIndex < 0 ? null : questionsBefore(pages, pageIndex);
  }
  return null;
}

function questionsBefore(pages: readonly ReachPage[], pageIndex: number): number {
  return pages.slice(0, pageIndex).reduce((total, page) => total + page.questions.length, 0);
}

/**
 * The one-line note an author reads beside the destination, or `''` when there is nothing to say.
 *
 * An inert rule reports THAT and not the count: how many questions it would have skipped is
 * beside the point on a rule that never runs, and leading with the count would describe
 * behaviour no respondent will ever meet.
 */
export function reachNote(reach: JumpReach): string {
  if (reach.inert) {
    return 'This destination is no longer ahead of the rule, so it never runs';
  }
  if (reach.skipped === 0) {
    return '';
  }
  const questions = reach.skipped === 1 ? '1 question' : `${reach.skipped} questions`;
  return reach.required === 0
    ? `Skips ${questions}`
    : `Skips ${questions}, ${reach.required} of them required`;
}
