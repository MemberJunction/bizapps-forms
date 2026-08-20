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
 * How a given question's answers should be visualised.
 *
 * `files` is not a chart. A FileUpload or Signature answer holds a `FileID` and nothing
 * renderable — there is no text to list and no category to bucket — so the card states how
 * many were attached and sends the reader to the response detail, which can actually open
 * them. It exists because the alternative was the free-text fallback, which printed "No
 * answers yet" directly beneath a header reading "19 answers".
 */
export type BreakdownKind = 'distribution' | 'numeric' | 'freeText' | 'boolean' | 'files';

/** Per-question breakdown view-model. */
export interface QuestionBreakdown {
  questionId: string;
  prompt: string;
  type: FormQuestionType;
  kind: BreakdownKind;
  /** Total responses that answered this question. */
  answeredCount: number;
  /** Choice/boolean distribution buckets (kind 'distribution' | 'boolean'). */
  buckets: DistributionBucket[];
  /** Numeric aggregates (kind 'numeric'). */
  numeric: NumericAggregate | null;
  /** Free-text answers (kind 'freeText'); capped for display. */
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
  breakdowns: QuestionBreakdown[];
  funnel: FunnelStep[];
  responses: ResponseListRow[];
}
