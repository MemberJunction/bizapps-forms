/**
 * Scroll render mode: one SECTION at a time, with Back / Next and a final submit.
 *
 * It used to stack every visible section on one surface. That read well for a short form and
 * left branching with nowhere to go: a `Go to` rule could only make questions disappear from a
 * page the respondent was already reading — above the cursor as often as below it, taking
 * whatever they had typed into them. A section is a step now, so a jump has a real destination
 * and the questions it skips are never reached rather than removed.
 *
 * A one-section form is one step, which is exactly the form as it always looked, so the
 * commonest shape is unchanged.
 *
 * Reads the shared {@link FormRuntime}; emits `submit` when the respondent is done.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { AnswerValue, PublishedFormPage, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

import { FormRuntime } from '../core/form-runtime';
import { sectionEntries, skippedMessage, type SectionEntry } from '../core/section-content';
import { steppableSections } from '../core/section-stepper';
import { clampCursor } from '../core/stepper';
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
  /** Passed through to file uploads so each one can be tied back to this response. */
  public readonly responseId = input<string>('');
  /**
   * The ONLY way a submission leaves this component.
   *
   * Note the name is also a native DOM event name, and this component renders a `<form>` whose
   * native `submit` bubbles through the host element the parent binds this on. `onSubmit` stops
   * that propagation, and must keep doing so — see the note there for what breaks otherwise.
   */
  public readonly submit = output<void>();
  /** Fires when the respondent has made progress worth autosaving (debounced upstream). */
  public readonly progressChange = output<void>();
  /**
   * Fires when the respondent has FINISHED with a question, not merely changed it.
   *
   * Separate from {@link progressChange} because the two feed decisions of very different
   * weight. Autosave is cheap and reversible, so it rides every change. A knockout rule is
   * neither: it ends the form. A text field here is bound with `(input)`, so `progressChange`
   * arrives on every keystroke — judging `age lessThan 18` on that signal disqualifies someone
   * typing `18` the moment they press `1`.
   */
  public readonly commitChange = output<void>();

  private readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);

  /**
   * Raw cursor over {@link sections}. Always written through {@link setIndex} so it stays in
   * range; the re-clamp {@link effect} below also corrects it whenever a rule resizes the path.
   */
  protected readonly index = signal(0);

  /**
   * The sections the respondent steps through — see `section-stepper.ts` for why this is not
   * simply every visible page.
   */
  protected readonly sections = computed(() =>
    steppableSections(this.runtime().visiblePages(), this.runtime().renderedQuestions()),
  );
  protected readonly total = computed(() => this.sections().length);
  protected readonly current = computed<PublishedFormPage | null>(
    () => this.sections()[this.index()] ?? null,
  );
  protected readonly isFirst = computed(() => this.index() === 0);
  protected readonly isLast = computed(() => this.index() >= this.total() - 1);
  protected readonly progress = computed(() => this.runtime().progress());
  /** Empty on a single-section form: "Section 1 of 1" is a step count nobody needs. */
  protected readonly stepLabel = computed(() =>
    this.total() > 1 ? `Section ${this.index() + 1} of ${this.total()}` : '',
  );

  /**
   * Disable the primary control while submitting, and on the final step when submit is blocked.
   *
   * `submitDisabled` means "the captcha is unsolved", which is a fact about SUBMITTING. Applied
   * to every Next it would strand a respondent on section one of every captcha-gated form,
   * unable to even reach the challenge.
   */
  protected readonly primaryDisabled = computed(
    () => this.submitting() || (this.isLast() && this.submitDisabled()),
  );

  constructor() {
    // A jump firing on the last section shortens the list under the cursor, so re-clamp whenever
    // the path resizes. Tracked on `total()` with the cursor read and written untracked, so the
    // effect re-runs on a size change and never as a self-feeding loop on its own write.
    effect(() => {
      const total = this.total();
      untracked(() => {
        const clamped = clampCursor(this.index(), total);
        if (clamped !== this.index()) {
          this.index.set(clamped);
        }
      });
    });

    // Move focus to the section itself when it changes, so keyboard and screen-reader users land
    // on the new heading rather than wherever the old Next button used to be — and so the
    // browser scrolls the top of the section into view on a phone.
    let lastFocusedId: string | null = null;
    effect(() => {
      const page = this.current();
      if (page && page.id !== lastFocusedId) {
        lastFocusedId = page.id;
        queueMicrotask(() => this.focusCurrentSection());
      }
    });
  }

  protected questionsFor(page: PublishedFormPage): PublishedFormQuestion[] {
    return this.runtime().visibleQuestions(page);
  }

  /**
   * What this section renders: its questions, and a note where a jump passed some over.
   *
   * A `Go to` pointing INSIDE the section on screen removes questions the respondent is looking
   * at. Section stepping fixed the cross-section case; this is what is left of it, and unspoken
   * it reads as a glitch. Which absences are worth mentioning is `section-content.ts`'s call —
   * notably not the ones a question's own `show` rule hid, which were never on screen.
   */
  protected entriesFor(page: PublishedFormPage): SectionEntry[] {
    return sectionEntries(page, this.runtime().renderedQuestions(), this.runtime().answerMap());
  }

  /** The line shown where the questions were — one wording, defined once. */
  protected skippedText(entry: Extract<SectionEntry, { kind: 'skipped' }>): string {
    return skippedMessage(entry);
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
    // Focus has genuinely left, so whatever is in the field is what the respondent meant. This
    // is the same moment validation messages become fair to show, and for the same reason.
    this.commitChange.emit();
  }

  /**
   * Advance, or submit on the last section.
   *
   * Validates the section being LEFT and nothing beyond it: a respondent on section one has not
   * reached section three, and showing them its errors would be answering a question they have
   * not been asked.
   */
  protected onNext(): void {
    const page = this.current();
    if (!page) {
      return;
    }
    if (this.isLast()) {
      this.submit.emit();
      return;
    }
    const questions = this.questionsFor(page);
    this.runtime().touchAll(questions);
    if (!this.runtime().areValid(questions)) {
      this.focusFirstInvalidIn(questions);
      return;
    }
    this.setIndex(this.index() + 1);
    // The section behind us is finished: a natural, non-chatty autosave checkpoint, and the
    // moment its answers are final enough to judge a knockout on.
    this.progressChange.emit();
    this.commitChange.emit();
  }

  /** Navigation, never a commit — validating on the way back shows errors for unreached work. */
  protected onBack(): void {
    if (!this.isFirst()) {
      this.setIndex(this.index() - 1);
    }
  }

  /**
   * Handles the form's native `submit` event.
   *
   * TWO DIFFERENT JOBS, and each closes a failure the other cannot.
   *
   * `preventDefault` stops the browser's default GET navigation, which unmounts the widget
   * mid-request so the submission never lands.
   *
   * `stopPropagation` stops the event ESCAPING this component, and without it Next submitted the
   * form. Angular 21's `listenerInternal` adds a DOM listener to a component host element in
   * ADDITION to wiring its outputs (`if (tNode.type & 3) { listenToDomEvent(...) }`, then
   * `if (processOutputs) { listenToOutput(...) }`). So `(submit)="onSubmit()"` on
   * `<mjf-form-scroll>` in the parent template listens for BOTH our `submit` output and any
   * native `submit` that bubbles up to that element — and native `submit` bubbles. Preventing
   * the default action does nothing about propagation. While Submit was the only button this was
   * invisible: the parent got the event twice and its re-entrancy guard swallowed the second.
   * The moment that button became Next, the bubbled event WAS the submission.
   *
   * It is an embed hazard too, independent of Angular: this widget is a custom element dropped
   * into somebody else's page, and a `submit` escaping it can trip that page's own form handling.
   *
   * Validates the WHOLE visible form, not just the last section. Reaching the last section
   * proves each section validated as it was left, which is a different claim from "the form is
   * valid now" — going Back and clearing a required field is one way to break it.
   */
  protected onSubmit(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.isLast()) {
      this.onNext();
      return;
    }
    const all = this.runtime().visibleAnswerableQuestions();
    this.runtime().touchAll(all);
    if (this.runtime().areValid(all)) {
      this.submit.emit();
    } else {
      this.revealFirstInvalid(all);
    }
  }

  /**
   * Move to the section holding the first invalid answer, and focus it.
   *
   * The old renderer simply called `focus()` on the field, which worked because every section
   * was on screen. With one section rendered at a time the field is usually not in the DOM at
   * all, so focusing it does nothing and the form refuses to submit with no visible reason.
   */
  private revealFirstInvalid(questions: readonly PublishedFormQuestion[]): void {
    const first = questions.find((question) => this.runtime().errorFor(question));
    if (!first) {
      return;
    }
    const section = this.sectionOf(first.id);
    if (section >= 0 && section !== this.index()) {
      this.setIndex(section);
      // The section-change effect moves focus to the new section; jumping to the field as well
      // would fight it, and landing on the heading is the more useful place to arrive anyway.
      return;
    }
    this.focusFirstInvalidIn(questions);
  }

  /** Index of the section rendering `questionId`, or -1. */
  private sectionOf(questionId: string): number {
    return this.sections().findIndex((page) => page.questions.some((q) => q.id === questionId));
  }

  private focusFirstInvalidIn(questions: readonly PublishedFormQuestion[]): void {
    const first = questions.find((question) => this.runtime().errorFor(question));
    if (first) {
      this.hostRef.nativeElement.querySelector<HTMLElement>(`#mjf-q-${first.id}`)?.focus();
    }
  }

  /** Move the cursor, clamped to the currently-valid range. */
  private setIndex(next: number): void {
    this.index.set(clampCursor(next, this.total()));
  }

  private focusCurrentSection(): void {
    this.hostRef.nativeElement.querySelector<HTMLElement>('.mjf-page')?.focus();
  }
}
