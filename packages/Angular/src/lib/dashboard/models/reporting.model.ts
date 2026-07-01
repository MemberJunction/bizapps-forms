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
   * Average seconds between StartedAt and SubmittedAt across complete responses
   * that have both timestamps. Null when not computable.
   */
  averageCompletionSeconds: number | null;
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

/** How a given question's answers should be visualised. */
export type BreakdownKind = 'distribution' | 'numeric' | 'freeText' | 'boolean';

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

/** A row in the individual-response list/grid. */
export interface ResponseListRow {
  responseId: string;
  status: 'Complete' | 'Partial';
  startedAt: Date | null;
  submittedAt: Date | null;
  respondent: string;
  answeredCount: number;
}

/** One labelled answer in the individual-response detail view. */
export interface ResponseAnswerView {
  questionId: string;
  prompt: string;
  type: FormQuestionType;
  /** Human-readable rendering of the answer. */
  displayValue: string;
}

/** The full individual-response detail view-model. */
export interface ResponseDetail {
  responseId: string;
  status: 'Complete' | 'Partial';
  startedAt: Date | null;
  submittedAt: Date | null;
  respondent: string;
  answers: ResponseAnswerView[];
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
