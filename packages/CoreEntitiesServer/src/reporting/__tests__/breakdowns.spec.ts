/**
 * The per-question breakdowns `Forms.GetResponseSummary` returns, built from the value-count query's
 * rows (choice, scale, yes/no, consent, dates) and from Matrix answer rows read on the server.
 *
 * The rules carried over from forms-ng's `reporting-aggregations.ts` are pinned here one by one; the
 * fixture parity spec (`FormReportingEngine.parity.spec.ts`) then holds the whole section to the old
 * browser output. What is NEW is pinned here too: an off-list choice value is folded into one
 * "Other (not an option)" bucket and never shipped under its own text, and a Matrix is reported as
 * row x column cell counts, never as rendered answers.
 */
import { describe, expect, it } from 'vitest';
import { OFF_LIST_LABEL } from '@mj-biz-apps/forms-entities';
import { buildQuestionBreakdowns } from '../breakdowns.js';
import { insightAnswer, question, valueRow } from './reporting-fixtures.js';

const colour = question('q-colour', 'SingleChoice', 'Favourite colour', [
  { value: 'r', label: 'Red' },
  { value: 'g', label: 'Green' },
  { value: 'b', label: 'Blue' },
]);

describe('choice breakdowns', () => {
  it('seeds every option (zero counts included), sorts most-chosen first and divides by selections', () => {
    const [card] = buildQuestionBreakdowns([colour], [valueRow('q-colour', 3, 'Text', 'g', 2), valueRow('q-colour', 3, 'Text', 'r', 1)], []);

    expect(card).toMatchObject({ QuestionID: 'q-colour', Role: 'choice', AnsweredCount: 3, Numeric: null, MatrixCells: [] });
    expect(card.Buckets).toEqual([
      { Label: 'Green', Count: 2, Fraction: 2 / 3 },
      { Label: 'Red', Count: 1, Fraction: 1 / 3 },
      { Label: 'Blue', Count: 0, Fraction: 0 },
    ]);
  });

  it('folds every off-list value into one Other bucket and never returns the value itself', () => {
    const rows = [
      valueRow('q-colour', 4, 'Text', 'r', 1),
      valueRow('q-colour', 4, 'Text', 'jane@example.org', 2),
      valueRow('q-colour', 4, 'Text', '07700 900123', 1),
    ];
    const [card] = buildQuestionBreakdowns([colour], rows, []);

    expect(card.Buckets.map((b) => b.Label)).toEqual([OFF_LIST_LABEL, 'Red', 'Green', 'Blue']);
    expect(card.Buckets[0]).toEqual({ Label: OFF_LIST_LABEL, Count: 3, Fraction: 3 / 4 });
    const shipped = JSON.stringify(card);
    expect(shipped).not.toContain('jane@example.org');
    expect(shipped).not.toContain('07700');
  });

  it('matches answers to questions whatever GUID casing the database returned', () => {
    const q = question('aaaaaaaa-0000-4000-8000-000000000001', 'Dropdown', 'Pick', [{ value: 'x', label: 'X' }]);
    const [card] = buildQuestionBreakdowns([q], [valueRow('AAAAAAAA-0000-4000-8000-000000000001', 1, 'Text', 'x', 1)], []);

    expect(card.AnsweredCount).toBe(1);
    expect(card.Buckets).toEqual([{ Label: 'X', Count: 1, Fraction: 1 }]);
  });

  it('reports a question nobody answered with its options at zero', () => {
    const [card] = buildQuestionBreakdowns([colour], [], []);

    expect(card.AnsweredCount).toBe(0);
    expect(card.Buckets.every((b) => b.Count === 0 && b.Fraction === 0)).toBe(true);
  });
});

