/**
 * Headless runtime shared by both render modes. Holds the live answer map as a signal,
 * derives per-question/per-page visibility from the conditional rules (S2), tracks
 * validation + touched state, and computes the progress signal. Components read its
 * signals and call its mutators; it owns no DOM and no transport.
 */
import { computed, signal } from '@angular/core';
import {
  isAnswerableQuestionType,
  resolveRenderedQuestions,
  resolveVisiblePages,
  resolveVisibleQuestions,
  answerCompleteness,
  isAnswerSupplied,
  type AnswerValue,
  type FormAnswerInput,
  type PublishedFormDefinition,
  type PublishedFormPage,
  type PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';

import { toAnswerInputs } from './answer-value';
import { computeProgress } from './progress';
import { validateQuestion } from './validation';

/**
 * How many times visibility is re-derived before giving up.
 *
 * Visibility is NOT monotone: `isNotAnswered` means removing an answer can REVEAL a question, so
 * "restrict, then re-derive" is not guaranteed to converge — a pair of rules can oscillate. A cap
 * with an explicit outcome is the honest shape for that, per this repo's design principles: every
 * loop bounded, and the limit case handled rather than assumed unreachable. Five is far above any
 * real form (the scenario that motivated this settles in two) and small enough to stay cheap.
 */
const MAX_VISIBILITY_PASSES = 5;

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

export class FormRuntime {
  private readonly answers = signal<Map<string, AnswerValue>>(new Map());
  private readonly touched = signal<Set<string>>(new Set());

  constructor(private readonly definition: PublishedFormDefinition) {}

  // --- Answer access -------------------------------------------------------

  public readonly answerMap = this.answers.asReadonly();

  /**
   * The RAW answer map — everything the respondent has entered, including answers to questions
   * that are currently hidden.
   *
   * Deliberately not the basis for any verdict, and it used to name ending-screen resolution as
   * its example consumer, which is exactly the call site that had to move off it: a verdict
   * reached here is reached on answers the widget will not transmit. {@link transmittedView} is
   * what every rule now evaluates against. What remains true of this map is that it must keep the
   * hidden answers — re-showing a question should bring its answer back — which is precisely why
   * it cannot also be the thing rules read.
   *
   * Read-only by type so a caller cannot mutate the runtime's state behind its back: every
   * write goes through `setValue`, which is what keeps the derived signals correct.
   */
  public currentAnswers(): ReadonlyMap<string, AnswerValue> {
    return this.answers();
  }

  /**
   * Ids of the questions that currently hold a real answer.
   *
   * Uses the contract's `isAnswerSupplied` — the same "is this answered" definition the required
   * check and the conditional evaluator use — rather than "has a map entry", which a focused-then-
   * abandoned field also satisfies.
   */
  public answeredQuestionIds(): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const [questionId, value] of this.answers()) {
      if (isAnswerSupplied(value)) {
        ids.add(questionId);
      }
    }
    return ids;
  }

  public valueFor(questionId: string): AnswerValue {
    return this.answers().get(questionId);
  }

  public setValue(questionId: string, value: AnswerValue): void {
    const next = new Map(this.answers());
    if (value === null || value === undefined) {
      next.delete(questionId);
    } else {
      next.set(questionId, value);
    }
    this.answers.set(next);
  }

  public markTouched(questionId: string): void {
    if (this.touched().has(questionId)) {
      return;
    }
    const next = new Set(this.touched());
    next.add(questionId);
    this.touched.set(next);
  }

  public isTouched(questionId: string): boolean {
    return this.touched().has(questionId);
  }

  // --- Visibility (conditional rules, S2) ---------------------------------

  /**
   * Pages the respondent can currently reach — page show rules AND forward jumps (C2), via
   * the shared resolver the server also uses.
   */
  public readonly visiblePages = computed<PublishedFormPage[]>(() => {
    return resolveVisiblePages(this.orderedPages(), this.settledAnswers());
  });

  /**
   * The questions the scroll renderer puts on THIS page, display-only types included.
   *
   * A slice of {@link renderedQuestions}, not its own derivation. It used to filter the page's
   * own list on the question's `show` rule alone, which meant a `Go to` rule changed what the
   * form submitted without changing what it displayed: the skipped question stayed on screen
   * with its required asterisk, was never validated (submit judges the flow's set), and
   * whatever was typed into it was dropped from the payload. Reading the walk is what keeps
   * "on screen" and "in the payload" the same sentence.
   */
  public visibleQuestions(page: PublishedFormPage): PublishedFormQuestion[] {
    const onThisPage = new Set(page.questions.map((q) => q.id));
    return this.renderedQuestions().filter((q) => onThisPage.has(q.id));
  }

  /**
   * The answers the whole widget derives from: a FIXED POINT of the server's own derivation,
   * which is the property that makes the two sides agree.
   *
   * Resolving once over the raw map is not enough, and the failure is worse than a wrong number.
   * The raw map keeps an answer whose question is hidden (nothing prunes on a visibility change),
   * the payload carries only the visible set, and the server re-derives visibility FROM that
   * payload. A rule reading an answer that is not being sent therefore reaches a different verdict
   * on each side — and with `isNotAnswered`, removing an answer can REVEAL a question, so the
   * server could make a question visible and REQUIRED that the widget never rendered. The
   * respondent then gets "«prompt» is required" for a field that is not on screen, and every retry
   * sends the identical payload: unrecoverable, on the anonymous path.
   *
   * So this iterates until the set is stable under "restrict the answers to this set, then re-derive
   * from them", and returns THE RESTRICTED MAP — the answers whose single-pass derivation is that
   * set, which is exactly the pass the server makes over the payload. Everything else here is a
   * reading of this map. See {@link MAX_VISIBILITY_PASSES} for why it is capped rather than
   * looped until stable.
   */
  private readonly settledAnswers = computed<ReadonlyMap<string, AnswerValue>>(() => {
    const pages = this.orderedPages();
    const raw = this.answers();
    let set = resolveVisibleQuestions(pages, raw);
    for (let pass = 0; pass < MAX_VISIBILITY_PASSES; pass++) {
      const restricted = restrictAnswers(raw, set);
      const next = resolveVisibleQuestions(pages, restricted);
      if (sameQuestions(next, set)) {
        return restricted;
      }
      set = next;
    }
    // Cap reached: the rules do not settle, so no client set can match the server's single pass.
    // Say so once and use the last derivation — the alternative is looping forever on a form whose
    // own rules contradict each other.
    console.warn(
      '[mj-form] visibility did not settle after ' +
        `${MAX_VISIBILITY_PASSES} passes; this form's show rules depend on each other in a way ` +
        'that has no stable answer (an `is not answered` rule revealing a question whose own answer ' +
        'then hides it). The server may disagree with what is on screen.',
    );
    return restrictAnswers(raw, set);
  });

  /**
   * Every question that RENDERS, in document order — display-only types included.
   *
   * The one walk both renderers read. Derived from {@link settledAnswers} rather than the raw
   * map so that what renders, what submits and what the server re-derives are three readings of
   * one answer set instead of three derivations that agree most of the time.
   */
  public readonly renderedQuestions = computed<PublishedFormQuestion[]>(() =>
    resolveRenderedQuestions(this.orderedPages(), this.settledAnswers()),
  );

  public readonly visibleAnswerableQuestions = computed<PublishedFormQuestion[]>(() =>
    this.renderedQuestions().filter((question) => isAnswerableQuestionType(question.type)),
  );

  /**
   * Exactly the answers this widget will transmit — derived FROM the payload builder, not
   * alongside it.
   *
   * Built by asking {@link buildAnswerInputs} what it will send and keying those ids, rather than
   * re-deriving the filter here. A previous version restricted the raw map with its own
   * `answers.has(id)` test, which agreed with the payload for every ordinary answer and disagreed
   * for a blank one — `buildAnswerInputs` drops what is not submittable, and a blank value is
   * still a map entry. One definition of "what gets sent" removes that class outright.
   */
  public transmittedAnswers(): ReadonlyMap<string, AnswerValue> {
    const raw = this.answers();
    const map = new Map<string, AnswerValue>();
    for (const input of this.buildAnswerInputs()) {
      map.set(input.questionId, raw.get(input.questionId));
    }
    return map;
  }

  /**
   * What the server will see, AND what it will make of it — the basis for every client-side
   * verdict.
   *
   * The server does two things with a submission: it reads the answers that arrive, and it
   * RE-DERIVES the visible question set from them (`resolveVisibleQuestions` over the payload).
   * Matching only the first is not matching. An earlier fix restricted the answer values and left
   * `visibleAnswerableQuestions` resolving over the raw map, so a show-rule naming a question that
   * is itself hidden kept an orphaned question "visible" on the client while the server — seeing no
   * answer for the question that rule reads — dropped it. Client and server then scored, banded and
   * judged knockouts over different sets, which is the failure that fix claimed to have removed
   * "by construction".
   *
   * One pass, deliberately, because that is what the server makes. Iterating to a fixed point here
   * would be a different answer from the authoritative one, which is worse than an imperfect
   * agreement — the point is to agree, not to be independently cleverer.
   */
  public transmittedView(): {
    readonly answers: ReadonlyMap<string, AnswerValue>;
    readonly questions: PublishedFormQuestion[];
  } {
    const answers = this.transmittedAnswers();
    return { answers, questions: resolveVisibleQuestions(this.orderedPages(), answers) };
  }

  // --- Validation ----------------------------------------------------------

  /** Validation message for a question, or `null` when valid. */
  public errorFor(question: PublishedFormQuestion): string | null {
    return validateQuestion(question, this.valueFor(question.id)).message;
  }

  /** Error shown in the UI only after the field has been touched. */
  public visibleErrorFor(question: PublishedFormQuestion): string | null {
    return this.isTouched(question.id) ? this.errorFor(question) : null;
  }

  /**
   * Per-sub-field errors for a composite, on the SAME touched gate as {@link visibleErrorFor} —
   * the two are one verdict shown two ways, so they must appear and clear together.
   *
   * `{}` when the question has no per-field problems, which includes every group-level failure;
   * the renderer reads that as "show the one message under the group instead".
   */
  public visiblePartErrorsFor(question: PublishedFormQuestion): Record<string, string> {
    if (!this.isTouched(question.id)) {
      return {};
    }
    return validateQuestion(question, this.valueFor(question.id)).parts ?? {};
  }

  /** True when every supplied list of questions currently validates. */
  public areValid(questions: PublishedFormQuestion[]): boolean {
    return questions.every((q) => validateQuestion(q, this.valueFor(q.id)).valid);
  }

  /** Mark a set of questions touched (e.g. on a failed next/submit) to surface errors. */
  public touchAll(questions: PublishedFormQuestion[]): void {
    const next = new Set(this.touched());
    for (const q of questions) {
      next.add(q.id);
    }
    this.touched.set(next);
  }

  /** Whole-form validity over all currently-visible answerable questions. */
  public readonly isFormValid = computed(() =>
    this.visibleAnswerableQuestions().every(
      (q) => validateQuestion(q, this.valueFor(q.id)).valid,
    ),
  );

  // --- Progress ------------------------------------------------------------

  /**
   * How full the bar is. The weighting — and why it is weighted — lives in `progress.ts`.
   *
   * Requiredness is `isRequired` — the same judge `errorFor`/`isFormValid` use, which is the
   * property that matters. `computeProgress` returns 1 as soon as every required question is
   * satisfied, so a bar reading a different notion of "required" than the submit button reads
   * can show full on a form that will not submit, which is the one state where the bar is the
   * respondent's only clue that something is missing. The two used to be able to disagree
   * (the bar read the static flag, validity read the `require` verb); with the verb gone there
   * is only one flag left to read, and both read it.
   *
   * Visibility still gates it: the map runs over `visibleAnswerableQuestions`, so a required
   * question hidden by its show rule is not counted against the bar.
   */
  public readonly progress = computed(() =>
    computeProgress(
      this.visibleAnswerableQuestions().map((q) => ({
        required: q.isRequired,
        completeness: answerCompleteness(q.type, this.valueFor(q.id)),
      })),
    ),
  );

  // --- Submission ----------------------------------------------------------

  /** Build the wire answers for all currently-visible answerable questions. */
  public buildAnswerInputs(): FormAnswerInput[] {
    return toAnswerInputs(this.visibleAnswerableQuestions(), this.answers());
  }

  private orderedPages(): PublishedFormPage[] {
    return [...this.definition.pages].sort((a, b) => a.displayOrder - b.displayOrder);
  }
}

