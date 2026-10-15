/**
 * Input for `Forms.ArchiveForm` and `Forms.RestoreForm` — one shape, because both name one form and
 * let the server's status machine decide the rest.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsFormLifecycleInput {
    /** The form to archive or restore. */
    FormID: string;
}
