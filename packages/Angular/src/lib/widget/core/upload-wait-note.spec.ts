/**
 * The note beside Submit (or Next) while a file on the current step is still uploading.
 *
 * Submit was already safe to press mid-upload — the widget waits and says "Saving your file…" (#248)
 * — but nothing said so BEFORE the press. A respondent who saw a spinner on the last question had
 * to guess whether pressing Submit would lose the file; the one who reported this guessed, pressed,
 * and on a widget without the wait lost it. The note answers that question where they are looking.
 */
import { describe, expect, it } from 'vitest';

import { uploadWaitNote } from './upload-wait-note';

describe('uploadWaitNote', () => {
  it('says nothing when no file on the step is uploading', () => {
    expect(uploadWaitNote({ uploading: false, isLast: true })).toBeNull();
    expect(uploadWaitNote({ uploading: false, isLast: false })).toBeNull();
  });

  it('on the last step, tells the respondent Submit is safe and what it will do', () => {
    expect(uploadWaitNote({ uploading: true, isLast: true })).toBe(
      'Your file is still uploading. You can press Submit — your response is sent once the file is saved.',
    );
  });

  it('on an earlier step, says the same about Next', () => {
    expect(uploadWaitNote({ uploading: true, isLast: false })).toBe(
      'Your file is still uploading. You can press Next — you move on once the file is saved.',
    );
  });
});
