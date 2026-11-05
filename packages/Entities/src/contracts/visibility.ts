/**
 * Which questions a respondent can see, given their answers — settled, and the same on both sides.
 *
 * The widget and the server must reach the SAME question set from the same answers, or one of
 * them requires, scores or judges a knockout over questions the other never showed. They used to
 * derive it differently: the widget iterated to a fixed point over its live answers, then kept a
 * second one-pass derivation (`transmittedView`) purely to mirror the server, which made a single
 * `resolveRenderedQuestions` pass over the payload. Two derivations that agree "most of the time"
 * is the bug class. {@link settleVisibility} is now the only one, and both sides call it.
 *
 * WHY A FIXED POINT. The raw answer map keeps an answer whose question has since been hidden
 * (re-showing a question should bring its answer back, so nothing prunes on a visibility change).
 * A rule that reads such an answer reaches a different verdict than it would on the answers that
 * are actually SENT — and with `isNotAnswered`, removing an answer can REVEAL a question, so a
 * one-pass reading can hide a question the server then shows and requires. So the derivation is
 * iterated until the set is stable under "restrict the answers to this set, then re-derive", and
 * the restricted answers are returned: they are exactly the answers whose one-pass derivation is
 * that set, which is what makes settling them again a no-op on the server.
 */
import type { AnswerValue } from './conditional-rule';
import type { PublishedFormPage, PublishedFormQuestion } from './form-definition';
import { isAnswerableQuestionType } from './question-types';
import { resolveRenderedQuestions, resolveVisibleQuestions } from './rule-verbs';

/**
 * How many times visibility is re-derived before giving up.
 *
 * Visibility is NOT monotone (`isNotAnswered`), so "restrict, then re-derive" is not guaranteed to
 * converge — a pair of rules can oscillate. Every loop here is bounded and the limit case is
 * reported rather than assumed unreachable. Five is far above any real form (the scenario that
 * motivated the fixed point settles in two) and small enough to stay cheap on every keystroke.
 */
export const MAX_VISIBILITY_PASSES = 5;

/** The visibility a set of answers settles to. */
export interface SettledVisibility {
  /**
   * False when {@link MAX_VISIBILITY_PASSES} was reached without the set stabilising — the form's
   * own show rules contradict each other. Every other field then holds the LAST derivation, which
   * is still a usable answer; what it is not is guaranteed to match a derivation from different
   * raw answers. The caller decides what to do with that, because only the caller knows who to
   * tell (the widget logs it; the server names the form version).
   */
  readonly settled: boolean;
  /** How many restrict-then-re-derive passes ran (1 when the raw answers were already settled). */
  readonly passes: number;
  /** The answers the rules read: the raw answers restricted to the settled answerable set. */
  readonly answers: ReadonlyMap<string, AnswerValue>;
  /** Every question that renders, in document order, display-only types included. */
  readonly rendered: PublishedFormQuestion[];
  /** {@link rendered} minus the display-only types — what can be answered, required and sent. */
  readonly answerable: PublishedFormQuestion[];
}

/**
 * Settle visibility for these answers. Pure; no extras (a score is never known while visibility
 * is being decided — see `EvalExtras`).
 *
 * Takes only the pages, so a published definition and a respondent projection both qualify.
 */
export function settleVisibility(
  definition: { readonly pages: readonly PublishedFormPage[] },
  rawAnswers: ReadonlyMap<string, AnswerValue>,
): SettledVisibility {
  const pages = [...definition.pages].sort((a, b) => a.displayOrder - b.displayOrder);
  let current = resolveVisibleQuestions(pages, rawAnswers);
  for (let pass = 1; pass <= MAX_VISIBILITY_PASSES; pass++) {
    const restricted = restrictAnswers(rawAnswers, current);
    const next = resolveVisibleQuestions(pages, restricted);
    if (sameQuestions(next, current)) {
      return settledAt(pages, restricted, pass, true);
    }
    current = next;
  }
  return settledAt(pages, restrictAnswers(rawAnswers, current), MAX_VISIBILITY_PASSES, false);
}

function settledAt(
  pages: readonly PublishedFormPage[],
  answers: ReadonlyMap<string, AnswerValue>,
  passes: number,
  settled: boolean,
): SettledVisibility {
  const rendered = resolveRenderedQuestions(pages, answers);
  return {
    settled,
    passes,
    answers,
    rendered,
    answerable: rendered.filter((question) => isAnswerableQuestionType(question.type)),
  };
}

/** The answers belonging to `questions`, dropping every other entry. */
function restrictAnswers(
  answers: ReadonlyMap<string, AnswerValue>,
  questions: readonly PublishedFormQuestion[],
): ReadonlyMap<string, AnswerValue> {
  const restricted = new Map<string, AnswerValue>();
  for (const question of questions) {
    if (answers.has(question.id)) {
      restricted.set(question.id, answers.get(question.id));
    }
  }
  return restricted;
}

/** Whether two derivations picked the same questions, in the same order. */
function sameQuestions(a: readonly PublishedFormQuestion[], b: readonly PublishedFormQuestion[]): boolean {
  return a.length === b.length && a.every((question, index) => question.id === b[index].id);
}
