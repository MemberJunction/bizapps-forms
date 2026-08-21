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
  OnChanges,
  OnDestroy,
  OnInit,
  signal,
  SimpleChanges,
  viewChild,
} from '@angular/core';
import {
  endingMessage,
  endingRedirectUrl,
  resolveEndingScreen,
  type FormSubmissionInput,
  type FormSubmissionResult,
  type FormStyleTokens,
  type PublishedFormDefinition,
  type PublishedFormScreen,
} from '@mj-biz-apps/forms-entities';

import { FORMS_API_SERVICE } from './api/forms-api.interface';
import { FORMS_API_CONFIG } from './api/forms-api.config';
import { submitWaitMessage } from './core/submit-progress';
import { applyStyleTokens } from './core/theming';
import { FormRuntime } from './core/form-runtime';
import { AutosaveController, type AutosaveStatus } from './core/autosave-controller';
import { generateClientResponseId } from './core/client-id';
import { passedSubmitPoints } from './core/partial-submit-point';
import { initialPhaseFor, outcomeForResult, shouldIgnoreSubmit } from './core/submit-phase';
import { resolveShownScreen, shownScreenFor, type ShownScreen } from './core/shown-screen';
import {
  canRenderChallenge,
  canSubmit,
  captchaRequired,
  isConfigGap,
  isTurnstileError,
} from './core/turnstile-gate';
import { FormScreenComponent } from './components/form-screen.component';
import { FormScrollComponent } from './components/form-scroll.component';
import { FormOneQuestionComponent } from './components/form-one-question.component';
import { TurnstileChallengeComponent } from './components/turnstile-challenge.component';
import type { WidgetPhase } from './core/submit-phase';
import { shouldReloadOnDefinitionChange } from './definition-change';
import { MjfIconComponent } from './components/mjf-icon.component';

@Component({
  selector: 'mj-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormScreenComponent,
    FormScrollComponent,
    FormOneQuestionComponent,
    TurnstileChallengeComponent,
    MjfIconComponent,
  ],
  templateUrl: './mj-form.component.html',
  styleUrls: ['./mj-form.component.css'],
})
export class MjFormComponent implements OnInit, OnChanges, OnDestroy {
  /** Distribution slug identifying which published form to load (element attribute). */
  public readonly distributionSlug = input<string>('', { alias: 'slug' });

  /**
   * THE CURRENT definition to render directly, bypassing the API fetch. Used by the builder's
   * WYSIWYG Preview to render the unpublished draft (fillable, themed) with no publish/DB
   * round-trip. When set, {@link load} skips `loadPublishedForm`.
   *
   * "Current", not "initial", and that is a recent correction. This was read exactly once, in
   * `ngOnInit`, so a host that re-derived the definition — which the Design tab does on every
   * structural edit — kept showing the form as it was when the stage was first created. The
   * Preview modal never noticed because `@if` destroys and recreates it per open; the Design tab's
   * stage lives as long as the tab does. See {@link ngOnChanges}.
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

  /**
   * The ending screen this response resolved to, set once at submit time.
   *
   * Captured rather than recomputed on every render, because it is resolved from the answers
   * AS SUBMITTED. Recomputing would re-read a runtime the respondent can no longer edit but
   * which a stray autosave or a re-render could still perturb, and a thank-you page that
   * changes after it is shown is a genuinely disorienting thing to ship.
   */
  private readonly endingScreen = signal<PublishedFormScreen | undefined>(undefined);

  /** The welcome screen, when the form has one. */
  protected readonly welcomeScreen = computed(() => this.definition()?.welcomeScreen);

  /**
   * Set once the logo's URL fails to load, so a dead link leaves NOTHING rather than a broken
   * image icon. An author who deletes the asset should get a form that looks un-branded, not
   * one that looks broken — and they cannot see the difference from a respondent's browser.
   */
  private readonly logoBroken = signal(false);

