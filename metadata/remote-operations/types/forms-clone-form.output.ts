/**
 * Output for `Forms.CloneForm`. The counts describe what was copied, so a caller can confirm the
 * copy is whole without re-reading it.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsCloneFormOutput {
    /** The new form's (or template's) id. */
    FormID: string;
    /** The copy's `TemplateSourceFormID`: the input's SourceFormID when AsTemplate, else `null`. */
    TemplateSourceFormID: string | null;
    /** Pages copied. */
    PageCount: number;
    /** Questions copied. */
    QuestionCount: number;
    /** Question options copied. */
    OptionCount: number;
    /** Welcome and ending screens copied. */
    ScreenCount: number;
    /** Automations copied. */
    AutomationCount: number;
    /** Entity bindings copied. */
    BindingCount: number;
    /** References that could not be carried over (a rule naming a question the source no longer has). Usually empty. */
    Warnings: string[];
}
