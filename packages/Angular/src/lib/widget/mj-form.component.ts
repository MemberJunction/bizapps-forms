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
import {
  computeScore,
  endingMessage,
  endingRedirectUrl,
  endsWithoutSubmit,
  NOTHING_TO_SUBMIT_MESSAGE,
  resolveFormOutcome,
  SCREENED_OUT_MESSAGE,
  type FormOutcome,
  type FormSubmissionInput,
  type FormSubmissionResult,
  type FormStyleTokens,
  type PublishedFormDefinition,
  type PublishedFormScreen,
  type ResumeSnapshot,
} from '@mj-biz-apps/forms-entities';

import { FORMS_API_SERVICE } from './api/forms-api.interface';
import { FORMS_API_CONFIG } from './api/forms-api.config';
import { submitWaitMessage } from './core/submit-progress';
import { applyStyleTokens } from './core/theming';
import { FormRuntime } from './core/form-runtime';
import { AutosaveController, type AutosaveStatus } from './core/autosave-controller';
import { generateClientResponseId } from './core/client-id';
import { FormUploadStore } from './core/upload-store';
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
import type { WidgetPhase } from './core/submit-phase';

@Component({
  selector: 'mj-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormScreenComponent,
    FormScrollComponent,
    FormOneQuestionComponent,
    TurnstileChallengeComponent,
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
   * Pre-built definition to render directly, bypassing the API fetch. Used by the
   * builder's WYSIWYG Preview to render the unpublished draft (fillable, themed) with no
   * publish/DB round-trip. When set, {@link load} skips `loadPublishedForm`.
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
  protected readonly errorText = signal<string>('');
  protected readonly definition = signal<PublishedFormDefinition | null>(null);
  protected readonly runtime = signal<FormRuntime | null>(null);
  protected readonly result = signal<FormSubmissionResult | null>(null);

  /** Subtle, non-blocking autosave indicator. */
  protected readonly autosaveStatus = signal<AutosaveStatus>('idle');

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
    this.resumed.set(false);
    this.resumeDropped.set([]);
    this.partialAnnounced = false;
    try {
      const loaded = this.definitionInput()
        ? { definition: this.definitionInput() as PublishedFormDefinition }
        : await this.api.loadPublishedForm(this.distributionSlug());
      if (!loaded) {
        this.fail('This form is not available.');
        return;
      }
      const def = loaded.definition;
      applyStyleTokens(this.hostRef.nativeElement, def.styleTokens);
      this.definition.set(def);
      const runtime = new FormRuntime(def);
      this.runtime.set(runtime);
      // File answers are committed by the store, not by a view event — see `FormUploadStore.succeed`.
      this.uploads.connect(runtime);
      this.autosave?.dispose();
      this.autosave = new AutosaveController(
        () => this.savePartial(),
        (status) => this.autosaveStatus.set(status),
      );
      this.endingScreen.set(undefined);
      this.logoBroken.set(false);
      this.bankedSubmitPoints = new Set<string>();
      this.endingEarly = false;
      this.phase.set(this.adoptResume(loaded.resume, def, runtime) ?? initialPhaseFor(def));
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'Failed to load the form.');
    }
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
    definition: PublishedFormDefinition,
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
      this.result.set({ success: true, responseId: resume.responseId, status: resume.status });
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
    // A knockout already under way owns the rest of this response: its bank is on the wire and
    // another ping would re-arm the debounce behind it.
    if (this.endingEarly) {
      return;
    }
    // Also on a KEYSTROKE, not only on the commit below. The ready line is driven by the same
    // signals and reappears the moment a character lands, so clearing only on blur left the two
    // on screen together for as long as the respondent kept typing — the narrower version of the
    // contradiction this exists to remove.
    this.clearNothingToSubmitIfAnswered();
    this.autosave?.ping();
    void this.bankPassedSubmitPoints();
  }

  /**
   * Drop the #124 refusal once the respondent has answered something.
   *
   * A ONE-WAY transition driven by their own action, deliberately, rather than a view-level
   * suppression of the sentence. Suppressing it in the view would also blank the SERVER's copy of
   * the same message whenever the two predicates disagree — the client settles visibility to a
   * fixed point while the server makes a single pass, and `settledAnswers` says in so many words
   * that the two can differ — and the server's refusal is the one that exists to catch what the
   * client missed, so the respondent would be left with a failed submit and nothing on screen. It
   * would also re-mount the `role="alert"` node every time the condition came back, re-announcing
   * mid-edit with no submit attempt in between. Cleared once, it stays cleared until something
   * raises it again.
   */
  private clearNothingToSubmitIfAnswered(): void {
    if (this.errorText() === NOTHING_TO_SUBMIT_MESSAGE && this.runtime()?.wouldSubmitNothing() === false) {
      this.errorText.set('');
    }
  }

  /**
   * The respondent has FINISHED with a question — they left it, or advanced past it.
   *
   * Knockout rules are judged here and nowhere else. They used to ride `onProgress`, which in
   * scroll mode arrives on every keystroke, so a rule like `age lessThan 18` disqualified an
   * eligible respondent the instant they typed the `1` of `18` — and irreversibly, because
   * {@link endEarly} latches, seals the row and leaves intake. A rule that ends the
   * form has to be judged on a finished answer; autosave keeps riding every change, because
   * saving a half-typed value costs nothing and is undone by the next save.
   *
   * This is only about when the client NOTICES. The server re-evaluates the same shared rule on
   * the save regardless, so a client that never fired this is still disqualified.
   */
  protected onCommit(): void {
    if (this.endingEarly || this.phase() !== 'ready') {
      return;
    }
    this.clearNothingToSubmitIfAnswered();
    const outcome = this.outcomeForAnswers();
    // Not every finished flow is the widget's to send. `endsWithoutSubmit` is where that line is
    // drawn and why: a screening is done TO the respondent, so it seals itself, and everything
    // else waits for them to press Submit. Reading `endedEarly` here instead made a
    // `Go to -> Submit` fire on a BLUR — click out of a text box and the response was gone.
    if (outcome && endsWithoutSubmit(outcome)) {
      void this.endEarly(outcome);
    }
  }

  /**
   * The verdict these answers have already reached.
   *
   * A pure query — it decides, it does not act. {@link endEarly} is the command half, and keeping
   * them apart is what lets the command be awaited without the decision being re-made every time
   * control comes back.
   *
   * The ONE place this component resolves an outcome, read by both paths a finished form can
   * take: sealed by a screening, or submitted by the respondent. They used to be two calls to two
   * different resolvers — this one, and `resolveEndingScreen` on the submit path, which resolves
   * by CONDITION and knows nothing about a jump's named target. So a rule saying "Go to -> Thanks
   * for applying" showed that screen when it sealed itself and a different one when the
   * respondent pressed Submit.
   *
   * No phase guard: WHEN it is fair to ask is the caller's business, and the submit path asks
   * after the phase has already left `ready`.
   */
  private outcomeForAnswers(): FormOutcome | undefined {
    const def = this.definition();
    const rt = this.runtime();
    if (!def || !rt) {
      return undefined;
    }
    // `visibleAnswers()`, not the raw map — the set this widget will SEND, which is the set the
    // server judges. The score already folded over the visible questions while the conditions were
    // read from the raw map, so the two halves of this one expression disagreed: a knockout could
    // fire here on an answer to a question the respondent had since hidden, be omitted from the
    // payload, and leave the server writing `Complete` — SubmittedAt stamped, quota counted, every
    // on-submit automation fired — while the respondent was shown the knockout screen.
    // The server's view — the answers it will receive AND the question set it will derive from
    // them. Using the rendered question list here instead was the divergence: an orphaned question
    // stays "visible" on the client when the rule that reveals it reads an answer that is no
    // longer being sent.
    const sent = rt.transmittedView();
    return resolveFormOutcome(def.pages, def.endScreens ?? [], sent.answers, {
      score: computeScore(sent.questions, sent.answers),
    });
  }

  /**
   * End the form on a knockout (C3) — the whole point of a disqualification is that an
   * ineligible respondent does not fill the rest in first.
   *
   * THE ORDER HERE IS THE FEATURE. This client-side verdict is a courtesy; the enforcement is
   * the server re-evaluating the same shared rule on the save below and writing
   * `Status = 'Disqualified'`. That makes this one save the only thing standing between a
   * knockout and a response row that still claims to be an abandoned `Partial` — and it can be
   * lost two ways that both pass a hand test:
   *
   *   - `savePartial()` no-ops unless the phase is still 'ready', and `flushNow()` yields
   *     before issuing its write whenever a save is already in flight. Firing it unawaited and
   *     setting the phase in the same tick therefore dropped the write exactly when the
   *     respondent had been typing, and worked whenever the autosave happened to be idle.
   *   - `window.location.assign` aborts requests still on the wire, so navigating first
   *     cancels it.
   *
   * So: bank while intake still permits it, await that, and only then show the screen and
   * follow the redirect — the same order {@link applySubmitResult} uses on the submit path.
   * The respondent waits one round trip before the screen appears, which is the correct trade:
   * the alternative is telling them they are screened out while quietly recording nothing.
   *
   * Fail-soft like every autosave — `flushNow()` never throws — so a failed bank still shows
   * the screen rather than stranding the respondent mid-form.
   */
  private async endEarly(outcome: FormOutcome): Promise<void> {
    this.endingEarly = true;
    // Quiesce the autosave before writing, so two requests never carry the same
    // `clientResponseId` — the primary-key collision the submit path guards the same way.
    await this.autosave?.settle();
    await this.sealEarlyEnd();
    // Disqualifying or not, the client does the SAME thing here: seal a completion and show the
    // screen. Which status gets written is the server's call, from the same shared outcome — an
    // ending jump to an unflagged screen is an ordinary completion (quota counts it, automations
    // fire) and only the screen differs. Deciding that twice, once per side, is how a respondent
    // ends up looking at a knockout screen while the row says `Complete`.
    this.endingScreen.set(outcome.screen);
    this.phase.set('done');
    const redirectUrl = outcome.screen?.redirectURL?.trim();
    if (redirectUrl) {
      this.redirect(redirectUrl);
    }
  }

  /**
   * Record the knockout: ONE finished submission, sent before the form leaves intake.
   *
   * A finished submission, not an autosave, because only a completion seals a knockout
   * server-side — a partial deliberately does not, since the rule would otherwise be judged on
   * whatever half-typed value the debounce happened to catch. For this respondent the form IS
   * over, so a completion is also the honest description of it.
   *
   * Fail-soft, like every other background write here. A captcha-gated form whose challenge is
   * unsolved lands in the catch — the server refuses a completion without a token — and the row
   * keeps whatever its last autosave left. Showing the respondent their screen anyway is the
   * better half of that trade; stranding them mid-form to protect a record is not.
   */
  private async sealEarlyEnd(): Promise<void> {
    const def = this.definition();
    const rt = this.runtime();
    if (!def || !rt) {
      return;
    }
    // Don't send a completion the server is certain to refuse. The captcha gate applies to every
    // completion, and a knockout can fire long before the challenge is solved — `onSubmit` makes
    // this same check, and skipping it here meant a captcha-gated form could never record one.
    if (this.submitAllowed() && (await this.trySeal(def, rt))) {
      return;
    }
    // The seal did not land. Bank what exists as a draft so the knockout ANSWER survives even
    // though its status did not — `settle()` above cancelled the pending debounce without firing
    // it, and nothing else will write: the latch is set and every other entry point returns early.
    await this.autosave?.flushNow();
  }

  /**
   * One attempt at the terminal write. True when the server accepted it.
   *
   * `submitResponse` RESOLVES with `success: false` for anything the pipeline refuses — a
   * captcha, the row ceiling, a rate limit — and throws only on a transport failure. A bare
   * `try/catch` therefore treated every refusal as a successful seal, silently, which is the
   * worst of the three possible outcomes: no record, and nothing anywhere saying so.
   */
  private async trySeal(def: PublishedFormDefinition, rt: FormRuntime): Promise<boolean> {
    try {
      const res = await this.api.submitResponse(this.buildSubmission(def, rt, false), this.responseTarget());
      if (res.success) {
        if (res.responseId) {
          this.responseId = res.responseId;
        }
        return true;
      }
      const why = (res.errors ?? []).map((e) => e.message).join(' ').trim();
      console.warn(`[mj-form] the disqualification could not be recorded: ${why || 'refused'}`);
      return false;
    } catch (err) {
      console.warn(`[mj-form] the disqualification could not be recorded: ${String(err)}`);
      return false;
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
    // the widget already knows — and every other validation rule here answers inline. Same sentence
    // as the server's, from the shared contract, so the two cannot drift into disagreeing about it.
    //
    // BEFORE the captcha gate, deliberately: this refusal costs the respondent nothing to act on,
    // while a challenge costs them work. Ordered the other way, someone who answered nothing solves
    // a captcha first and only then learns they had to answer a question — two rounds of their
    // effort to deliver one fact the widget already had.
    //
    // BEFORE the phase flip below, also deliberately: this is a refusal to START, not a failed
    // submit, so the form must stay exactly where it was rather than settling the autosave and
    // rebuilding its children for a request that is never sent.
    if (rt.wouldSubmitNothing()) {
      this.refuseWithNothingToSubmit();
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
   * Raise the #124 refusal and take the respondent to it.
   *
   * Rendering alone is not answering them: the banner is at the top of the shell and Submit is at
   * the bottom of a scroll-mode form, so a press produced no visible change whatever for a sighted
   * respondent looking at the button. Focus both moves the viewport and announces, which is what
   * the widget's other blocked path (`onNext` -> `touchAll`) achieves by annotating the offending
   * field — an option this refusal does not have, because no single field is at fault.
   */
  private refuseWithNothingToSubmit(): void {
    this.errorText.set(NOTHING_TO_SUBMIT_MESSAGE);
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
    if (outcome.phase === 'done') {
      // The draft is sealed: tell the page so it can drop the device pointer. Reopening the public
      // link on this browser afterwards must show a FRESH form — the response is finished, and a
      // multi-use link is meant to be fillable again. The sealed answers stay reachable only
      // through a link the respondent was sent.
      this.emitHostEvent('mjf-submitted', { responseId: res.responseId });
    }
    if (!res.success) {
      const message = (res.errors ?? []).map((e) => e.message).join(' ').trim();
      if (message) {
        this.errorText.set(message);
        this.handlePossibleTurnstileFailure(message);
      }
      return;
    }
    if (res.status === 'Disqualified') {
      // The SERVER screened this respondent out on a rule the client had not reached: the last
      // question before Submit, a client that never fired a commit, or a caller with no widget at
      // all. Do not re-resolve the ending — `resolveEndingScreen` deliberately excludes knockout
      // screens, so it would pick one written for someone who QUALIFIED, and `endingRedirect`
      // would then fall back to that screen's URL and send a screened-out respondent to the
      // qualified destination. The server sent the knockout's own copy and redirect; they are the
      // only correct answer here, and `confirmationMessage()` already prefers the echoed one.
      this.endingScreen.set(undefined);
      if (res.redirectUrl) {
        this.redirect(res.redirectUrl);
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

  /**
   * Pick the ending screen for the answers as submitted.
   *
   * Through {@link outcomeForAnswers}, which reads the payload the server will judge AND honours
   * a `Go to` that named a screen. It used to call `resolveEndingScreen` directly — condition
   * banding only — so a terminal jump's destination was simply lost on the manual-submit path:
   * the same rule showed one screen when it sealed itself and another when the respondent
   * pressed Submit.
   */
  private resolveEnding(): void {
    this.endingScreen.set(this.outcomeForAnswers()?.screen);
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
      this.announceFirstPartial(res.responseId);
    }
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
   * Whether the server recorded this response as a screening rather than a completion.
   *
   * Read from the RESULT, not from the client's own verdict, because the server sees knockouts the
   * client never evaluated — a rule on the last question before Submit, or a caller with no widget.
   */
  protected readonly screenedOut = computed(() => this.result()?.status === 'Disqualified');

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
    // A screening never falls back to the form's confirmation. The server sends a redirect OR a
    // message, never both, so a knockout carrying a redirect arrives here with nothing echoed —
    // and the form-wide default is "your response has been recorded", which is untrue of a
    // knockout on both counts. A redirect usually makes this a flash; a blocked or slow
    // navigation makes it the resting state, and it must not be a thank-you either way.
    if (this.screenedOut()) {
      return SCREENED_OUT_MESSAGE;
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
