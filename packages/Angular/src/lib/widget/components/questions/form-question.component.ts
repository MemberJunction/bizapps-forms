/**
 * Renders ONE question of any type and emits value changes. The control set is intentionally
 * native (`<input>`, `<textarea>`, `<select>`, buttons) for maximum accessibility and
 * mobile-keyboard fidelity, themed entirely by `--mjf-*` tokens.
 *
 * All 25 types are handled here via `@switch`. Only the ones needing a bespoke control get a
 * `@case`; ShortText, Email, Phone, Website, Date and Time share the `@default` input, differing
 * only in the `type`/`inputmode`/`autocomplete` triple `input-mode.ts` derives.
 *
 * `Doodle` is delegated to {@link DoodlePadComponent} and then travels the SAME upload path a
 * `FileUpload` answer does — it is a file answer whose file came from a canvas.
 */
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  Injector,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CdkDrag, CdkDragHandle, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';

import { optionLetter } from '../../../shared/option-letter';
import { moveItem } from '../../../shared/move-item';
import {
  ADDRESS_FIELDS,
  CONTACT_INFO_FIELDS,
  doodlePen,
  isAnswerableQuestionType,
  numericScalePoints,
  opinionScaleBounds,
  ratingScaleMax,
  type AnswerValue,
  type PublishedFormQuestion,
  type PublishedFormQuestionOption,
} from '@mj-biz-apps/forms-entities';

import { NgTemplateOutlet } from '@angular/common';

import { FORMS_UPLOAD_SERVICE } from '../../api/form-upload.interface';
import { FormUploadStore } from '../../core/upload-store';
import {
  autocompleteFor,
  compositeAutocompleteFor,
  compositeInputTypeFor,
  compositeLabelFor,
  inputModeFor,
  inputTypeFor,
} from './input-mode';
import { DoodlePadComponent, type DoodleCapture } from './doodle-pad.component';
import { flipDeltas, rankAnnouncement } from './rank-motion';

/** How long a reordered row takes to travel to its new place. */
const RANK_TRAVEL_MS = 220;

/**
 * How long the moved row stays marked.
 *
 * Long enough to find after the motion ends, short enough that it is gone before the next
 * decision — a mark that outstays the action stops meaning "this one" and becomes decoration.
 */
const MOVED_MARK_MS = 900;

/** Respect the OS setting; vestibular disorders make travelling rows genuinely unpleasant. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** UI state of a FileUpload control. */
type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

@Component({
  selector: 'mjf-form-question',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, DoodlePadComponent, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder],
  templateUrl: './form-question.component.html',
  styleUrls: ['./form-question.component.css'],
})
export class FormQuestionComponent {
  /** The published question to render. */
  public readonly question = input.required<PublishedFormQuestion>();
  /** Current value (controlled). */
  public readonly value = input<AnswerValue>(undefined);
  /** Validation message to show, or `null` when valid / untouched. */
  public readonly errorMessage = input<string | null>(null);
  /**
   * Per-sub-field messages for a composite (Address / ContactInfo), keyed by field name.
   *
   * Empty for every other question type, and empty for a composite whose failure belongs to
   * the group (required, or a value that is not a record) — that case still shows one message
   * under the whole control. See {@link FormRuntime.visiblePartErrorsFor}.
   */
  public readonly partErrors = input<Record<string, string>>({});
  /** Distribution slug — needed to scope a FileUpload's upload to the current form. */
  public readonly distributionSlug = input<string>('');
  /**
   * The response id this form is filling in, passed through to uploads.
   *
   * It is what ties an uploaded file to this respondent's submission; the anonymous session id is
   * blank in ordinary public-link flows and cannot do that job.
   */
  public readonly responseId = input<string>('');
  /** Emits whenever the respondent changes the answer. */
  public readonly valueChange = output<AnswerValue>();

  private readonly uploader = inject(FORMS_UPLOAD_SERVICE);
  /**
   * Upload state, keyed by question id rather than held here.
   *
   * These four used to be plain signals on this component, which quietly assumed one instance
   * per question for the life of the form. Neither render mode works that way — see the note on
   * {@link FormUploadStore} — so the state outlived the question it described and was announced
   * against whichever question the framework reused this instance for.
   */
  private readonly uploads = inject(FormUploadStore);

