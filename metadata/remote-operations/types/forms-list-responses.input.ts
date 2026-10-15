/**
 * Input for `Forms.ListResponses`: one page of a form's responses, newest first by default.
 *
 * Two callers: the Responses list, which pages through rows only, and the dashboard's CSV/Excel
 * export, which pages through EVERY response with its stored answers (`IncludeAnswers: true`)
 * and pivots them response x question. The export reads the whole form this way, page by page,
 * because no single page is allowed to be unbounded.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsListResponsesInput {
    /** The form whose responses are listed. */
    FormID: string;
    /** Only responses pinned to this version. Omitted or `null`: every version. */
    FormVersionID?: string | null;
    /** Only responses in this status (the `FormResponse.Status` CHECK values). Omitted: every status. */
    Status?: 'Complete' | 'Disqualified' | 'Partial';
    /** Zero-based index of the first row to return. */
    StartRow: number;
    /** Rows to return; the server caps it. */
    MaxRows: number;
    /** Sort order, from a fixed set so no caller-supplied SQL reaches the view. Default: SubmittedAt DESC. */
    OrderBy?: 'SubmittedAt DESC' | 'SubmittedAt ASC' | 'StartedAt DESC' | 'StartedAt ASC';
    /** Attach each row's stored answers, and the labelling definition, for the export. */
    IncludeAnswers: boolean;
}
