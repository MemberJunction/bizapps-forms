/**
 * Which state the Forms home list shows.
 *
 * The defect (UI audit F10): a failed load left `forms` empty, so the page showed the error banner
 * AND "No forms yet" with a New form button — a claim about the data the page could not make, and
 * no way to try again. When every form was archived it read: No forms match “”.
 */
import { describe, expect, it } from 'vitest';
import { homeListState, type HomeListInput } from './home-list-state';

const base: HomeListInput = { loading: false, failed: false, total: 0, archived: 0, visible: 0, query: '', showArchived: false };

describe('homeListState', () => {
  it('shows loading while the list is read', () => {
    expect(homeListState({ ...base, loading: true, failed: true })).toBe('loading');
  });

  it('shows the failed state, never "No forms yet", when the first read failed', () => {
    expect(homeListState({ ...base, failed: true })).toBe('failed');
  });

  it('keeps a list already on screen when a later reload fails', () => {
    expect(homeListState({ ...base, failed: true, total: 4, visible: 4 })).toBe('list');
  });

  it('shows first run when there really are no forms', () => {
    expect(homeListState(base)).toBe('first-run');
  });

  it('says every form is archived instead of matching an empty search', () => {
    expect(homeListState({ ...base, total: 5, archived: 5 })).toBe('all-archived');
  });

  it('is a search miss when a query hides everything', () => {
    expect(homeListState({ ...base, total: 5, query: 'zz' })).toBe('no-match');
    expect(homeListState({ ...base, total: 5, archived: 5, query: 'zz' })).toBe('no-match');
  });

  it('ignores a query of only spaces', () => {
    expect(homeListState({ ...base, total: 5, archived: 5, query: '   ' })).toBe('all-archived');
  });

  it('shows the list when anything is visible', () => {
    expect(homeListState({ ...base, total: 5, visible: 3 })).toBe('list');
  });
});