  /** This question's upload lifecycle, and nobody else's. */
  private readonly upload = computed(() => this.uploads.viewFor(this.question().id));
  protected readonly uploadStatus = computed<UploadStatus>(() => this.upload().status);
  /** Progress 0–1 while uploading, or `null` for an indeterminate phase. */
  protected readonly uploadProgress = computed(() => this.upload().progress);
  /** Display name of the selected/uploaded file (the stored answer is the fileId). */
  protected readonly uploadFileName = computed(() => this.upload().fileName);
  /** Inline, respondent-facing upload error, or `null`. */
  protected readonly uploadError = computed(() => this.upload().error);
  /**
   * The file held locally for this question, whatever its upload has done — or `null`.
   *
   * "Local" is the distinction that matters, and the reason it is not called `uploadedFile`: the
   * file is here from the moment it is chosen or drawn, while it is uploading, and after an
   * upload has failed. Only {@link answerRecorded} says a file is stored. What this is for is
   * rendering — the doodle pad repaints itself from it after Angular destroys the control —
   * and retrying. Read from the store, keyed by question id, for the same reason every other
   * upload fact is: this component instance is recycled across questions and cannot be trusted
   * to still be the one the file belongs to.
   */
  protected readonly localFile = computed(() => this.upload().file);
  /**
   * Whether a file answer is on record for this question — the answer id, not the artifact.
   *
   * The two can come apart, and a control that reads only the artifact then renders EMPTY over a
   * stored answer. That is the shape of the bug the doodle pad had, one level up: the upload
   * store is per-widget memory, so a drawing or file captured in an earlier session leaves the
   * answer with nothing local to show for it. Reading the answer itself is what keeps the control
   * from claiming a question is unanswered when it is not.
   */
  protected readonly answerRecorded = computed(() => {
    const value = this.value();
    return typeof value === 'string' && value.trim() !== '';
  });
  /** Whole-number progress percent for the aria-valuenow / label. */
  protected readonly uploadPercent = computed(() => {
    const p = this.uploadProgress();
    return p === null ? null : Math.round(p * 100);
  });

  protected readonly inputId = computed(() => `mjf-q-${this.question().id}`);

  /**
   * The A/B/C badge for the option at this position.
   *
   * Position, never the label or the value: the badge is a way to refer to a choice out loud
   * ("pick C"), so it has to agree with what the author sees in the builder, and both sides read
   * the options in the same published order.
   */
  protected letterAt(index: number): string {
    return optionLetter(index);
  }
  protected readonly errorId = computed(() => `${this.inputId()}-error`);
  protected readonly statusId = computed(() => `${this.inputId()}-status`);

  /**
   * Whether the file control's status line currently says anything.
   *
   * Read by the input's `aria-describedby`, because that line is the ONLY place the attached
   * file is named: a re-created file input reports "No file chosen" no matter what is stored, so
   * a screen-reader user who is not pointed at the status is never told their answer exists.
   * `aria-live` does not cover it — the text is already on the page when the control is
   * rendered, and a live region announces changes, not what was there on arrival.
   */
  protected readonly hasFileStatus = computed(
    () =>
      this.question().type === 'FileUpload' &&
      (this.uploadStatus() === 'uploading' || this.uploadStatus() === 'done' || this.answerRecorded()),
  );

  /** True when the failure is field-level, which is what decides where messages are rendered. */
  protected readonly hasPartErrors = computed(() => Object.keys(this.partErrors()).length > 0);

  protected partError(field: string): string | null {
    return this.partErrors()[field] ?? null;
  }

  protected partErrorId(field: string): string {
    return `${this.inputId()}-${field}-error`;
  }

  /**
   * Whether to mark ONE sub-field as invalid.
   *
   * Red is the signal that says "look here", and it only works while it is scarce: a composite
   * that reddens all five inputs because the email is malformed makes the respondent hunt for
   * the one that matters. So a sub-field is marked when it has its own error — and when the
   * failure is group-level (no per-field errors) the whole group is marked, because then every
   * field really is implicated.
   */
  protected compositeInvalid(field: string): boolean {
    return this.hasPartErrors() ? !!this.partErrors()[field] : !!this.errorMessage();
  }
  protected readonly helpId = computed(() => `${this.inputId()}-help`);
  protected readonly describedBy = computed(() => {
    const ids: string[] = [];
    if (this.question().helpText) {
      ids.push(this.helpId());
    }
    if (this.errorMessage()) {
      ids.push(this.errorId());
    }
    if (this.hasFileStatus()) {
      ids.push(this.statusId());
    }
    return ids.length ? ids.join(' ') : null;
  });

