/**
 * Output for `Forms.SaveAutomation`.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsSaveAutomationOutput {
    /** The step written. */
    FormAutomationID: string;
    /** The binding the step runs, or `null` for an Action or Agent step. */
    FormEntityBindingID: string | null;
    /** The step's DisplayOrder after the save. */
    DisplayOrder: number;
    /** Built-in steps seeded in the same transaction because this was the form's first configured step. Usually empty. */
    SeededAutomationIDs: string[];
}
