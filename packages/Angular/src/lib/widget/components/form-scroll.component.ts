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
  /** When true, the submit control is disabled (e.g. captcha not yet solved). */
  public readonly submitDisabled = input<boolean>(false);
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
    this.progressChange.emit();
  }

  /**
   * A field becomes "touched" when the respondent LEAVES it, not when they type in it.
   *
   * Marking touched on every keystroke means the error message is live while someone is still
   * typing: a `Phone` question wants 7+ digits, so the first six keystrokes each render
   * "Enter a valid phone number." — and because that message carries `role="alert"`, a screen
   * reader re-announces it on every one.
   */
  protected onBlur(question: PublishedFormQuestion, event: FocusEvent): void {
    // `focusout` bubbles, which is why one binding covers every control a question renders — but
    // it also fires when focus moves BETWEEN two controls of the same question. A MultiChoice
    // renders one `role="checkbox"` per option and SingleChoice/Rating a `role="radiogroup"`, so
    // without this guard tabbing from the first option to the second marks the question touched
    // and renders "This question is required." while the respondent is still reading the options.
    // Focus has only really left when it landed somewhere outside this question (or nowhere).
    const container = event.currentTarget as HTMLElement | null;
    const movedTo = event.relatedTarget as Node | null;
    if (container && movedTo && container.contains(movedTo)) {
      return;
    }
    this.runtime().markTouched(question.id);
  }

  /**
   * Handles the form's native `submit` event.
   *
   * `preventDefault` is load-bearing, not decorative: without it the browser performs a
   * GET navigation that unmounts the widget mid-request, so the submission never lands.
   * See the comment on the <form> element.
   */
  protected onSubmit(event?: Event): void {
    event?.preventDefault();
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