  protected readonly inputType = computed(() => inputTypeFor(this.question().type));
  protected readonly inputMode = computed(() => inputModeFor(this.question().type));
  protected readonly autocomplete = computed(() => autocompleteFor(this.question().type));

  protected readonly textValue = computed(() => {
    const v = this.value();
    return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  });

  protected readonly selectedValues = computed<string[]>(() => {
    const v = this.value();
    if (Array.isArray(v)) {
      return v.map((x) => String(x));
    }
    return [];
  });

  // Both scales come from the shared contract, for the reason `opinionScaleBounds` already
  // carries: derived twice, they drift, and the respondent is told that the number they were
  // just shown and allowed to click is out of range. The second reader is now the condition
  // editor, which offers exactly these points as a rule's comparison value — a rule naming a
  // sixth star on a five-star question can never fire, and neither screen would say why.
  /** Rating scale max — the author's `settings.max`, or the shared default. */
  protected readonly ratingMax = computed(() => ratingScaleMax(this.question().settings));
  protected readonly ratingScale = computed(
    () => numericScalePoints('Rating', this.question().settings) ?? [],
  );
  /** NPS is 0–10 by definition, not by configuration. */
  protected readonly npsScale = numericScalePoints('NPS') ?? [];

  protected readonly placeholder = computed(() => {
    const raw = this.question().settings?.['placeholder'];
    return typeof raw === 'string' ? raw : '';
  });
  protected readonly textRows = computed(() => {
    const raw = this.question().settings?.['rows'];
    return typeof raw === 'number' && raw > 0 ? raw : 4;
  });
  protected readonly fileAccept = computed(() => {
    const raw = this.question().settings?.['accept'];
    return typeof raw === 'string' ? raw : '';
  });

  protected readonly numericValue = computed(() => {
    const v = this.value();
    return typeof v === 'number' ? v : null;
  });
  protected readonly booleanValue = computed(() => {
    const v = this.value();
    return typeof v === 'boolean' ? v : null;
  });

  /** False only for `Statement`, which renders as content instead of as a control. */
  protected readonly isAnswerable = computed(() => isAnswerableQuestionType(this.question().type));

  // --- OpinionScale --------------------------------------------------------
  //
  // Distinct from Rating (stars, always 1..N) in the two ways that matter to a respondent: it
  // can start at 0, and it carries a word at each end so "7" means something. Both are settings
  // rather than new columns, which is what `PublishedFormQuestion.settings` is for.

  // Bounds come from the shared contract, not from a second copy here: the server now REJECTS an
  // OpinionScale answer outside them, so a local default that disagreed would render a point the
  // respondent can click and the submit then refuses.
  protected readonly scaleMin = computed(() => opinionScaleBounds(this.question().settings).min);
  protected readonly scaleMax = computed(() => opinionScaleBounds(this.question().settings).max);
  protected readonly scalePoints = computed(() => {
    const min = this.scaleMin();
    return Array.from({ length: this.scaleMax() - min + 1 }, (_, i) => min + i);
  });
  protected readonly scaleLabelMin = computed(() => this.settingText('labelMin'));
  protected readonly scaleLabelMax = computed(() => this.settingText('labelMax'));

  // --- Legal ---------------------------------------------------------------

  /** The terms a `Legal` question asks the respondent to accept. */
  protected readonly legalTerms = computed(() => this.settingText('terms'));

  // --- Composites (Address / ContactInfo) ----------------------------------

  protected readonly compositeFields = computed<readonly string[]>(() =>
    this.question().type === 'Address' ? ADDRESS_FIELDS : CONTACT_INFO_FIELDS,
  );

