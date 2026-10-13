/**
 * `toFormReport` — the server's summary as the dashboard's read model. It computes nothing; what it
 * must get right is that every section arrives, in the components' terms, and that a question type
 * this client does not know fails loudly instead of rendering an unlabelled card.
 */
import { describe, expect, it } from 'vitest';
import { toFormReport } from './report-view';
import { summaryOutput } from '../testing/summary-fixture';
import type { ReportableForm } from '../models/reporting.model';

const FORM: ReportableForm = { formId: 'form-1', formVersionId: 'ver-1', name: 'Feedback', responseCount: 12 };

describe('toFormReport', () => {
  it('keeps Partial and Disqualified apart and turns the last submission into a Date', () => {
    expect(toFormReport(FORM, summaryOutput()).summary).toEqual({
      totalResponses: 12,
      completeResponses: 12,
      partialResponses: 3,
      disqualifiedResponses: 2,
      completionRate: 12 / 17,
      typicalCompletionSeconds: 150,
      lastSubmittedAt: new Date('2026-09-05T10:01:30.000Z'),
    });
  });

  it('carries a Matrix as cell counts, never as rendered answers', () => {
    const grid = toFormReport(FORM, summaryOutput()).breakdowns.find((b) => b.questionId === 'q-grid');

    expect(grid).toMatchObject({ type: 'Matrix', role: 'composite' });
    expect(grid?.matrixCells[0]).toEqual({ rowLabel: 'Venue', columnLabel: 'Good', count: 3 });
    expect(Object.keys(grid ?? {})).not.toContain('textAnswers');
  });

  it('keeps the off-list bucket under the label the server counted it under', () => {
    const colour = toFormReport(FORM, summaryOutput()).breakdowns.find((b) => b.questionId === 'q-colour');
    expect(colour?.buckets.map((b) => b.label)).toEqual(['Green', 'Other (not an option)', 'Red']);
  });

  it('maps NPS segments, and the open-text type key to the builder label', () => {
    const report = toFormReport(FORM, summaryOutput());

    expect(report.breakdowns.find((b) => b.questionId === 'q-nps')?.numeric?.npsSegments).toEqual({ detractors: 2, passives: 4, promoters: 4 });
    expect(report.openText[0]).toMatchObject({ typeLabel: 'Long text', themes: [{ term: 'pricing', answers: 3, fraction: 0.6 }] });
  });

  it('carries the profile, the funnel and the capped flag through', () => {
    const report = toFormReport(FORM, summaryOutput({ InsightAnswersCapped: true }));

    expect(report.profile.metrics[0]).toEqual({ label: 'Contactable', value: '10', detail: 'of 12 responses gave an email', fraction: 10 / 12 });
    expect(report.funnel.map((s) => [s.title, s.reached])).toEqual([['Page 1', 17], ['Opinions', 13]]);
    expect(report.insightAnswersCapped).toBe(true);
  });

  it('refuses a question type it does not know, naming the question', () => {
    const output = summaryOutput();
    output.Questions[0] = { ...output.Questions[0], QuestionType: 'Hologram' };

    expect(() => toFormReport(FORM, output)).toThrow(/q-colour.*Hologram/);
  });
});
