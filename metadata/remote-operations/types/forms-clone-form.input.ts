/**
 * Input for `Forms.CloneForm`.
 *
 * Copies a form's whole authored tree (pages, questions, options, screens, entity bindings,
 * automations) into a new form or template in one transaction, then rewrites every rule and field
 * mapping that referenced a copied question or page by id. Also the "save as template" verb.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsCloneFormInput {
    /** The form (or template) to copy. */
    SourceFormID: string;
    /** Name for the copy. Omitted or blank: the server derives one from the source's name. */
    Name?: string;
    /** Description for the copy. Omitted: the source's carries over. `null` clears it. */
    Description?: string | null;
    /** `true` produces a template (`IsTemplate = 1`) whose `TemplateSourceFormID` is SourceFormID, which is what the builder's "Saved as template" indicator looks up; `false` a working Draft form. */
    AsTemplate: boolean;
}
