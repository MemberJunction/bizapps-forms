import { describe, it, expect } from 'vitest';
import { resolveResponsesView } from './responses-view-state';

/** The all-clear baseline: loaded, published, has rows, showing the list. */
const loaded = {
  loading: false,
  failed: false,
  isPublished: true,
  rowCount: 3,
  hasDetail: false,
};

describe('resolveResponsesView', () => {
  it('never claims a form was unpublished when the load simply failed', () => {
    // The regression: an API outage or a missing Read grant left `questions` null, and the
    // template read null as "never published" — telling an author their live,
    // response-collecting form had never been published.
    const view = resolveResponsesView({ ...loaded, failed: true, isPublished: false });
    expect(view).toBe('failed');
    expect(view).not.toBe('never-published');
  });

  it('keeps showing the spinner while a load is in flight, even after an earlier failure', () => {
    expect(resolveResponsesView({ ...loaded, loading: true, failed: true })).toBe('loading');
  });

  it('distinguishes "never published" from "published, nothing submitted yet"', () => {
    expect(resolveResponsesView({ ...loaded, isPublished: false, rowCount: 0 })).toBe(
      'never-published',
    );
    expect(resolveResponsesView({ ...loaded, rowCount: 0 })).toBe('no-responses');
  });

  it('shows an open response in preference to the list behind it', () => {
    expect(resolveResponsesView({ ...loaded, hasDetail: true })).toBe('detail');
  });

  it('shows the list once there is something to list', () => {
    expect(resolveResponsesView(loaded)).toBe('list');
  });

  it('keeps the list when it is a single response that failed to open, not the list itself', () => {
    // `failed` means "the load that populates THIS view failed". A detail-open failure
    // surfaces as a banner over the list the user can still see and retry from; treating it
    // as a whole-view failure would blank the list they were working in.
    expect(resolveResponsesView({ ...loaded, failed: false })).toBe('list');
  });
});
