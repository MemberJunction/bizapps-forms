/**
 * Scroll (classic) render mode: every visible page and question stacked in one
 * scrollable surface, with a sticky progress bar and a single submit. Reads the
 * shared {@link FormRuntime}; emits `submit` when the respondent is done.
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { AnswerValue, PublishedFormPage, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

import { FormRuntime } from '../core/form-runtime';
import { FormProgressComponent } from './form-progress.component';
import { FormQuestionComponent } from './questions/form-question.component';

@Component({
  selector: 'mjf-form-scroll',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormProgressComponent, FormQuestionComponent],
  templateUrl: './form-scroll.component.html',
  styleUrls: ['./form-scroll.component.css'],
})
export class FormScrollComponent {
  public readonly runtime = input.required<FormRuntime>();
  public readonly submitting = input<boolean>(false);
  /** Distribution slug, forwarded to FileUpload questions for scoped uploads. */
  public readonly distributionSlug = input<string>('');
  public readonly submit = output<void>();
  /** Fires when the respondent has made progress worth autosaving (debounced upstream). */
  public readonly progressChange = output<void>();

  protected readonly pages = computed(() => this.runtime().visiblePages());
  protected readonly progress = computed(() => this.runtime().progress());

  protected questionsFor(page: PublishedFormPage): PublishedFormQuestion[] {
    return this.runtime().visibleQuestions(page);
  }

  protected onValueChange(question: PublishedFormQuestion, value: AnswerValue): void {
    this.runtime().setValue(question.id, value);
    this.runtime().markTouched(question.id);
    this.progressChange.emit();
  }

  protected onSubmit(): void {
    const all = this.runtime().visibleAnswerableQuestions();
    this.runtime().touchAll(all);
    if (this.runtime().areValid(all)) {
      this.submit.emit();
    } else {
      this.focusFirstInvalid();
    }
  }

  private focusFirstInvalid(): void {
    const first = this.runtime()
      .visibleAnswerableQuestions()
      .find((q) => this.runtime().errorFor(q));
    if (first) {
      document.getElementById(`mjf-q-${first.id}`)?.focus();
    }
  }
}
