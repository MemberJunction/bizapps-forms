/**
 * Output for `Forms.ListResponses`. Instants are ISO-8601 strings.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/**
 * One stored answer, exactly as the `FormResponseAnswer` row holds it (one typed column used per
 * answer; the rest `null`). Shared by `Forms.ListResponses` (export) and `Forms.GetResponseDetail`.
 *
 * `Score` and `ScoreRationale` are deliberately absent: neither the export nor the detail view
 * shows them (the scoring automation scores every ShortText answer, so a first name got
 * "Score: 100" beside it), and a value nobody renders is not worth sending.
 */
export interface FormsStoredAnswer {
    /** The `MJ_BizApps_Forms: Form Response Answers` row. */
    ID: string;
    /** The question answered. */
    QuestionID: string;
    /** Text and single-choice answers. */
    TextValue: string | null;
    /** Number, rating and NPS answers. */
    NumericValue: number | null;
    /** Date answers, ISO-8601. */
    DateValue: string | null;
    /** Yes/no and consent answers. */
    BooleanValue: boolean | null;
    /** JSON text of multi-select and composite answers. */
    JSONValue: string | null;
    /** The `MJ: Files` id of a file answer. */
    FileID: string | null;
}

/** One response in the list. */
export interface FormsResponseListRow {
    /** The `MJ_BizApps_Forms: Form Responses` row. */
    ResponseID: string;
    /** Its status (the `FormResponse.Status` CHECK values). */
    Status: 'Complete' | 'Disqualified' | 'Partial';
    /** The version it was submitted against. */
    FormVersionID: string;
    /** When the respondent began; `null` when unrecorded. */
    StartedAt: string | null;
    /** When it was submitted; `null` for a Partial. */
    SubmittedAt: string | null;
    /** The linked Person, when one was matched; `null` for an anonymous response. */
    RespondentPersonID: string | null;
    /** Who responded, for display: the linked Person's name, else a name or email answer, else "Anonymous". */
    Respondent: string;
    /** Questions this response stored an answer for. */
    AnsweredCount: number;
    /** Every stored answer of the response. Present only when the input's IncludeAnswers is true. */
    Answers?: FormsStoredAnswer[];
}

export interface FormsListResponsesOutput {
    /** The requested page of rows. */
    Rows: FormsResponseListRow[];
    /** Rows matching the filters across all pages. */
    TotalRowCount: number;
    /** The version whose questions labelled Respondent (and that the export pivots onto): the input's FormVersionID when given, else the form's Published version; `null` if neither exists. */
    LabelVersionID: string | null;
    /** JSON text of LabelVersionID's `PublishedFormDefinition` snapshot, for export columns. Present only when IncludeAnswers is true and LabelVersionID is set. */
    DefinitionJSON?: string;
}