describe('historical question types', () => {
  it('counts answered responses only for the kind the current question charts', () => {
    const rows = [valueRow('q', 7, 'Text', 'old text', 7), valueRow('q', 2, 'Numeric', '5', 2)];
    const [card] = buildQuestionBreakdowns([question('q', 'Number')], rows, []);

    expect(card.AnsweredCount).toBe(2);
    expect(card.Numeric?.Answered).toBe(2);
  });

  it('shows zero answered when only an older incompatible kind has values', () => {
    const [card] = buildQuestionBreakdowns([question('q', 'YesNo')], [valueRow('q', 7, 'Text', 'old text', 7)], []);

    expect(card.AnsweredCount).toBe(0);
    expect(card.Buckets.map((bucket) => bucket.Count)).toEqual([0, 0]);
  });
});

describe('scale breakdowns', () => {
  it('weights min, max and the mean by how many answers carried each value', () => {
    const rating = question('q-rate', 'Rating', 'Rate us');
    const [card] = buildQuestionBreakdowns([rating], [valueRow('q-rate', 4, 'Numeric', '2', 1), valueRow('q-rate', 4, 'Numeric', '5', 3)], []);

    expect(card.Role).toBe('scale');
    expect(card.Buckets).toEqual([]);
    expect(card.Numeric).toEqual({ Answered: 4, Min: 2, Max: 5, Average: 17 / 4, NPSScore: null, NPSSegments: null });
  });

  it('scores NPS over ratings within 0..10 only, while min/max/mean still describe every number', () => {
    const nps = question('q-nps', 'NPS', 'Recommend?');
    const rows = [
      valueRow('q-nps', 5, 'Numeric', '10', 2),
      valueRow('q-nps', 5, 'Numeric', '7', 1),
      valueRow('q-nps', 5, 'Numeric', '3', 1),
      valueRow('q-nps', 5, 'Numeric', '99', 1),
    ];
    const [card] = buildQuestionBreakdowns([nps], rows, []);

    expect(card.Numeric).toEqual({
      Answered: 5,
      Min: 3,
      Max: 99,
      Average: (20 + 7 + 3 + 99) / 5,
      NPSScore: Math.round(((2 - 1) / 4) * 100),
      NPSSegments: { Detractors: 1, Passives: 1, Promoters: 2 },
    });
  });

  it('leaves NPS unscored when no rating is on the 0..10 scale', () => {
    const [card] = buildQuestionBreakdowns([question('q-nps', 'NPS')], [valueRow('q-nps', 1, 'Numeric', '50', 1)], []);

    expect(card.Numeric).toMatchObject({ Answered: 1, NPSScore: null, NPSSegments: null });
  });

  it('reports a scale question nobody answered as empty, not as zero', () => {
    const [card] = buildQuestionBreakdowns([question('q-n', 'Number')], [], []);

    expect(card.Numeric).toEqual({ Answered: 0, Min: null, Max: null, Average: null, NPSScore: null, NPSSegments: null });
  });
});

describe('yes/no and consent breakdowns', () => {
  it('always returns Yes then No', () => {
    const rows = [valueRow('q-yn', 3, 'Boolean', 'false', 2), valueRow('q-yn', 3, 'Boolean', 'true', 1)];
    const [card] = buildQuestionBreakdowns([question('q-yn', 'YesNo')], rows, []);

    expect(card.Role).toBe('sentiment');
    expect(card.Buckets).toEqual([
      { Label: 'Yes', Count: 1, Fraction: 1 / 3 },
      { Label: 'No', Count: 2, Fraction: 2 / 3 },
    ]);
    expect(buildQuestionBreakdowns([question('q-c', 'Legal')], [], [])[0].Role).toBe('consent');
  });
});