  /**
   * A design host's live, unsaved style. Null for a real respondent, always.
   *
   * The builder previews colour by writing custom properties onto this element, which works
   * because colour IS a custom property. A logo is not — it is an <img> the widget renders from
   * its definition, and the definition is read once at load — so an author could pick a logo,
   * watch every colour update live beside it, and see no logo at all until they left the tab and
   * came back. This is the channel for the part of a style that is content rather than CSS.
   */
  private readonly styleOverride = signal<FormStyleTokens | null>(null);

  /** The form's logo, or undefined when there is none (or the one there is will not load). */
  protected readonly logoUrl = computed(() => {
    if (this.logoBroken()) {
      return undefined;
    }
    const tokens = this.styleOverride() ?? this.definition()?.styleTokens;
    return tokens?.logoURL?.trim() || undefined;
  });

  protected onLogoError(): void {
    this.logoBroken.set(true);
  }

  /**
   * Re-style this form from a design host's working values.
   *
   * A command, like {@link showScreen}, and for the same reason: the host owns a draft that
   * changes on every keystroke, and an input holding it would be one more thing to keep in step.
   * It replaces the host reaching into this element and calling the widget's own theming
   * function on it from outside — the widget applies its own style, which is the only way the
   * non-CSS parts of one (the logo) can be applied at all.
   */
  public applyPreviewStyle(tokens: FormStyleTokens): void {
    this.logoBroken.set(false);
    this.styleOverride.set(tokens);
    applyStyleTokens(this.hostRef.nativeElement, tokens);
  }

  /**
   * How long the in-flight submit has been running, in ms. Zero when nothing is submitting.
   *
   * Ticked rather than derived because the message has to change while nothing else does —
   * the whole point is that the respondent sees the page acknowledge a wait it cannot
   * shorten. The interval is cleared on every exit path, including failure.
   */
  private readonly submitElapsed = signal(0);
  private submitTicker: ReturnType<typeof setInterval> | null = null;

  /** The reassurance shown under the spinner, escalating if the wait drags on. */
  protected readonly waitMessage = computed(() => submitWaitMessage(this.submitElapsed()));

  /** The resolved ending screen for the template. */
  protected readonly activeEndingScreen = computed(() => this.endingScreen());

  /**
   * The surface currently on display, for a host that reflects it in its own chrome.
   *
   * Read-only and derived, so it reports where the widget ACTUALLY is — including after the
   * respondent pressed Start or a submit landed — rather than wherever a host last pointed it.
   * The builder's preview strip highlights from this, which is why it needs no state of its own
   * and cannot drift out of step with the form.
   */
  public readonly shownScreen = computed<ShownScreen | null>(() =>
    shownScreenFor(this.phase(), this.endingScreen()),
  );

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
   * The response id uploads are tagged with.
   *
   * Exposed as a method rather than the field so the template reads the CURRENT id — it is
   * regenerated when the form resets, and an upload tagged with a stale id would fail its
   * provenance check on the next submission.
   */
  protected currentResponseId(): string {
    return this.clientResponseId;
  }

  /**
   * Server-echoed response id, if returned. Kept only as a fallback/consistency signal —
   * {@link clientResponseId} is authoritative, so submits never block on the server echo.
   */
  private responseId: string | undefined;
  private autosave: AutosaveController | null = null;
  /** Submit-point pages already banked this fill, so each fires once. Reset on {@link load}. */
  private bankedSubmitPoints = new Set<string>();

  public async ngOnInit(): Promise<void> {
    await this.load();
  }

