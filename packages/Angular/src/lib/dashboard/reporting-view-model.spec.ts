/**
 * Behaviour of the reporting dashboard's presentation logic.
 *
 * The interesting cases are all the ones where a plausible implementation says something
 * FALSE rather than something ugly: a future timestamp read as a prediction, a 0%
 * completion rate printed for a form nobody has opened, a zero-count segment claiming a
 * slice of a bar, an NPS bar reordered until the scale it represents is gone.
 */
import { describe, expect, it } from 'vitest';
import type { FormSummaryStats, ReportableForm } from './models/reporting.model';
import {
  answerRate,
  booleanSegments,
  completionSegments,
  consentRate,
  consentSegments,
  dropOffSeverity,
  filterForms,
  formatDuration,
  npsSegments,
  percent,
  plural,
  portfolioSummary,
  relativeTime,
  sortFormsForRail,
} from './reporting-view-model';

const NOW = new Date('2026-08-20T12:00:00Z');
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function stats(overrides: Partial<FormSummaryStats> = {}): FormSummaryStats {
  return {
    totalResponses: 0,
    completeResponses: 0,
    partialResponses: 0,
    completionRate: 0,
    typicalCompletionSeconds: null,
    lastSubmittedAt: null,
    ...overrides,
  };
}

function form(name: string, responseCount = 0): ReportableForm {
  return { formId: `id-${name}`, formVersionId: `v-${name}`, name, responseCount };
}

