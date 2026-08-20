import { describe, expect, it } from 'vitest';

import { STILL_WORKING_AFTER_MS, submitWaitMessage } from './submit-progress';

describe('submitWaitMessage', () => {
  it('says what is happening from the very first moment', () => {
    // Doherty: the click has to change something immediately or the respondent presses it
    // again. "Submitting…" on the button alone is easy to miss on a long form where the
    // button is below the fold of what they were last looking at.
    expect(submitWaitMessage(0)).toBe('Sending your response…');
    expect(submitWaitMessage(900)).toBe('Sending your response…');
  });

  it('escalates once the wait stops feeling instant', () => {
    // The dangerous moment is not the wait, it is the respondent deciding the page is broken
    // and closing it — which loses a form they have already filled in. Naming the situation
    // and asking them to stay is the cheapest possible insurance against that.
    expect(submitWaitMessage(STILL_WORKING_AFTER_MS)).toMatch(/still/i);
    expect(submitWaitMessage(STILL_WORKING_AFTER_MS)).toMatch(/keep this page open|don't close/i);
  });

  it('does not escalate a moment too early', () => {
    expect(submitWaitMessage(STILL_WORKING_AFTER_MS - 1)).toBe('Sending your response…');
  });

  it('never blames the respondent or promises a time it cannot keep', () => {
    for (const ms of [0, 2000, 5000, 30_000]) {
      const message = submitWaitMessage(ms);
      expect(message).not.toMatch(/\byour (connection|network|browser)\b/i);
      expect(message).not.toMatch(/\b\d+ seconds?\b/);
    }
  });
});
