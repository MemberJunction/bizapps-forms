/**
 * Root of the `<mj-form>` custom element. Loads the form via the S1 API
 * (`Forms.GetRespondentForm`), builds the shared {@link FormRuntime}, themes the host from the
 * form's style tokens, picks the render mode, and handles submit / partial-save
 * (`Forms.SaveResponse`).
 *
 * WHO ENDS THE FORM (#303). The live widget holds the respondent projection, which carries no
 * scoring, no ending screens and no knockout or score conditions (#302), so it cannot judge a
 * knockout or pick an ending, and never tries: every save's result says whether the form ended
 * (`Outcome`) and on which screen (`Ending`). The builder's Preview hands in the author's FULL
 * draft instead, sends nothing anywhere, and resolves locally through the same contracts function
 * the server uses (`resolveResponseOutcome`) — one code path for both (DW13 / #75). Which of the two
 * this widget is doing is the `kind` of the {@link WidgetForm} it holds, decided once, at load.
 *
 * It is a normal standalone Angular component; {@link registerMjFormElement} wraps it
 * as a browser custom element. No Explorer shell, no MJ global provider — everything
 * it needs arrives via DI (the API service) and `@Input` (the distribution slug).
 */
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import type { FormsSaveResponseInput, FormsSaveResponseOutput } from '@mj-biz-apps/forms-entities';
import {
  CAPTCHA_NOT_CONFIGURED_MESSAGE,
  endingMessage,
  endingRedirectUrl,
  endsWithoutSubmit,
  NOTHING_TO_SUBMIT_MESSAGE,
  resolveDefinitionForRender,
  resolveRespondentDefinitionForRender,
  resolveResponseOutcome,
  resolveStyleTokensForRender,
  SCREENED_OUT_MESSAGE,
  type FormAnswerInput,
  type FormOutcome,
  type FormStyleTokens,
  type PublishedFormDefinition,
  type PublishedFormScreen,
  type ResumeSnapshot,
} from '@mj-biz-apps/forms-entities/contracts';

import {
  FORM_UNAVAILABLE_MESSAGE,
  FORMS_API_SERVICE,
  FormUnavailableError,
  SessionExpiredError,
} from './api/forms-api.interface';
import { toSaveResponseInput, toWireAnswer } from './api/submission-mapping';
import { endingScreenFrom } from './core/server-ending';
import { failureDetail } from './core/failure-detail';
import { fullForm, projectionForm, type WidgetForm, type WidgetRenderDefinition } from './core/widget-form';
import { FORMS_API_CONFIG } from './api/forms-api.config';
import { SAVING_FILE_MESSAGE, submitWaitMessage } from './core/submit-progress';
import { applyStyleTokens } from './core/theming';
import { gateWelcomeScreen } from './core/welcome-gate';
import { prefetchImages } from './core/image-prefetch';
import { PrefetchScheduler } from './core/prefetch-scheduler';
import { CommitLedger } from './core/commit-ledger';
import { FormRuntime } from './core/form-runtime';
import { AutosaveController, NOTHING_TO_SAVE, type AutosaveStatus } from './core/autosave-controller';
import { generateClientResponseId } from './core/client-id';
import { FormUploadStore, type UploadFailure } from './core/upload-store';
import { progressReportingSink } from './core/progress-reporting-sink';
import { nothingToSubmit } from './core/nothing-to-submit';
import { passedSubmitPoints } from './core/partial-submit-point';
import { initialPhaseFor, outcomeForResult, resumedPhaseFor, shouldIgnoreSubmit } from './core/submit-phase';
import { prefillFromResume } from './core/resume-prefill';
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
import { IconComponent } from './components/icon.component';
import { MjLoaderComponent } from './components/mj-loader.component';
import type { WidgetPhase } from './core/submit-phase';
import { judgeRedirect, redirectRefusalMessage } from './core/safe-redirect';
import { SubmitTimer } from './core/submit-timer';

@Component({
  selector: 'mj-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormScreenComponent,
    FormScrollComponent,
    FormOneQuestionComponent,
    TurnstileChallengeComponent,
    IconComponent,
    MjLoaderComponent,
  ],
  templateUrl: './mj-form.component.html',
  styleUrls: ['./mj-form.component.css'],
  // One upload store per widget, NOT a singleton: several forms can be embedded on one host
  // page and must not see each other's uploads. Question components inject it.
  providers: [FormUploadStore],
})
export class MjFormComponent implements OnInit, OnDestroy {
  /** Distribution slug identifying which published form to load (element attribute). */
  public readonly distributionSlug = input<string>('', { alias: 'slug' });

  /**
   * The author's full draft definition to render directly, bypassing the API. Used by the
   * builder's WYSIWYG Preview to render the unpublished draft (fillable, themed) with no
   * publish/DB round-trip. When set, {@link load} skips `loadRespondentForm`, and the widget
   * becomes a `full` form: it resolves endings locally and sends nothing — no autosave, no submit.
   */
  public readonly definitionInput = input<PublishedFormDefinition | null>(null, { alias: 'definition' });

