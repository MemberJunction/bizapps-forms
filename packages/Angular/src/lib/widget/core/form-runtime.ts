/**
 * Headless runtime shared by both render modes. Holds the live answer map as a signal,
 * derives per-question/per-page visibility from the conditional rules (S2), tracks
 * validation + touched state, and computes the progress signal. Components read its
 * signals and call its mutators; it owns no DOM and no transport.
 */
import { computed, signal } from '@angular/core';
import {
  NOTHING_TO_SUBMIT_MESSAGE,
  resolveVisiblePages,
  answerCompleteness,
  isAnswerSupplied,
  rulesMayRead,
  settleVisibility,
  validateAnswer,
  validateAnswers,
  type AnswerProblem,
  type AnswerValue,
  type FormAnswerInput,
  type PublishedFormPage,
  type PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities/contracts';

import { toAnswerInputs, transmittedValue } from './answer-value';
import { computeProgress } from './progress';
import type { WidgetForm } from './widget-form';

/**
 * What an autosave would send: the storable answers, or — when a field it would have to leave out
 * is one a rule may read — nothing, with the fields that hold it.
 */
export type DraftInputs =
  | { readonly held: false; readonly answers: FormAnswerInput[] }
  | { readonly held: true; readonly unstorable: readonly string[] };

export class FormRuntime {
  private readonly answers = signal<Map<string, AnswerValue>>(new Map());
  private readonly touched = signal<Set<string>>(new Set());
  /**
   * What the server last refused, per question, from a submit's `Errors` (`QuestionID` → message).
   *
   * Kept apart from the client's own verdict because the server's refusal no longer names the
   * question in its text ("This question is required."): shown in a banner it says nothing about
   * which answer to fix. Shown under the field instead, and cleared the moment that answer changes —
   * the respondent's edit is what the refusal asked for.
   */
  private readonly serverErrors = signal<ReadonlyMap<string, string>>(new Map());

  /**
   * @param form what the widget holds — the live projection or the author's full draft. The runtime
   * renders, settles and validates from `form.render`, and asks `rulesMayRead` with `form` itself, so
   * whether an autosave may leave a field out is decided by the kind the load path declared.
   */
  constructor(private readonly form: WidgetForm) {}

  // --- Answer access -------------------------------------------------------

  public readonly answerMap = this.answers.asReadonly();

  /**
   * The RAW answer map — everything the respondent has entered, including answers to questions
   * that are currently hidden.
   *
   * Deliberately not the basis for any verdict, and it used to name ending-screen resolution as
   * its example consumer, which is exactly the call site that had to move off it: a verdict
   * reached here is reached on answers the widget will not transmit; every rule evaluates against
   * the SETTLED answers instead (`settleVisibility`, which `resolveResponseOutcome` runs over this
   * map). What remains true of this map is that it must keep the hidden answers — re-showing a
   * question should bring its answer back — which is precisely why it cannot also be the thing
   * rules read.
   *
   * Read-only by type so a caller cannot mutate the runtime's state behind its back: every
   * write goes through `setValue`, which is what keeps the derived signals correct.
   */
  public currentAnswers(): ReadonlyMap<string, AnswerValue> {
    return this.answers();
  }

  /**
   * Ids of the questions that currently hold a real answer.
   *
   * Uses the contract's `isAnswerSupplied` — the same "is this answered" definition the required
   * check and the conditional evaluator use — rather than "has a map entry", which a focused-then-
   * abandoned field also satisfies.
   */
  public answeredQuestionIds(): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const [questionId, value] of this.answers()) {
      if (isAnswerSupplied(value)) {
        ids.add(questionId);
      }
    }
    return ids;
  }

  public valueFor(questionId: string): AnswerValue {
    return this.answers().get(questionId);
  }

  public setValue(questionId: string, value: AnswerValue): void {
    if (this.serverErrors().has(questionId)) {
      const remaining = new Map(this.serverErrors());
      remaining.delete(questionId);
      this.serverErrors.set(remaining);
    }
    const next = new Map(this.answers());
    if (value === null || value === undefined) {
      next.delete(questionId);
    } else {
      next.set(questionId, value);
    }
    this.answers.set(next);
  }

  public markTouched(questionId: string): void {
    if (this.touched().has(questionId)) {
      return;
    }
    const next = new Set(this.touched());
    next.add(questionId);
    this.touched.set(next);
  }

  public isTouched(questionId: string): boolean {
    return this.touched().has(questionId);
  }

  // --- Visibility (conditional rules, S2) ---------------------------------

  /**
   * Pages the respondent can currently reach — page show rules AND forward jumps (C2), via
   * the shared resolver the server also uses.
   */
  public readonly visiblePages = computed<PublishedFormPage[]>(() => {
    return resolveVisiblePages(this.orderedPages(), this.visibility().answers);
  });

  /**
   * The questions the scroll renderer puts on THIS page, display-only types included.
   *
   * A slice of {@link renderedQuestions}, not its own derivation. It used to filter the page's
   * own list on the question's `show` rule alone, which meant a `Go to` rule changed what the
   * form submitted without changing what it displayed: the skipped question stayed on screen
   * with its required asterisk, was never validated (submit judges the flow's set), and
   * whatever was typed into it was dropped from the payload. Reading the walk is what keeps
   * "on screen" and "in the payload" the same sentence.
   */
  public visibleQuestions(page: PublishedFormPage): PublishedFormQuestion[] {
    const onThisPage = new Set(page.questions.map((q) => q.id));
    return this.renderedQuestions().filter((q) => onThisPage.has(q.id));
  }

  /**
   * The settled visibility the whole widget derives from — `settleVisibility`, the ONE derivation
   * the server runs over the payload too, so what renders, what is sent and what the server
   * re-derives from it are readings of one answer set. Why it is a fixed point, and why that is
   * what makes the two sides agree, is written down there.
   */
  private readonly visibility = computed(() => settleVisibility(this.form.render, this.answers()));

  /**
   * Whether this form's show rules settle for the current answers.
   *
   * False only on a form whose rules contradict each other (an `is not answered` rule revealing a
   * question whose own answer then hides it): visibility is then the last of a capped number of
   * derivations, and the server, settling the payload, may disagree with what is on screen. An
   * explicit signal rather than a console warning from inside the derivation, so the caller
   * decides whether and where to say so.
   */
  public readonly rulesSettle = computed(() => this.visibility().settled);

  /**
   * Every question that RENDERS, in document order — display-only types included.
   *
   * The one walk both renderers read, from the settled visibility rather than the raw map.
   */
  public readonly renderedQuestions = computed<PublishedFormQuestion[]>(
    () => this.visibility().rendered,
  );

  public readonly visibleAnswerableQuestions = computed<PublishedFormQuestion[]>(
    () => this.visibility().answerable,
  );

  /**
   * Whether the respondent has anything to fill in at all.
   *
   * Lives here rather than in each renderer so both spell the same predicate. A form of pure
   * Statement copy — or one whose every question is currently hidden by a show rule — has no
   * progress to report, and both render modes suppress the bar on exactly this fact.
   */
  public readonly hasAnswerableQuestions = computed(
    () => this.visibleAnswerableQuestions().length > 0,
  );

  // --- Validation ----------------------------------------------------------

  /**
   * Validation message for a question, or `null` when valid: the widget's own verdict first, else
   * what the server last refused about it ({@link showServerErrors}).
   */
  public errorFor(question: PublishedFormQuestion): string | null {
    return this.problemFor(question)?.message ?? this.serverErrors().get(question.id) ?? null;
  }

  /**
   * Put the server's per-question refusals under their fields, and mark those fields touched so the
   * message shows. Replaces the previous set: a new submit's refusals are the current ones.
   *
   * Display only — {@link areValid} and {@link isFormValid} stay the client's verdict, so a refusal the
   * respondent cannot act on (a file the server no longer vouches for) never locks the form.
   */
  public showServerErrors(errors: readonly { readonly questionId: string; readonly message: string }[]): void {
    this.serverErrors.set(new Map(errors.map((error) => [error.questionId, error.message])));
    this.touchAll(this.visibleAnswerableQuestions().filter((question) => this.serverErrors().has(question.id)));
  }

  /** Error shown in the UI only after the field has been touched. */
  public visibleErrorFor(question: PublishedFormQuestion): string | null {
    return this.isTouched(question.id) ? this.errorFor(question) : null;
  }

  /**
   * Per-sub-field errors for a composite, on the SAME touched gate as {@link visibleErrorFor} —
   * the two are one verdict shown two ways, so they must appear and clear together.
   *
   * `{}` when the question has no per-field problems, which includes every group-level failure;
   * the renderer reads that as "show the one message under the group instead".
   */
  public visiblePartErrorsFor(question: PublishedFormQuestion): Record<string, string> {
    if (!this.isTouched(question.id)) {
      return {};
    }
    return { ...(this.problemFor(question)?.parts ?? {}) };
  }

  /** True when every supplied list of questions currently validates. */
  public areValid(questions: PublishedFormQuestion[]): boolean {
    return questions.every((q) => this.problemFor(q) === undefined);
  }

  /** Mark a set of questions touched (e.g. on a failed next/submit) to surface errors. */
  public touchAll(questions: PublishedFormQuestion[]): void {
    const next = new Set(this.touched());
    for (const q of questions) {
      next.add(q.id);
    }
    this.touched.set(next);
  }

  /**
   * What the server would say about a final submit right now — `validateAnswers`, the same call
   * the server makes, over exactly the payload {@link buildAnswerInputs} would send.
   *
   * The pre-submit check (#303): the widget used to restate the server's rules — its own
   * per-field loop for validity, its own predicate for "nothing to submit" — and the restatements
   * drifted. Reading the server's verdict is what keeps "the button says ready" and "the server
   * accepts it" the same sentence.
   */
  private readonly submitVerdict = computed(() =>
    validateAnswers(this.form.render, this.buildAnswerInputs(), 'complete'),
  );

  /**
   * Whole-form validity: no QUESTION the respondent can see is in error.
   *
   * Question-scoped errors only. The one form-level error a respondent's own form can raise is
   * "nothing to submit", which is {@link wouldSubmitNothing}'s to report — a form of blank optional
   * questions has nothing wrong with any field.
   */
  public readonly isFormValid = computed(() =>
    this.submitVerdict().errors.every((error) => error.questionId === undefined),
  );

  // --- Progress ------------------------------------------------------------

  /**
   * How full the bar is: the fraction of the visible form that is filled in, reaching 1 only when
   * every visible answerable question is answered. The weighting — and why it is weighted — lives
   * in `progress.ts`.
   *
   * Requiredness is `isRequired`, the same judge `errorFor`/`isFormValid` use. It is a WEIGHT here,
   * not a finish line: this used to short-circuit to full the moment every required question was
   * satisfied, and a bar that reads 100% over eight blank questions tells the respondent they are
   * done when they are not (#88).
   *
   * "The respondent can submit" is {@link isFormValid}'s answer, not this one, and the renderers
   * show it as its own line beside the bar. Two facts, two signals — which is also why they may
   * legitimately disagree: an answered-but-malformed email holds the button while the bar counts
   * the answer, so the bar does not flicker under someone still typing.
   *
   * Visibility gates it: the map runs over `visibleAnswerableQuestions`, so a required question
   * hidden by its show rule is not counted against the bar. That makes the denominator a property
   * of the CURRENT path, so switching branches can move the bar down as well as up — deliberately.
   * The alternative, a high-water clamp, would hold 100% over a revealed required question, which
   * is the lie this is written to avoid.
   */
  public readonly progress = computed(() =>
    computeProgress(
      this.visibleAnswerableQuestions().map((q) => ({
        required: q.isRequired,
        completeness: answerCompleteness(q.type, this.valueFor(q.id)),
      })),
    ),
  );

  // --- Submission ----------------------------------------------------------

  /** Build the wire answers for all currently-visible answerable questions. */
  public buildAnswerInputs(): FormAnswerInput[] {
    return toAnswerInputs(this.visibleAnswerableQuestions(), this.answers());
  }

  /**
   * The AUTOSAVE payload: {@link buildAnswerInputs} minus every answer the server cannot store as a
   * draft — the same `validateAnswer` verdict, in `draft` mode, that the server applies — or HELD.
   *
   * Why leave a field out rather than send it (fix round 3, re-review N2): the server refuses a
   * draft WHOLE when one answer cannot be stored (a number `decimal(18,4)` cannot hold, an unreadable
   * date, a value past its ceiling), and autosave is fail-soft — so one bad field silently stopped
   * EVERY other answer from being saved for as long as it stayed wrong. Leaving it out keeps the rest
   * of the draft saving; the field shows its error under it ({@link errorFor}), and the final submit
   * still carries it and stays blocked by {@link areValid} until it is fixed. The cost: a previously
   * saved value for that one field is not kept while the field holds something unstorable.
   *
   * Why HOLD instead when a rule may read the field (fix round 4, re-review R3-1/R3-2): to a rule, a
   * field left out is a field nobody answered, so leaving it out changes what the server decides for
   * everything else — a question shown because of it is hidden and its saved row deleted, and an
   * `isNotAnswered` knockout on it ends the form. Nothing is sent then; the answers stay here until
   * the field is fixed. On the live form — a `projection` — every field counts as read
   * (`rulesMayRead`), because the projection has had the server's knockout, score and automation
   * rules removed; only the author's `full` draft can show that nothing reads a field.
   */
  public buildDraftInputs(): DraftInputs {
    const visible = this.visibleAnswerableQuestions();
    const unstorable = visible
      .filter((question) => validateAnswer(question, transmittedValue(question, this.valueFor(question.id)), 'draft') !== undefined)
      .map((question) => question.id);
    if (rulesMayRead(this.form, unstorable)) {
      return { held: true, unstorable };
    }
    const storable = visible.filter((question) => !unstorable.includes(question.id));
    return { held: false, answers: toAnswerInputs(storable, this.answers()) };
  }

  /**
   * Would a final submit right now store nothing, on a form that asked for something? (#124)
   *
   * The server refuses such a submission, so without this the respondent presses Submit, waits for
   * a round trip, and gets a banner — while every other rule in this widget blocks or annotates
   * inline. Read off {@link submitVerdict}, i.e. off the server's own rule rather than a restatement
   * of it, so it also inherits the server's exemptions: a form that asked NOTHING on this path
   * (pure `Statement` copy, or every answerable question hidden) is completable, and a whitespace-
   * only answer counts as no answer even though the payload builder transmits it.
   */
  public readonly wouldSubmitNothing = computed(() =>
    this.submitVerdict().errors.some((error) => error.message === NOTHING_TO_SUBMIT_MESSAGE),
  );

  /**
   * One question's verdict — `validateAnswer`, the call the server makes for each answer — over
   * the value that would be SENT (`transmittedValue`), which is what {@link isFormValid} judges
   * through the payload. Judging the held value here let the two disagree whenever the payload
   * conversion changed an answer.
   */
  private problemFor(question: PublishedFormQuestion): AnswerProblem | undefined {
    const sent = transmittedValue(question, this.valueFor(question.id));
    return validateAnswer(question, sent, 'complete');
  }

  private orderedPages(): PublishedFormPage[] {
    return [...this.form.render.pages].sort((a, b) => a.displayOrder - b.displayOrder);
  }
}

