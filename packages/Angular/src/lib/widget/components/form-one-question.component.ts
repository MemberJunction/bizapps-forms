/**
 * OneQuestion (Typeform-style) render mode: one question at a time with Back/Next
 * stepping, a progress bar, and a final submit. The visible-question list is derived
 * live from the runtime, so conditional show/hide changes the path as the respondent
 * answers. Enter in a text field advances; focus moves to each new question for keyboard + SR users.
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
  viewChildren,
  ElementRef,
} from '@angular/core';
import type { AnswerValue, PublishedFormQuestion } from '@mj-biz-apps/forms-entities/contracts';

import { FormRuntime } from '../core/form-runtime';
import { nothingToSubmit } from '../core/nothing-to-submit';
import { StepJudge } from '../core/settled-validation';
import { clampCursor } from '../core/stepper';
import { advancesOnEnter } from './enter-advances';
import { FormUploadStore } from '../core/upload-store';
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
  /** When true, the final-step submit control is disabled (e.g. captcha not yet solved). */
  public readonly submitDisabled = input<boolean>(false);
  /** Distribution slug, forwarded to FileUpload questions for scoped uploads. */
  public readonly distributionSlug = input<string>('');
  /** Passed through to file uploads so each one can be tied back to this response. */
  public readonly responseId = input<string>('');
  public readonly submit = output<void>();
  /** Fires when the respondent advances a step — a natural autosave checkpoint. */
  public readonly progressChange = output<void>();
  /**
   * Fires when the respondent has FINISHED with a question. In this mode that is unambiguous:
   * they answered it and advanced. See the scroll renderer for why knockout rules need a signal
   * distinct from {@link progressChange}.
   */
  public readonly commitChange = output<void>();

  private readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);

  /** The one question currently rendered (this render mode shows a single step at a time). */
  private readonly questionViews = viewChildren(FormQuestionComponent);

  /**
   * Commit every rendered question's visible text before anything judges it (#268) — an autofill
   * that fired no event the controls listen for is otherwise "required" while plainly filled in.
   */
  private commitVisibleValues(): void {
    for (const view of this.questionViews()) {
      view.syncFromDom();
    }
  }

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

  /** The widget's upload store: shared with the step judge and the ready line (#328). */
  private readonly uploads = inject(FormUploadStore);

  /** Judges a question only once its upload has landed (#248) — and only once per tap. */
  private readonly stepJudge = new StepJudge(
    this.uploads,
    () => this.current()?.id ?? null,
  );

  /**
   * Progress comes from the runtime, the same as Scroll mode.
   *
   * This used to be `(index + 1) / total` — the respondent's POSITION in the deck, which is a
   * different quantity wearing the same name. It read 14% on arrival with nothing filled in,
   * moved when someone skipped an optional question without answering it, and disagreed with
   * the bar the other render mode showed for the identical form. One definition of "how far
   * along am I", in the one place that can answer it.
   */
  protected readonly progress = computed(() => this.runtime().progress());
  protected readonly stepLabel = computed(() => `${this.index() + 1} of ${this.total()}`);

  /** Disable the primary control while submitting, or on the final (submit) step when blocked. */
  protected readonly primaryDisabled = computed(
    () => this.submitting() || (this.isLast() && this.submitDisabled()),
  );

  /**
   * Whether "you can submit now" is true HERE — the last question, the control live, the whole
   * visible form valid. Same three conditions as the scroll renderer, resolved against this
   * renderer's own cursor, because "the last step" is the one thing the two do not share.
   *
   * This is the signal the progress bar used to carry by reading 100% early (#88).
   */
  protected readonly readyToSubmit = computed(
    () =>
      this.isLast() &&
      !this.primaryDisabled() &&
      this.runtime().isFormValid() &&
      // ...and the submit would actually be ACCEPTED. `isFormValid` only asks whether any field is
      // in error, which nothing is on a form of blank optional questions — so without this the bar
      // said "You can submit now." beside the #124 banner refusing that exact submit. An upload on
      // its way counts as an answer, matching the submit gate (#328).
      !nothingToSubmit(this.runtime(), this.uploads),
  );

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
  }

  /**
   * Touched means "left the field", not "typed in it" — see the note on the scroll renderer.
   * `onNext` below still touches the question (through the judge), because trying to advance IS
   * a commit.
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
   * Validate the current question, then submit (last step) or advance.
   *
   * Waits for the question's upload first (#248): a drawing still on the wire has no answer yet,
   * and judging it now would call it "required". The visible value is committed BEFORE the wait.
   * A `stale` verdict (a second tap or Enter, or Back during the wait) does nothing; see
   * {@link StepJudge}.
   *
   * The step is held by EITHER an `invalid` verdict or `errorFor`. `errorFor` because the verdict's
   * `areValid` ignores a server refusal, and this step has always been held by one until the answer
   * changes. The verdict because only it knows about a failed upload on an optional question, which
   * has no `errorFor` but must not be advanced past (and is left untouched by the judge, so its
   * quiet failure line is not contradicted by "required").
   */
  protected async onNext(): Promise<void> {
    const q = this.current();
    if (!q) {
      return;
    }
    this.commitVisibleValues();
    const verdict = await this.stepJudge.judge(this.runtime(), [q]);
    if (verdict === 'stale') {
      return;
    }
    if (verdict === 'invalid' || this.runtime().errorFor(q)) {
      this.focusCurrent();
      return;
    }
    if (this.isLast()) {
      this.submit.emit();
    } else {
      this.setIndex(this.index() + 1);
      // Advancing a step is a natural, non-chatty autosave checkpoint — and, since the answer
      // behind us is now final, the moment to judge a knockout on it.
      this.progressChange.emit();
      this.commitChange.emit();
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

  /**
   * Enter in a single-line text field advances. Enter on a control — Back, a choice, Retry,
   * "Choose a file" — is left alone so the control does its own job; the old textarea-only guard
   * made Enter on Back go forward, and on the last question submit. The Enter that confirms an IME
   * composition (Japanese, Chinese) is the input method's, not "next".
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === 'Enter' && advancesOnEnter(event.target as Element | null)) {
      event.preventDefault();
      void this.onNext();
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
