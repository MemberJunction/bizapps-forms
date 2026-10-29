import { describe, expect, it } from 'vitest';
import { builderViewFromParams, builderViewToParams, homeViewFromParams, homeViewToParams, reportingViewFromParams, reportingViewToParams, urlNamesRecord } from './view-urls';
import { DEFAULT_RESPONSE_QUERY } from '../responses/responses-query';

/**
 * What each Forms surface keeps in its URL (UI audit F09: a reload or a shared link always landed
 * on the default view). Each codec is total: any params in, a valid view out, never a throw — a
 * mistyped or stale link opens the default for whatever part it got wrong.
 */
describe('Forms home in the URL', () => {
  it('keeps the search and the archived toggle, and leaves defaults out', () => {
    expect(homeViewToParams({ query: ' intake ', showArchived: true })).toEqual({ q: 'intake', archived: '1' });
    expect(homeViewToParams({ query: '', showArchived: false })).toEqual({ q: null, archived: null });
    expect(homeViewFromParams({ q: 'intake', archived: '1' })).toEqual({ query: 'intake', showArchived: true });
    expect(homeViewFromParams({ archived: 'yes' })).toEqual({ query: '', showArchived: false });
  });
});

describe('Responses & Analytics in the URL', () => {
  it('keeps the chosen form and view', () => {
    const id = '0F0F0F0F-0000-4000-8000-000000000001';
    expect(reportingViewToParams({ formId: id, view: 'responses' })).toEqual({ form: id, view: 'responses' });
    expect(reportingViewToParams({ formId: id, view: 'insights' })).toEqual({ form: id, view: null });
    expect(reportingViewFromParams({ form: id, view: 'responses' })).toEqual({ formId: id, view: 'responses' });
  });

  it('ignores a form id that is not an id, and an unknown view', () => {
    expect(reportingViewFromParams({ form: "x' OR 1=1", view: 'charts' })).toEqual({ formId: null, view: 'insights' });
  });
});

describe('the builder in the URL', () => {
  const responseId = 'ABCDEF01-0000-4000-8000-000000000002';

  it('keeps the tab as ?view=, never ?tab=, which Explorer\'s shell owns', () => {
    const params = builderViewToParams({ view: 'design', responses: { query: DEFAULT_RESPONSE_QUERY, responseId: null } });
    expect(params).toMatchObject({ view: 'design' });
    expect(params).not.toHaveProperty('tab');
  });

  it('carries the Responses table and the open response only on the Responses tab', () => {
    const responses = { query: { ...DEFAULT_RESPONSE_QUERY, search: 'ann', page: 2 }, responseId };
    expect(builderViewToParams({ view: 'responses', responses })).toEqual({ view: 'responses', q: 'ann', sort: null, page: '2', size: null, response: responseId });
    expect(builderViewToParams({ view: 'build', responses })).toEqual({ view: null, q: null, sort: null, page: null, size: null, response: null });
  });

  it('reads back what it wrote', () => {
    const view = { view: 'responses' as const, responses: { query: { ...DEFAULT_RESPONSE_QUERY, sort: 'oldest' as const }, responseId } };
    expect(builderViewFromParams(builderViewToParams(view) as Record<string, string>)).toEqual(view);
  });

  it('falls back to Build for an unknown view, and drops a response id that is not an id', () => {
    expect(builderViewFromParams({ view: 'nope', response: 'r-1' })).toEqual({ view: 'build', responses: { query: DEFAULT_RESPONSE_QUERY, responseId: null } });
  });
});

describe('whether a URL is this record\'s', () => {
  const id = 'A11C0DE0-0000-4000-8000-000000000003';
  it('matches the record segment, case-insensitively and encoded', () => {
    expect(urlNamesRecord(`/app/forms/record/MJ_BizApps_Forms%3A%20Forms/ID%7C${id.toLowerCase()}?view=design`, id)).toBe(true);
    expect(urlNamesRecord(`/app/forms/record/MJ_BizApps_Forms: Forms/ID|${id}`, id)).toBe(true);
  });
  it('does not match another record or a dashboard', () => {
    expect(urlNamesRecord('/app/forms/record/MJ_BizApps_Forms: Forms/ID|B11C0DE0-0000-4000-8000-000000000003', id)).toBe(false);
    expect(urlNamesRecord('/app/forms/Forms?q=x', id)).toBe(false);
  });
});