describe('date and time breakdowns', () => {
  it('groups dates by UTC month, in calendar order, never re-sorted by count', () => {
    const rows = [
      valueRow('q-d', 3, 'Date', '2026-09-01T00:00:00.000Z', 1),
      valueRow('q-d', 3, 'Date', '2026-03-10T00:00:00Z', 2),
    ];
    const [card] = buildQuestionBreakdowns([question('q-d', 'Date')], rows, []);

    expect(card.Role).toBe('temporal');
    expect(card.Buckets).toEqual([
      { Label: 'Mar 2026', Count: 2, Fraction: 2 / 3 },
      { Label: 'Sep 2026', Count: 1, Fraction: 1 / 3 },
    ]);
  });

  it('groups times into parts of the UTC day', () => {
    const rows = [valueRow('q-t', 2, 'Date', '1970-01-01T14:30:00Z', 1), valueRow('q-t', 2, 'Date', '1970-01-01T07:00:00Z', 1)];
    const [card] = buildQuestionBreakdowns([question('q-t', 'Time')], rows, []);

    expect(card.Buckets.map((b) => b.Label)).toEqual(['Morning (6am–12pm)', 'Afternoon (12–5pm)']);
  });
});

describe('Matrix breakdowns', () => {
  const matrix = question('q-m', 'Matrix', 'Rate each', [
    { value: 'venue', label: 'Venue', matrixAxis: 'Row' },
    { value: 'food', label: 'Food', matrixAxis: 'Row' },
    { value: 'good', label: 'Good', matrixAxis: 'Column' },
    { value: 'poor', label: 'Poor', matrixAxis: 'Column' },
  ]);

  it('counts every row x column cell in option order, zeros included, and counts responses that chose a cell', () => {
    const answers = [
      insightAnswer('r1', 'q-m', { JSONValue: '{"venue":"good","food":"poor"}' }),
      insightAnswer('r2', 'q-m', { JSONValue: '{"venue":["good","poor"]}' }),
      insightAnswer('r3', 'q-m', { JSONValue: '{}' }),
      insightAnswer('r4', 'q-m', { JSONValue: '{not json' }),
    ];
    const [card] = buildQuestionBreakdowns([matrix], [], answers);

    expect(card).toMatchObject({ Role: 'composite', AnsweredCount: 2, Buckets: [], Numeric: null });
    expect(card.MatrixCells).toEqual([
      { RowLabel: 'Venue', ColumnLabel: 'Good', Count: 2 },
      { RowLabel: 'Venue', ColumnLabel: 'Poor', Count: 1 },
      { RowLabel: 'Food', ColumnLabel: 'Good', Count: 0 },
      { RowLabel: 'Food', ColumnLabel: 'Poor', Count: 1 },
    ]);
  });

  it('folds an off-list row or column into Other rather than returning its text', () => {
    const answers = [insightAnswer('r1', 'q-m', { JSONValue: '{"venue":"call me on 0770","Jane Smith":"good"}' })];
    const [card] = buildQuestionBreakdowns([matrix], [], answers);

    expect(card.MatrixCells).toContainEqual({ RowLabel: 'Venue', ColumnLabel: OFF_LIST_LABEL, Count: 1 });
    expect(card.MatrixCells).toContainEqual({ RowLabel: OFF_LIST_LABEL, ColumnLabel: 'Good', Count: 1 });
    const shipped = JSON.stringify(card);
    expect(shipped).not.toContain('0770');
    expect(shipped).not.toContain('Jane');
  });
});

describe('which questions are charted', () => {
  it('charts only choice, scale, yes/no, consent, date and Matrix questions, in the order given', () => {
    const questions = [
      question('q-email', 'Email'),
      question('q-name', 'ShortText'),
      question('q-essay', 'LongText'),
      question('q-file', 'FileUpload'),
      question('q-say', 'Statement'),
      question('q-yn', 'YesNo'),
      colour,
    ];
    const rows = [valueRow('q-email', 1, 'Text', 'jane@example.org', 1), valueRow('q-name', 1, 'Text', 'Jane', 1)];
    const cards = buildQuestionBreakdowns(questions, rows, []);

    expect(cards.map((c) => c.QuestionID)).toEqual(['q-yn', 'q-colour']);
    expect(JSON.stringify(cards)).not.toContain('jane');
  });
});
