/**
 * The OLD browser aggregation, driven exactly as forms-ng's `FormsReportingService.loadReport` drove
 * it, and its output mapped to the server's summary shape with ONLY the documented differences
 * applied (D1-D4, listed in `FormReportingEngine.parity.spec.ts`). Shared by the fake-provider parity
 * spec and the opt-in real-database one, so both hold the server to the same expectation.
 *
 * Imports forms-ng's functions from their SOURCE (the CES typecheck widens `rootDir` for it). Task 10
 * deletes them; when it does, this module becomes a golden snapshot of what it computes today.
 */
import type {
  FormsNumericAggregate,
  FormsQuestionBreakdown,
  mjBizAppsFormsFormResponseAnswerEntityType,
  mjBizAppsFormsFormResponseEntityType,
  PublishedFormDefinition,
} from '@mj-biz-apps/forms-entities';
import { buildBreakdowns, buildFunnel, buildSummary } from '../../../../Angular/src/lib/dashboard/services/reporting-aggregations';
import { buildRespondentProfile } from '../../../../Angular/src/lib/dashboard/services/respondent-profile';
import { buildOpenTextInsights } from '../../../../Angular/src/lib/dashboard/services/open-text-insights';
import { insightRoleFor } from '../../../../Angular/src/lib/dashboard/services/question-insight-roles';
import { flattenQuestions } from '../../../../Angular/src/lib/shared/published-questions';
import type { NumericAggregate, QuestionBreakdown } from '../../../../Angular/src/lib/dashboard/models/reporting.model';
import { OFF_LIST_LABEL } from '../breakdowns.js';
import type { FixtureAnswer, FixtureResponse } from './parity-fixture.js';

type BrowserResponse = mjBizAppsFormsFormResponseEntityType;
type BrowserAnswer = mjBizAppsFormsFormResponseAnswerEntityType;

/** What `FormsReportingService.loadReport` computed, called the way it called it. */
export function browserReport(definition: PublishedFormDefinition, responses: FixtureResponse[], answers: FixtureAnswer[]) {
  const rows = responses as unknown as BrowserResponse[];
  const answerRows = answers as unknown as BrowserAnswer[];
  const questions = flattenQuestions(definition);
  const summary = buildSummary(rows);
  const complete = new Set(rows.filter((r) => r.Status === 'Complete').map((r) => r.ID));
  const completeAnswers = answerRows.filter((a) => complete.has(a.ResponseID));
  return {
    questions,
    summary,
    profile: buildRespondentProfile(questions, completeAnswers, summary.totalResponses),
    breakdowns: buildBreakdowns(questions, completeAnswers),
    openText: buildOpenTextInsights(
      questions.filter((q) => insightRoleFor(q.type) === 'openText'),
      completeAnswers,
      summary.totalResponses,
      (q) => q.type, // D4: the server returns the type key; the client maps it to its label.
    ),
    funnel: buildFunnel(definition, answerRows),
  };
}

function numericOf(numeric: NumericAggregate | null): FormsNumericAggregate | null {
  if (!numeric) return null;
  const segments = numeric.npsSegments;
  return {
    Answered: numeric.answered,
    Min: numeric.min,
    Max: numeric.max,
    Average: numeric.average,
    NPSScore: numeric.npsScore,
    NPSSegments: segments ? { Detractors: segments.detractors, Passives: segments.passives, Promoters: segments.promoters } : null,
  };
}

/** D2: every bucket the browser labelled with a raw off-list value, folded into one Other bucket. */
function foldOffList(card: QuestionBreakdown, optionLabels: Set<string>): FormsQuestionBreakdown['Buckets'] {
  const kept = card.buckets.filter((b) => optionLabels.has(b.label));
  const off = card.buckets.filter((b) => !optionLabels.has(b.label));
  const offCount = off.reduce((sum, b) => sum + b.count, 0);
  const total = card.buckets.reduce((sum, b) => sum + b.count, 0);
  const merged = offCount > 0 ? [...kept, { label: OFF_LIST_LABEL, count: offCount, fraction: offCount / total }] : kept;
  return merged.sort((a, b) => b.count - a.count).map((b) => ({ Label: b.label, Count: b.count, Fraction: b.fraction }));
}

/** The browser's report, in the server's shape, with only the documented differences applied. */
export function expectedFromBrowser(report: ReturnType<typeof browserReport>, matrixCells: FormsQuestionBreakdown['MatrixCells']) {
  const { summary } = report;
  return {
    Summary: {
      TotalResponses: summary.totalResponses,
      CompleteResponses: summary.completeResponses,
      // D1: the server splits this; the parity check on the sum is below.
      PartialPlusDisqualified: summary.partialResponses,
      CompletionRate: summary.completionRate,
      TypicalCompletionSeconds: summary.typicalCompletionSeconds,
      LastSubmittedAt: summary.lastSubmittedAt ? summary.lastSubmittedAt.toISOString() : null,
    },
    Profile: {
      IsEmpty: report.profile.isEmpty,
      Metrics: report.profile.metrics.map((m) => ({ Label: m.label, Value: m.value, Detail: m.detail, Fraction: m.fraction })),
      Distributions: report.profile.distributions.map((d) => ({
        Title: d.title,
        Caption: d.caption,
        Buckets: d.buckets.map((b) => ({ Label: b.label, Count: b.count, Fraction: b.fraction })),
      })),
    },
    Questions: report.breakdowns.map((card): FormsQuestionBreakdown => {
      const question = report.questions.find((q) => q.id === card.questionId);
      const optionLabels = new Set((question?.options ?? []).map((o) => o.label));
      return {
        QuestionID: card.questionId,
        Prompt: card.prompt,
        QuestionType: card.type,
        Role: card.role as FormsQuestionBreakdown['Role'],
        AnsweredCount: card.answeredCount,
        Buckets: card.role === 'choice' ? foldOffList(card, optionLabels) : card.buckets.map((b) => ({ Label: b.label, Count: b.count, Fraction: b.fraction })),
        Numeric: numericOf(card.numeric),
        // D3: textAnswers (rendered Matrix answers) never leave the server; cells replace them.
        MatrixCells: card.role === 'composite' ? matrixCells : [],
      };
    }),
    OpenText: report.openText.map((t) => ({
      QuestionID: t.questionId,
      Prompt: t.prompt,
      QuestionType: t.typeLabel,
      Answered: t.answered,
      Skipped: t.skipped,
      ResponseRate: t.responseRate,
      MedianLength: t.medianLength,
      Themes: t.themes.map((th) => ({ Term: th.term, Answers: th.answers, Fraction: th.fraction })),
      ThemesApply: t.themesApply,
    })),
    Funnel: report.funnel.map((s) => ({ PageID: s.pageId, Title: s.title, DisplayOrder: s.displayOrder, Reached: s.reached, Retention: s.retention, DropOff: s.dropOff })),
  };
}

/** The cell counts the fixture's two Matrix answers hold ({venue: good, food: poor} and {venue: [good, poor]}). */
export const FIXTURE_MATRIX_CELLS = [
  { RowLabel: 'Venue', ColumnLabel: 'Good', Count: 2 },
  { RowLabel: 'Venue', ColumnLabel: 'Poor', Count: 1 },
  { RowLabel: 'Food', ColumnLabel: 'Good', Count: 0 },
  { RowLabel: 'Food', ColumnLabel: 'Poor', Count: 1 },
];

