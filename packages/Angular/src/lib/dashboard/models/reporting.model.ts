/**
 * View-model types for the Forms reporting dashboard (WP-F).
 *
 * These are the shapes the dashboard components render. Since #303 the numbers are computed on the
 * server (`Forms.GetResponseSummary`) and `toFormReport` turns the operation's wire shape into this
 * read model: instants become `Date`s, question type keys are checked and become builder labels, and
 * names read the way the components were written. Nothing here is persisted.
 */
import type { FormQuestionType, FormsQuestionBreakdown } from '@mj-biz-apps/forms-entities';

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
  /** Complete responses — the headline count. A Partial is an in-progress autosave, not a response. */
  totalResponses: number;
  /** Responses with Status = 'Complete' (equal to `totalResponses`; kept so the two meanings stay distinct). */
  completeResponses: number;
  /** Responses with Status = 'Partial': started, not finished. */
  partialResponses: number;
  /** Responses with Status = 'Disqualified': ended by a knockout question ("screened out"). */
  disqualifiedResponses: number;
  /** Complete divided by every started response (Complete + Partial + Disqualified), 0..1; 0 when none. */
  completionRate: number;
  /**
   * MEDIAN seconds between StartedAt and SubmittedAt across Complete responses whose gap is
   * plausible (0..24 h). Null when not computable.
   *
   * The median, not the mean, and the name is the point: this figure is presented as the TYPICAL
   * time to fill the form in, and a single response whose `StartedAt` is the Unix epoch — which
   * live data has — drags a mean of forty real submissions to roughly twenty-four years.
   */
  typicalCompletionSeconds: number | null;
  /** Most recent SubmittedAt across Complete responses, or null. */
  lastSubmittedAt: Date | null;
}

/** One bucket in a choice/distribution breakdown. */
export interface DistributionBucket {
  /** Option label, "Other (not an option)" (`OFF_LIST_LABEL`), Yes/No, a period, a domain or "Other (n more)". */
  label: string;
  /** Number of answers in this bucket. */
  count: number;
  /** count / total answered for the question, 0..1. */
  fraction: number;
}

/** Aggregates for numeric-family questions (Number, Rating, NPS, OpinionScale). */
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

/** One (row, column) cell of a Matrix question: how many answers chose that column for that row. */
export interface MatrixCellCount {
  rowLabel: string;
  columnLabel: string;
  count: number;
}

/** Which card renders a charted question — the server's insight role. */
export type ChartedRole = FormsQuestionBreakdown['Role'];

/**
 * Per-question breakdown — only for questions that are CHARTED.
 *
 * Identity, attachment and written-answer questions never produce one of these: the server
 * summarises them in the respondent profile and the open-text insights, because a bar chart is the
 * wrong shape for all three, and rendering them here is what once put a column of email addresses
 * on the dashboard.
 */
export interface QuestionBreakdown {
  questionId: string;
  prompt: string;
  type: FormQuestionType;
  role: ChartedRole;
  /** Complete responses that stored a value for this question. */
  answeredCount: number;
  /** Distribution buckets — 'choice', 'sentiment', 'consent' and 'temporal' roles. */
  buckets: DistributionBucket[];
  /** Numeric aggregates ('scale' role). */
  numeric: NumericAggregate | null;
  /**
   * 'composite' (Matrix) only: every row × column cell with its count, in option order. Counts, never
   * rendered answers — those stay on the server and under Responses.
   */
  matrixCells: MatrixCellCount[];
}

/** One step in the page completion / drop-off funnel. */
export interface FunnelStep {
  pageId: string;
  title: string;
  displayOrder: number;
  /** Responses (any status) that answered at least one question on this page. */
  reached: number;
  /** reached / firstStepReached, 0..1. */
  retention: number;
  /** Drop relative to the previous step, 0..1. */
  dropOff: number;
}

/** One counted fact about the respondent population. */
export interface ProfileMetric {
  /** What is being counted, e.g. "Contactable". */
  label: string;
  /** The figure itself, already formatted for display. */
  value: string;
  /** The reading under it, e.g. "31 of 40 gave an email address". Empty when the value says it all. */
  detail: string;
  /** 0..1 when the metric is a share of the responses, for the inline meter. Null otherwise. */
  fraction: number | null;
}

/** A named grouping of the population — email domains, countries, companies. */
export interface ProfileDistribution {
  title: string;
  /** What the grouping means, and any caveat it carries. */
  caption: string;
  buckets: DistributionBucket[];
}

/**
 * The "Who responded" section: identity and attachment questions, counted and never quoted. Every
 * value is a count, a rate or a coarse grouping (an email DOMAIN, never an address).
 */
export interface RespondentProfile {
  /** True when the form asks nothing that profiles a respondent; the section is then omitted. */
  isEmpty: boolean;
  metrics: ProfileMetric[];
  distributions: ProfileDistribution[];
}

/** One recurring term and how many answers contained it. */
export interface TextTheme {
  term: string;
  /** Number of ANSWERS containing the term, not total occurrences. */
  answers: number;
  /** answers / answered, 0..1. */
  fraction: number;
}

/** What the Insights view says about one written question — rates, lengths and themes, never the answers. */
export interface OpenTextInsight {
  questionId: string;
  prompt: string;
  /** The builder's name for the type, e.g. "Long text". */
  typeLabel: string;
  answered: number;
  /** Complete responses that did not answer it. */
  skipped: number;
  /** answered / Complete responses, 0..1. Null when there are no responses to divide by. */
  responseRate: number | null;
  /** Median characters across non-empty answers. Null when nothing was written. */
  medianLength: number | null;
  /** Recurring terms, most common first. Empty when nothing recurs, or when themes do not apply. */
  themes: TextTheme[];
  /**
   * Whether themes are mined for this question at all (LongText only, so names typed into a
   * ShortText never become themes). Distinguishes "no pattern found" from "we do not mine this kind
   * of field", which the panel must not conflate: they look identical and mean opposite things.
   */
  themesApply: boolean;
}

/** The dashboard's report for one form, across every version. */
export interface FormReportData {
  form: ReportableForm;
  summary: FormSummaryStats;
  /** Who reached us — identity and attachment questions, counted rather than quoted. */
  profile: RespondentProfile;
  /** What they chose — the questions with a genuine aggregate form. */
  breakdowns: QuestionBreakdown[];
  /** What they wrote — rates, lengths and themes; never the answers themselves. */
  openText: OpenTextInsight[];
  funnel: FunnelStep[];
  /**
   * True when the form holds more identity, written and Matrix answers than one summary reads (a
   * fixed server ceiling): the profile, the open-text insights and the Matrix cells then describe
   * only the answers read, and the dashboard says so. Every other figure is exact either way.
   */
  insightAnswersCapped: boolean;
}
