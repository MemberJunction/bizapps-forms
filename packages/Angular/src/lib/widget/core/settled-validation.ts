/**
 * Judge a set of questions only once their uploads have landed (#248).
 *
 * A Doodle or FileUpload has no answer while its file is on the wire — the store writes the file
 * id only when the upload succeeds. So a Next tapped mid-upload used to touch the question, find
 * it empty, and tell the respondent their drawing was "required" while it was still saving.
 *
 * Waiting first and touching after is the whole point: touching is what makes an error visible,
 * so nothing is touched until there is an answer to judge. The wait is bounded by the store —
 * `whenSettled` resolves on success, on a failure once the capped retries are spent, on a clear
 * and on a reload, and never rejects.
 *
 * A question whose upload FAILED is a problem of its own kind. It blocks the step even when it is
 * optional (a drawing that did not save is not a skipped drawing), and it is never touched: the
 * question already shows the quiet "Your file did not save…" line, and "This question is
 * required." beside it would tell a respondent who did draw something that they did not.
 */
import type { PublishedFormQuestion } from '@mj-biz-apps/forms-entities/contracts';

import type { FormRuntime } from './form-runtime';
import type { FormUploadStore } from './upload-store';

/**
 * Restarts `questions`' spent uploads, waits for every upload among them, then touches the ones
 * that have no upload failure and returns whether all of them are valid with none failed.
 *
 * The restart is here, not only in mj-form's submit, because pressing Next or Submit again is the
 * respondent saying "try again" — and for a REQUIRED question the renderer refuses on the empty
 * answer before any submit is emitted, so a restart that lived only downstream would never run.
 * mj-form keeps its own for the Scroll last-section Next, which emits submit without judging.
 */
export async function judgeWhenSettled(
  store: FormUploadStore,
  runtime: FormRuntime,
  questions: readonly PublishedFormQuestion[],
): Promise<boolean> {
  await settleUploads(store, questions);
  return judgeSettled(store, runtime, questions);
}

/** The waiting half of {@link judgeWhenSettled}: restart spent uploads, then wait for all of them. */
async function settleUploads(store: FormUploadStore, questions: readonly PublishedFormQuestion[]): Promise<void> {
  const ids = questions.map((question) => question.id);
  store.retryUnsaved(ids);
  await store.whenSettled(ids);
}

/**
 * The judging half of {@link judgeWhenSettled}: touch what can be judged and return the verdict.
 * Split out so {@link StepJudge} can drop a stale verdict BEFORE it touches anything.
 */
function judgeSettled(store: FormUploadStore, runtime: FormRuntime, questions: readonly PublishedFormQuestion[]): boolean {
  const judgeable = questions.filter((question) => store.failureAmong([question.id]) === null);
  runtime.touchAll(judgeable);
  return judgeable.length === questions.length && runtime.areValid(questions);
}

/**
 * The first of `questions` the respondent must fix — an upload failure or a validation error — or
 * null. A pure read; the renderer focuses it after an `invalid` verdict.
 *
 * It reads `errorFor`, not the touched-gated `visibleErrorFor`, so it finds a question the judge
 * deliberately left untouched; and it counts upload failures, which `errorFor` cannot see on an
 * optional question. Same two facts the verdict is made of, so a refusal always has a target.
 */
export function firstProblemIn(
  store: FormUploadStore,
  runtime: FormRuntime,
  questions: readonly PublishedFormQuestion[],
): PublishedFormQuestion | null {
  return (
    questions.find((question) => store.failureAmong([question.id]) !== null || runtime.errorFor(question) !== null) ??
    null
  );
}

/**
 * What a renderer may do with a step's verdict. `stale` means act on nothing: the verdict
 * belongs to a moment that has passed.
 */
export type StepVerdict = 'valid' | 'invalid' | 'stale';

/**
 * {@link judgeWhenSettled} for a renderer's Next, which can now take seconds — up to the whole
 * retry schedule — and so can be tapped again, or walked away from, before it answers.
 *
 * Two guards, each closing a failure the other does not:
 *
 * - One judgement at a time PER STEP. A second tap on a step whose judgement is still waiting is
 *   `stale` at once. Without this, both taps resume on the same step after the upload lands and
 *   both advance (or, on the last step, both emit submit), skipping a step the respondent never
 *   saw. Keyed by step, not one flag for the renderer: the scrim blocks the pointer but not the
 *   keyboard, so a respondent can go Back during the wait, and Next on THAT step must not be
 *   swallowed by a judgement about the step they left.
 * - Still on the step that was judged. A respondent who taps Back during the wait has moved on;
 *   advancing from wherever they are now would be acting on a verdict about a different screen.
 *   Checked before anything is touched, so a stale verdict leaves no "required" errors behind on
 *   the abandoned step.
 *
 * One instance per renderer; it holds the in-flight steps, so it must not be shared.
 */
export class StepJudge {
  private readonly judging = new Set<string | null>();

  /** `stepId` reads the renderer's current step — the section or question on screen — or null. */
  public constructor(
    private readonly store: FormUploadStore,
    private readonly stepId: () => string | null,
  ) {}

  public async judge(runtime: FormRuntime, questions: readonly PublishedFormQuestion[]): Promise<StepVerdict> {
    const judgedStep = this.stepId();
    if (this.judging.has(judgedStep)) {
      return 'stale';
    }
    this.judging.add(judgedStep);
    try {
      await settleUploads(this.store, questions);
      if (this.stepId() !== judgedStep) {
        return 'stale';
      }
      return judgeSettled(this.store, runtime, questions) ? 'valid' : 'invalid';
    } finally {
      this.judging.delete(judgedStep);
    }
  }

  /** {@link firstProblemIn} against this judge's store. */
  public firstProblemIn(runtime: FormRuntime, questions: readonly PublishedFormQuestion[]): PublishedFormQuestion | null {
    return firstProblemIn(this.store, runtime, questions);
  }
}
