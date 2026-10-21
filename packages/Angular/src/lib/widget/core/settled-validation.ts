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
 */
import type { PublishedFormQuestion } from '@mj-biz-apps/forms-entities/contracts';

import type { FormRuntime } from './form-runtime';
import type { FormUploadStore } from './upload-store';

/** Waits for `questions`' uploads, then marks them touched and returns whether they are all valid. */
export async function judgeWhenSettled(
  store: FormUploadStore,
  runtime: FormRuntime,
  questions: readonly PublishedFormQuestion[],
): Promise<boolean> {
  await store.whenSettled(questions.map((question) => question.id));
  runtime.touchAll(questions);
  return runtime.areValid(questions);
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
 * - One judgement at a time. A second tap while the first is still waiting is `stale` at once.
 *   Without this, both taps resume on the same step after the upload lands and both advance (or,
 *   on the last step, both emit submit), skipping a step the respondent never saw.
 * - Still on the step that was judged. A respondent who taps Back during the wait has moved on;
 *   advancing from wherever they are now would be acting on a verdict about a different screen.
 *
 * One instance per renderer; it holds the in-flight flag, so it must not be shared.
 */
export class StepJudge {
  private judging = false;

  /** `stepId` reads the renderer's current step — the section or question on screen — or null. */
  public constructor(
    private readonly store: FormUploadStore,
    private readonly stepId: () => string | null,
  ) {}

  public async judge(runtime: FormRuntime, questions: readonly PublishedFormQuestion[]): Promise<StepVerdict> {
    if (this.judging) {
      return 'stale';
    }
    const judgedStep = this.stepId();
    this.judging = true;
    try {
      const valid = await judgeWhenSettled(this.store, runtime, questions);
      if (this.stepId() !== judgedStep) {
        return 'stale';
      }
      return valid ? 'valid' : 'invalid';
    } finally {
      this.judging = false;
    }
  }
}
