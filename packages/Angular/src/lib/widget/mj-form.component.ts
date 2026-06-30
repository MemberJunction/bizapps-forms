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
export class MjFormComponent implements OnInit {
  /** Distribution slug identifying which published form to load (element attribute). */
  public readonly distributionSlug = input<string>('', { alias: 'slug' });

  private readonly api = inject(FORMS_API_SERVICE);
  private readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly startedAt = new Date().toISOString();

  protected readonly phase = signal<WidgetPhase>('loading');
  protected readonly errorText = signal<string>('');
  protected readonly definition = signal<PublishedFormDefinition | null>(null);
  protected readonly runtime = signal<FormRuntime | null>(null);
  protected readonly result = signal<FormSubmissionResult | null>(null);

  public async ngOnInit(): Promise<void> {
    await this.load();
  }

  /** Fetch the published form, theme the host, and build the runtime. */
  private async load(): Promise<void> {
    this.phase.set('loading');
    try {
      const def = await this.api.loadPublishedForm(this.distributionSlug());
      if (!def) {
        this.fail('This form is not available.');
        return;
      }
      applyStyleTokens(this.hostRef.nativeElement, def.styleTokens);
      this.definition.set(def);
      this.runtime.set(new FormRuntime(def));
      this.phase.set('ready');
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'Failed to load the form.');
    }
  }

  protected isScroll(): boolean {
    return this.definition()?.renderMode !== 'OneQuestion';
  }

  protected async onSubmit(): Promise<void> {
    const def = this.definition();
    const rt = this.runtime();
    if (!def || !rt) {
      return;
    }
    this.phase.set('submitting');
    const input: FormSubmissionInput = {
      distributionSlug: this.distributionSlug(),
      formVersionId: def.formVersionId,
      partial: false,
      startedAt: this.startedAt,
      clientMeta: {
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
      answers: rt.buildAnswerInputs(),
    };
    try {
      const res = await this.api.submitResponse(input);
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
