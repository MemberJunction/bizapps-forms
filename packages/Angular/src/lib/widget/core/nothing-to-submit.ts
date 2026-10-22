import type { FormRuntime } from './form-runtime';
import type { FormUploadStore } from './upload-store';

/**
 * Whether a submit would carry no answer at all, counting uploads still on their way.
 *
 * A pending upload on a VISIBLE question is an answer on its way: the upload store holds `null`
 * for a file question until its upload succeeds, so the runtime alone calls the form blank. This
 * predicate lets that submit fall through to the upload wait in `MjFormComponent`
 * (`uploadsLanded`), which waits for the upload or restarts an `unsaved` one. A pending upload on
 * a HIDDEN question does not count, because a hidden answer is never sent.
 *
 * `FormRuntime.wouldSubmitNothing` stays the server's verdict and free of upload state on purpose:
 * the runtime does not know the store. `wouldSubmitNothing()` is read first so the common case
 * (something answered) does no store read.
 */
export function nothingToSubmit(runtime: FormRuntime, uploads: FormUploadStore): boolean {
  return (
    runtime.wouldSubmitNothing() &&
    !uploads.hasPendingAmong(runtime.visibleAnswerableQuestions().map((q) => q.id))
  );
}
