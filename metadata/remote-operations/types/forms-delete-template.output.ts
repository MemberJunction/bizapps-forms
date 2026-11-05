/**
 * Output for `Forms.DeleteTemplate`. The counts say what went with the template, all in one
 * transaction: either all of it is gone or none of it is.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDeleteTemplateOutput {
    /** The template deleted. */
    TemplateFormID: string;
    /** Pages deleted with it. */
    PageCount: number;
    /** Questions deleted with it. */
    QuestionCount: number;
    /** Question options deleted with it. */
    OptionCount: number;
    /** Welcome and ending screens deleted with it. */
    ScreenCount: number;
    /** Automations deleted with it. */
    AutomationCount: number;
    /** Entity bindings deleted with it. */
    BindingCount: number;
}
