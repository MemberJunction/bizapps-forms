/**
 * Input for `Forms.DeleteTemplate`: permanently delete one SAVED template (a `Form` row with
 * `IsTemplate = 1`) and everything under it.
 *
 * Deletion is real only for templates. A working form is archived (`Forms.ArchiveForm`), never
 * deleted, because a form that collected responses must keep them; a template provably has none.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDeleteTemplateInput {
    /** The template to delete. A form that is not a template is refused. */
    TemplateFormID: string;
}
