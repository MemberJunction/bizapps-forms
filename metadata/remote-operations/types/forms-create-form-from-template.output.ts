/**
 * Output for `Forms.CreateFormFromTemplate`. The new form is a Draft; publishing is a separate verb.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsCreateFormFromTemplateOutput {
    /** The new Draft form's id. */
    FormID: string;
    /** References a saved template's copy could not carry over (a rule naming a question the template no longer has), for the author to fix. Always empty for a starter key. */
    Warnings: string[];
}
