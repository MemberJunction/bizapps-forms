/**
 * A `Forms.GetResponseSummary` output for dashboard specs: every section populated, a Matrix with
 * an off-list column, Partial and Disqualified both present. Typed against the generated output, so
 * a change to the operation's shape fails the typecheck here rather than leaving specs on a stale
 * shape. Excluded from the build (`src/**\/testing/**`).
 */
import type { FormsGetResponseSummaryOutput } from '@mj-biz-apps/forms-entities';

export function summaryOutput(overrides: Partial<FormsGetResponseSummaryOutput> = {}): FormsGetResponseSummaryOutput {
  return {
    FormID: 'form-1',
    LabelVersionID: 'ver-1',
    Summary: {
      TotalResponses: 12,
      CompleteResponses: 12,
      PartialResponses: 3,
      DisqualifiedResponses: 2,
      CompletionRate: 12 / 17,
      TypicalCompletionSeconds: 150,
      LastSubmittedAt: '2026-09-05T10:01:30.000Z',
    },
    Profile: {
      IsEmpty: false,
      Metrics: [{ Label: 'Contactable', Value: '10', Detail: 'of 12 responses gave an email', Fraction: 10 / 12 }],
      Distributions: [{ Title: 'Email domains', Caption: 'Where addresses are hosted.', Buckets: [{ Label: 'example.org', Count: 6, Fraction: 0.6 }] }],
    },
    Questions: [
      {
        QuestionID: 'q-colour',
        Prompt: 'Favourite colour',
        QuestionType: 'SingleChoice',
        Role: 'choice',
        AnsweredCount: 11,
        Buckets: [
          { Label: 'Green', Count: 6, Fraction: 6 / 11 },
          { Label: 'Other (not an option)', Count: 3, Fraction: 3 / 11 },
          { Label: 'Red', Count: 2, Fraction: 2 / 11 },
        ],
        Numeric: null,
        MatrixCells: [],
      },
      {
        QuestionID: 'q-nps',
        Prompt: 'Recommend us?',
        QuestionType: 'NPS',
        Role: 'scale',
        AnsweredCount: 10,
        Buckets: [],
        Numeric: { Answered: 10, Min: 2, Max: 10, Average: 7.4, NPSScore: 20, NPSSegments: { Detractors: 2, Passives: 4, Promoters: 4 } },
        MatrixCells: [],
      },
      {
        QuestionID: 'q-grid',
        Prompt: 'Rate each',
        QuestionType: 'Matrix',
        Role: 'composite',
        AnsweredCount: 4,
        Buckets: [],
        Numeric: null,
        MatrixCells: [
          { RowLabel: 'Venue', ColumnLabel: 'Good', Count: 3 },
          { RowLabel: 'Venue', ColumnLabel: 'Poor', Count: 1 },
          { RowLabel: 'Venue', ColumnLabel: 'Other (not an option)', Count: 1 },
          { RowLabel: 'Food', ColumnLabel: 'Good', Count: 0 },
          { RowLabel: 'Food', ColumnLabel: 'Poor', Count: 2 },
          { RowLabel: 'Food', ColumnLabel: 'Other (not an option)', Count: 0 },
          { RowLabel: 'Other (not an option)', ColumnLabel: 'Good', Count: 0 },
          { RowLabel: 'Other (not an option)', ColumnLabel: 'Poor', Count: 0 },
          { RowLabel: 'Other (not an option)', ColumnLabel: 'Other (not an option)', Count: 0 },
        ],
      },
    ],
    OpenText: [
      {
        QuestionID: 'q-essay',
        Prompt: 'Anything else?',
        QuestionType: 'LongText',
        Answered: 5,
        Skipped: 7,
        ResponseRate: 5 / 12,
        MedianLength: 42,
        Themes: [{ Term: 'pricing', Answers: 3, Fraction: 0.6 }],
        ThemesApply: true,
      },
    ],
    Funnel: [
      { PageID: 'p1', Title: 'Page 1', DisplayOrder: 0, Reached: 17, Retention: 1, DropOff: 0 },
      { PageID: 'p2', Title: 'Opinions', DisplayOrder: 1, Reached: 13, Retention: 13 / 17, DropOff: 4 / 17 },
    ],
    InsightAnswersCapped: false,
    ...overrides,
  };
}
