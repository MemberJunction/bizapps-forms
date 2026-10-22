import type { FormUploadStore, UploadToken } from '../../core/upload-store';
import type { DoodleCapture, DoodleExportSink } from './doodle-pad.component';

/**
 * The doodle pad's exports, wired to the upload store by the subject each one names (#333).
 *
 * `started` reserves the question, so Next and Submit wait on a drawing still being encoded
 * instead of advancing past it. `delivered` hands the capture — the file AND the subject it was
 * drawn for — to `upload`, the ordinary file-answer path, whose upload supersedes the reservation; `released` ends a reservation that produced no
 * file, with the pad's own token, so a stale one is ignored.
 *
 * Every call is keyed by the subject the pad passed, and nothing here can read which question a
 * view is bound to now. The pad calls these after an await — often after the question component
 * is destroyed, or, in OneQuestion mode, re-pointed at the next Doodle question, where reading the
 * current question filed the first one's drawing as the second one's answer.
 *
 * A plain function of the store rather than a field on the question component so the delivery
 * guard can be RUN: the component uses `inject()` and cannot be built in this package's node test
 * environment, and a source-reading spec cannot tell a guard that returns from one that does not
 * (`doodle-export-sink.spec.ts`).
 */
export function doodleExportSink(
  uploads: FormUploadStore,
  upload: (capture: DoodleCapture) => Promise<void>,
): DoodleExportSink<UploadToken> {
  return {
    started: (subject) => uploads.reserve(subject),
    delivered: async (capture, reservation) => {
      // A teardown (`dispose`) or reload (`connect`) during the encode retired the reservation.
      // The export is dropped then, as the old `output()` emit was: after a teardown there is no
      // answer sink to commit to, and after a reload this drawing belongs to a response that no
      // longer exists. A newer stroke or Clear retires it too, but the pad's claim stops those first.
      if (!uploads.isCurrent(reservation)) {
        return;
      }
      await upload(capture);
    },
    released: (reservation) => uploads.release(reservation),
  };
}
