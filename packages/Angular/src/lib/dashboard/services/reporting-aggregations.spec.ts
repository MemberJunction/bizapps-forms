import { describe, it, expect } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import {
  breakdownKindFor,
  buildSummary,
  buildBreakdowns,
  buildFunnel,
} from './reporting-aggregations';
import { flattenQuestions } from '../../shared/published-questions';
import { q, response, answer } from '../../shared/testing/entity-row-fixtures';

describe('breakdownKindFor', () => {
  it('maps types to kinds', () => {
    expect(breakdownKindFor('SingleChoice')).toBe('distribution');
    expect(breakdownKindFor('MultiChoice')).toBe('distribution');
    expect(breakdownKindFor('Dropdown')).toBe('distribution');
    expect(breakdownKindFor('YesNo')).toBe('boolean');
    expect(breakdownKindFor('Number')).toBe('numeric');
    expect(breakdownKindFor('Rating')).toBe('numeric');
    expect(breakdownKindFor('NPS')).toBe('numeric');
    expect(breakdownKindFor('LongText')).toBe('freeText');
    expect(breakdownKindFor('Email')).toBe('freeText');
  });

  it('gives file-backed answers their own kind instead of the free-text fallback', () => {
    // The live defect: these landed in 'freeText', whose list reads `renderAnswer`, which
    // has nothing to return for an answer that stores only a FileID. The card printed "No
    // answers yet" underneath its own header saying "19 answers".
    expect(breakdownKindFor('FileUpload')).toBe('files');
    expect(breakdownKindFor('Signature')).toBe('files');
  });

  it('still lists dates as text, though the contract calls them unanalysable too', () => {
    // Date and Time are `analysis: 'none'` like the file types are, so keying the fix on
    // the analysis kind would have swept them up and lost a readable list of real dates.
    // The discriminator is the answer COLUMN, which is what decides if anything renders.
    expect(breakdownKindFor('Date')).toBe('freeText');
    expect(breakdownKindFor('Time')).toBe('freeText');
  });
});

describe('flattenQuestions', () => {
  it('flattens pages in display order', () => {
    const def: PublishedFormDefinition = {
      formId: 'f1',
      formVersionId: 'v1',
      name: 'F',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      pages: [
        { id: 'p2', displayOrder: 1, questions: [q('q3', 'Number', 0)] },
        { id: 'p1', displayOrder: 0, questions: [q('q2', 'Email', 1), q('q1', 'ShortText', 0)] },
      ],
    };
    expect(flattenQuestions(def).map((x) => x.id)).toEqual(['q1', 'q2', 'q3']);
  });
});

describe('buildSummary', () => {
  it('headline total counts COMPLETE only; partials feed partialResponses + completionRate', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const rows: ResponseRow[] = [
      response('r1', 'Complete', start, new Date(start.getTime() + 60_000)),
      response('r2', 'Complete', start, new Date(start.getTime() + 120_000)),
      response('r3', 'Partial', start, null),
    ];
    const s = buildSummary(rows);
    // Headline total EXCLUDES the in-progress partial (regression: partials must not inflate it).
    expect(s.totalResponses).toBe(2);
    expect(s.completeResponses).toBe(2);
    expect(s.partialResponses).toBe(1);
    // completionRate keeps the started (complete + partial) denominator as the drop-off signal.
    expect(s.completionRate).toBeCloseTo(2 / 3);
    expect(s.typicalCompletionSeconds).toBe(90); // median of [60, 120]
  });

  it('is the MEDIAN, so one absurd session cannot define "typical"', () => {
    // Fill times are right-skewed even in clean data: most people take two minutes and one
    // leaves the tab open over lunch. A mean of [60, 90, 120, 20000] is 5067s — over an
    // hour — which is not what any of these four people experienced.
    const start = new Date('2026-01-01T00:00:00Z');
    const at = (secs: number) => new Date(start.getTime() + secs * 1000);
    const rows: ResponseRow[] = [
      response('r1', 'Complete', start, at(60)),
      response('r2', 'Complete', start, at(90)),
      response('r3', 'Complete', start, at(120)),
      response('r4', 'Complete', start, at(20_000)),
    ];
    expect(buildSummary(rows).typicalCompletionSeconds).toBe(105); // median of [60,90,120,20000]
  });

  it('discards a gap too long to have been one sitting', () => {
    // The live defect: a response whose StartedAt is the Unix epoch reported the form's
    // typical completion time as "212759h 19m" — about twenty-four years — to its owner.
    // The broken pair leaves the sample entirely rather than merely being out-voted.
    const rows: ResponseRow[] = [
      response('good', 'Complete', new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:02:00Z')),
      response('epoch', 'Complete', new Date('1970-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z')),
    ];
    expect(buildSummary(rows).typicalCompletionSeconds).toBe(120);
  });

  it('reports nothing rather than a wrong number when every pair is implausible', () => {
    const rows: ResponseRow[] = [
      response('epoch', 'Complete', new Date('1970-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z')),
    ];
    expect(buildSummary(rows).typicalCompletionSeconds).toBeNull();
  });

  it('handles zero responses', () => {
    const s = buildSummary([]);
    expect(s.totalResponses).toBe(0);
    expect(s.completionRate).toBe(0);
    expect(s.typicalCompletionSeconds).toBeNull();
    expect(s.lastSubmittedAt).toBeNull();
  });

  it('counts nothing as a response when only partials exist', () => {
    const s = buildSummary([response('p1', 'Partial', new Date(), null)]);
    expect(s.totalResponses).toBe(0);
    expect(s.partialResponses).toBe(1);
    expect(s.completionRate).toBe(0);
  });
});

