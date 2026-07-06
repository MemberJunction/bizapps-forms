/**
 * Renders a Cloudflare Turnstile challenge (DG-4) inside the respondent widget and
 * emits its lifecycle: `(solved)` with the single-use token, `(expired)` when a solved
 * token times out (~300s), and `(errored)` when the widget itself fails to load/render.
 *
 * The parent (`MjFormComponent`) only mounts this component when the form requires
 * captcha AND a site key is configured — so this component assumes a valid site key.
 * It loads the Cloudflare script once per document (shared across widget instances),
 * renders in explicit mode against the injected site key, and exposes `reset()` so the
 * parent can re-arm the challenge after an expiry or a failed submit (tokens are
 * single-use).
 *
 * Framework-free by design: no Explorer shell, no MJ globals. The external script load
 * is intentional — the widget is a real embeddable app, not a sandboxed artifact.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

import { FORMS_API_CONFIG } from '../api/forms-api.config';
import {
  ensureTurnstileScript,
  getTurnstile,
  type TurnstileRenderOptions,
} from '../core/turnstile-loader';

@Component({
  selector: 'mjf-turnstile-challenge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="mjf-turnstile" aria-label="Security challenge"></div>`,
  styleUrl: './turnstile-challenge.component.css',
})
export class TurnstileChallengeComponent implements AfterViewInit, OnDestroy {
  /** Public Cloudflare site key (global, not per-form). Required for a real render. */
  public readonly siteKey = input.required<string>();

  /** Emits the single-use token when the challenge is solved. */
  public readonly solved = output<string>();
  /** Emits when a previously-solved token expires and must be re-solved. */
  public readonly expired = output<void>();
  /** Emits when the challenge fails to load or render (script blocked, bad key, etc.). */
  public readonly errored = output<void>();

  private readonly hostEl = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly config = inject(FORMS_API_CONFIG);
  private readonly zone = inject(NgZone);

  /** Handle returned by `turnstile.render`, used to reset/remove the widget. */
  private widgetId: string | undefined;
  private disposed = false;
  /** Guards against a second mount while the script load is still in flight. */
  private mounting = false;

  public ngAfterViewInit(): void {
    void this.mount();
  }

  public ngOnDestroy(): void {
    this.disposed = true;
    this.remove();
  }

  /** Load the script (once) then render the challenge into the host element. */
  private async mount(): Promise<void> {
    if (this.mounting || this.widgetId !== undefined) {
      return;
    }
    this.mounting = true;
    try {
      await ensureTurnstileScript(this.config.turnstileScriptUrl);
    } catch {
      this.mounting = false;
      this.emitErrored();
      return;
    }
    this.mounting = false;
    if (this.disposed || this.widgetId !== undefined) {
      return;
    }
    this.render();
  }

  /** Render the Turnstile widget in explicit mode and wire its callbacks. */
  private render(): void {
    const turnstile = getTurnstile();
    const host = this.hostEl().nativeElement;
    if (!turnstile || !host) {
      this.emitErrored();
      return;
    }
    const options: TurnstileRenderOptions = {
      sitekey: this.siteKey(),
      callback: (token: string) => this.zone.run(() => this.solved.emit(token)),
      'expired-callback': () => this.zone.run(() => this.expired.emit()),
      'error-callback': () => this.zone.run(() => this.emitErrored()),
    };
    try {
      this.widgetId = turnstile.render(host, options);
    } catch {
      this.emitErrored();
    }
  }

  /**
   * Re-arm the challenge for a fresh token — called by the parent after a token expires
   * or a submit fails on the server's Turnstile check (tokens are single-use).
   */
  public reset(): void {
    const turnstile = getTurnstile();
    if (turnstile && this.widgetId !== undefined) {
      turnstile.reset(this.widgetId);
    }
  }

  /** Remove the rendered widget (on destroy) to free the Cloudflare instance. */
  private remove(): void {
    const turnstile = getTurnstile();
    if (turnstile && this.widgetId !== undefined) {
      turnstile.remove(this.widgetId);
    }
    this.widgetId = undefined;
  }

  private emitErrored(): void {
    if (!this.disposed) {
      this.errored.emit();
    }
  }
}
