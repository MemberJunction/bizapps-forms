import { describe, expect, it } from 'vitest';
import { FormUnavailableError, ResponseNotSavedError } from '../api/forms-api.interface';
import { failureDetail } from './failure-detail';

describe('failureDetail', () => {
  it('names the server\'s cause for a refusal whose message is the fixed sentence', () => {
    expect(failureDetail(new ResponseNotSavedError('refused (FORBIDDEN): not your link'))).toBe('refused (FORBIDDEN): not your link');
    expect(failureDetail(new FormUnavailableError('distribution-not-found'))).toBe('distribution-not-found');
  });

  it('falls back to name and message for any other error, and to the value itself for a non-error', () => {
    expect(failureDetail(new TypeError('boom'))).toBe('TypeError: boom');
    expect(failureDetail('plain')).toBe('plain');
  });
});
