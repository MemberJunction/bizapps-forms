/**
 * The rule verbs beyond plain show/hide (RULES_AND_BRANCHING_PLAN §2.2, as narrowed by
 * RULES_SIMPLIFICATION_PLAN §2): forward page jumps, disqualification and screen resolution.
 * Pure, framework-free, shared by the widget and the server exactly like
 * {@link evaluateConditionalRule} — one implementation, two callers, so the two sides cannot
 * drift on what a rule means.
 *
 * There was a fourth, `isRequiredNow`, folding a `require` group in on top of the static
 * `isRequired` toggle. Both the verb and the helper are gone: requiredness is the toggle, and
 * only the toggle, so there is one place to read it and nothing that can disagree with the
 * asterisk the respondent sees.
 */
import {
  MAX_JUMP_RULES,
  evaluateConditionalRule,
  evaluateGroup,
  isTerminalTarget,
  type AnswerValue,
  type EvalExtras,
  type ConditionalRule,
  type JumpTarget,
} from './conditional-rule';
import type { PublishedFormPage, PublishedFormQuestion, PublishedFormScreen } from './form-definition';
import { isAnswerableQuestionType } from './question-types';

/**
 * ONE forward walk over the whole form, producing everything that depends on where a
 * respondent currently is: which pages render, which questions render, and whether the form
 * has already ended.
 *
 * There used to be two independent folds — one over pages, one over pages × questions — and
 * that was safe only while jumps could target nothing but a page. A question-level `Go to`
 * makes page visibility depend on question visibility (jump past every question on a page and
 * the page is an empty header) and question visibility depend on page visibility (as it always
 * did). Two folds computing halves of one interdependent answer is how the two come to
 * disagree, and the sides that must agree here are on opposite ends of the wire.
 *
 * THE WALK. Pages in display order, each page's questions in display order, as one flat
 * sequence of stops. A fired jump sets a marker at the target's position and every stop before
 * it is skipped. Because the marker only ever moves forward, the walk is linear and cycles are
 * unrepresentable rather than merely unlikely.
 *
 * INERTNESS. A non-terminal target at or before the current position — backward, self, or
 * unknown — is skipped, never an error. A TERMINAL target has no ordering to violate, so it
 * fires even when it names a screen that no longer exists: continuing would ask questions the
 * author had decided this respondent should not see, and `resolveEndingScreen` is what deals
 * with a dangling id.
 *
 * WHAT A SKIPPED STOP CANNOT DO. Its own rules are never consulted — a jumped-over question
 * cannot jump, and cannot terminate. And a target hidden by its own `show` rule stays hidden:
 * jumping skips what is between, it does not force the destination to appear.
 */
