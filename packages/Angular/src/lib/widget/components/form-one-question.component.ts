/**
 * OneQuestion (Typeform-style) render mode: one question at a time with Back/Next
 * stepping, a progress bar, and a final submit. The visible-question list is derived
 * live from the runtime, so conditional show/hide changes the path as the respondent
 * answers. Enter advances; focus moves to each new question for keyboard + SR users.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  ElementRef,
} from '@angular/core';
import type { AnswerValue, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

import { FormRuntime } from '../core/form-runtime';
import { FormProgressComponent } from './form-progress.component';
import { FormQuestionComponent } from './questions/form-question.component';

@Component({
  selector: 'mjf-form-one-question',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormProgressComponent, FormQuestionComponent],
  templateUrl: './form-one-question.component.html',
  styleUrls: ['./form-one-question.component.css'],
})
export class FormOneQuestionComponent {
  public readonly runtime = input.required<FormRuntime>();
  public readonly submitting = input<boolean>(false);
  public readonly submit = output<void>();

  private readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);
  protected readonly index = signal(0);

  /** The ordered, currently-visible answerable questions (recomputed reactively). */
  protected readonly steps = computed(() => this.runtime().visibleAnswerableQuestions());
  protected readonly total = computed(() => this.steps().length);
  protected readonly current = computed<PublishedFormQuestion | null>(
    () => this.steps()[this.clampedIndex()] ?? null,
  );
  protected readonly isFirst = computed(() => this.clampedIndex() === 0);
  protected readonly isLast = computed(() => this.clampedIndex() >= this.total() - 1);
  protected readonly progress = computed(() => {
    const t = this.total();
    return t === 0 ? 1 : (this.clampedIndex() + 1) / t;
  });
  protected readonly stepLabel = computed(() => `${this.clampedIndex() + 1} of ${this.total()}`);

  constructor() {
    // When conditional logic shrinks the path below the cursor, keep the index valid
    // and move focus to whatever question is now current.
    effect(() => {
      const c = this.current();
      if (c) {
        queueMicrotask(() => this.focusCurrent());
      }
    });
  }

  protected clampedIndex(): number {
    return Math.min(this.index(), Math.max(0, this.total() - 1));
  }

  protected onValueChange(question: PublishedFormQuestion, value: AnswerValue): void {
    this.runtime().setValue(question.id, value);
    this.runtime().markTouched(question.id);
  }

  protected onNext(): void {
    const q = this.current();
    if (!q) {
      return;
    }
    this.runtime().markTouched(q.id);
    if (this.runtime().errorFor(q)) {
      this.focusCurrent();
      return;
    }
    if (this.isLast()) {
      this.submit.emit();
    } else {
      this.index.set(this.clampedIndex() + 1);
    }
  }

  protected onBack(): void {
    if (!this.isFirst()) {
      this.index.set(this.clampedIndex() - 1);
    }
  }

  /** Enter on the question advances (except in a multiline textarea). */
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (event.key === 'Enter' && target?.tagName !== 'TEXTAREA') {
      event.preventDefault();
      this.onNext();
    }
  }

  private focusCurrent(): void {
    const q = this.current();
    if (!q) {
      return;
    }
    const host = this.hostRef.nativeElement;
    const field = host.querySelector<HTMLElement>(`#mjf-q-${q.id}`);
    (field ?? host.querySelector<HTMLElement>('.mjf-oneq__card'))?.focus();
  }
}
