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
  untracked,
  ElementRef,
} from '@angular/core';
import type { AnswerValue, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

import { FormRuntime } from '../core/form-runtime';
import { clampCursor } from '../core/one-question-stepper';
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
  /** Distribution slug, forwarded to FileUpload questions for scoped uploads. */
  public readonly distributionSlug = input<string>('');
  public readonly submit = output<void>();
  /** Fires when the respondent advances a step — a natural autosave checkpoint. */
  public readonly progressChange = output<void>();

  private readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);

  /**
   * Raw cursor. Always written through {@link setIndex} so it stays inside the valid
   * range; the re-clamp {@link effect} below also corrects it whenever conditional logic
   * resizes the visible-question path, so the stored value never drifts out of bounds.
   */
  protected readonly index = signal(0);

  /** The ordered, currently-visible answerable questions (recomputed reactively). */
  protected readonly steps = computed(() => this.runtime().visibleAnswerableQuestions());
  protected readonly total = computed(() => this.steps().length);
  protected readonly current = computed<PublishedFormQuestion | null>(
    () => this.steps()[this.index()] ?? null,
  );
  protected readonly isFirst = computed(() => this.index() === 0);
  protected readonly isLast = computed(() => this.index() >= this.total() - 1);
  protected readonly progress = computed(() => {
    const t = this.total();
    return t === 0 ? 1 : (this.index() + 1) / t;
  });
  protected readonly stepLabel = computed(() => `${this.index() + 1} of ${this.total()}`);

  constructor() {
    // When conditional logic resizes the path, re-clamp the stored cursor so it never
    // drifts above the new last index. Without this, hiding questions below the cursor
    // (then revealing them again) would let the cursor "jump ahead", skipping steps.
    // We track `total()` and read/write the cursor untracked, so the effect re-runs only
    // when the path size changes — never as a self-feeding loop on the cursor write.
    effect(() => {
      const total = this.total();
      untracked(() => {
        const clamped = clampCursor(this.index(), total);
        if (clamped !== this.index()) {
          this.index.set(clamped);
        }
      });
    });

    // Move focus to the current question only when the question itself changes — not on
    // every answer edit — so typing or selecting an answer never yanks focus mid-input.
    let lastFocusedId: string | null = null;
    effect(() => {
      const c = this.current();
      if (c && c.id !== lastFocusedId) {
        lastFocusedId = c.id;
        queueMicrotask(() => this.focusCurrent());
      }
    });
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
      this.setIndex(this.index() + 1);
      // Advancing a step is a natural, non-chatty autosave checkpoint.
      this.progressChange.emit();
    }
  }

  protected onBack(): void {
    if (!this.isFirst()) {
      this.setIndex(this.index() - 1);
    }
  }

  /** Move the cursor to `next`, clamped to the currently-valid range. */
  private setIndex(next: number): void {
    this.index.set(clampCursor(next, this.total()));
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
