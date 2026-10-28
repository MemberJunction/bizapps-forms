/**
 * Which state the report pane shows for the selected form.
 *
 * The defect (UI audit F01): a failed report left `report` null with no branch for it, so after
 * the reader dismissed the banner the pane was blank, with no way to try again. On the first
 * load the failure also reached MJ's host, which replaced the whole dashboard.
 */
import { describe, expect, it } from 'vitest';
import { reportState, type ReportStateInput } from './reporting-view-model';

const base: ReportStateInput = { loading: false, failed: false, unavailable: null, hasReport: false, hasResponses: false };

describe('reportState', () => {
  it('shows loading while a report is being read, whatever the previous outcome was', () => {
    expect(reportState({ ...base, loading: true, failed: true })).toBe('loading');
    expect(reportState({ ...base, loading: true, unavailable: 'Not yours.' })).toBe('loading');
  });

  it('shows the failed state, with its Retry, when the read failed', () => {
    expect(reportState({ ...base, failed: true })).toBe('failed');
  });

  it('prefers the failure over a refusal left from an earlier form', () => {
    expect(reportState({ ...base, failed: true, unavailable: 'Not yours.' })).toBe('failed');
  });

  it('shows the refusal when the summary is not available to this reader', () => {
    expect(reportState({ ...base, unavailable: 'Summary not available to you.' })).toBe('unavailable');
  });

  it('shows the empty state for a form with no responses yet', () => {
    expect(reportState({ ...base, hasReport: true })).toBe('empty');
  });

  it('shows the report when it has responses', () => {
    expect(reportState({ ...base, hasReport: true, hasResponses: true })).toBe('ready');
  });

  it('treats a missing report that is not loading, failed or refused as nothing to show yet', () => {
    expect(reportState(base)).toBe('none');
  });

  it('moves from failed to loading to ready when the reader picks another form', () => {
    const sequence = [
      reportState({ ...base, failed: true }),
      reportState({ ...base, loading: true }),
      reportState({ ...base, hasReport: true, hasResponses: true }),
    ];
    expect(sequence).toEqual(['failed', 'loading', 'ready']);
  });
});
