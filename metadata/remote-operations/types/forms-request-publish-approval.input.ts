/**
 * Input for `Forms.RequestPublishApproval`.
 *
 * For a form whose `RequiresPublishApproval` is on: the server builds the snapshot of the form's
 * CURRENT authored structure as a new version with status `InReview`, then starts the review
 * workflow. The reviewer approves exactly that snapshot — edits made to the form afterwards are not
 * in it. Nothing the client holds is trusted, so the only input is which form.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsRequestPublishApprovalInput {
    /** The `MJ_BizApps_Forms: Forms` row to send for review. */
    FormID: string;
}