  private readonly api = inject(FORMS_API_SERVICE);
  private readonly config = inject(FORMS_API_CONFIG);
  private readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);
  /** Needed to schedule work for after the next render from outside a construction context. */
  private readonly injector = inject(Injector);
  /** Provided above, so this is the store every question component in THIS widget injects. */
  private readonly uploads = inject(FormUploadStore);
  private readonly startedAt = new Date().toISOString();

  /** The mounted Turnstile challenge (present only when captcha is required + rendered). */
  private readonly turnstile = viewChild(TurnstileChallengeComponent);

  /** The in-form banner element, so a refusal can move the respondent to it rather than only render it. */
  private readonly banner = viewChild<ElementRef<HTMLElement>>('bannerError');

  protected readonly phase = signal<WidgetPhase>('loading');

  /**
   * Welcome and ending phases, where the logo and the screen centre together as one hero rather
   * than the logo sitting in a top bar over a question list.
   */
  protected readonly isHeroPhase = computed(() => this.phase() === 'welcome' || this.phase() === 'done');
  protected readonly errorText = signal<string>('');
  /**
   * The upload failure's sentence last put in the banner by {@link refuseWithUploadFailure}, or ''
   * (#328). A failure's message is not one fixed string the way the #124 sentence is, so "the
   * banner is an upload failure" is recorded here as a fact rather than read off the text.
   */
  private uploadFailureShown = '';
  /** What this widget holds: the live projection, or the author's full draft (see the class header). */
  private readonly form = signal<WidgetForm | null>(null);
  /** What every surface renders, whichever kind of form it is. */
  protected readonly definition = computed<WidgetRenderDefinition | null>(() => this.form()?.render ?? null);
  protected readonly runtime = signal<FormRuntime | null>(null);
  /** The result the confirmation reads: the submit's, a knockout's seal, or a resumed sealed row's. */
  protected readonly result = signal<FormsSaveResponseOutput | null>(null);

  /** Subtle, non-blocking autosave indicator. */
  protected readonly autosaveStatus = signal<AutosaveStatus>('idle');

  /**
   * True once the answers the respondent COMMITTED could not be saved after every automatic retry —
   * so the server has not yet judged them (a knockout among them included). Shown as a notice, not a
   * blocker: the respondent keeps going, the next edit tries again, and the final submit is judged by
   * the server regardless (fix round 1, Minor 4). Cleared by the next save that lands.
   */
  protected readonly saveNotice = signal(false);

  /**
   * True when this widget mounted onto a draft the server handed back (#138).
   *
   * Gates the start-over control, which must NOT appear in an ordinary first sitting: "Not you?
   * Start over" only makes sense to somebody who was shown answers they may not have written.
   */
  protected readonly resumed = signal<boolean>(false);

  /**
   * Question ids whose stored answer could not be put back — the question is gone from this
   * version, or its type changed under the draft.
   *
   * Surfaced rather than swallowed because the failure is otherwise invisible in the worst way: a
   * stored value its control silently rejects leaves the field blank, and a value in the wrong
   * column fails server-side validation on EVERY autosave from then on. Autosave is fail-soft, so
   * the respondent types on and nothing is ever saved again — with nothing on screen saying so.
   */
  protected readonly resumeDropped = signal<readonly string[]>([]);

  /**
   * One line from the page when it could not reopen a draft it thought existed.
   *
   * An INPUT rather than something the widget discovers, because the widget knows nothing about
   * cookies or host routes — the boot script does the reopening and reports the outcome here. Empty
   * for an embed, which never calls those routes at all.
   */
  public readonly resumeNotice = input<string>('', { alias: 'resume-notice' });

  /**
   * The ending screen this response landed on, set once when the form ends.
   *
   * Live: the screen the SERVER chose and returned (`Ending`). Preview: resolved locally from the
   * answers as submitted. Captured rather than recomputed on every render either way: a thank-you
   * page that changes after it is shown is a genuinely disorienting thing to ship.
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

  /** True while a welcome screen waits for its images (core/welcome-gate.ts): the MJ loader shows. */
  protected readonly waitingForWelcomeImage = signal(false);
  /** The logo, held back while the welcome gate waits so it arrives with the welcome screen. */
  protected readonly shownLogoUrl = computed(() => (this.waitingForWelcomeImage() ? undefined : this.logoUrl()));
  /** Bumped by every load(): the welcome gate of an earlier load must not reveal this one. */
  private loadGeneration = 0;

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
    // Same host-independent resolution as `load()` (#270): the builder preview's draft tokens
    // can carry the same asset references a published snapshot does.
    const resolved = resolveStyleTokensForRender(tokens, this.config.graphqlUrl);
    this.logoBroken.set(false);
    this.styleOverride.set(resolved);
    applyStyleTokens(this.hostRef.nativeElement, resolved);
  }

  private readonly submitTimer = new SubmitTimer();

  /** The reassurance shown under the spinner, escalating if the wait drags on. */
  protected readonly waitMessage = computed(() => submitWaitMessage(this.submitTimer.Elapsed()));

  /** The line under the spinner while an upload is still on the wire (#248). */
  protected readonly savingFileMessage = SAVING_FILE_MESSAGE;

  /**
   * What the overlay is covering the form for, or null when it is not shown.
   *
   * `saving-file` comes first and is read off the upload store, not the phase, because two paths
   * wait on an upload: this component's submit (phase `submitting`) and a renderer's Next (phase
   * still `ready`). Both leave the respondent looking at a button that seemingly did nothing until
   * the file lands, and both need the same answer on screen.
   *
   * Only in those two phases, though. A wait can outlive them — a renderer's Next still waiting
   * when an autosave learns the session expired — and the scrim would then sit over the
   * session-expired notice, the one surface that tells the respondent what to do next.
   */
  protected readonly overlay = computed<'saving-file' | 'sending' | null>(() => {
    const phase = this.phase();
    if (this.uploads.waiting() && (phase === 'ready' || phase === 'submitting')) {
      return 'saving-file';
    }
    return phase === 'submitting' ? 'sending' : null;
  });

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

  /**
   * Whether the final submit is allowed: the captcha state permits it AND the session is alive.
   *
   * Fed to the children as `submitDisabled`, which is what makes an expired session withdraw
   * the Submit control and the "You can submit now." line without this component reaching into
   * either renderer. Before the phase was folded in, a form whose every request could only ever
   * be refused went on announcing that it was ready to send.
   */
  protected readonly submitAllowed = computed(
    () => this.phase() !== 'expired' && canSubmit(this.definition(), this.siteKey, this.turnstileToken()),
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
  /** The `online` handler while registered — kept so ngOnDestroy removes the same function. */
  private onlineListener: (() => void) | null = null;
  /** Prefetch of later screens' images; one queue per load (core/prefetch-scheduler.ts). */
  private readonly prefetcher = new PrefetchScheduler(prefetchImages, () => this.destroyed);
  /** Set on destroy: a `load()` still awaiting the network resumes afterwards and must start nothing. */
  private destroyed = false;
  /** Submit-point pages already banked this fill, so each fires once. Reset on {@link load}. */
  private bankedSubmitPoints = new Set<string>();
  /**
   * Latched the moment a knockout starts ending the form, and never cleared: awaiting the bank
   * hands control back to a template that keeps firing progress events at a respondent who is
   * still typing, and each one would otherwise start another knockout. Reset on {@link load},
   * with the rest of the per-fill state.
   */
  private endingEarly = false;
  /**
   * Whether this fill has already announced its first acknowledged partial save.
   *
   * ONCE per fill: `mjf-partial-saved` is what makes the page mint a device invite, and minting one
   * per autosave would leave a row (plus an audit row) every few seconds of typing.
   */
  private partialAnnounced = false;
  /** What the respondent has committed versus what the server has judged. */
  private readonly ledger = new CommitLedger();

  public async ngOnInit(): Promise<void> {
    this.listenForNetwork();
    await this.load();
  }

  /**
   * A save that failed while the network was down is re-sent the moment the browser says it is back,
   * instead of at the next backoff tick or the respondent's next edit. Registered once per widget
   * (not per load) and guarded for non-browser hosts.
   */
  private listenForNetwork(): void {
    if (typeof window === 'undefined' || this.onlineListener) {
      return;
    }
    this.onlineListener = () => this.autosave?.resume();
    window.addEventListener('online', this.onlineListener);
  }

  public ngOnDestroy(): void {
    if (this.onlineListener && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineListener);
    }
    this.onlineListener = null;
    this.autosave?.dispose();
    this.destroyed = true;
    this.prefetcher.Cancel();
    // Stops a retry asleep between attempts from re-sending a file for a widget nobody can see.
    this.uploads.dispose();
  }

  /** Fetch (or accept) the form definition, theme the host, and build the runtime. */
  private async load(): Promise<void> {
    this.prefetcher.Cancel();
    const generation = ++this.loadGeneration;
    this.waitingForWelcomeImage.set(false);
    this.phase.set('loading');
    // Fresh load == fresh response identity: mint a new client id and drop any stale
    // server echo so a retry never upserts a previously-abandoned row.
    this.clientResponseId = generateClientResponseId();
    this.responseId = undefined;
    this.resumed.set(false);
    this.resumeDropped.set([]);
    this.partialAnnounced = false;
    this.ledger.Reset(undefined);
    this.saveNotice.set(false);
    // A failed load's message is for the error page; the form's banner reads the same signal, so a
    // "Try again" that succeeds would otherwise show the old failure above a form that loaded fine.
    this.errorText.set('');
    try {
      const { form, resume } = await this.loadForm();
      // The await is where the widget can move on: destroyed by its host, or reloaded by "Try
      // again". A load resuming after either builds nothing — no runtime, no autosave controller
      // that nothing would dispose, no overwrite of the newer load's form and response identity.
      if (!this.isCurrentLoad(generation)) {
        return;
      }
      const def = form.render;
      applyStyleTokens(this.hostRef.nativeElement, def.styleTokens);
      this.form.set(form);
      const runtime = new FormRuntime(form);
      this.runtime.set(runtime);
      // File answers are committed by the store, not by a view event — see `FormUploadStore.succeed` —
      // so no `valueChange` reaches `onProgress` for them. The sink reports progress at the commit
      // instead, or the draft would miss the file until another field blurred (F4).
      this.uploads.connect(progressReportingSink(runtime, () => this.onProgress()));
      this.autosave?.dispose();
      // Preview never autosaves: the draft it renders is the author's, and nothing about it may be
      // sent to the respondent API. Every autosave entry point no-ops on a null controller.
      this.autosave =
        form.kind === 'projection'
          ? new AutosaveController(
              () => this.savePartial(),
              (status) => this.autosaveStatus.set(status),
              undefined,
              undefined,
              { onRetriesSpent: () => this.noticeUnsavedCommit() },
            )
          : null;
      this.endingScreen.set(undefined);
      this.result.set(null);
      this.logoBroken.set(false);
      this.bankedSubmitPoints = new Set<string>();
      this.endingEarly = false;
      const opening = this.adoptResume(resume, def, runtime) ?? initialPhaseFor(def);
      // After the resume prefill, so a resumed draft's own answers count as already on the server.
      // A second Reset equals setting the loaded answers alone: nothing can commit or acknowledge since the
      // first one. `onCommit` is gated on 'ready', and no autosave save can be in flight, because `load()` runs
      // only from `ngOnInit` and from `retry()` on 'error', which only a failed load reaches.
      this.ledger.Reset(this.draftKeyNow());
      const welcomeImage = opening === 'welcome' ? def.welcomeScreen?.mediaURL?.trim() : undefined;
      const gated = !!welcomeImage;
      // Plan before holding: the plan's URLs must be set before anything can start the queue.
      this.prefetcher.Plan(form, opening, gated);
      if (welcomeImage) {
        this.holdForWelcomeImages(welcomeImage, generation); // phase stays 'loading' until the gate reveals
      } else {
        this.phase.set(opening);
      }
    } catch (err) {
      if (!this.isCurrentLoad(generation)) {
        return;
      }
      // A load can meet an expired session too — the error page's "Try again" re-fetches with
      // the same token, and after eight hours that is a 401 with a retry button that loops.
      if (this.endSessionIfExpired(err)) {
        return;
      }
      if (err instanceof FormUnavailableError) {
        // One sentence for every reason (a prober must not tell a closed link from a foreign one);
        // the reason is for whoever opens the console.
        console.warn(`[mj-form] ${err.reason}`);
        this.fail(FORM_UNAVAILABLE_MESSAGE);
        return;
      }
      this.fail(err instanceof Error ? err.message : 'Failed to load the form.');
    }
  }

  /** Whether the load numbered `generation` is still the one this widget is showing. */
  private isCurrentLoad(generation: number): boolean {
    return !this.destroyed && generation === this.loadGeneration;
  }

  /**
   * The form to render, of the right KIND, with its asset references resolved against THIS widget's
   * own API origin — the one host guaranteed to be reachable from this browser and to serve these
   * bytes. `MJAPI_PUBLIC_URL` at upload time was not: a form authored on localhost, a domain change,
   * or a second API instance all left published forms pointing respondents at a host they cannot
   * reach (#270).
   */
  private async loadForm(): Promise<{ form: WidgetForm; resume?: ResumeSnapshot }> {
    const authored = this.definitionInput();
    if (authored) {
      return { form: fullForm(resolveDefinitionForRender(authored, this.config.graphqlUrl)) };
    }
    const served = await this.api.loadRespondentForm(this.distributionSlug());
    return {
      form: projectionForm(resolveRespondentDefinitionForRender(served.definition, this.config.graphqlUrl)),
      resume: served.resume,
    };
  }

  /**
   * Take over a draft the server says this session owns, and return the phase it opens in — or
   * `undefined` when there is nothing to resume, which is every first sitting.
   *
   * THE ADOPTION IS THE LOAD-BEARING LINE. Making the row's own id this widget's
   * `clientResponseId` is what routes every later save onto that row, and it is also what keeps the
   * upload ledger's provenance proof matching: the first sitting's files were tagged with this id.
   *
   * SEALED IS DECIDED HERE, at mount, and it cannot be decided anywhere else — `savePartial`
   * ignores the result's status and the pipeline answers a partial against a sealed row with
   * `success: true`, so a respondent allowed to start typing would type into a row that will never
   * take another answer. Reaching `done` also makes `shouldIgnoreSubmit` true, so the sealed screen
   * cannot issue a submit at all.
   */
  private adoptResume(
    resume: ResumeSnapshot | undefined,
    definition: WidgetRenderDefinition,
    runtime: FormRuntime,
  ): WidgetPhase | undefined {
    if (!resume) {
      return undefined;
    }
    this.clientResponseId = resume.responseId;
    this.responseId = resume.responseId;
    this.resumed.set(true);
    const prefill = prefillFromResume(runtime, definition, resume);
    this.resumeDropped.set(prefill.dropped);
    const phase = resumedPhaseFor(resume.status);
    if (phase === 'done') {
      // The confirmation path reads the RESULT, so a resumed sealed row hands it the same shape a
      // submit would have — which is how a `Disqualified` draft gets the screened-out copy rather
      // than a thank-you it never earned.
      this.result.set({ Success: true, ResponseID: resume.responseId, Status: resume.status, Outcome: 'ended', Errors: [] });
    } else {
      // Its answers are already on the server. Saying `saved` rather than `idle` stops the
      // indicator claiming unsaved work the moment the respondent touches anything.
      this.autosaveStatus.set('saved');
    }
    return phase;
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
    const form = this.form();
    if (!form || this.phase() === 'submitting') {
      return;
    }
    // Only an author's full draft has ending screens to jump to; the live projection holds none
    // (#302), so there only the welcome screen, the questions and the built-in confirmation exist.
    const target = resolveShownScreen(
      { welcomeScreen: form.render.welcomeScreen, endScreens: form.kind === 'full' ? form.definition.endScreens : [] },
      selection,
    );
    if (!target) {
      return;
    }
    this.endingScreen.set(target.ending);
    this.waitingForWelcomeImage.set(false); // an author command ends the gate's wait
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
      // The welcome gate (core/welcome-gate.ts) normally starts the prefetch, but a respondent can
      // tap Start while a timed-out image still downloads. prefetcher.Start() runs once per load.
      this.prefetcher.Start();
    }
  }

  /**
   * Keep the loader up until the welcome screen's image (and the form's logo, which sits above it)
   * is ready, or WELCOME_IMAGE_WAIT_MS passes — see core/welcome-gate.ts. A preview's showScreen()
   * during the wait moves the phase itself; the reveal then leaves that choice alone.
   */
  private holdForWelcomeImages(welcomeImage: string, generation: number): void {
    this.waitingForWelcomeImage.set(true);
    const logo = this.logoUrl();
    gateWelcomeScreen(logo ? [welcomeImage, logo] : [welcomeImage], {
      isCurrent: () => this.isCurrentLoad(generation),
      reveal: (failed) => {
        // The gate already saw this logo fail; rendering it would request it again and drop the bar
        // a round trip later, moving the screen just shown. Only the logo the gate loaded: a preview
        // may have swapped it during the wait.
        if (logo && failed.has(logo) && this.logoUrl() === logo) this.logoBroken.set(true);
        this.waitingForWelcomeImage.set(false);
        if (this.phase() === 'loading') this.phase.set('welcome');
      },
      imagesSettled: () => this.prefetcher.Start(),
    });
  }

  protected isScroll(): boolean {
    return this.definition()?.renderMode !== 'OneQuestion';
  }

  /** Progress checkpoint from a child render mode → schedule a debounced partial save. */
  protected onProgress(): void {
    // A knockout already under way owns the rest of this response: its bank is on the wire and
    // another ping would re-arm the debounce behind it.
    if (this.endingEarly) {
      return;
    }
    // Also on a KEYSTROKE, not only on the commit below. The ready line is driven by the same
    // signals and reappears the moment a character lands, so clearing only on blur left the two
    // on screen together for as long as the respondent kept typing — the narrower version of the
    // contradiction this exists to remove.
    this.clearResolvedRefusal();
    this.autosave?.ping();
    void this.bankPassedSubmitPoints();
  }

  /**
   * Drop a submit refusal once the respondent has acted on it. Each refusal clears on the fact it
   * stated, not on any change:
   * - the #124 sentence (the server's copy included) once the submit would no longer store
   *   nothing. An upload the respondent has started counts as answering (#328);
   * - an upload failure's sentence ({@link uploadFailureShown}) once no visible question has a
   *   failed upload any more — a new upload, a cleared answer, or a rule hiding the question.
   *   Answering ANOTHER question does not clear it: the failed upload still blocks the submit.
   *
   * An upload start fires no event of its own, so the respondent's next keystroke, blur or Next is
   * what clears a stale refusal.
   *
   * A ONE-WAY transition driven by their own action, deliberately, rather than a view-level
   * suppression of the sentence. Suppressing it in the view would also blank the SERVER's copy of
   * the same message whenever the two predicates disagree — the client settles visibility to a
   * fixed point and the server re-settles from the payload, and on a form whose rules do not settle
   * the two can differ (`FormRuntime.rulesSettle`) — and the server's refusal is the one that
   * exists to catch what the client missed, so the respondent would be left with a failed submit and nothing on screen. It
   * would also re-mount the `role="alert"` node every time the condition came back, re-announcing
   * mid-edit with no submit attempt in between. Cleared once, it stays cleared until something
   * raises it again.
   */
  private clearResolvedRefusal(): void {
    const rt = this.runtime();
    if (rt === null) {
      return;
    }
    const banner = this.errorText();
    const resolved =
      banner === NOTHING_TO_SUBMIT_MESSAGE
        ? !nothingToSubmit(rt, this.uploads)
        : this.uploadFailureShown !== '' &&
          banner === this.uploadFailureShown &&
          this.uploads.failureAmong(visibleIdsOf(rt)) === null;
    if (resolved) {
      this.errorText.set('');
      this.uploadFailureShown = '';
    }
  }

  /**
   * The respondent has FINISHED with a question — they left it, or advanced past it.
   *
   * Knockouts are judged on a finished answer and nowhere else. They used to ride `onProgress`,
   * which in scroll mode arrives on every keystroke, so a rule like `age lessThan 18` disqualified an
   * eligible respondent the instant they typed the `1` of `18` — and irreversibly, because
   * {@link endEarly} latches, seals the row and leaves intake. Autosave keeps riding every change,
   * because saving a half-typed value costs nothing and is undone by the next save.
   *
   * Live, the widget cannot judge a knockout at all — the projection has none (#302) — so a commit
   * asks the SERVER: it records the answers as committed and has them saved now, and a save whose
   * answers are exactly those and whose result is `ended` ends the form ({@link actOnVerdict}).
   * Preview holds every rule, so it judges locally through the same contracts function.
   */
  protected onCommit(): void {
    if (this.endingEarly || this.phase() !== 'ready') {
      return;
    }
    this.clearResolvedRefusal();
    const form = this.form();
    if (form?.kind === 'full') {
      this.judgePreviewCommit(form);
      return;
    }
    void this.judgeCommittedAnswers();
  }

  /**
   * Preview's half of {@link onCommit}: the author's draft has every rule, nothing is sent, and the
   * verdict comes from {@link previewOutcome}. Not every finished flow ends here: `endsWithoutSubmit`
   * draws that line — a screening is done TO the respondent, so it ends itself, and everything else
   * waits for Submit (reading `endedEarly` instead made a `Go to -> Submit` fire on a BLUR).
   */
  private judgePreviewCommit(form: Extract<WidgetForm, { kind: 'full' }>): void {
    const outcome = this.previewOutcome(form);
    if (outcome && endsWithoutSubmit(outcome)) {
      void this.endEarly({ screen: outcome.screen, redirectUrl: outcome.screen?.redirectURL?.trim() || undefined });
    }
  }

  /**
   * The live half of {@link onCommit}: mark the current answers as committed and get the server's
   * verdict on exactly them.
   *
   * When the last ACCEPTED save already carried these answers, its verdict is the answer and nothing
   * is sent. Otherwise the save runs now, through the autosave controller so it never overlaps
   * another save on the same response id; {@link savePartial} acts on its verdict.
   *
   * A refused or failed save leaves the commit standing, so the controller's capped retries (and any
   * later save of the same answers) still deliver its verdict — a knockout is never silently skipped
   * because a draft ceiling or the autosave rate limit refused one request. If every retry fails, the
   * final submit is judged by the server as well: it seals a knockout `Disqualified` and returns its
   * screen.
   */
  private async judgeCommittedAnswers(): Promise<void> {
    const key = this.draftKeyNow();
    this.ledger.Commit(key);
    if (key === undefined) {
      return; // held: nothing can be sent until the unstorable answer is fixed
    }
    if (key === this.ledger.JudgedAnswers()) {
      // Nothing new: the server already judged exactly these answers (or holds them, untouched).
      // `savePartial` makes the same check, deliberately twice: there it covers every save the
      // controller runs (debounce, checkpoint, retry); here it keeps a no-op commit from going through
      // the controller at all, which would flash "Saving…" for a request never made.
      const verdict = this.ledger.VerdictFor(key);
      if (verdict) {
        this.actOnVerdict(verdict, key);
      }
      return;
    }
    await this.autosave?.flushNow();
  }

  /**
   * The autosave spent its retries. Say so when what it failed to save is a COMMIT the server has not
   * judged — the case where a knockout could be waiting unseen. Not otherwise: a keystroke draft
   * the next edit re-saves is not worth interrupting anyone for.
   */
  private noticeUnsavedCommit(): void {
    if (this.ledger.HasUnjudgedCommit()) {
      this.saveNotice.set(true);
    }
  }

  /**
   * The payload key of the draft an autosave would send right now, or `undefined` while it is held
   * (an unstorable answer a rule may read — see `FormRuntime.buildDraftInputs`).
   */
  private draftKeyNow(): string | undefined {
    const draft = this.runtime()?.buildDraftInputs();
    return draft && !draft.held ? answersKey(draft.answers.map(toWireAnswer)) : undefined;
  }

  /**
   * End the form when a save of the COMMITTED answers came back `ended` — a knockout, judged by the
   * server on finished answers. A save of any other answers set (a keystroke autosave, or answers
   * edited since the commit) is not a verdict the widget acts on.
   *
   * Scheduled, never awaited, from inside a save: {@link endEarly} first quiesces the autosave, and
   * the save that delivered this verdict is still the controller's in-flight save until it returns.
   */
  private actOnVerdict(result: FormsSaveResponseOutput, sentKey: string): void {
    if (result.Outcome !== 'ended' || !this.ledger.IsCommitted(sentKey) || this.endingEarly) {
      return;
    }
    void this.endEarly({
      screen: result.Ending ? endingScreenFrom(result.Ending, this.config.graphqlUrl) : undefined,
      redirectUrl: result.RedirectURL,
      result,
    });
  }

  /**
   * The verdict the author's draft has reached, for Preview only — the live widget asks the server.
   *
   * A pure query — it decides, it does not act. {@link endEarly} is the command half.
   *
   * Over the SETTLED answers, not the raw map: `resolveResponseOutcome` settles visibility, scores
   * the settled questions and resolves over the settled answers, exactly as the server does on every
   * save (DW13 / #75), so Preview lands where a respondent would.
   */
  private previewOutcome(form: Extract<WidgetForm, { kind: 'full' }>): FormOutcome | undefined {
    const rt = this.runtime();
    if (!rt) {
      return undefined;
    }
    const resolved = resolveResponseOutcome(form.definition, rt.currentAnswers());
    if (!resolved.visibility.settled) {
      // Not fatal — the last derivation is still a usable verdict — but the server, settling the
      // payload, may reach a different one, and nothing on screen would say why.
      console.warn(
        `[mj-form] form version ${form.definition.formVersionId}: visibility did not settle; this form's show ` +
          'rules depend on each other in a way that has no stable answer, so the server may judge ' +
          'this response differently from what is on screen.',
      );
    }
    return resolved.outcome;
  }

  /**
   * End the form early — a knockout (C3): the whole point of a disqualification is that an
   * ineligible respondent does not fill the rest in first.
   *
   * THE ORDER HERE IS THE FEATURE. Live, the partial save that delivered the verdict leaves the row a
   * `Partial` draft (a seal is permanent, and only a finished submission seals); the final submit
   * below is what records it `Disqualified`. It can be lost two ways that both pass a hand test:
   *
   *   - `savePartial()` no-ops unless the phase is still 'ready', and `flushNow()` yields
   *     before issuing its write whenever a save is already in flight. Firing it unawaited and
   *     setting the phase in the same tick therefore dropped the write exactly when the
   *     respondent had been typing, and worked whenever the autosave happened to be idle.
   *   - `window.location.assign` aborts requests still on the wire, so navigating first
   *     cancels it.
   *
   * So: seal while intake still permits it, await that, and only then show the screen and
   * follow the redirect — the same order {@link applySubmitResult} uses on the submit path.
   * The respondent waits one round trip before the screen appears, which is the correct trade:
   * the alternative is telling them they are screened out while quietly recording nothing.
   *
   * Fail-soft like every autosave, so a failed seal still shows the screen rather than stranding the
   * respondent mid-form. Preview records nothing: {@link sealEarlyEnd} sends nothing for a full form.
   */
  private async endEarly(ending: EarlyEnding): Promise<void> {
    this.endingEarly = true;
    // Quiesce the autosave before writing, so two requests never carry the same
    // `clientResponseId` — the primary-key collision the submit path guards the same way.
    await this.autosave?.settle();
    const sealed = await this.sealEarlyEnd();
    // Both awaits above can END THE FILL for a different reason: either writes through
    // `savePartial`, which answers a lapsed session by setting the terminal `expired` phase. This
    // method's ending is not the one that then applies. Without this re-read the unconditional
    // `phase.set('done')` below tore the notice back down, un-inerted the form, and showed a
    // knockout screen — with a redirect, if the screen carried one — for an outcome the server
    // refused and never recorded.
    if (this.phase() === 'expired') {
      return;
    }
    // The seal's own result wins when it landed: the server answers it from the row it sealed. Its
    // absence (an unsolved captcha, a refusal) leaves the verdict that ended the form.
    const shown = sealed
      ? {
          screen: sealed.Ending ? endingScreenFrom(sealed.Ending, this.config.graphqlUrl) : ending.screen,
          redirectUrl: sealed.RedirectURL ?? ending.redirectUrl,
          result: sealed,
        }
      : ending;
    if (shown.result) {
      this.result.set(shown.result);
    }
    this.endingScreen.set(shown.screen);
    this.phase.set('done');
    if (sealed) {
      this.emitHostEvent('mjf-submitted', { responseId: sealed.ResponseID });
    }
    if (shown.redirectUrl) {
      this.redirect(shown.redirectUrl);
    }
  }

  /**
   * Record the knockout: ONE finished submission, sent before the form leaves intake. Resolves with
   * the server's result when it accepted it; `undefined` when nothing was recorded as sealed.
   *
   * A finished submission, not an autosave, because only a completion seals a knockout server-side
   * — a partial deliberately does not, since an autosave carries half-typed values and a seal is
   * permanent. For this respondent the form IS over, so a completion is the honest description.
   *
   * Fail-soft, like every other background write here. A captcha-gated form whose challenge is
   * unsolved never sends it — the server refuses a completion without a token — and the row keeps
   * its last draft. Showing the respondent their screen anyway is the better half of that trade;
   * stranding them mid-form to protect a record is not.
   */
  private async sealEarlyEnd(): Promise<FormsSaveResponseOutput | undefined> {
    const form = this.form();
    const rt = this.runtime();
    if (!form || !rt || form.kind === 'full') {
      return undefined;
    }
    // Don't send a completion the server is certain to refuse. The captcha gate applies to every
    // completion, and a knockout can fire long before the challenge is solved — `onSubmit` makes
    // this same check, and skipping it here meant a captcha-gated form could never record one.
    const sealed = this.submitAllowed() ? await this.trySeal(form, rt) : undefined;
    if (sealed) {
      return sealed;
    }
    // The seal did not land. Bank what exists as a draft so the knockout ANSWER survives even
    // though its status did not — `settle()` above cancelled the pending debounce without firing
    // it, and nothing else will write: the latch is set and every other entry point returns early.
    await this.autosave?.flushNow();
    return undefined;
  }

  /**
   * One attempt at the terminal write: the server's result when it accepted it, else `undefined`.
   *
   * `saveResponse` RESOLVES with `Success: false` for anything the server refuses — a captcha, the
   * row ceiling, a rate limit — and throws only when the call itself fails. A bare `try/catch`
   * therefore treated every refusal as a successful seal, silently, which is the worst of the three
   * possible outcomes: no record, and nothing anywhere saying so.
   */
  private async trySeal(form: WidgetForm, rt: FormRuntime): Promise<FormsSaveResponseOutput | undefined> {
    try {
      const res = await this.api.saveResponse(this.buildSubmission(form, rt, false));
      if (res.Success) {
        if (res.ResponseID) {
          this.responseId = res.ResponseID;
        }
        return res;
      }
      const why = res.Errors.map((e) => e.Message).join(' ').trim();
      console.warn(`[mj-form] the disqualification could not be recorded: ${why || 'refused'}`);
      return undefined;
    } catch (err) {
      // A request that can DISCOVER an expiry, and the first one to do so on a choice knockout:
      // `endEarly` calls `settle()` beforehand, which cancels the pending debounce without firing
      // it, so no autosave is in flight when this is sent. Routed through the same single decision
      // as the other requests rather than swallowed here — the log line below stays for every other
      // refusal, which really is fail-soft background work.
      this.endSessionIfExpired(err);
      console.warn(`[mj-form] the disqualification could not be recorded: ${failureDetail(err)}`);
      return undefined;
    }
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
    const form = this.form();
    const rt = this.runtime();
    if (!form || !rt) {
      return;
    }
    // Double-submit guard: ignore re-entrant submits while one is in flight or already
    // done. Without this, a double-tap (or an Enter + click) fires two mutations and can
    // leave the UI stuck between phases.
    if (shouldIgnoreSubmit(this.phase())) {
      return;
    }
    // A knockout mid-seal is not visible to the phase guard above: `endEarly` awaits
    // twice while the phase is still 'ready', so the submit button stays live the whole time.
    // Without this, tapping the knockout option and then Submit puts two completions on the wire
    // carrying the same `clientResponseId` — exactly the primary-key collision the settle() below
    // exists to prevent.
    if (this.endingEarly) {
      return;
    }
    // Nothing-to-submit gate (#124). The server refuses a completion that would store nothing on a
    // form that DID ask something, so sending one costs the respondent a round trip to be told what
    // the widget already knows — and every other validation rule here answers inline. For a form
    // with nothing to store the sentence is the server's own, from the shared contract, so the two
    // cannot drift into disagreeing about it; a refused upload is named instead (see
    // refuseWithNothingToSubmit).
    //
    // BEFORE the captcha gate, deliberately: this refusal costs the respondent nothing to act on,
    // while a challenge costs them work. Ordered the other way, someone who answered nothing solves
    // a captcha first and only then learns they had to answer a question — two rounds of their
    // effort to deliver one fact the widget already had.
    //
    // BEFORE the phase flip below, also deliberately: this is a refusal to START, not a failed
    // submit, so the form must stay exactly where it was rather than settling the autosave and
    // rebuilding its children for a request that is never sent.
    //
    // An upload still on its way (uploading, or `unsaved`) is an answer on its way, so a submit
    // whose only answers are uploads passes this gate and reaches the upload wait (`uploadsLanded`),
    // which waits for them or restarts them (#328). A `refused` upload is not on its way: the
    // gate refuses, and names it (see refuseWithNothingToSubmit).
    if (nothingToSubmit(rt, this.uploads)) {
      this.refuseWithNothingToSubmit(rt);
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
    this.uploadFailureShown = '';
    // A no-op in Preview, which has no autosave controller.
    await this.autosave?.settle();
    // Before the Preview branch too: Preview's mock uploads take time, and an author testing the
    // form should see the same wait a respondent would.
    if (!(await this.uploadsLanded(form, rt))) {
      return;
    }
    if (form.kind === 'full') {
      // Preview sends nothing: the author's draft is resolved here, locally, by the same contracts
      // function the server runs on a live submit (DW13 / #75).
      this.applyPreviewSubmit(form);
      return;
    }
    const input = this.buildSubmission(form, rt, false);
    this.submitTimer.Start();
    try {
      const res = await this.api.saveResponse(input);
      this.submitTimer.LogOutcome(true);
      this.applySubmitResult(res);
    } catch (err) {
      this.submitTimer.LogOutcome(false);
      this.result.set(null);
      // Not a failure to retry from: the session is over, and `ready` would put the respondent
      // back in front of a Submit that can only ever be refused again.
      if (this.endSessionIfExpired(err)) {
        return;
      }
      // The banner shows the fixed sentence; the cause goes to whoever opens the console.
      console.warn(`[mj-form] the response could not be submitted: ${failureDetail(err)}`);
      this.returnToEditing();
      const message = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      this.errorText.set(message);
      this.handlePossibleTurnstileFailure(message);
    } finally {
      this.submitTimer.Stop();
    }
  }

  /**
   * A submit that settled the autosave did not end the fill: hand the form back to the respondent
   * and tell the autosave so too. Without `reopen()` the controller stays quiesced and an `online`
   * event after an offline submit would never retry the save. Sends nothing itself — a partial
   * right behind a submit that just failed would only fail again.
   */
  private returnToEditing(): void {
    this.phase.set('ready');
    this.autosave?.reopen();
  }

  /**
   * Wait for the uploads of every question the respondent can see, and say whether the submit may
   * go on (#248).
   *
   * The store commits a file question's answer only when its upload lands, so a submit built while
   * one is on the wire sends that question unanswered — silently, which is how a consent form went
   * in without its signature. Waiting closes that.
   *
   * Visible answerable questions only: an upload on a question a rule has since hidden is not part
   * of what gets judged, so neither its wait nor its failure may hold the submit. An `unsaved` one
   * is restarted first, because pressing Submit again is the respondent saying "try again"; a
   * `refused` one is not, because the same bytes get the same verdict.
   *
   * False means stop: either an upload ended in a failure (the phase goes back to `ready` and its
   * sentence is put in the banner, the same way the #124 refusal is), or the widget moved on while
   * it waited — a lapsed session set `expired`, or a reload replaced the form — and this submit
   * describes a form that is no longer on screen.
   */
  private async uploadsLanded(form: WidgetForm, rt: FormRuntime): Promise<boolean> {
    const ids = visibleIdsOf(rt);
    this.uploads.retryUnsaved(ids);
    await this.uploads.whenSettled(ids);
    if (this.phase() !== 'submitting' || this.form() !== form || this.runtime() !== rt) {
      return false;
    }
    const failure = this.uploads.failureAmong(ids);
    if (failure) {
      this.returnToEditing();
      this.refuseWithUploadFailure(failure);
      return false;
    }
    return true;
  }

  /**
   * Raise the gate's refusal and take the respondent to it: the #124 sentence, or — when a visible
   * question's upload was refused — that upload's own message (#328). The refused upload is the real
   * reason nothing would be stored, and the one the respondent can act on ("Choose again"). Any
   * failure reaching this gate is `refused`, because an `unsaved` upload counts as pending.
   *
   * Rendering alone is not answering them: the banner is at the top of the shell and Submit is at
   * the bottom of a scroll-mode form, so a press produced no visible change whatever for a sighted
   * respondent looking at the button. Focus both moves the viewport and announces, which is what
   * the widget's other blocked path (`onNext` -> `touchAll`) achieves by annotating the offending
   * field. That option is missing for the #124 sentence, where no single field is at fault; for a
   * refused upload one field IS at fault, but the banner still takes focus because it is the one
   * place both cases render.
   */
  private refuseWithNothingToSubmit(rt: FormRuntime): void {
    const refused = this.uploads.failureAmong(visibleIdsOf(rt));
    if (refused) {
      this.refuseWithUploadFailure(refused);
      return;
    }
    this.errorText.set(NOTHING_TO_SUBMIT_MESSAGE);
    this.focusBanner();
  }

  /**
   * Put an upload failure's sentence in the banner and record that it is one, so
   * {@link clearResolvedRefusal} drops it once the failure is gone. The gate and the upload wait
   * both raise it through here, so neither path can leave a failure's sentence that never clears.
   */
  private refuseWithUploadFailure(failure: UploadFailure): void {
    this.uploadFailureShown = failure.message;
    this.errorText.set(failure.message);
    this.focusBanner();
  }

  /** Put focus on the in-form banner, once it has rendered. */
  private focusBanner(): void {
    afterNextRender(
      () => {
        this.banner()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  /**
   * Fold the server's submit result into the widget phase. On success we reach the 'done'
   * confirmation for BOTH render modes, show the ending the SERVER chose, and ONLY redirect when the
   * result carries a redirect URL; on failure we return to 'ready' with the refusal shown — under the
   * fields it names (`QuestionID`), and in the banner.
   */
  private applySubmitResult(res: FormsSaveResponseOutput): void {
    this.result.set(res);
    if (res.Success && res.ResponseID) {
      this.responseId = res.ResponseID;
    }
    const outcome = outcomeForResult(res);
    this.phase.set(outcome.phase);
    if (outcome.phase === 'ready') {
      this.autosave?.reopen();
    }
    if (outcome.phase === 'done') {
      // The draft is sealed: tell the page so it can drop the device pointer. Reopening the public
      // link on this browser afterwards must show a FRESH form — the response is finished, and a
      // multi-use link is meant to be fillable again. The sealed answers stay reachable only
      // through a link the respondent was sent.
      this.emitHostEvent('mjf-submitted', { responseId: res.ResponseID });
    }
    if (!res.Success) {
      this.showRefusal(res);
      return;
    }
    // The server resolved the ending — a knockout's own screen and redirect, a score band, the
    // default — from the full snapshot the respondent never receives. There is nothing to re-resolve
    // here, and nothing to resolve it from.
    this.endingScreen.set(res.Ending ? endingScreenFrom(res.Ending, this.config.graphqlUrl) : undefined);
    // Success always reaches 'done' (both render modes). Redirect ONLY when a URL is set, and
    // only after 'done' — so a blocked/slow navigation still shows the confirmation.
    if (outcome.redirect && res.RedirectURL) {
      this.redirect(res.RedirectURL);
    }
  }

  /**
   * A refused submit, shown: each error that names a question goes under that question (the server's
   * text no longer names it — "This question is required." in a banner says nothing about which), and
   * the banner lists every message, prefixed with its question's prompt, so a one-question form whose
   * refused field is screens behind still says what to fix.
   */
  private showRefusal(res: FormsSaveResponseOutput): void {
    const fieldErrors = res.Errors.flatMap((e) => (e.QuestionID ? [{ questionId: e.QuestionID, message: e.Message }] : []));
    this.runtime()?.showServerErrors(fieldErrors);
    const prompts = new Map((this.definition()?.pages ?? []).flatMap((page) => page.questions.map((q) => [q.id, q.prompt] as const)));
    const message = res.Errors.map((e) => {
      const prompt = e.QuestionID ? prompts.get(e.QuestionID)?.trim() : undefined;
      return prompt ? `${prompt}: ${e.Message}` : e.Message;
    })
      .join(' ')
      .trim();
    if (message) {
      this.errorText.set(message);
      this.handlePossibleTurnstileFailure(message);
    }
  }

  /**
   * Preview's submit: resolve the author's draft locally and land where a respondent would.
   *
   * Through {@link previewOutcome}, which reads the settled answers AND honours a `Go to` that named a
   * screen. The redirect is the resolved ending's own URL, else the form-wide one — what lets an author
   * send qualified respondents to a booking page and everyone else to a thank-you — and it is followed
   * exactly as the live widget follows the server's, as Preview always has.
   */
  private applyPreviewSubmit(form: Extract<WidgetForm, { kind: 'full' }>): void {
    const outcome = this.previewOutcome(form);
    this.result.set({
      Success: true,
      ResponseID: null,
      Status: outcome?.disqualified ? 'Disqualified' : 'Complete',
      Outcome: 'ended',
      Errors: [],
    });
    this.endingScreen.set(outcome?.screen);
    this.phase.set('done');
    const url = endingRedirectUrl(outcome?.screen, form.definition.settings);
    if (url) {
      this.redirect(url);
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

  /**
   * The config-gap half is the SHARED constant, not a second spelling of it. The server says the
   * same sentence when its own half of Turnstile is missing, and `isTurnstileError` matches that
   * sentence by identity — so a reworded duplicate here would silently stop the challenge being
   * reset after a server-side refusal (#122).
   */
  private captchaBlockedMessage(): string {
    return this.captchaConfigGap()
      ? CAPTCHA_NOT_CONFIGURED_MESSAGE
      : 'Please complete the security challenge before submitting.';
  }

  /**
   * Save the current answers as a Partial response (server upserts, runs no hooks/quota).
   * Reuses the returned {@link responseId} so subsequent autosaves update the same record.
   * Throws on failure — a transport error, OR a server REFUSAL (`Success === false`, e.g. the
   * autosave rate-limit bucket) — so the {@link AutosaveController} records `'error'` (never
   * `'saved'` for a save the server threw away) and retries it on its own capped backoff.
   *
   * An accepted save is also a VERDICT: the server judged knockouts on these answers. It is
   * remembered in the {@link ledger}, and acted on when the answers are the committed ones ({@link actOnVerdict}).
   */
  private async savePartial(): Promise<string | undefined | typeof NOTHING_TO_SAVE> {
    const form = this.form();
    const rt = this.runtime();
    if (!form || !rt) {
      return undefined;
    }
    // Never autosave once the respondent has moved past editing — a partial landing after
    // the final submit would resurrect a Partial row (or, worse, revert the confirmation).
    // The autosave is also cancelled in onSubmit(); this is the belt-and-braces guard for a
    // save that was already dispatched before the cancel.
    if (this.phase() !== 'ready') {
      return this.responseTarget();
    }
    let sentKey = '';
    let res: FormsSaveResponseOutput;
    try {
      // Built as the request's argument, so a HELD draft throws before any request is made.
      const input = this.buildSubmission(form, rt, true);
      sentKey = answersKey(input.Answers);
      // Nothing new to send (fix round 1): the server already holds exactly these answers — an
      // untouched form, an edit undone before the debounce fired, or a save of the same answers that
      // already came back (a commit flushed behind an in-flight save that ENDED the form, Minor 3).
      if (sentKey === this.ledger.JudgedAnswers()) {
        const verdict = this.ledger.VerdictFor(sentKey);
        if (verdict) {
          this.actOnVerdict(verdict, sentKey);
        }
        return NOTHING_TO_SAVE;
      }
      res = await this.api.saveResponse(input);
    } catch (err) {
      // The autosave is the request most likely to DISCOVER an expiry: it fires on every edit,
      // long before the respondent reaches Submit. Left to the controller alone the failure is
      // logged and retried on a capped backoff — never diagnosed as a session expiry — so the
      // respondent would go on typing into a form that is quietly retrying against an expired
      // session and will refuse the final send regardless. Still rethrown, so the controller
      // records the failure AND this component gets a chance to check for expiry.
      this.endSessionIfExpired(err);
      throw err;
    }
    if (!res.Success) {
      // A logical refusal — the rate-limit bucket, most commonly — is NOT the same as "saved".
      // Left to return normally here, the controller had no way to tell it apart from a real
      // save and reported 'saved' for progress the server had just thrown away.
      throw new Error(`Autosave refused for response ${this.responseTarget()}: ${res.Errors[0]?.Message ?? 'no reason given'}`);
    }
    if (res.ResponseID) {
      this.responseId = res.ResponseID;
      this.announceFirstPartial(res.ResponseID);
    }
    this.ledger.Acknowledge(sentKey, res);
    this.saveNotice.set(false);
    this.actOnVerdict(res, sentKey);
    return this.responseTarget();
  }

  /**
   * Tell the page there is now a draft worth remembering — once, on the first ACKNOWLEDGED save.
   *
   * Acknowledged, not attempted: the page turns this into a magic-link invite scoped to the
   * response, and a row that failed to save has no id to scope one to.
   *
   * IT CARRIES BOTH CORRELATORS, and that is not incidental. The page's `/remember` route has to
   * run the ownership rule before it mints a bearer token for this draft, and the only proof of
   * ownership a first sitting has is the `x-session-id` header — which lives inside the API service
   * and is invisible to the boot script. Sending the response id alone would have the page minting
   * a credential on a bare row id, which is the header-replay weakness this whole feature exists to
   * close.
   *
   * `composed: true` so it crosses the shadow boundary; a page that is not listening (an embed)
   * simply receives nothing, which is why embeds need no conditional code in the widget.
   */
  private announceFirstPartial(responseId: string): void {
    if (this.partialAnnounced) {
      return;
    }
    this.partialAnnounced = true;
    this.emitHostEvent('mjf-partial-saved', { responseId, sessionId: this.api.sessionCorrelator() });
  }

  /**
   * "Not you? Start over" — the control a shared device needs.
   *
   * The widget only ANNOUNCES it. The page clears the device pointer and reloads, and the reload is
   * the point: under a response-scoped session the pipeline would update the scoped row rather than
   * create a new one, so a genuine start-over needs a fresh distribution session, which only a
   * fresh page load can mint. The old draft is left exactly as it was.
   */
  protected startOver(): void {
    this.emitHostEvent('mjf-start-over', {});
  }

  /** Dispatch one host event, or nothing at all outside a browser. */
  private emitHostEvent(name: string, detail: Record<string, unknown>): void {
    const host = this.hostRef.nativeElement;
    if (typeof CustomEvent === 'undefined' || !host?.dispatchEvent) {
      return;
    }
    host.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /**
   * The response id sent to the server as the upsert target. The client-generated id is
   * PRIMARY (stable across the whole fill); the server echo is only a fallback if for some
   * reason the client id were ever unavailable.
   */
  private responseTarget(): string {
    return this.clientResponseId || this.responseId || generateClientResponseId();
  }

  /** Build the `Forms.SaveResponse` input for either a partial autosave or the final submit. */
  private buildSubmission(form: WidgetForm, rt: FormRuntime, partial: boolean): FormsSaveResponseInput {
    return toSaveResponseInput({
      distributionSlug: this.distributionSlug(),
      // The projection's own version, which the transport checked equals the version it was served as.
      formVersionId: form.render.formVersionId,
      mode: partial ? 'partial' : 'final',
      clientResponseId: this.responseTarget(),
      startedAt: this.startedAt,
      // Only the final submit carries a captcha token; partial autosaves run no captcha
      // check server-side, so we never spend the single-use token on an autosave.
      turnstileToken: partial ? undefined : this.turnstileToken() ?? undefined,
      clientMeta: {
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
      // An autosave leaves out a field the server cannot store as a draft, so one bad field never
      // stops the rest of the draft saving — unless a rule may read it (`draftAnswers`); a final
      // submit carries everything.
      answers: partial ? this.draftAnswers(rt) : rt.buildAnswerInputs(),
    });
  }

  /**
   * The autosave's answers — or a throw when the draft is HELD: a field the server cannot store is
   * one a rule may read, so leaving it out would change what the server decides for other questions
   * (#303 Task 8 fix round 4; see `FormRuntime.buildDraftInputs`).
   *
   * A throw, not an empty payload: it is raised while the request's argument is being built, so no
   * request is made and no saved row is touched, and the {@link AutosaveController} records `'error'`
   * — never `'saved'` — and retries on its capped backoff, each retry re-checking for free.
   */
  private draftAnswers(rt: FormRuntime): FormAnswerInput[] {
    const draft = rt.buildDraftInputs();
    if (draft.held) {
      throw new Error(
        `Autosave held for response ${this.responseTarget()}: question(s) ${draft.unstorable.join(', ')} cannot be saved ` +
          'as entered and a rule may read them, so nothing was sent; the answers stay in this browser until they are fixed.',
      );
    }
    return draft.answers;
  }

  /**
   * Whether the server recorded this response as a screening rather than a completion.
   *
   * Read from the RESULT, not from the client's own verdict, because the server sees knockouts the
   * client never evaluated — a rule on the last question before Submit, or a caller with no widget.
   */
  protected readonly screenedOut = computed(() => {
    const result = this.result();
    // A sealed screening, or a knockout the server ended on whose seal did not land (the row is
    // still a draft, but the respondent was screened out all the same).
    return result?.Status === 'Disqualified' || result?.Ending?.IsDisqualification === true;
  });

  /**
   * The confirmation message for a form with no ending screen.
   *
   * The server's echoed message wins over the form's own setting, because a server that
   * overrode it (a quota message, say) knows something the snapshot does not.
   */
  protected confirmationMessage(): string {
    const echoed = this.result()?.ConfirmationMessage;
    if (echoed) {
      return echoed;
    }
    // A screening never falls back to the form's confirmation. The server sends a redirect OR a
    // message, never both, so a knockout carrying a redirect arrives here with nothing echoed —
    // and the form-wide default is "your response has been recorded", which is untrue of a
    // knockout on both counts. A redirect usually makes this a flash; a blocked or slow
    // navigation makes it the resting state, and it must not be a thank-you either way.
    if (this.screenedOut()) {
      return SCREENED_OUT_MESSAGE;
    }
    return endingMessage(undefined, { confirmationMessage: this.definition()?.confirmationMessage });
  }

  protected retry(): void {
    void this.load();
  }

  /**
   * End the fill if `err` says the anonymous session has expired. True when it did.
   *
   * The ONE place the widget decides what an expired session means, reached from every request
   * that can discover one — submit, autosave, load — so whichever happens to see the 401 first,
   * the outcome is the same. The session JWT is dead and MJ issues no refresh tokens, so this is
   * terminal: the autosave is disposed outright (a disposed controller never re-arms, and its
   * next flush would otherwise report "Progress saved" for a save the phase guard skipped), the
   * phase withdraws submit and makes the form inert, and focus moves into the notice — with the
   * shell inert it would otherwise fall to <body>, leaving a keyboard or screen-reader user an
   * announcement and nowhere to go.
   */
  private endSessionIfExpired(err: unknown): boolean {
    if (!(err instanceof SessionExpiredError)) {
      return false;
    }
    this.autosave?.dispose();
    this.phase.set('expired');
    afterNextRender(
      () => this.hostRef.nativeElement.querySelector<HTMLElement>('.mjf-expired__action')?.focus(),
      { injector: this.injector },
    );
    return true;
  }

  /**
   * The one recovery from an expired session: a new page.
   *
   * `GET /f/:slug` mints a fresh anonymous session on every fetch, so the host page IS the
   * re-mint — nothing in the widget can obtain a token, and nothing should: the operator's
   * session TTL is a bound, not an inconvenience to route around. A reload rather than {@link load}
   * because `load` would re-fetch with the same dead token and land straight back here.
   */
  protected startAgain(): void {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  private fail(message: string): void {
    this.errorText.set(message);
    this.phase.set('error');
  }

  /**
   * Navigate to an author-configured (or server-echoed) redirect URL — http(s) ONLY.
   *
   * The URL is author-controlled content rendered on an EMBEDDING site, so passing it to
   * `window.location.assign` unvalidated let a `javascript:` (or `data:`) URL execute in the
   * host page's origin — script injection on whatever site embeds the widget. The judgement
   * itself lives in {@link judgeRedirect}, as a pure function: it is a security guard, and a
   * private method on a component this heavy is a guard nothing can test.
   */
  private redirect(url: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const refusal = judgeRedirect(url, window.location.href);
    if (refusal) {
      console.warn(redirectRefusalMessage(url, refusal));
      return;
    }
    window.location.assign(url);
  }
}

/** How a form ended early, and what to show for it. */
interface EarlyEnding {
  /** The ending screen; `undefined` shows the built-in confirmation copy. */
  readonly screen: PublishedFormScreen | undefined;
  /** Where to send the respondent instead; `undefined` to stay on the screen. */
  readonly redirectUrl: string | undefined;
  /** The server result that ended it, live only; Preview has none. */
  readonly result?: FormsSaveResponseOutput;
}

/** The ids of the questions the respondent can see and answer: what a submit is judged on. */
function visibleIdsOf(rt: FormRuntime): string[] {
  return rt.visibleAnswerableQuestions().map((question) => question.id);
}

/**
 * A key for an answers payload, equal exactly when two payloads carry the same answers in the same
 * order — which they do when built from the same runtime state, because the payload walks the
 * settled questions in document order.
 */
function answersKey(answers: FormsSaveResponseInput['Answers']): string {
  return JSON.stringify(answers);
}