function resolveFlow(
  pages: readonly PublishedFormPage[],
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): FlowResult {
  const stops = flattenStops(pages);
  const positionOf = new Map<string, number>();
  for (const stop of stops) {
    // Page ids and question ids share this map. They are distinct id spaces in practice, and a
    // collision could only make a jump land on the wrong stop of the SAME position, which the
    // forward-only check already bounds.
    positionOf.set(stop.question?.id ?? stop.page.id, stop.position);
  }

  const shownPage = new Map<string, boolean>();
  const isPageShown = (page: PublishedFormPage): boolean => {
    const cached = shownPage.get(page.id);
    if (cached !== undefined) {
      return cached;
    }
    // Memoized because a jump landing inside a page asks this without having walked its header.
    const shown = evaluateConditionalRule(page.conditionalRule, answers, extras);
    shownPage.set(page.id, shown);
    return shown;
  };

  const visiblePages: PublishedFormPage[] = [];
  const seenPages = new Set<string>();
  const rendered: PublishedFormQuestion[] = [];
  const enteredPages = new Set<string>();
  let skipUntil: number | null = null;
  let termination: JumpTarget | undefined;

  for (const stop of stops) {
    if (termination !== undefined) {
      break;
    }
    if (skipUntil !== null) {
      if (stop.position < skipUntil) {
        continue;
      }
      skipUntil = null; // arrived; this stop is evaluated normally
    }
    if (!isPageShown(stop.page)) {
      continue; // a hidden page takes its questions with it
    }

    // A page is entered by its header OR by a jump landing on one of its questions. Either way
    // it renders, and its own jump gets exactly one chance to fire.
    if (!seenPages.has(stop.page.id)) {
      seenPages.add(stop.page.id);
      visiblePages.push(stop.page);
    }
    if (!enteredPages.has(stop.page.id)) {
      enteredPages.add(stop.page.id);
      const fired = firedJump(stop.page.conditionalRule, stop.position, positionOf, answers, extras);
      if (fired !== null) {
        if (isTerminalTarget(fired)) {
          termination = fired;
          continue;
        }
        skipUntil = positionOf.get(fired.id) ?? null;
      }
    }

    if (stop.question === undefined) {
      continue; // the page header itself collects nothing
    }
    if (!evaluateConditionalRule(stop.question.conditionalRule, answers, extras)) {
      continue;
    }
    rendered.push(stop.question);

    const fired = firedJump(stop.question.conditionalRule, stop.position, positionOf, answers, extras);
    if (fired !== null) {
      if (isTerminalTarget(fired)) {
        termination = fired;
      } else {
        skipUntil = positionOf.get(fired.id) ?? null;
      }
    }
  }

  return { pages: visiblePages, rendered, termination };
}

/** What one forward walk produces. */
interface FlowResult {
  /** Pages that render, in display order. */
  pages: PublishedFormPage[];
  /** Every question that renders, display-only types included. */
  rendered: PublishedFormQuestion[];
  /** The terminal target that fired, if the form ended before running out of questions. */
  termination: JumpTarget | undefined;
}

/** One position in the walk: a page header, or a question on that page. */
interface FlowStop {
  position: number;
  page: PublishedFormPage;
  question?: PublishedFormQuestion;
}

/** Pages in display order, each followed by its questions in display order. */
function flattenStops(pages: readonly PublishedFormPage[]): FlowStop[] {
  const stops: FlowStop[] = [];
  for (const page of [...pages].sort((a, b) => a.displayOrder - b.displayOrder)) {
    stops.push({ position: stops.length, page });
    for (const question of [...page.questions].sort((a, b) => a.displayOrder - b.displayOrder)) {
      stops.push({ position: stops.length, page, question });
    }
  }
  return stops;
}

/**
 * The first jump rule on `rule` that fires and is allowed to, or null.
 *
 * Non-terminal targets must point strictly forward; a terminal target is accepted wherever it
 * is found. Rules past {@link MAX_JUMP_RULES} are not consulted at all.
 */
function firedJump(
  rule: ConditionalRule | undefined,
  position: number,
  positionOf: ReadonlyMap<string, number>,
  answers: ReadonlyMap<string, AnswerValue>,
  extras: EvalExtras | undefined,
): JumpTarget | null {
  for (const jump of (rule?.jump ?? []).slice(0, MAX_JUMP_RULES)) {
    const target = jump.target;
    if (!isTerminalTarget(target)) {
      const targetPosition = positionOf.get(target.id);
      if (targetPosition === undefined || targetPosition <= position) {
        continue; // unknown, self, or backward: inert by design
      }
    }
    if (evaluateGroup(jump.when, answers, extras)) {
      return target;
    }
  }
  return null;
}

/**
 * The pages a respondent can currently reach, in display order — the single source of truth
 * for page visibility on both client and server.
 *
 * A thin reader of {@link resolveFlow}, which is where the semantics live. Kept as its own
 * export because every existing caller asks this question and only this one.
 */
export function resolveVisiblePages(
  pages: readonly PublishedFormPage[],
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): PublishedFormPage[] {
  return resolveFlow(pages, answers, extras).pages;
}

