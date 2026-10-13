/**
 * Output for `Forms.GetResponseSummary`: every section of the reporting dashboard
 * (`FormReportData` in forms-ng: summary, profile, breakdowns, open text, funnel), computed on the
 * server instead of in the browser over every answer row.
 *
 * AGGREGATES ONLY. Nothing here carries an answer's value: no email, phone, address, name or
 * free-text answer, and no rendered matrix answer. The server reads every value to compute the
 * figures and returns counts, rates, medians and groupings, which is the dashboard's own rule
 * (`respondent-profile.ts`: "an identity answer's VALUE never leaves this file";
 * `reporting.model.ts`: open text is "rates, lengths and themes; never the answers themselves").
 * The only text derived from answers is what the dashboard already shows as a grouping: email
 * DOMAINS, countries and organisation names folded to the top six plus "Other", and LongText
 * theme terms used in at least two answers. Per-response values belong to `Forms.ListResponses`
 * and `Forms.GetResponseDetail`, where each has a person and a time attached.
 *
 * Population rules carried over from reporting-aggregations.ts: the headline, the breakdowns, the
 * profile and the open-text section describe COMPLETE responses; the funnel counts every response,
 * because drop-off is a fact about the people who abandoned. Instants are ISO-8601 strings.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** Headline figures. */
export interface FormsResponseSummaryStats {
    /** Complete responses: the headline count. A Partial row is an in-progress autosave, not a response. */
    TotalResponses: number;
    /** Responses with Status Complete (equal to TotalResponses; kept so the two meanings stay distinct). */
    CompleteResponses: number;
    /** Responses with Status Partial. */
    PartialResponses: number;
    /** Responses with Status Disqualified (ended by a knockout). */
    DisqualifiedResponses: number;
    /** Complete divided by every started response (Complete + Partial + Disqualified), 0..1; 0 when none. */
    CompletionRate: number;
    /** MEDIAN seconds from StartedAt to SubmittedAt over Complete responses whose gap is 0..24 h; `null` when none qualify. */
    TypicalCompletionSeconds: number | null;
    /** Latest SubmittedAt over Complete responses; `null` when none. */
    LastSubmittedAt: string | null;
}

/** One bucket of a distribution. */
export interface FormsAnswerBucket {
    /** Display label: an option label, Yes/No, a period, a domain, or "Other (n more)". */
    Label: string;
    /** Answers (or, for profile groupings, addresses or responses) in this bucket. */
    Count: number;
    /** Count divided by the distribution's total, 0..1. */
    Fraction: number;
}

/** Counts of NPS segments. */
export interface FormsNPSSegments {
    /** Ratings 0..6. */
    Detractors: number;
    /** Ratings 7..8. */
    Passives: number;
    /** Ratings 9..10. */
    Promoters: number;
}

/** Aggregates for numeric questions (Number, Rating, NPS, OpinionScale). */
export interface FormsNumericAggregate {
    /** Answers carrying a number. */
    Answered: number;
    /** Smallest answer; `null` when none. */
    Min: number | null;
    /** Largest answer; `null` when none. */
    Max: number | null;
    /** Mean answer; `null` when none. */
    Average: number | null;
    /** NPS score -100..100 over ratings within 0..10 only; `null` unless an NPS question with such ratings. */
    NPSScore: number | null;
    /** Segment counts behind NPSScore; `null` unless NPSScore is set. */
    NPSSegments: FormsNPSSegments | null;
}

/** One (row, column) cell of a Matrix question: how many answers chose that column for that row. */
export interface FormsMatrixCell {
    /** The row option's label. */
    RowLabel: string;
    /** The column option's label. */
    ColumnLabel: string;
    /** Answers that chose this column for this row. */
    Count: number;
}

