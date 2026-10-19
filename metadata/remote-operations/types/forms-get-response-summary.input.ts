/**
 * Input for `Forms.GetResponseSummary`.
 *
 * Responses are scoped by FORM, across every version, unless a version is named: each response pins
 * the version that was live when it was submitted, so filtering to the latest version alone hides
 * every response an earlier one collected. Question and page labels come from the named version, or
 * from the form's Published version when none is named.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsGetResponseSummaryInput {
    /** The form to report on. */
    FormID: string;
    /** Narrow to the responses of one version, and label from it. Omitted or `null`: every version. */
    FormVersionID?: string | null;
}
