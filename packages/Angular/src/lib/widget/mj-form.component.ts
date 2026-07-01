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
  computed,
  ElementRef,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import type {
  FormSubmissionInput,
  FormSubmissionResult,
  PublishedFormDefinition,
} from '@mj-biz-apps/forms-entities';

import { FORMS_API_SERVICE } from './api/forms-api.interface';
import { FORMS_API_CONFIG } from './api/forms-api.config';
import { applyStyleTokens } from './core/theming';
import { FormRuntime } from './core/form-runtime';
import { AutosaveController, type AutosaveStatus } from './core/autosave-controller';
import { generateClientResponseId } from './core/client-id';
import { outcomeForResult, shouldIgnoreSubmit } from './core/submit-phase';
import {
  canRenderChallenge,
  canSubmit,
  captchaRequired,
  isConfigGap,
  isTurnstileError,
} from './core/turnstile-gate';
import { FormScrollComponent } from './components/form-scroll.component';
import { FormOneQuestionComponent } from './components/form-one-question.component';
import { TurnstileChallengeComponent } from './components/turnstile-challenge.component';
import type { WidgetPhase } from './core/submit-phase';

@Component({
  selector: 'mj-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormScrollComponent, FormOneQuestionComponent, TurnstileChallengeComponent],
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
  private readonly config = inject(FORMS_API_CONFIG);
  private readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly startedAt = new Date().toISOString();

  /** The mounted Turnstile challenge (present only when captcha is required + rendered). */
  private readonly turnstile = viewChild(TurnstileChallengeComponent);

  protected readonly phase = signal<WidgetPhase>('loading');
  protected readonly errorText = signal<string>('');
  protected readonly definition = signal<PublishedFormDefinition | null>(null);
  protected readonly runtime = signal<FormRuntime | null>(null);
  protected readonly result = signal<FormSubmissionResult | null>(null);

  /** Subtle, non-blocking autosave indicator. */
  protected readonly autosaveStatus = signal<AutosaveStatus>('idle');

  /** Public Cloudflare Turnstile site key (global; from widget config). May be undefined. */
  protected readonly siteKey = this.config.turnstileSiteKey;

  /** Non-null site key for the template's `[siteKey]` binding (guarded by `showChallenge`). */
  protected readonly resolvedSiteKey = computed(() => this.siteKey ?? '');

  /** Solved single-use Turnstile token, held until the final submit consumes it. */
  private readonly turnstileToken = signal<string | null>(null);

  /** True when this form requires a captcha challenge before submit. */
  protected readonly needsCaptcha = computed(() => captchaRequired(this.definition()));

  /** Render the challenge only when required AND a site key is configured. */
  protected readonly showChallenge = computed(() =>
    canRenderChallenge(this.definition(), this.siteKey),
  );

  /** Captcha is required but no site key is configured — show the config-gap message. */
  protected readonly captchaConfigGap = computed(() =>
    isConfigGap(this.definition(), this.siteKey),
  );

  /** Whether the final submit is allowed given the current captcha state. */
  protected readonly submitAllowed = computed(() =>
    canSubmit(this.definition(), this.siteKey, this.turnstileToken()),
  );

  /**
   * Stable client-generated response id, minted ONCE per form load. It is the PRIMARY
   * idempotency key: sent as the response target on every partial autosave AND the final
   * submit so they all UPSERT one FormResponse row, independent of debounce/network timing
   * or a blank server session id. The server adopts it as the row's primary key on first
   * save. Regenerated on each {@link load} (a retry starts a fresh response).
   */
  private clientResponseId: string = generateClientResponseId();

  /**
   * Server-echoed response id, if returned. Kept only as a fallback/consistency signal —
   * {@link clientResponseId} is authoritative, so submits never block on the server echo.
   */
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
    // Fresh load == fresh response identity: mint a new client id and drop any stale
    // server echo so a retry never upserts a previously-abandoned row.
    this.clientResponseId = generateClientResponseId();
    this.responseId = undefined;
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
    // Double-submit guard: ignore re-entrant submits while one is in flight or already
    // done. Without this, a double-tap (or an Enter + click) fires two mutations and can
    // leave the UI stuck between phases.
    if (shouldIgnoreSubmit(this.phase())) {
      return;
    }
    // Captcha gate: when required, block final submit until the challenge is solved.
    if (!this.submitAllowed()) {
      this.errorText.set(this.captchaBlockedMessage());
      return;
    }
    // Flip to 'submitting' FIRST: this both drives the button's disabled state (no second
    // concurrent submit) and makes savePartial()'s phase guard reject any autosave dispatched
    // from here on. Then await any autosave ALREADY in flight so we never put two writes on
    // the wire carrying the same clientResponseId (the PK-collision source). settle() cancels
    // the pending debounce too, and is fail-soft.
    this.phase.set('submitting');
    this.errorText.set('');
    await this.autosave?.settle();
    const input = this.buildSubmission(def, rt, false);
    try {
      const res = await this.api.submitResponse(input, this.responseTarget());
      this.applySubmitResult(res);
    } catch (err) {
      this.result.set(null);
      this.phase.set('ready');
      const message = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      this.errorText.set(message);
      this.handlePossibleTurnstileFailure(message);
    }
  }

  /**
   * Fold the server result into the widget phase. On success we reach the 'done'
   * confirmation for BOTH render modes and ONLY redirect when a redirect URL is actually
   * set; on failure we return to 'ready' with a clear message.
   */
  private applySubmitResult(res: FormSubmissionResult): void {
    this.result.set(res);
    if (res.success && res.responseId) {
      this.responseId = res.responseId;
    }
    const outcome = outcomeForResult(res);
    this.phase.set(outcome.phase);
    if (!res.success) {
      const message = (res.errors ?? []).map((e) => e.message).join(' ').trim();
      if (message) {
        this.errorText.set(message);
        this.handlePossibleTurnstileFailure(message);
      }
      return;
    }
    // Success always reaches 'done' (both render modes). Redirect ONLY when a URL is set, and
    // only after 'done' — so a blocked/slow navigation still shows the confirmation.
    if (outcome.redirect && res.redirectUrl) {
      this.redirect(res.redirectUrl);
    }
  }

  /** Called by the challenge when the respondent solves it — holds the single-use token. */
  protected onTurnstileSolved(token: string): void {
    this.turnstileToken.set(token);
  }

  /** Token expired (~300s) — clear it so submit re-gates; the child re-arms itself. */
  protected onTurnstileExpired(): void {
    this.turnstileToken.set(null);
  }

  /** The challenge failed to load/render — surface a clear, actionable message. */
  protected onTurnstileErrored(): void {
    this.turnstileToken.set(null);
    this.errorText.set('The security challenge could not be loaded. Please refresh and try again.');
  }

  /**
   * When a failed submit came from the server's Turnstile check, the single-use token is
   * spent — clear it and reset the challenge so the respondent can solve a fresh one.
   */
  private handlePossibleTurnstileFailure(message: string): void {
    if (this.needsCaptcha() && isTurnstileError(message)) {
      this.turnstileToken.set(null);
      this.turnstile()?.reset();
    }
  }

  private captchaBlockedMessage(): string {
    return this.captchaConfigGap()
      ? 'This form requires a security challenge, but it is not configured. Please contact the form owner.'
      : 'Please complete the security challenge before submitting.';
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
    // Never autosave once the respondent has moved past editing — a partial landing after
    // the final submit would resurrect a Partial row (or, worse, revert the confirmation).
    // The autosave is also cancelled in onSubmit(); this is the belt-and-braces guard for a
    // save that was already dispatched before the cancel.
    if (this.phase() !== 'ready') {
      return this.responseTarget();
    }
    const res = await this.api.submitResponse(
      this.buildSubmission(def, rt, true),
      this.responseTarget(),
    );
    if (res.success && res.responseId) {
      this.responseId = res.responseId;
    }
    return this.responseTarget();
  }

  /**
   * The response id sent to the server as the upsert target. The client-generated id is
   * PRIMARY (stable across the whole fill); the server echo is only a fallback if for some
   * reason the client id were ever unavailable.
   */
  private responseTarget(): string {
    return this.clientResponseId || this.responseId || generateClientResponseId();
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
      // Only the final submit carries a captcha token; partial autosaves run no captcha
      // check server-side (see submit-pipeline), so we never spend the single-use token
      // on an autosave.
      turnstileToken: partial ? undefined : this.turnstileToken() ?? undefined,
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