  /**
   * Re-render when the host hands us a different definition.
   *
   * Signal inputs still report through `ngOnChanges`, and using it rather than an `effect` is
   * what makes the ordering legible: `ngOnChanges` fires BEFORE the first `ngOnInit`, so skipping
   * `firstChange` leaves exactly one load per definition instead of the double-load an effect
   * would produce by firing after init with the value init just used.
   *
   * A full {@link load} is the right response, not a partial patch: a new definition is a
   * structurally different form, so its runtime, phase and response identity all have to be
   * rebuilt. Trial answers in the builder's preview are discarded with it, which is correct — they
   * were answers to different questions. A real respondent never reaches this: they are driven by
   * `slug`, and `definition` stays null for the component's whole life.
   *
   * `SimpleChanges` is keyed by the PROPERTY name, not the `definition` alias the host writes.
   */
  public async ngOnChanges(changes: SimpleChanges): Promise<void> {
    // The decision itself lives in `definition-change.ts`, where it can be tested without a DOM.
    // It used to live here, and the only test that could reach it was a regex over this file —
    // which passed just as happily with the guard inverted.
    if (!shouldReloadOnDefinitionChange(changes)) {
      return;
    }
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
      this.endingScreen.set(undefined);
      this.logoBroken.set(false);
      this.bankedSubmitPoints = new Set<string>();
      this.phase.set(initialPhaseFor(def));
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'Failed to load the form.');
    }
  }

  /**
   * Jump straight to a screen, without traversing the form to reach it.
   *
   * A COMMAND rather than an input, deliberately. As an input it would carry the host's last
   * request as state, and the two would desynchronise the moment the widget moved on its own:
   * a respondent pressing Start leaves the request saying `welcome`, so asking for `welcome`
   * again would set the input to a value it already held, change nothing, and look broken.
   * Having nothing to keep in step is the only reliable way to keep it in step — the host
   * commands through here and reads {@link shownScreen} back.
   *
   * This exists for the builder's preview, where an author styles all of these surfaces and a
   * CONDITIONAL ending is otherwise unreachable without answering the way its rule demands.
   * It sets phase directly and never submits, so no response is written and no automation runs.
   *
   * Answers survive the jump: the runtime is untouched, so an author can look at their ending
   * screen and come back to a half-filled form. An unsatisfiable request (a welcome screen the
   * form has not got) is refused rather than honoured into a blank preview, and a request
   * arriving mid-submit is ignored — the in-flight result would overwrite it a moment later.
   */
  public showScreen(selection: ShownScreen): void {
    const def = this.definition();
    if (!def || this.phase() === 'submitting') {
      return;
    }
    const target = resolveShownScreen(def, selection);
    if (!target) {
      return;
    }
    this.endingScreen.set(target.ending);
    this.phase.set(target.phase);
  }

  /**
   * Leave the welcome screen and begin intake.
   *
   * Guarded on the phase so a double-tap on the start button cannot pull an already-submitting
   * form back to `ready` — the same re-entrancy the submit guard exists for, on the other end
   * of the lifecycle.
   */
  protected startIntake(): void {
    if (this.phase() === 'welcome') {
      this.phase.set('ready');
    }
  }

  protected isScroll(): boolean {
    return this.definition()?.renderMode !== 'OneQuestion';
  }

  /** Progress checkpoint from a child render mode → schedule a debounced partial save. */
  protected onProgress(): void {
    this.autosave?.ping();
    void this.bankPassedSubmitPoints();
  }

  /**
   * Bank a partial the moment the respondent moves past a page the author marked as a submit
   * point, instead of waiting for the debounce.
   *
   * Each page fires at most once — `bankedSubmitPoints` is what makes this a checkpoint rather
   * than a second, undebounced autosave that writes on every keystroke after the point is
   * crossed.
   */
  private async bankPassedSubmitPoints(): Promise<void> {
    const def = this.definition();
    const rt = this.runtime();
    if (!def || !rt || this.phase() !== 'ready') {
      return;
    }
    const passed = passedSubmitPoints(def.pages, rt.answeredQuestionIds());
    const fresh = passed.filter((pageId) => !this.bankedSubmitPoints.has(pageId));
    if (fresh.length === 0) {
      return;
    }
    for (const pageId of fresh) {
      this.bankedSubmitPoints.add(pageId);
    }
    // `flushNow()` rather than `settle()`: settle CANCELS the pending debounce without firing it,
    // so banking a checkpoint with it discarded the very answers the checkpoint promised to keep —
    // and left the page marked banked, so nothing retried. flushNow writes now and awaits the
    // write, still never overlapping two requests on the same clientResponseId.
    await this.autosave?.flushNow();
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
    const startedAt = Date.now();
    this.startSubmitTicker();
    try {
      const res = await this.api.submitResponse(input, this.responseTarget());
      this.logSubmitTiming(startedAt, true);
      this.applySubmitResult(res);
    } catch (err) {
      this.logSubmitTiming(startedAt, false);
      this.result.set(null);
      this.phase.set('ready');
      const message = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      this.errorText.set(message);
      this.handlePossibleTurnstileFailure(message);
    } finally {
      this.stopSubmitTicker();
    }
  }

  /**
   * Drive the escalating wait message.
   *
   * A plain interval rather than anything cleverer because the only requirement is that the
   * text changes while the page is otherwise frozen; the cost is one timer for the length of
   * one request, cleared in a `finally` so a thrown submit cannot leave it running.
   */
  private startSubmitTicker(): void {
    this.submitElapsed.set(0);
    const startedAt = Date.now();
    this.stopSubmitTicker();
    this.submitTicker = setInterval(() => this.submitElapsed.set(Date.now() - startedAt), 250);
  }

  private stopSubmitTicker(): void {
    if (this.submitTicker !== null) {
      clearInterval(this.submitTicker);
      this.submitTicker = null;
    }
    this.submitElapsed.set(0);
  }

  /**
   * Report where a submit spent its time, in the respondent's own console.
   *
   * Round-trip measured from the client, because that is the number the respondent actually
   * experiences — a server that finishes in 40ms is still a four-second submit if the request
   * spent the rest of it in flight, and only the client can see the difference. The server
   * logs its own per-stage breakdown under the same heading, so the two read together.
   */
  private logSubmitTiming(startedAt: number, ok: boolean): void {
    const ms = Date.now() - startedAt;
    // eslint-disable-next-line no-console -- diagnostic output is the entire purpose here
    console.info(
      `[mj-form] submit ${ok ? 'completed' : 'failed'} in ${ms}ms (client round trip; see the API log for the server-side stage breakdown)`,
    );
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
    this.resolveEnding();
    // Success always reaches 'done' (both render modes). Redirect ONLY when a URL is set, and
    // only after 'done' — so a blocked/slow navigation still shows the confirmation.
    const url = this.endingRedirect(res);
    if (url) {
      this.redirect(url);
    }
  }

  /** Pick the ending screen for the answers as submitted. */
  private resolveEnding(): void {
    const def = this.definition();
    const rt = this.runtime();
    if (!def || !rt) {
      return;
    }
    this.endingScreen.set(resolveEndingScreen(def.endScreens ?? [], rt.currentAnswers()));
  }

  /**
   * Where to send the respondent, or `undefined` to show a screen.
   *
   * The SERVER's echoed `redirectUrl` still wins: it is the only party that knows about a
   * redirect the snapshot does not carry, and `outcomeForResult` already gates it on success.
   * Below that, the resolved ending's own URL beats the form-wide one — which is what lets an
   * author send qualified respondents to a booking page and everyone else to a thank-you.
   */
  private endingRedirect(res: FormSubmissionResult): string | undefined {
    if (outcomeForResult(res).redirect && res.redirectUrl) {
      return res.redirectUrl;
    }
    return endingRedirectUrl(this.endingScreen(), this.definition()?.settings ?? {});
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

  /**
   * The confirmation message for a form with no ending screen.
   *
   * The server's echoed message wins over the form's own setting, because a server that
   * overrode it (a quota message, say) knows something the snapshot does not.
   */
  protected confirmationMessage(): string {
    const echoed = this.result()?.confirmationMessage;
    if (echoed) {
      return echoed;
    }
    return endingMessage(undefined, this.definition()?.settings ?? {});
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
