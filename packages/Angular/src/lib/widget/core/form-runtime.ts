/**
 * Headless runtime shared by both render modes. Holds the live answer map as a signal,
 * derives per-question/per-page visibility from the conditional rules (S2), tracks
 * validation + touched state, and computes the progress signal. Components read its
 * signals and call its mutators; it owns no DOM and no transport.
 */
import { computed, signal } from '@angular/core';
import {
  evaluateConditionalRule,
  isRequiredNow,
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

export class FormRuntime {
  private readonly answers = signal<Map<string, AnswerValue>>(new Map());
  private readonly touched = signal<Set<string>>(new Set());

  constructor(private readonly definition: PublishedFormDefinition) {}

  // --- Answer access -------------------------------------------------------

  public readonly answerMap = this.answers.asReadonly();

  /**
   * The live answer map, for consumers that evaluate a rule over the WHOLE response rather
   * than one question — ending-screen resolution is the only one today.
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
    return resolveVisiblePages(this.orderedPages(), this.answers());
  });

  /** Visible questions on a given page (page must itself be visible to matter). */
  public visibleQuestions(page: PublishedFormPage): PublishedFormQuestion[] {
    const map = this.answers();
    return [...page.questions]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .filter((q) => evaluateConditionalRule(q.conditionalRule, map));
  }

  /**
   * Every visible, answer-collecting question across the form, in document order — from the
   * shared resolver, so the set this widget renders, submits and scores over is the same set
   * the server scores over.
   */
  public readonly visibleAnswerableQuestions = computed<PublishedFormQuestion[]>(() =>
    resolveVisibleQuestions(this.orderedPages(), this.answers()),
  );

  // --- Validation ----------------------------------------------------------

  /** Validation message for a question, or `null` when valid. */
  public errorFor(question: PublishedFormQuestion): string | null {
    return validateQuestion(question, this.valueFor(question.id), this.answers()).message;
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
    return validateQuestion(question, this.valueFor(question.id), this.answers()).parts ?? {};
  }

  /** True when every supplied list of questions currently validates. */
  public areValid(questions: PublishedFormQuestion[]): boolean {
    return questions.every((q) => validateQuestion(q, this.valueFor(q.id), this.answers()).valid);
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
      (q) => validateQuestion(q, this.valueFor(q.id), this.answers()).valid,
    ),
  );

  // --- Progress ------------------------------------------------------------

  /**
   * How full the bar is. The weighting — and why it is weighted — lives in `progress.ts`.
   *
   * Requiredness comes from `isRequiredNow`, the same judge `errorFor`/`isFormValid` use, NOT
   * from the static `isRequired` flag. `computeProgress` returns 1 as soon as every required
   * question is satisfied, so reading the static flag showed a full bar on a form whose submit
   * button was disabled by a `require` group that had just fired — the one state in which the
   * bar is the respondent's only clue that something is still missing.
   */
  public readonly progress = computed(() =>
    computeProgress(
      this.visibleAnswerableQuestions().map((q) => ({
        required: isRequiredNow(q, this.answers()),
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

