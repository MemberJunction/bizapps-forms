/**
 * Input for `Forms.PublishForm`.
 *
 * Publishes the form's CURRENT authored structure as a new version: the server reads the live rows,
 * builds the snapshot with the contracts builder, gates it on the strict rule parsers, retires the
 * incumbent and inserts the new Published version in one transaction. Nothing the client holds is
 * trusted, so the only input is which form.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsPublishFormInput {
    /** The `MJ_BizApps_Forms: Forms` row to publish. Template forms are refused. */
    FormID: string;
}
