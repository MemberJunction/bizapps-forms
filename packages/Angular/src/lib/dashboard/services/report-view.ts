/**
 * `Forms.GetResponseSummary`'s output, as the dashboard's read model (`FormReportData`).
 *
 * The server computes every figure (#303); this only changes how they are spelled for the
 * components: ISO instants become `Date`s, PascalCase becomes the components' names, and a question
 * type arrives as a string key that is CHECKED here and turned into the builder's label — so a type
 * this client does not know fails loudly, naming the question, instead of rendering a card with no
 * icon and no label. Pure; no I/O.
 */
import {
  isFormQuestionType,
  type FormQuestionType,
  type FormsAnswerBucket,
  type FormsGetResponseSummaryOutput,
  type FormsNumericAggregate,
  type FormsOpenTextInsight,
  type FormsQuestionBreakdown,
  type FormsRespondentProfile,
} from '@mj-biz-apps/forms-entities';
import { toDate } from '../../shared/runview-dates';
import { questionTypeMeta } from '../../builder/question-type-catalog';
import type {
  DistributionBucket,
  FormReportData,
  NumericAggregate,
  OpenTextInsight,
  QuestionBreakdown,
  ReportableForm,
  RespondentProfile,
} from '../models/reporting.model';

/** The report for `form`, from the summary the server computed for it. */
export function toFormReport(form: ReportableForm, output: FormsGetResponseSummaryOutput): FormReportData {
  const { Summary: s } = output;
  return {
    form,
    summary: {
      totalResponses: s.TotalResponses,
      completeResponses: s.CompleteResponses,
      partialResponses: s.PartialResponses,
      disqualifiedResponses: s.DisqualifiedResponses,
      completionRate: s.CompletionRate,
      typicalCompletionSeconds: s.TypicalCompletionSeconds,
      lastSubmittedAt: toDate(s.LastSubmittedAt),
    },
    profile: toProfile(output.Profile),
    breakdowns: output.Questions.map(toBreakdown),
    openText: output.OpenText.map(toOpenText),
    funnel: output.Funnel.map((step) => ({
      pageId: step.PageID,
      title: step.Title,
      displayOrder: step.DisplayOrder,
      reached: step.Reached,
      retention: step.Retention,
      dropOff: step.DropOff,
    })),
    insightAnswersCapped: output.InsightAnswersCapped,
  };
}

/** A question type key from the server, checked against the contracts' list. */
function questionType(key: string, questionId: string): FormQuestionType {
  if (!isFormQuestionType(key)) {
    throw new Error(`The response summary reported question ${questionId} as type '${key}', which this dashboard does not know.`);
  }
  return key;
}

function toBuckets(buckets: readonly FormsAnswerBucket[]): DistributionBucket[] {
  return buckets.map((b) => ({ label: b.Label, count: b.Count, fraction: b.Fraction }));
}

function toNumeric(numeric: FormsNumericAggregate | null): NumericAggregate | null {
  if (!numeric) {
    return null;
  }
  const segments = numeric.NPSSegments;
  return {
    answered: numeric.Answered,
    min: numeric.Min,
    max: numeric.Max,
    average: numeric.Average,
    npsScore: numeric.NPSScore,
    ...(segments ? { npsSegments: { detractors: segments.Detractors, passives: segments.Passives, promoters: segments.Promoters } } : {}),
  };
}

function toBreakdown(card: FormsQuestionBreakdown): QuestionBreakdown {
  return {
    questionId: card.QuestionID,
    prompt: card.Prompt,
    type: questionType(card.QuestionType, card.QuestionID),
    role: card.Role,
    answeredCount: card.AnsweredCount,
    buckets: toBuckets(card.Buckets),
    numeric: toNumeric(card.Numeric),
    matrixCells: card.MatrixCells.map((c) => ({ rowLabel: c.RowLabel, columnLabel: c.ColumnLabel, count: c.Count })),
  };
}

function toProfile(profile: FormsRespondentProfile): RespondentProfile {
  return {
    isEmpty: profile.IsEmpty,
    metrics: profile.Metrics.map((m) => ({ label: m.Label, value: m.Value, detail: m.Detail, fraction: m.Fraction })),
    distributions: profile.Distributions.map((d) => ({ title: d.Title, caption: d.Caption, buckets: toBuckets(d.Buckets) })),
  };
}

function toOpenText(insight: FormsOpenTextInsight): OpenTextInsight {
  return {
    questionId: insight.QuestionID,
    prompt: insight.Prompt,
    typeLabel: questionTypeMeta(questionType(insight.QuestionType, insight.QuestionID)).label,
    answered: insight.Answered,
    skipped: insight.Skipped,
    responseRate: insight.ResponseRate,
    medianLength: insight.MedianLength,
    themes: insight.Themes.map((t) => ({ term: t.Term, answers: t.Answers, fraction: t.Fraction })),
    themesApply: insight.ThemesApply,
  };
}
