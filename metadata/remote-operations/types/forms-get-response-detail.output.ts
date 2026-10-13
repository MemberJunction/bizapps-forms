/**
 * Output for `Forms.GetResponseDetail`. Instants are ISO-8601 strings.
 *
 * The STORED rows, not a rendered view model: the client labels answers against
 * `DefinitionJSON` with the same pure builder it uses today (`buildResponseDetail`), so the
 * rendering rules stay in one place. `FormsStoredAnswer` is declared in
 * `forms-list-responses.output.ts`; CodeGen emits every type into one module, so it resolves.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** The response row's own fields. */
export interface FormsResponseDetailRecord {
    /** The response. */
    ID: string;
    /** Its form. */
    FormID: string;
    /** The version it was submitted against. */
    FormVersionID: string;
    /** Its status (the `FormResponse.Status` CHECK values). */
    Status: 'Complete' | 'Disqualified' | 'Partial';
    /** When the respondent began; `null` when unrecorded. */
    StartedAt: string | null;
    /** When it was submitted; `null` for a Partial. */
    SubmittedAt: string | null;
    /** The linked Person; `null` when none was matched. */
    RespondentPersonID: string | null;
    /** The linked Person's display name (the base view's denormalised field); `null` when none. */
    RespondentPerson: string | null;
}

/** The provenance row of one uploaded file a file answer references. */
export interface FormsResponseUpload {
    /** The `MJ_BizApps_Forms: Form Uploads` row. */
    ID: string;
    /** The `MJ: Files` id the answer holds. */
    FileID: string;
    /** The file name as uploaded; `null` when unrecorded. */
    FileName: string | null;
    /** Its MIME type; `null` when unrecorded. */
    ContentType: string | null;
    /** Its size; `null` when unrecorded. */
    SizeBytes: number | null;
    /** `Revoked` means the file is no longer retrievable (the `FormUpload.Status` CHECK values). */
    Status: 'Active' | 'Revoked';
}

/** One on-submit automation attempt this response triggered. */
export interface FormsResponseAutomationRun {
    /** The `MJ_BizApps_Forms: Form Automation Runs` row. */
    ID: string;
    /** The automation that ran. */
    FormAutomationID: string;
    /** Its name (the base view's denormalised field). */
    FormAutomation: string;
    /** Outcome of the attempt (the `FormAutomationRun.Status` CHECK values). */
    Status: 'Failed' | 'Pending' | 'Running' | 'Skipped' | 'Succeeded';
    /** The delivery attempt of its Work Queue message that last opened this row (1-based); not a count of runs. */
    AttemptCount: number;
    /**
     * The `forms.response-submitted` Work Queue message whose delivery ran this step — the exact link
     * from a run to the submit event that caused it. `null` for runs written before the column existed,
     * and for runs no delivery wrote.
     */
    WorkQueueMessageID: string | null;
    /** When it began; `null` if it never started. */
    StartedAt: string | null;
    /** When it finished; `null` while in flight. */
    CompletedAt: string | null;
    /** Why it failed; `null` otherwise. */
    ErrorMessage: string | null;
    /** JSON digest of the result; `null` when none. */
    OutputSummary: string | null;
    /** The `MJ: Action Execution Logs` row when an Action ran. */
    ActionExecutionLogID: string | null;
    /** The `MJ: AI Agent Runs` row when an Agent ran. */
    AIAgentRunID: string | null;
}

/** One business record this response's entity bindings created or merged into. */
export interface FormsResponseBindingRecord {
    /** The `MJ_BizApps_Forms: Form Entity Binding Records` ledger row. */
    ID: string;
    /** The binding that wrote it. */
    BindingID: string;
    /** The binding's name (the base view's denormalised field). */
    Binding: string;
    /** The entity written to. */
    TargetEntityID: string;
    /** That entity's canonical name, resolved server-side for deep links; `null` when metadata has none. */
    TargetEntityName: string | null;
    /** The record written; `null` when none was. */
    TargetRecordID: string | null;
    /** What happened (the `FormEntityBindingRecord.Outcome` CHECK values). */
    Outcome: 'Created' | 'Merged' | 'Skipped' | 'Unchanged';
    /** JSON text of the field names written; `null` when none. */
    WrittenFields: string | null;
}

export interface FormsGetResponseDetailOutput {
    /** The response. */
    Response: FormsResponseDetailRecord;
    /** Every stored answer of the response. */
    Answers: FormsStoredAnswer[];
    /** Provenance of the files the answers reference. Empty when no answer holds a file. */
    Uploads: FormsResponseUpload[];
    /** Automation attempts, oldest first. */
    AutomationRuns: FormsResponseAutomationRun[];
    /** Binding ledger rows, oldest first. */
    BindingRecords: FormsResponseBindingRecord[];
    /** The version that labelled the answers. */
    LabelFormVersionID: string;
    /** JSON text of that version's `PublishedFormDefinition` snapshot; `null` when it has none. */
    DefinitionJSON: string | null;
    /** Sections the caller may not read (for example "automation runs"): reported as missing, never as empty. */
    UnavailableSections: string[];
}
