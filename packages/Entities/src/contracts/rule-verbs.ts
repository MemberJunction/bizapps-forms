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
import { resolveEndingScreen } from './form-screens';

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
 * THE WALK. Pages in display order, each page entered, then its questions in display order,
 * then left — one flat sequence of stops. A fired jump sets a marker at the target's position
 * and every stop before it is skipped. Because the marker only ever moves forward, the walk is
 * linear and cycles are unrepresentable rather than merely unlikely. A page's own `Go to` fires
 * at the stop where the page is LEFT; see {@link flattenStops} for why that is load-bearing.
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
    //
    // A page is keyed to where it is ENTERED, never to where it is left: a jump aimed at a page
    // must land before that page's questions, not after them. The exit stop carries no key, so
    // it can never be a destination.
    if (stop.kind === 'question') {
      positionOf.set(stop.question.id, stop.position);
    } else if (stop.kind === 'enter') {
      positionOf.set(stop.page.id, stop.position);
    }
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
    // it renders.
    if (!seenPages.has(stop.page.id)) {
      seenPages.add(stop.page.id);
      visiblePages.push(stop.page);
    }

    if (stop.kind === 'question') {
      if (!evaluateConditionalRule(stop.question.conditionalRule, answers, extras)) {
        continue; // hidden by its own show rule: it renders nothing, and its jump never runs
      }
      rendered.push(stop.question);
    }

    const fired = firedJump(ruleAt(stop), stop.position, positionOf, answers, extras);
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

/**
 * One position in the walk.
 *
 * A page occupies TWO of them — it is arrived at and it is left — because those are two
 * different moments and the page's own rules belong to different ones. `enter` is where its
 * `show` gate and its position as a jump DESTINATION live; `exit` is where its `Go to` fires.
 */
type FlowStop =
  | { kind: 'enter'; position: number; page: PublishedFormPage }
  | { kind: 'question'; position: number; page: PublishedFormPage; question: PublishedFormQuestion }
  | { kind: 'exit'; position: number; page: PublishedFormPage };

/** The rule whose `Go to` this stop may fire: the question's own, or the page's on its exit. */
function ruleAt(stop: FlowStop): ConditionalRule | undefined {
  switch (stop.kind) {
    case 'question':
      return stop.question.conditionalRule;
    case 'exit':
      return stop.page.conditionalRule;
    case 'enter':
      return undefined; // arriving decides nothing; see FlowStop
  }
}

/**
 * Pages in display order — entered, then their questions in display order, then left.
 *
 * THE EXIT STOP IS THE POINT. A page's `Go to` reads "After this page, go to…", and the builder
 * offers the page's OWN questions as its condition sources, because leaving a page is decided by
 * what was just answered on it. Firing that rule on arrival made the commonest authoring
 * self-defeating: the answer that satisfies the condition belongs to a question the jump then
 * skipped, so the page rendered as an empty header, the trigger's answer was never transmitted,
 * and the widget's fixed point oscillated forever between the two readings. Leaving the page is
 * when the rule was always meant to run, and it is the only position from which the page's own
 * questions are already behind the walk.
 */
function flattenStops(pages: readonly PublishedFormPage[]): FlowStop[] {
  const stops: FlowStop[] = [];
  for (const page of [...pages].sort((a, b) => a.displayOrder - b.displayOrder)) {
    stops.push({ kind: 'enter', position: stops.length, page });
    for (const question of [...page.questions].sort((a, b) => a.displayOrder - b.displayOrder)) {
      stops.push({ kind: 'question', position: stops.length, page, question });
    }
    stops.push({ kind: 'exit', position: stops.length, page });
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
 * What the form's flow decided: which ending screen to show, whether arriving there disqualifies,
 * and whether a rule ended the form before it ran out of questions.
 *
 * ONE answer, shared by the widget and the server, because the two must agree about all three
 * facts and a respondent shown a knockout screen while the server writes `Complete` is the worst
 * kind of disagreement — quota counted, automations fired, and a screen saying none of that
 * happened.
 *
 * This replaced `resolveDisqualification`, which read a knockout off an ending screen's OWN show
 * group plus its `isDisqualification` flag. That entangled two meanings in one group — "which
 * thank-you page at the end" versus "who gets screened out mid-form" — and needed an
 * `isArmedKnockout` guard, because an empty group is vacuously true and "disqualify everyone
 * before they have answered anything" is a catastrophic reading of a half-authored rule. The
 * rule now says where to GO and the screen says what ARRIVING means, so there is no group doing
 * double duty and nothing to arm.
 */
export interface FormOutcome {
  /** The screen to show, or undefined when the form has no ending to show at all. */
  screen: PublishedFormScreen | undefined;
  /** Whether the response is recorded as `Disqualified` rather than `Complete`. */
  disqualified: boolean;
  /** Whether a `Go to` rule ended the form early, rather than it running out of questions. */
  endedEarly: boolean;
}

/**
 * Whether reaching this outcome ends the response WITHOUT the respondent pressing Submit.
 *
 * `endedEarly` says the FLOW is over — nothing further will be asked, so the widget stops
 * rendering questions and the Submit control is what is left. It does not say who finishes the
 * response, and reading it as though it did is how a `Go to → Submit` came to transmit a
 * completed submission the moment a respondent clicked out of a text box: in scroll mode a
 * commit is a blur, so the rule fired, sealed and navigated away from a form the respondent was
 * still looking at.
 *
 * Only a SCREENING seals itself. That asymmetry is the point of a knockout: it is done TO the
 * respondent, they are ineligible, and the whole reason to fire it early is that they should not
 * fill in the rest first — so waiting for their consent to send would be waiting for something
 * they have no reason to give. Every other finish is done BY them, and Submit is where they say
 * so. The server draws the same line: `disqualifiedBy` is what lets a terminal write skip the
 * required checks, and nothing else does.
 *
 * Named here rather than spelled `outcome.disqualified` at the call site because the field
 * answers "what status is written" and this answers "who ends it", and the two only happen to
 * coincide. A future outcome that seals for some other reason changes this function, not every
 * caller.
 */
export function endsWithoutSubmit(outcome: FormOutcome): boolean {
  return outcome.disqualified;
}

export function resolveFormOutcome(
  pages: readonly PublishedFormPage[],
  endScreens: readonly PublishedFormScreen[],
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): FormOutcome {
  const terminal = resolveTermination(pages, answers, extras);
  const ordinary = (): PublishedFormScreen | undefined => resolveEndingScreen(endScreens, answers, extras);

  if (terminal?.kind === 'ending') {
    const named = endScreens.find((screen) => screen.id === terminal.id);
    return {
      // A dangling id falls back to the ordinary ending so the respondent still sees something.
      screen: named ?? ordinary(),
      // ...but the FLAG is read only off the screen that was actually named. We cannot know
      // whether a missing screen was a knockout, and guessing "yes" would discard a real
      // respondent's submission on the strength of a dangling id. `Complete` is the recoverable
      // direction, and the Rules tab flags the rule as broken either way.
      disqualified: named?.isDisqualification === true,
      endedEarly: true,
    };
  }

  return { screen: ordinary(), disqualified: false, endedEarly: terminal !== undefined };
}