/** One CHARTED question's breakdown (roles choice, scale, sentiment, consent, temporal, composite). */
export interface FormsQuestionBreakdown {
    /** The question. */
    QuestionID: string;
    /** Its prompt, from the labelling version. */
    Prompt: string;
    /** Its type: a `FormQuestionType` key from the contracts (validate with `isFormQuestionType`). */
    QuestionType: string;
    /** Which card renders it (the dashboard's insight role; identity, open text and attachment questions are reported elsewhere). */
    Role: 'choice' | 'scale' | 'sentiment' | 'consent' | 'temporal' | 'composite';
    /** Complete responses that stored an answer to it (a choice answer that selected nothing does not count). */
    AnsweredCount: number;
    /** choice: every option, most chosen first. sentiment and consent: Yes then No. temporal: periods in order, never re-sorted. Otherwise empty. */
    Buckets: FormsAnswerBucket[];
    /** scale only; `null` otherwise. */
    Numeric: FormsNumericAggregate | null;
    /** composite (Matrix) only: every row x column cell with a count, in option order; empty otherwise. */
    MatrixCells: FormsMatrixCell[];
}

/** One counted fact about the respondent population, formatted as the profile panel shows it. */
export interface FormsProfileMetric {
    /** What is counted, for example "Contactable". */
    Label: string;
    /** The figure, already formatted, for example "31" or "61%". */
    Value: string;
    /** The reading under it, for example "of 40 responses gave an email"; empty when the value says it all. */
    Detail: string;
    /** 0..1 when the metric is a share, for the inline meter; `null` otherwise. */
    Fraction: number | null;
}

/** A named grouping of the population, folded to the top six plus "Other". */
export interface FormsProfileDistribution {
    /** For example "Email domains", "Countries", "Organisations". */
    Title: string;
    /** What the grouping means and its caveat. */
    Caption: string;
    /** Biggest first. */
    Buckets: FormsAnswerBucket[];
}

/** The "Who responded" section: identity and attachment questions, counted and never quoted. */
export interface FormsRespondentProfile {
    /** True when the form asks nothing that profiles a respondent; the section is then omitted. */
    IsEmpty: boolean;
    /** Contactable, distinct people, work addresses, phone/website/address/drawing/file coverage. */
    Metrics: FormsProfileMetric[];
    /** Email domains (local parts never read), countries, organisations. */
    Distributions: FormsProfileDistribution[];
}

/** One recurring term across a LongText question's answers. */
export interface FormsTextTheme {
    /** The term, lowercased. */
    Term: string;
    /** Answers containing it (at least 2), not occurrences. */
    Answers: number;
    /** Answers divided by the question's Answered, 0..1. */
    Fraction: number;
}

/** What can be said about one written question (ShortText, LongText) without quoting it. */
export interface FormsOpenTextInsight {
    /** The question. */
    QuestionID: string;
    /** Its prompt. */
    Prompt: string;
    /** Its type: a `FormQuestionType` key; the client maps it to its display label. */
    QuestionType: string;
    /** Complete responses that wrote something, de-duplicated by response. */
    Answered: number;
    /** Complete responses that did not, clamped at 0. */
    Skipped: number;
    /** Answered divided by Complete responses, 0..1; `null` when there are none. */
    ResponseRate: number | null;
    /** Median characters across non-empty answers, rounded; `null` when nothing was written. */
    MedianLength: number | null;
    /** Up to 8 recurring terms, most common first. Always empty when ThemesApply is false. */
    Themes: FormsTextTheme[];
    /** Whether themes are mined for this type at all (LongText only, so names typed into a ShortText never become themes). */
    ThemesApply: boolean;
}

/** One step of the page completion funnel. */
export interface FormsFunnelStep {
    /** The page. */
    PageID: string;
    /** Its title, or a positional fallback ("Page 2") when it has none. */
    Title: string;
    /** Its DisplayOrder in the labelling version. */
    DisplayOrder: number;
    /** Responses (any status) that answered at least one question on the page. */
    Reached: number;
    /** Reached divided by the first step's Reached, 0..1. */
    Retention: number;
    /** Drop relative to the previous step, 0..1. */
    DropOff: number;
}

export interface FormsGetResponseSummaryOutput {
    /** The form reported on. */
    FormID: string;
    /** The version the labels came from; `null` when the form has never been published. */
    LabelVersionID: string | null;
    /** Headline figures. */
    Summary: FormsResponseSummaryStats;
    /** Who responded. */
    Profile: FormsRespondentProfile;
    /** One entry per charted question of the labelling version, in page then question order. */
    Questions: FormsQuestionBreakdown[];
    /** One entry per ShortText or LongText question, in page then question order. */
    OpenText: FormsOpenTextInsight[];
    /** One step per page that asks at least one answerable question, in DisplayOrder. */
    Funnel: FormsFunnelStep[];
}
