import { describe, it, expect } from 'vitest';
import type { FormSubmissionResult } from '@mj-biz-apps/forms-entities';
import { outcomeForResult, shouldIgnoreSubmit, type WidgetPhase } from './submit-phase';

describe('shouldIgnoreSubmit (double-submit guard)', () => {
  it('ignores re-entrant submits while submitting or already done', () => {
    expect(shouldIgnoreSubmit('submitting')).toBe(true);
    expect(shouldIgnoreSubmit('done')).toBe(true);
  });

  it('allows a submit from ready / error', () => {
    const allow: WidgetPhase[] = ['ready', 'error', 'loading'];
    for (const p of allow) {
      expect(shouldIgnoreSubmit(p)).toBe(false);
    }
  });

  it('ignores a submit once the session has expired — nothing sent with that token can succeed', () => {
    // bizapps-forms#123: the session JWT has lapsed and MJ issues no refresh tokens, so a submit
    // from here is not a retry, it is a guaranteed 401. The phase is terminal, like `done`.
    expect(shouldIgnoreSubmit('expired')).toBe(true);
  });
});

describe('outcomeForResult (done-transition)', () => {
  it('a successful result with NO redirect reaches done and does not redirect', () => {
    const res: FormSubmissionResult = { success: true, responseId: 'r1', status: 'Complete' };
    expect(outcomeForResult(res)).toEqual({ phase: 'done', redirect: false });
  });

  it('a successful result WITH a redirect reaches done AND redirects', () => {
    const res: FormSubmissionResult = { success: true, responseId: 'r1', redirectUrl: 'https://x/y' };
    expect(outcomeForResult(res)).toEqual({ phase: 'done', redirect: true });
  });

  it('a failed result returns to ready (never done), never redirects', () => {
    const res: FormSubmissionResult = { success: false, errors: [{ message: 'bad' }] };
    expect(outcomeForResult(res)).toEqual({ phase: 'ready', redirect: false });
  });

  it('an empty success (no id, no redirect) still reaches the confirmation screen', () => {
    // Regression: a scroll-mode submit that returns success must show the thank-you screen.
    const res: FormSubmissionResult = { success: true };
    expect(outcomeForResult(res).phase).toBe('done');
  });
});
