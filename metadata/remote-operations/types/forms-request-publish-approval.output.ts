/**
 * Output for `Forms.RequestPublishApproval`.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsRequestPublishApprovalOutput {
    /** The new `MJ_BizApps_Forms: Form Versions` row, now `InReview`. It goes live only if approved. */
    FormVersionID: string;
    /** Its version number: the form's highest existing VersionNumber plus one. */
    VersionNumber: number;
    /** The review workflow run (the parent `MJ: Tasks` row), also stored on the version. */
    WorkflowTaskID: string;
}
