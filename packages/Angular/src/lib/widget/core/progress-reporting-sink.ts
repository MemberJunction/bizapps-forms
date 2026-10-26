/**
 * The answer sink the upload store writes through, made to report progress after every write.
 *
 * File answers bypass the view on purpose: the store commits them straight into the runtime when an
 * upload lands (#248, #333), because the question component that started the upload may be gone by
 * then. The view's `valueChange` is what pings autosave for every other answer, so a file answer
 * committed this way never reached it and the draft on the server stayed without the file until some
 * other field blurred (F4).
 *
 * Progress is therefore reported at the commit. This is the one place every file-answer write passes
 * through, a successful upload and a clear alike, so wrapping the sink covers both without the store
 * or the autosave controller learning about each other.
 */
import type { UploadAnswerSink } from './upload-store';

export function progressReportingSink(runtime: UploadAnswerSink, onProgress: () => void): UploadAnswerSink {
  return {
    setValue(questionId, value) {
      runtime.setValue(questionId, value);
      onProgress();
    },
  };
}
