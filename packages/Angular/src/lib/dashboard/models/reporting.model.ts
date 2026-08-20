/**
 * View-model types for the Forms reporting dashboard (WP-F).
 *
 * These are the shapes the dashboard components render. The data service
 * (`FormsReportingService`) builds them from RunView/RunViews results and the
 * published-form snapshot (`PublishedFormDefinition` from `@mj-biz-apps/forms-entities`).
 * Nothing here is persisted — they are purely the report's read-model.
 */
import type {
  FormQuestionType,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import type { ResponseListRow } from '../../responses/response-models';
import type { QuestionInsightRole } from '../services/question-insight-roles';
import type { RespondentProfile } from '../services/respondent-profile';
import type { OpenTextInsight } from '../services/open-text-insights';

/** A form the user can pick to report on, plus its published-version pointer. */
export interface ReportableForm {
  formId: string;
  formVersionId: string;
  name: string;
  /** Complete responses (Partials excluded) — used to disable empty forms in the picker. */
  responseCount: number;
}

/** Top-line summary statistics for the selected form. */
export interface FormSummaryStats {
  /** Total responses regardless of status. */
  totalResponses: number;
  /** Responses with Status = 'Complete'. */
  completeResponses: number;
  /** Responses with Status = 'Partial'. */
  partialResponses: number;
  /** completeResponses / totalResponses, 0..1. 0 when no responses. */
  completionRate: number;
  /**
   * MEDIAN seconds between StartedAt and SubmittedAt across complete responses that have
   * both timestamps and a plausible gap between them. Null when not computable.
   *
   * The median, not the mean, and the rename is the point: this figure is presented as the
   * TYPICAL time to fill the form in, and a mean is the one statistic that cannot survive
   * the data this column actually holds. A single response whose `StartedAt` is the Unix
   * epoch — which live data has — drags a mean of forty real submissions to "212759h 19m",
   * roughly twenty-four years, shown to a form owner as how long their form takes. The
   * median ignores it, and `PLAUSIBLE_SESSION_SECONDS` drops it from the sample entirely.
   */
  typicalCompletionSeconds: number | null;
  /** Most recent SubmittedAt across complete responses, or null. */
  lastSubmittedAt: Date | null;
}

/** One bucket in a choice/distribution breakdown. */
export interface DistributionBucket {
  /** Option label (or raw value for non-option answers). */
  label: string;
  /** Number of answers in this bucket. */
  count: number;
  /** count / total answered for the question, 0..1. */
  fraction: number;
}

/** Aggregates for numeric-family questions (Number, Rating, NPS). */
export interface NumericAggregate {
  answered: number;
  min: number | null;
  max: number | null;
  average: number | null;
  /** NPS score (-100..100); only populated for NPS questions. */
  npsScore: number | null;
  /** NPS segment counts; only populated for NPS questions. */
  npsSegments?: { detractors: number; passives: number; promoters: number };
}

/**
 * Per-question breakdown view-model — only for questions that are CHARTED.
 *
 * Identity, attachment and written-answer questions no longer produce one of these. They are
 * summarised by `RespondentProfile` and `OpenTextInsight` respectively, because a bar chart is
 * the wrong shape for all three and rendering them here is what put a column of email
 * addresses on the dashboard. See `question-insight-roles.ts`.
 */
export interface QuestionBreakdown {
  questionId: string;
  prompt: string;
  type: FormQuestionType;
  role: QuestionInsightRole;
  /** Total responses that answered this question. */
  answeredCount: number;
  /** Distribution buckets — 'choice', 'sentiment', 'consent' and 'temporal' roles. */
  buckets: DistributionBucket[];
  /** Numeric aggregates ('scale' role). */
  numeric: NumericAggregate | null;
  /** Rendered answers for 'composite' (Matrix), which has no aggregate form; capped. */
  textAnswers: string[];
}

/** One step in the page completion / drop-off funnel. */
export interface FunnelStep {
  pageId: string;
  title: string;
  displayOrder: number;
  /** Responses that reached (answered at least one question on) this page. */
  reached: number;
  /** reached / firstStepReached, 0..1. */
  retention: number;
  /** Drop relative to the previous step, 0..1. */
  dropOff: number;
}

/** The complete dashboard data bundle for one form version. */
export interface FormReportData {
  form: ReportableForm;
  /** The published questions, flattened in page/display order, for labelling. */
  questions: PublishedFormQuestion[];
  summary: FormSummaryStats;
  /** Who reached us — identity and attachment questions, counted rather than quoted. */
  profile: RespondentProfile;
  /** What they chose — the questions with a genuine aggregate form. */
  breakdowns: QuestionBreakdown[];
  /** What they wrote — rates, lengths and themes; never the answers themselves. */
  openText: OpenTextInsight[];
  funnel: FunnelStep[];
  responses: ResponseListRow[];
}