/**
 * Every question that RENDERS, display-only types included — what a page's question list shows.
 *
 * Distinct from {@link resolveVisibleQuestions}, which is the answerable subset used for
 * submission, requiredness and scoring. A Statement renders and collects nothing, and conflating
 * the two sets is how a Statement ends up counted against a progress bar.
 */
export function resolveRenderedQuestions(
  pages: readonly PublishedFormPage[],
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): PublishedFormQuestion[] {
  return resolveFlow(pages, answers, extras).rendered;
}

/**
 * Whether the form has already ended, and how.
 *
 * `{ kind: 'ending' }` names the screen to show; `{ kind: 'submit' }` leaves the screen to
 * `resolveEndingScreen`. What arriving MEANS — `Complete` or `Disqualified` — is the screen's
 * business, not this function's: a screen flagged `isDisqualification` records the response as
 * disqualified, and every other screen records it as complete. Keeping that on the screen is
 * what let the separate disqualify verb, and its armed-knockout guard, be deleted.
 */
export function resolveTermination(
  pages: readonly PublishedFormPage[],
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): JumpTarget | undefined {
  return resolveFlow(pages, answers, extras).termination;
}

/**
 * Every answer-collecting question the respondent can currently see, in document order:
 * reachable pages (show rules + jumps) × the questions on them whose OWN show rule passes ×
 * answerable types only.
 *
 * The one definition, because three things have to agree about this set and two of them are on
 * opposite sides of the wire: the widget renders it, the widget submits exactly it, and the
 * server scores over it. The server used to score over every question on a reachable page,
 * question-level `show` rules ignored — so an answer to a hidden scored question (a stale one
 * the respondent had since hidden, or simply one a crafted request added) counted toward a
 * total the widget had computed without it. The two sides then picked different ending screens
 * from the same submission, and the server's was the one an attacker could move.
 */
export function resolveVisibleQuestions(
  pages: readonly PublishedFormPage[],
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): PublishedFormQuestion[] {
  // The answerable subset of what renders. Re-deriving it from `resolveVisiblePages` instead
  // would miss question-level jumps entirely: those hide questions WITHIN a page the walk
  // already decided was visible, so a second pass over that page's own list puts them back.
  return resolveFlow(pages, answers, extras).rendered.filter((question) =>
    isAnswerableQuestionType(question.type),
  );
}

/**
 * Whether a knockout screen's rule actually CONSTRAINS anything.
 *
 * `evaluateGroup` is vacuously true on an empty group, which is right for `show` — "no
 * condition" means "always visible" — and catastrophic for a knockout, where it means
 * "disqualify everyone, before they have answered anything". Testing that the group EXISTS is
 * not enough, because `{}`, `{all: []}` and `{any: []}` all exist and all evaluate true. So
 * armed means: at least one leaf condition to fail.
 */
function isArmedKnockout(rule: ConditionalRule | undefined): boolean {
  const show = rule?.show;
  if (show === undefined) {
    return false;
  }
  return (show.all?.length ?? 0) > 0 || (show.any?.length ?? 0) > 0;
}

/**
 * The disqualification screen these answers have triggered, or undefined (C3).
 *
 * First match in display order — deliberately the same ordering promise as
 * {@link resolveEndingScreen} in form-screens.ts, so the two can never disagree about which
 * screen "comes first". A screen's flag alone never fires, and neither does an EMPTY rule:
 * see {@link isArmedKnockout} for why "has a show group" was the wrong test.
 */
export function resolveDisqualification(
  screens: readonly PublishedFormScreen[],
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): PublishedFormScreen | undefined {
  return [...screens]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .find(
      (s) =>
        s.isDisqualification === true &&
        isArmedKnockout(s.conditionalRule) &&
        evaluateConditionalRule(s.conditionalRule, answers, extras),
    );
}
