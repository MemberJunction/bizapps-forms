/**
 * The note beside the primary button while a file on the current step is still uploading.
 *
 * Pressing Submit (or Next) mid-upload is safe — the widget waits for the file before it sends or
 * moves on (#248) — but nothing said so before the press, so a respondent looking at a spinner had
 * to guess whether the press would lose their file. This says it where they are looking. Both
 * renderers use it, so the two cannot word it differently.
 */
export function uploadWaitNote(state: { uploading: boolean; isLast: boolean }): string | null {
  if (!state.uploading) {
    return null;
  }
  return state.isLast
    ? 'Your file is still uploading. You can press Submit — your response is sent once the file is saved.'
    : 'Your file is still uploading. You can press Next — you move on once the file is saved.';
}