describe('buildBreakdowns', () => {
  const choice = q('qc', 'SingleChoice', 0, [
    { id: 'o1', label: 'Red', value: 'red', displayOrder: 0 },
    { id: 'o2', label: 'Blue', value: 'blue', displayOrder: 1 },
  ]);
  const multi = q('qm', 'MultiChoice', 1, [
    { id: 'a', label: 'A', value: 'a', displayOrder: 0 },
    { id: 'b', label: 'B', value: 'b', displayOrder: 1 },
  ]);
  const nps = q('qn', 'NPS', 2);
  const yn = q('qy', 'YesNo', 3);
  const text = q('qt', 'LongText', 4);

  const answers: AnswerRow[] = [
    answer('r1', 'qc', { TextValue: 'red' }),
    answer('r2', 'qc', { TextValue: 'red' }),
    answer('r3', 'qc', { TextValue: 'blue' }),
    answer('r1', 'qm', { JSONValue: JSON.stringify(['a', 'b']) }),
    answer('r2', 'qm', { JSONValue: JSON.stringify(['a']) }),
    answer('r1', 'qn', { NumericValue: 10 }),
    answer('r2', 'qn', { NumericValue: 8 }),
    answer('r3', 'qn', { NumericValue: 0 }),
    answer('r1', 'qy', { BooleanValue: true }),
    answer('r2', 'qy', { BooleanValue: false }),
    answer('r1', 'qt', { TextValue: 'hello' }),
  ];

  const breakdowns = buildBreakdowns([choice, multi, nps, yn, text], answers);

  it('builds choice distribution with option labels, sorted by count', () => {
    const b = breakdowns.find((x) => x.questionId === 'qc')!;
    expect(b.kind).toBe('distribution');
    expect(b.buckets[0]).toMatchObject({ label: 'Red', count: 2 });
    expect(b.buckets[1]).toMatchObject({ label: 'Blue', count: 1 });
  });

  it('counts multi-select selections from JSON', () => {
    const b = breakdowns.find((x) => x.questionId === 'qm')!;
    const a = b.buckets.find((x) => x.label === 'A')!;
    const bb = b.buckets.find((x) => x.label === 'B')!;
    expect(a.count).toBe(2);
    expect(bb.count).toBe(1);
  });

  it('computes NPS score and segments', () => {
    const b = breakdowns.find((x) => x.questionId === 'qn')!;
    expect(b.numeric).not.toBeNull();
    expect(b.numeric!.npsSegments).toEqual({ detractors: 1, passives: 1, promoters: 1 });
    // (1 promoter - 1 detractor) / 3 * 100 = 0
    expect(b.numeric!.npsScore).toBe(0);
  });

  it('builds boolean buckets for YesNo', () => {
    const b = breakdowns.find((x) => x.questionId === 'qy')!;
    expect(b.kind).toBe('boolean');
    expect(b.buckets).toEqual([
      { label: 'Yes', count: 1, fraction: 0.5 },
      { label: 'No', count: 1, fraction: 0.5 },
    ]);
  });

  it('lists free-text answers', () => {
    const b = breakdowns.find((x) => x.questionId === 'qt')!;
    expect(b.kind).toBe('freeText');
    expect(b.textAnswers).toEqual(['hello']);
  });
});

describe('buildFunnel', () => {
  it('computes reach, retention and drop-off across pages', () => {
    const def: PublishedFormDefinition = {
      formId: 'f1',
      formVersionId: 'v1',
      name: 'F',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      pages: [
        { id: 'p1', title: 'One', displayOrder: 0, questions: [q('q1', 'ShortText', 0)] },
        { id: 'p2', title: 'Two', displayOrder: 1, questions: [q('q2', 'ShortText', 0)] },
      ],
    };
    // r1 + r2 answered page 1; only r1 answered page 2
    const answers: AnswerRow[] = [
      answer('r1', 'q1', { TextValue: 'a' }),
      answer('r2', 'q1', { TextValue: 'b' }),
      answer('r1', 'q2', { TextValue: 'c' }),
    ];
    const funnel = buildFunnel(def, answers);
    expect(funnel[0]).toMatchObject({ reached: 2, retention: 1, dropOff: 0 });
    expect(funnel[1].reached).toBe(1);
    expect(funnel[1].retention).toBe(0.5);
    expect(funnel[1].dropOff).toBe(0.5);
  });
});
