import { describe, expect, it } from 'vitest';
import { failureMessage } from './failure-message';

describe('failureMessage', () => {
  it('keeps the action and appends the error message, so the reader learns what failed', () => {
    expect(failureMessage(new Error('GraphQL Error (Code: unknown)'), 'Failed to load the report.')).toBe(
      'Failed to load the report: GraphQL Error (Code: unknown)',
    );
  });

  it('returns the action unchanged when the thrown value is not an Error', () => {
    expect(failureMessage('boom', 'Failed to load forms.')).toBe('Failed to load forms.');
    expect(failureMessage(undefined, 'Export failed.')).toBe('Export failed.');
  });

  it('returns the action unchanged when the Error message is blank', () => {
    expect(failureMessage(new Error('   '), 'Failed to load the response.')).toBe('Failed to load the response.');
    expect(failureMessage(new Error(''), 'Export failed.')).toBe('Export failed.');
  });

  it('leaves an action without a trailing period intact', () => {
    expect(failureMessage(new Error(' timeout '), 'Export failed')).toBe('Export failed: timeout');
  });
});
