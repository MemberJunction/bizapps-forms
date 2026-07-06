/**
 * Headless runtime shared by both render modes. Holds the live answer map as a signal,
 * derives per-question/per-page visibility from the conditional rules (S2), tracks
 * validation + touched state, and computes the progress signal. Components read its
 * signals and call its mutators; it owns no DOM and no transport.
 */
import { computed, signal } from '@angular/core';
import {
  evaluateConditionalRule,
  type AnswerValue,
  type FormAnswerInput,
  type PublishedFormDefinition,
  type PublishedFormPage,
  type PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';

import { toAnswerInputs } from './answer-value';
import { validateQuestion } from './validation';

export class FormRuntime {
  private readonly answers = signal<Map<string, AnswerValue>>(new Map());
  private readonly touched = signal<Set<string>>(new Set());

  constructor(private readonly definition: PublishedFormDefinition) {}

  // --- Answer access -------------------------------------------------------

  public readonly answerMap = this.answers.asReadonly();

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

  /** Pages whose page-level rule passes given current answers. */
  public readonly visiblePages = computed<PublishedFormPage[]>(() => {
    const map = this.answers();
    return this.orderedPages().filter((p) =>
      evaluateConditionalRule(p.conditionalRule, map),
    );
  });

  /** Visible questions on a given page (page must itself be visible to matter). */
  public visibleQuestions(page: PublishedFormPage): PublishedFormQuestion[] {
    const map = this.answers();
    return [...page.questions]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .filter((q) => evaluateConditionalRule(q.conditionalRule, map));
  }

  /** Every visible, non-statement question across the form, in document order. */
  public readonly visibleAnswerableQuestions = computed<PublishedFormQuestion[]>(() => {
    const out: PublishedFormQuestion[] = [];
    for (const page of this.visiblePages()) {
      for (const q of this.visibleQuestions(page)) {
        if (q.type !== 'Statement') {
          out.push(q);
        }
      }
    }
    return out;
  });

  // --- Validation ----------------------------------------------------------

  /** Validation message for a question, or `null` when valid. */
  public errorFor(question: PublishedFormQuestion): string | null {
    return validateQuestion(question, this.valueFor(question.id)).message;
  }

  /** Error shown in the UI only after the field has been touched. */
  public visibleErrorFor(question: PublishedFormQuestion): string | null {
    return this.isTouched(question.id) ? this.errorFor(question) : null;
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

  /** Fraction 0–1 of visible answerable questions that have a value. */
  public readonly progress = computed(() => {
    const qs = this.visibleAnswerableQuestions();
    if (qs.length === 0) {
      return 1;
    }
    const answered = qs.filter((q) => hasAnswer(this.valueFor(q.id))).length;
    return answered / qs.length;
  });

  // --- Submission ----------------------------------------------------------

  /** Build the wire answers for all currently-visible answerable questions. */
  public buildAnswerInputs(): FormAnswerInput[] {
    return toAnswerInputs(this.visibleAnswerableQuestions(), this.answers());
  }

  private orderedPages(): PublishedFormPage[] {
    return [...this.definition.pages].sort((a, b) => a.displayOrder - b.displayOrder);
  }
}

function hasAnswer(value: AnswerValue): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}
