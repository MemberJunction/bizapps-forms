/**
 * The Responses table as a view of one `ResponseQuery` (UI audit F08).
 *
 * Behaviour through the component's own class (it has no injected dependencies), plus source-text
 * smoke for template facts a node suite cannot render: the sort is announced, the header is sticky,
 * and the "search the loaded responses" wording and the status chips are gone.
 */
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormsResponseListComponent, SEARCH_DEBOUNCE_MS, responseCountLine } from './response-list.component';
import { DEFAULT_RESPONSE_QUERY, type ResponseQuery } from './responses-query';

afterEach(() => {
  vi.useRealTimers();
});

function list(query: ResponseQuery = DEFAULT_RESPONSE_QUERY, total = 217): { c: FormsResponseListComponent; emitted: ResponseQuery[] } {
  const c = new FormsResponseListComponent();
  c.Query = query;
  c.Total = total;
  c.Rows = [];
  const emitted: ResponseQuery[] = [];
  c.QueryChange.subscribe((q) => emitted.push(q));
  return { c, emitted };
}

describe('FormsResponseListComponent', () => {
  it('sends a search once typing pauses, from page 1', () => {
    vi.useFakeTimers();
    const { c, emitted } = list({ ...DEFAULT_RESPONSE_QUERY, page: 4 });
    c.OnSearchInput('a');
    c.OnSearchInput('an');
    c.OnSearchInput('ann');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    expect(emitted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(emitted).toEqual([{ ...DEFAULT_RESPONSE_QUERY, search: 'ann', page: 1 }]);
  });

  it('flips the Submitted sort and says which way it is sorted', () => {
    const { c, emitted } = list();
    expect(c.SubmittedSort()).toBe('descending');
    c.ToggleSort();
    expect(emitted).toEqual([{ ...DEFAULT_RESPONSE_QUERY, sort: 'oldest', page: 1 }]);
  });

  it('pages forward and back, and never past either end', () => {
    const { c, emitted } = list({ ...DEFAULT_RESPONSE_QUERY, page: 1 }, 30);
    c.GoToPage(0);
    c.GoToPage(2);
    c.GoToPage(3);
    expect(emitted).toEqual([{ ...DEFAULT_RESPONSE_QUERY, page: 2 }]);
  });

  it('changes the page size from page 1', () => {
    const { c, emitted } = list({ ...DEFAULT_RESPONSE_QUERY, page: 3 });
    c.SetPageSize('100');
    expect(emitted).toEqual([{ ...DEFAULT_RESPONSE_QUERY, pageSize: 100, page: 1 }]);
  });

  it('ignores a page size the server does not offer', () => {
    const { c, emitted } = list();
    c.SetPageSize('37');
    expect(emitted).toEqual([]);
  });

  it('says where the page sits in the whole', () => {
    const { c } = list({ ...DEFAULT_RESPONSE_QUERY, page: 9, pageSize: 25 }, 217);
    expect(c.RangeLine()).toBe('201–217 of 217');
  });

  it('counts the whole list, or the matches while searching', () => {
    expect(responseCountLine(217, '')).toBe('217 responses');
    expect(responseCountLine(1, '')).toBe('1 response');
    expect(responseCountLine(3, 'ann')).toBe('3 responses match “ann”');
    expect(responseCountLine(0, 'ann')).toBe('No responses match “ann”');
  });
});

describe('the response table template (source-text smoke)', () => {
  const source = readFileSync(join(__dirname, 'response-list.component.ts'), 'utf8');

  it('announces the Submitted sort to screen readers', () => {
    expect(source).toContain('[attr.aria-sort]="SubmittedSort()"');
  });

  it('keeps the header in view while the rows scroll', () => {
    expect(source).toMatch(/thead th \{[^}]*position: sticky;[^}]*top: 0;/);
  });

  it('no longer says it searches only the loaded responses, and has no status chips', () => {
    expect(source).not.toContain('Search the loaded responses');
    expect(source).not.toContain('Filter by status');
    expect(source).not.toContain('Load more');
  });

  it('caps the search box at what the server accepts', () => {
    expect(source).toContain('[attr.maxlength]="maxSearchLength"');
  });
});
