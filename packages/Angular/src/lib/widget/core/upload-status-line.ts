/**
 * The line a file question shows while its upload runs.
 *
 * A pure function of the store's view so the wording is tested by behaviour: the question
 * component cannot be rendered in this package's node test environment.
 */
import type { UploadView } from './upload-store';

/**
 * "Uploading resume.pdf — 63%…" while bytes are going up, then "Saving resume.pdf…" once every
 * byte is sent and the server is storing the file.
 *
 * Never "100%": that measured bytes leaving the browser, and it stayed on screen for as long as the
 * server took to store the file, which a respondent reads as finished.
 */
export function uploadingLine(view: UploadView): string {
  if (view.phase === 'storing') {
    return `Saving ${view.fileName}…`;
  }
  const percent = view.progress === null ? null : Math.round(view.progress * 100);
  return percent === null ? `Uploading ${view.fileName}…` : `Uploading ${view.fileName} — ${percent}%…`;
}