  /** The composite answer as a flat string map, ignoring anything that is not a string. */
  protected readonly compositeValue = computed<Record<string, string>>(() => {
    const v = this.value();
    if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(v)) {
      if (typeof raw === 'string') {
        out[key] = raw;
      }
    }
    return out;
  });

  protected compositeLabel(field: string): string {
    return compositeLabelFor(field);
  }
  protected compositeAutocomplete(field: string): string {
    return compositeAutocompleteFor(field);
  }
  protected compositeInputType(field: string): string {
    return compositeInputTypeFor(field);
  }
  protected compositePart(field: string): string {
    return this.compositeValue()[field] ?? '';
  }

  /**
   * Update one part of a composite, emitting the whole object.
   *
   * Blank parts are DROPPED rather than kept as empty strings, so a respondent who tabs through
   * an optional address without typing leaves no answer at all. Keeping them would emit
   * `{line1:'', city:''}` — an object `isAnswerSupplied` correctly calls unanswered, but which
   * every reader downstream still has to receive, store and skip.
   */
  protected onComposite(field: string, raw: string): void {
    const next: Record<string, string> = { ...this.compositeValue(), [field]: raw };
    for (const key of Object.keys(next)) {
      if (next[key].trim() === '') {
        delete next[key];
      }
    }
    this.valueChange.emit(Object.keys(next).length > 0 ? next : null);
  }

  // --- Ranking -------------------------------------------------------------

  /**
   * Options in their current ranked order.
   *
   * Unranked options keep their authored position at the end, so an untouched Ranking still
   * renders a sensible list while its ANSWER stays null — which is what lets `isRequired` mean
   * "you must actually rank these" rather than being satisfied by the default order.
   */
  protected readonly rankedOptions = computed<PublishedFormQuestionOption[]>(() => {
    const remaining = new Map(this.question().options.map((o) => [o.value, o]));
    const ordered: PublishedFormQuestionOption[] = [];
    for (const value of this.selectedValues()) {
      const option = remaining.get(value);
      if (option) {
        ordered.push(option);
        remaining.delete(value);
      }
    }
    for (const option of this.question().options) {
      if (remaining.has(option.value)) {
        ordered.push(option);
      }
    }
    return ordered;
  });

  /** Move one option up (-1) or down (+1) the ranking, emitting the full new order. */
  /**
   * A dragged item was dropped. Distinct from {@link moveRank}: a button SWAPS with its
   * neighbour, a drag LIFTS an item out and puts it down, shifting everything in between.
   */
  protected onRankDrop(from: number, to: number): void {
    const options = this.rankedOptions();
    this.valueChange.emit(moveItem(options.map((o) => o.value), from, to));
    // No FLIP here: CDK has already animated the rows out of the way and the item into place.
    // Re-animating from the pre-drop layout would drag everything back and replay the move.
    this.announceRank(options[from], to, options.length);
  }

  protected moveRank(index: number, delta: number): void {
    const options = this.rankedOptions();
    const target = index + delta;
    if (target < 0 || target >= options.length) {
      return;
    }
    // Everything below is derived from `options`, read ONCE before the emit. Reading the signal
    // again afterwards would be a coin flip: the value travels out to the parent and back as an
    // input, so whether it has landed depends on change detection, and the two readers here
    // wanted opposite answers — the mark wants the row at the OLD index, the announcement wants
    // it at the NEW one. Same object, named once, no timing question.
    const moved = options[index];

    // Measure BEFORE emitting: once the list re-renders the old layout is gone, and knowing
    // where each row used to be is the whole of FLIP.
    const before = this.rankPositions();

    const order = options.map((o) => o.value);
    [order[index], order[target]] = [order[target], order[index]];
    this.valueChange.emit(order);

    this.movedRankId.set(moved.id);
    this.announceRank(moved, target, options.length);
    afterNextRender(() => this.playRankMotion(before, target), { injector: this.injector });
  }

  // --- Making a reorder visible --------------------------------------------
  //
  // See rank-motion.ts for why an instant swap reads as "the arrows do not work".

  private readonly rankList = viewChild<ElementRef<HTMLOListElement>>('rankList');
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  /** The row the respondent just moved, marked so they can find it among the two that move. */
  protected readonly movedRankId = signal<string | null>(null);
  /** Spoken after a reorder; motion says nothing to a screen reader. */
  protected readonly rankLiveMessage = signal<string>('');
  private movedRankTimer: ReturnType<typeof setTimeout> | undefined;

  /** Current top of every row, keyed by option id. Empty before the list exists. */
  private rankPositions(): Map<string, number> {
    const positions = new Map<string, number>();
    for (const row of this.rankRows()) {
      const key = row.dataset['rankKey'];
      if (key) {
        positions.set(key, row.getBoundingClientRect().top);
      }
    }
    return positions;
  }

  private rankRows(): HTMLElement[] {
    const list = this.rankList()?.nativeElement;
    return list ? (Array.from(list.children) as HTMLElement[]) : [];
  }

  /**
   * Start each moved row at its old position and let it travel to the new one.
   *
   * Uses the Web Animations API rather than a transition on an inline transform: the element
   * already carries a `transform` transition for the drag states, and driving both from the
   * same property is how the two gestures would start fighting. `animate()` runs on its own
   * timeline, touches no inline style, and needs no cleanup.
   */
  private playRankMotion(before: ReadonlyMap<string, number>, landedAt: number): void {
    if (!prefersReducedMotion()) {
      const deltas = flipDeltas(before, this.rankPositions());
      for (const row of this.rankRows()) {
        const offset = deltas.get(row.dataset['rankKey'] ?? '');
        if (offset !== undefined) {
          row.animate(
            [{ transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' }],
            { duration: RANK_TRAVEL_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
          );
        }
      }
    }
    this.clearMovedRankAfterPause();
    this.keepFocusOnMovedRow(landedAt);
  }

  /**
   * Hold focus on the row the respondent is moving.
   *
   * Angular moves the existing DOM node, so focus normally travels with it — except at the ends
   * of the list, where the button just pressed becomes `disabled` and the browser drops focus to
   * the body. A respondent pressing Up repeatedly would lose the keyboard at exactly the moment
   * they arrived at the top, which is the most likely thing for them to be doing.
   */
  private keepFocusOnMovedRow(landedAt: number): void {
    const row = this.rankRows()[landedAt];
    const active = typeof document === 'undefined' ? null : document.activeElement;
    if (!row || (active && active !== document.body)) {
      return;
    }
    const usable = Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => !b.disabled,
    );
    usable?.focus();
  }

  /** Drop the "you moved this" mark once it has been seen. Replaces any pending clear. */
  private clearMovedRankAfterPause(): void {
    clearTimeout(this.movedRankTimer);
    this.movedRankTimer = setTimeout(() => this.movedRankId.set(null), MOVED_MARK_MS);
    this.destroyRef.onDestroy(() => clearTimeout(this.movedRankTimer));
  }

  private announceRank(
    option: PublishedFormQuestionOption | undefined,
    index: number,
    total: number,
  ): void {
    if (option) {
      this.rankLiveMessage.set(rankAnnouncement(option.label, index, total));
    }
  }

  // --- Matrix --------------------------------------------------------------
  //
  // Rows and columns share the option list, discriminated by `matrixAxis`. An option with no
  // axis is a Row, which is what makes a Matrix authored before the axis existed — or by an
  // importer that does not set it — degrade to a plain list of rows rather than to nothing.

  protected readonly matrixRows = computed(() =>
    this.question().options.filter((o) => (o.matrixAxis ?? 'Row') === 'Row'),
  );
  protected readonly matrixColumns = computed(() =>
    this.question().options.filter((o) => o.matrixAxis === 'Column'),
  );

  private readonly matrixValue = computed<Record<string, string>>(() => {
    const v = this.value();
    if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [row, picked] of Object.entries(v)) {
      if (typeof picked === 'string') {
        out[row] = picked;
      } else if (Array.isArray(picked) && typeof picked[0] === 'string') {
        // Tolerate the multi-select spelling: a form switched from multi to single after
        // collecting answers must still show what those respondents chose.
        out[row] = picked[0];
      }
    }
    return out;
  });

  protected isMatrixSelected(row: string, column: string): boolean {
    return this.matrixValue()[row] === column;
  }

  /** Select (or clear) one row's column. */
  protected onMatrix(row: string, column: string): void {
    const next: Record<string, string> = { ...this.matrixValue() };
    if (next[row] === column) {
      delete next[row];
    } else {
      next[row] = column;
    }
    this.valueChange.emit(Object.keys(next).length > 0 ? next : null);
  }

  // --- Doodle --------------------------------------------------------------

  /**
   * A drawing takes the ordinary file-answer path from here.
   *
   * Stored against the question the capture NAMES, not against `this.question()`. The export
   * finishes after the gesture, and this handler is routed by the view — in OneQuestion mode one
   * pad serves consecutive Doodle questions, so reading the current question here filed the
   * first one's drawing as the second one's answer.
   */
  protected async onDoodleDrawn(capture: DoodleCapture): Promise<void> {
    await this.uploadFile(capture.file, capture.subject);
  }

  protected onDoodleCleared(): void {
    // `clear` also retires the running upload. Without that, a respondent who draws, dislikes it
    // and taps Clear gets the discarded drawing back a moment later: the in-flight upload
    // resolves and emits its fileId over the null, leaving a stored drawing beside an empty pad
    // that reads "Draw here."
    this.uploads.clear(this.question().id);
    this.valueChange.emit(null);
  }

  /**
   * The pen this doodle question draws with, validated on the way out of the open settings blob.
   *
   * Parsed HERE rather than inside the pad so the pad receives a value it can always render:
   * `Settings` is reachable by paste and by API, and `doodlePen` falls back key by key, so an
   * unknown colour or a nonsense width becomes the default before it can reach a canvas.
   */
  protected readonly doodlePen = computed(() => doodlePen(this.question().settings));

  /** Read a string setting off the question, or '' when unset or the wrong type. */
  private settingText(key: string): string {
    const raw = this.question().settings?.[key];
    return typeof raw === 'string' ? raw : '';
  }

  protected onText(raw: string): void {
    this.valueChange.emit(raw === '' ? null : raw);
  }

  protected onNumber(raw: string): void {
    if (raw.trim() === '') {
      this.valueChange.emit(null);
      return;
    }
    const n = Number(raw);
    this.valueChange.emit(Number.isFinite(n) ? n : raw);
  }

  protected onSingleChoice(value: string): void {
    this.valueChange.emit(value);
  }

  protected onMultiToggle(value: string): void {
    const current = new Set(this.selectedValues());
    if (current.has(value)) {
      current.delete(value);
    } else {
      current.add(value);
    }
    const next = [...current];
    this.valueChange.emit(next.length ? next : null);
  }

  protected isSelected(value: string): boolean {
    return this.selectedValues().includes(value);
  }

  protected onRating(score: number): void {
    this.valueChange.emit(this.numericValue() === score ? null : score);
  }

  protected onYesNo(value: boolean): void {
    this.valueChange.emit(this.booleanValue() === value ? null : value);
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0] ?? null;
    if (!file) {
      // Cleared the picker — the store drops the upload state AND the answer together.
      this.uploads.clear(this.question().id);
      return;
    }
    // A picker's `change` fires with the view as rendered, so the current question IS the one
    // the respondent chose the file for. Only the pad's export outlives its gesture.
    await this.uploadFile(file, this.question().id);
  }

  /** Re-run the upload for the previously-selected file after a failure. */
  protected async retryUpload(): Promise<void> {
    const last = this.localFile();
    if (last) {
      await this.uploadFile(last, this.question().id);
    }
  }

  /**
   * Upload one file to the anonymous `/forms/upload` endpoint.
   *
   * The result does NOT travel back through `valueChange`, and that is the whole point. An output
   * is routed by the view: `(valueChange)="onValueChange(q, $event)"` writes to whichever question
   * the template is bound to at the moment it fires, which after an `await` is no longer reliably
   * the question the upload was for. The store commits the answer under the token's own question
   * id instead — see `succeed` for the two ways that went wrong.
   */
  private async uploadFile(file: File, questionId: string): Promise<void> {
    const token = this.uploads.begin(questionId, file);
    try {
      const result = await this.uploader.upload(
        file,
        this.distributionSlug(),
        questionId,
        (fraction) => this.uploads.setProgress(token, fraction),
        this.responseId() || undefined,
      );
      this.uploads.succeed(token, result.fileId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      this.uploads.fail(token, message);
    }
  }
}
