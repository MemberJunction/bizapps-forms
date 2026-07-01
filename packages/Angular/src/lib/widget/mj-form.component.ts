/**
 * Root of the `<mj-form>` custom element. Loads the published form via the S1 API,
 * builds the shared {@link FormRuntime}, themes the host from the form's style tokens,
 * picks the render mode, and handles submit / partial-save.
 *
 * It is a normal standalone Angular component; {@link registerMjFormElement} wraps it
 * as a browser custom element. No Explorer shell, no MJ global provider — everything
 * it needs arrives via DI (the API service) and `@Input` (the distribution slug).
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import type {
  FormSubmissionInput,
  FormSubmissionResult,
  PublishedFormDefinition,
} from '@mj-biz-apps/forms-entities';

import { FORMS_API_SERVICE } from './api/forms-api.interface';
import { applyStyleTokens } from './core/theming';
import { FormRuntime } from './core/form-runtime';
import { AutosaveController, type AutosaveStatus } from './core/autosave-controller';
import { FormScrollComponent } from './components/form-scroll.component';
import { FormOneQuestionComponent } from './components/form-one-question.component';

/** Lifecycle phase of the widget. */
type WidgetPhase = 'loading' | 'ready' | 'submitting' | 'done' | 'error';

@Component({
  selector: 'mj-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormScrollComponent, FormOneQuestionComponent],
  templateUrl: './mj-form.component.html',
  styleUrls: ['./mj-form.component.css'],
})
export class MjFormComponent implements OnInit, OnDestroy {
  /** Distribution slug identifying which published form to load (element attribute). */
  public readonly distributionSlug = input<string>('', { alias: 'slug' });

  /**
   * Pre-built definition to render directly, bypassing the API fetch. Used by the
   * builder's WYSIWYG Preview to render the unpublished draft (fillable, themed) with no
   * publish/DB round-trip. When set, {@link load} skips `loadPublishedForm`.
   */
  public readonly definitionInput = input<PublishedFormDefinition | null>(null, { alias: 'definition' });

  private readonly api = inject(FORMS_API_SERVICE);
  private readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly startedAt = new Date().toISOString();

  protected readonly phase = signal<WidgetPhase>('loading');
  protected readonly errorText = signal<string>('');
  protected readonly definition = signal<PublishedFormDefinition | null>(null);
  protected readonly runtime = signal<FormRuntime | null>(null);
  protected readonly result = signal<FormSubmissionResult | null>(null);

  /** Subtle, non-blocking autosave indicator. */
  protected readonly autosaveStatus = signal<AutosaveStatus>('idle');

  /** Server response id for the in-progress partial; reused so autosaves UPSERT. */
  private responseId: string | undefined;
  private autosave: AutosaveController | null = null;

  public async ngOnInit(): Promise<void> {
    await this.load();
  }

  public ngOnDestroy(): void {
    this.autosave?.dispose();
  }

  /** Fetch (or accept) the form definition, theme the host, and build the runtime. */
  private async load(): Promise<void> {
    this.phase.set('loading');
    try {
      const def = this.definitionInput() ?? (await this.api.loadPublishedForm(this.distributionSlug()));
      if (!def) {
        this.fail('This form is not available.');
        return;
      }
      applyStyleTokens(this.hostRef.nativeElement, def.styleTokens);
      this.definition.set(def);
      this.runtime.set(new FormRuntime(def));
      this.autosave?.dispose();
      this.autosave = new AutosaveController(
        () => this.savePartial(),
        (status) => this.autosaveStatus.set(status),
      );
      this.phase.set('ready');
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'Failed to load the form.');
    }
  }

  protected isScroll(): boolean {
    return this.definition()?.renderMode !== 'OneQuestion';
  }

  /** Progress checkpoint from a child render mode → schedule a debounced partial save. */
  protected onProgress(): void {
    this.autosave?.ping();
  }

  protected async onSubmit(): Promise<void> {
    const def = this.definition();
    const rt = this.runtime();
    if (!def || !rt) {
      return;
    }
    // Final submit persists everything — no need for a trailing partial autosave.
    this.autosave?.cancel();
    this.phase.set('submitting');
    const input = this.buildSubmission(def, rt, false);
    try {
      const res = await this.api.submitResponse(input, this.responseId);
      this.result.set(res);
      this.phase.set(res.success ? 'done' : 'ready');
      if (!res.success && res.errors?.length) {
        this.errorText.set(res.errors.map((e) => e.message).join(' '));
      } else if (res.success && res.redirectUrl) {
        this.redirect(res.redirectUrl);
      }
    } catch (err) {
      this.result.set(null);
      this.phase.set('ready');
      this.errorText.set(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    }
  }

  /**
   * Save the current answers as a Partial response (server upserts, runs no hooks/quota).
   * Reuses the returned {@link responseId} so subsequent autosaves update the same record.
   * Throws on failure so the {@link AutosaveController} can mark the status — it swallows
   * the error, keeping autosave strictly non-blocking for the respondent.
   */
  private async savePartial(): Promise<string | undefined> {
    const def = this.definition();
    const rt = this.runtime();
    if (!def || !rt) {
      return undefined;
    }
    const res = await this.api.submitResponse(
      this.buildSubmission(def, rt, true),
      this.responseId,
    );
    if (res.success && res.responseId) {
      this.responseId = res.responseId;
    }
    return this.responseId;
  }

  /** Build a submission payload for either a partial autosave or the final submit. */
  private buildSubmission(
    def: PublishedFormDefinition,
    rt: FormRuntime,
    partial: boolean,
  ): FormSubmissionInput {
    return {
      distributionSlug: this.distributionSlug(),
      formVersionId: def.formVersionId,
      partial,
      startedAt: this.startedAt,
      clientMeta: {
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
      answers: rt.buildAnswerInputs(),
    };
  }

  protected confirmationMessage(): string {
    return (
      this.result()?.confirmationMessage ??
      this.definition()?.settings.confirmationMessage ??
      'Thank you — your response has been recorded.'
    );
  }

  protected retry(): void {
    void this.load();
  }

  private fail(message: string): void {
    this.errorText.set(message);
    this.phase.set('error');
  }

  private redirect(url: string): void {
    if (typeof window !== 'undefined') {
      window.location.assign(url);
    }
  }
}
