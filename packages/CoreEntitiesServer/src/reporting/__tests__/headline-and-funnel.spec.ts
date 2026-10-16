/**
 * The headline figures and the page funnel, built from their two queries' rows. The rules are the
 * dashboard's (`reporting-aggregations.ts`): the headline counts COMPLETE responses only, the
 * completion rate divides by every started response, and the funnel drops pages that ask nothing
 * answerable (a welcome page first made every retention zero).
 */
import { describe, expect, it } from 'vitest';
import { buildSummaryStats } from '../headline.js';
import { buildFunnel } from '../funnel.js';
import type { FunnelReachRow } from '../report-queries.js';

describe('buildSummaryStats', () => {
  it('headlines Complete responses only and divides completion by every started response', () => {
    const stats = buildSummaryStats({
      CompleteCount: 6,
      PartialCount: 3,
      DisqualifiedCount: 1,
      StartedCount: 10,
      MedianCompletionSeconds: 95.5,
      LastSubmittedAt: new Date('2026-10-01T12:00:00Z'),
    });

    expect(stats).toEqual({
      TotalResponses: 6,
      CompleteResponses: 6,
      PartialResponses: 3,
      DisqualifiedResponses: 1,
      CompletionRate: 0.6,
      TypicalCompletionSeconds: 95.5,
      LastSubmittedAt: '2026-10-01T12:00:00.000Z',
    });
  });

  it('reports a form with no responses as zero, with no typical time and no last submission', () => {
    const stats = buildSummaryStats({ CompleteCount: 0, PartialCount: 0, DisqualifiedCount: 0, StartedCount: 0, MedianCompletionSeconds: null, LastSubmittedAt: null });

    expect(stats).toMatchObject({ TotalResponses: 0, CompletionRate: 0, TypicalCompletionSeconds: null, LastSubmittedAt: null });
  });
});

function page(id: string, displayOrder: number, reached: number, types: string | null, title: string | null = null): FunnelReachRow {
  return { PageID: id, Title: title, DisplayOrder: displayOrder, ReachedCount: reached, QuestionTypes: types };
}

describe('buildFunnel', () => {
  it('drops pages with no answerable question, and numbers untitled pages by their place in the funnel', () => {
    const steps = buildFunnel([
      page('welcome', 0, 0, 'Statement'),
      page('empty', 1, 0, null),
      page('p1', 2, 10, 'ShortText,Statement', 'About you'),
      page('p2', 3, 6, 'YesNo'),
      page('p3', 4, 0, 'Email'),
    ]);

    expect(steps).toEqual([
      { PageID: 'p1', Title: 'About you', DisplayOrder: 2, Reached: 10, Retention: 1, DropOff: 0 },
      { PageID: 'p2', Title: 'Page 2', DisplayOrder: 3, Reached: 6, Retention: 0.6, DropOff: 0.4 },
      { PageID: 'p3', Title: 'Page 3', DisplayOrder: 4, Reached: 0, Retention: 0, DropOff: 1 },
    ]);
  });

  it('orders by display order whatever order the rows arrive in, and ignores a type it does not know', () => {
    const steps = buildFunnel([page('b', 2, 1, 'YesNo'), page('a', 1, 2, 'YesNo'), page('x', 3, 5, 'Hologram')]);

    expect(steps.map((s) => s.PageID)).toEqual(['a', 'b']);
    expect(steps[1]).toMatchObject({ Retention: 0.5, DropOff: 0.5 });
  });

  it('reads zero retention, not a division by zero, when nobody reached the first step', () => {
    expect(buildFunnel([page('a', 1, 0, 'YesNo'), page('b', 2, 0, 'YesNo')]).map((s) => [s.Retention, s.DropOff])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });
});