describe('relativeTime', () => {
  it('says how long ago, in the coarsest unit that still means something', () => {
    expect(relativeTime(ago(20 * SECOND), NOW)).toBe('just now');
    expect(relativeTime(ago(5 * MINUTE), NOW)).toBe('5 minutes ago');
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('3 hours ago');
    expect(relativeTime(ago(2 * DAY), NOW)).toBe('2 days ago');
  });

  it('does not say "1 minutes ago"', () => {
    expect(relativeTime(ago(90 * SECOND), NOW)).toBe('1 minute ago');
    expect(relativeTime(ago(80 * MINUTE), NOW)).toBe('1 hour ago');
    expect(relativeTime(ago(30 * HOUR), NOW)).toBe('1 day ago');
  });

  it('switches to a date once "N days ago" stops being the easier reading', () => {
    expect(relativeTime(ago(6 * DAY), NOW)).toBe('6 days ago');
    expect(relativeTime(ago(9 * DAY), NOW)).not.toMatch(/ago/);
  });

  it('treats a future timestamp as clock skew, not as a prediction', () => {
    // Browser and server clocks disagree by seconds routinely. "in 4 minutes" beside a
    // response that has already been submitted reads as a bug in the product.
    expect(relativeTime(new Date(NOW.getTime() + 4 * MINUTE), NOW)).toBe('just now');
  });

  it('has something to render when nothing has been submitted', () => {
    expect(relativeTime(null, NOW)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('uses at most two units', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(150)).toBe('2m 30s');
    expect(formatDuration(4320)).toBe('1h 12m');
  });

  it('drops a zero remainder rather than printing "2m 0s"', () => {
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(3600)).toBe('1h');
  });

  it('renders nothing measurable as a dash, not as zero', () => {
    // "0s to complete" is a claim about how fast the form is. It is never true; it means
    // no response had both timestamps.
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('completionSegments', () => {
  it('splits the people who started into finished and not', () => {
    const segments = completionSegments(stats({ completeResponses: 30, partialResponses: 10 }));
    expect(segments.map((s) => [s.label, s.count, s.fraction])).toEqual([
      ['Completed', 30, 0.75],
      ['Started, not finished', 10, 0.25],
    ]);
  });

  it('omits a segment nobody is in, so the bar has no invisible slices', () => {
    const segments = completionSegments(stats({ completeResponses: 12, partialResponses: 0 }));
    expect(segments).toHaveLength(1);
    expect(segments[0].fraction).toBe(1);
  });

  it('renders nothing at all when nobody has started', () => {
    // Not a full bar, and not an empty one: a form with no responses has no completion
    // story, and drawing a 0%-filled track invites reading it as 0% completion.
    expect(completionSegments(stats())).toEqual([]);
  });

  it('colours by meaning rather than by position', () => {
    const segments = completionSegments(stats({ completeResponses: 1, partialResponses: 1 }));
    expect(segments.map((s) => s.vizClass)).toEqual(['mjf-viz-positive', 'mjf-viz-caution']);
  });
});

describe('npsSegments', () => {
  it('keeps promoter → passive → detractor order even when it is not the size order', () => {
    // The bar IS the scale. Sorting it by count would put the biggest band first and
    // destroy the only thing it shows.
    const segments = npsSegments({ promoters: 1, passives: 8, detractors: 3 });
    expect(segments.map((s) => s.label)).toEqual(['Promoters', 'Passives', 'Detractors']);
  });

  it('drops empty bands but keeps the survivors in scale order', () => {
    const segments = npsSegments({ promoters: 4, passives: 0, detractors: 2 });
    expect(segments.map((s) => s.label)).toEqual(['Promoters', 'Detractors']);
  });

  it('has nothing to draw with no ratings', () => {
    expect(npsSegments({ promoters: 0, passives: 0, detractors: 0 })).toEqual([]);
  });
});

describe('booleanSegments', () => {
  const bucket = (label: string, count: number, fraction: number) => ({ label, count, fraction });

  it('colours Yes and No by meaning, not by sort position', () => {
    // Sorted by count, "No" can come first. Handing it the rotation's first hue — the same
    // blue a "Very satisfied" bar gets elsewhere — makes declining read as approval.
    const segments = booleanSegments([bucket('No', 9, 0.75), bucket('Yes', 3, 0.25)]);
    expect(segments.map((s) => [s.label, s.vizClass])).toEqual([
      ['No', 'mjf-viz-neutral'],
      ['Yes', 'mjf-viz-positive'],
    ]);
  });

  it('matches Yes whatever case the option was authored in', () => {
    expect(booleanSegments([bucket('YES', 1, 1)])[0].vizClass).toBe('mjf-viz-positive');
  });

  it('drops a band nobody chose', () => {
    const segments = booleanSegments([bucket('Yes', 4, 1), bucket('No', 0, 0)]);
    expect(segments.map((s) => s.label)).toEqual(['Yes']);
  });
});

describe('consent questions', () => {
  const bucket = (label: string, count: number, fraction: number) => ({ label, count, fraction });

  it('reads as an acceptance rate rather than an opinion split', () => {
    expect(consentRate([bucket('Yes', 47, 0.94), bucket('No', 3, 0.06)])).toBeCloseTo(0.94);
  });

  it('has no rate when nobody answered, rather than reporting zero agreement', () => {
    // "0% accepted" is a claim that everyone refused. Nobody answering is a different fact.
    expect(consentRate([bucket('Yes', 0, 0), bucket('No', 0, 0)])).toBeNull();
    expect(consentRate([])).toBeNull();
  });

  it('labels the split by consent, and marks declining as the adverse outcome', () => {
    // Elsewhere a "No" is neutral — declining to answer is not a fault. On a consent
    // question it genuinely is the row someone has to go and find.
    expect(consentSegments([bucket('Yes', 9, 0.9), bucket('No', 1, 0.1)])).toEqual([
      { label: 'Accepted', count: 9, fraction: 0.9, vizClass: 'mjf-viz-positive' },
      { label: 'Declined', count: 1, fraction: 0.1, vizClass: 'mjf-viz-negative' },
    ]);
  });
});

describe('dropOffSeverity', () => {
  it('says nothing about ordinary attrition', () => {
    expect(dropOffSeverity(0)).toBe('none');
    expect(dropOffSeverity(0.09)).toBe('none');
  });

  it('escalates in two steps so the warning colour keeps its meaning', () => {
    expect(dropOffSeverity(0.2)).toBe('notable');
    expect(dropOffSeverity(0.6)).toBe('severe');
  });

  it('treats a non-finite rate as nothing to report', () => {
    expect(dropOffSeverity(Number.NaN)).toBe('none');
  });
});

describe('answerRate', () => {
  it('is the share of responses that answered the question', () => {
    expect(answerRate(30, 120)).toBe(0.25);
  });

  it('is null when there is nothing to divide by', () => {
    // A confident "0% answered" on a form with no responses is a false statement about
    // the question rather than about the form.
    expect(answerRate(0, 0)).toBeNull();
  });

  it('cannot exceed 1, however the counts were gathered', () => {
    // Answers span every published version; questions come from the latest. A question
    // answered on two versions can out-count the responses that reached the label source.
    expect(answerRate(140, 120)).toBe(1);
  });
});

describe('portfolioSummary and filterForms', () => {
  const forms = [form('Event RSVP', 12), form('Member Survey', 108), form('Feedback', 0)];

  it('totals what the whole dashboard covers', () => {
    expect(portfolioSummary(forms)).toEqual({ formCount: 3, responseCount: 120 });
  });

  it('totals to zero without dividing by anything', () => {
    expect(portfolioSummary([])).toEqual({ formCount: 0, responseCount: 0 });
  });

  it('narrows the rail by name, case-insensitively', () => {
    expect(filterForms(forms, 'sur').map((f) => f.name)).toEqual(['Member Survey']);
    expect(filterForms(forms, '  MEMBER ').map((f) => f.name)).toEqual(['Member Survey']);
  });

  it('returns everything for an empty search, as a copy', () => {
    const all = filterForms(forms, '   ');
    expect(all).toEqual(forms);
    expect(all).not.toBe(forms);
  });
});

describe('sortFormsForRail', () => {
  it('puts the busiest form first, so the dashboard does not open on an empty report', () => {
    const forms = [form('Alpha', 0), form('Zulu', 40), form('Mike', 7)];
    expect(sortFormsForRail(forms).map((f) => f.name)).toEqual(['Zulu', 'Mike', 'Alpha']);
  });

  it('breaks ties by name so the order is stable between loads', () => {
    const forms = [form('Beta', 5), form('Alpha', 5)];
    expect(sortFormsForRail(forms).map((f) => f.name)).toEqual(['Alpha', 'Beta']);
  });

  it('does not reorder the caller\'s array', () => {
    const forms = [form('Alpha', 0), form('Zulu', 40)];
    sortFormsForRail(forms);
    expect(forms.map((f) => f.name)).toEqual(['Alpha', 'Zulu']);
  });
});

describe('percent and plural', () => {
  it('rounds to whole percentage points', () => {
    expect(percent(0.666)).toBe('67%');
    expect(percent(0)).toBe('0%');
  });

  it('has a dash for a rate that is not a number', () => {
    expect(percent(Number.NaN)).toBe('—');
  });

  it('agrees with itself about one', () => {
    expect(plural(1, 'response')).toBe('1 response');
    expect(plural(0, 'response')).toBe('0 responses');
    expect(plural(2, 'response')).toBe('2 responses');
  });
});
