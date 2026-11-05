/**
 * Output for `Forms.ArchiveForm` and `Forms.RestoreForm`.
 *
 * Archive moves the form to `Closed` and closes every Active distribution in the same transaction.
 * Restore moves it back to `Published` when it has a Published version, else to `Draft` — so the
 * caller learns which, rather than assuming.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsFormLifecycleOutput {
    /** The form acted on. */
    FormID: string;
    /** The form's status after the verb (the `Form.Status` CHECK values). */
    Status: 'Draft' | 'Published' | 'Closed';
}
