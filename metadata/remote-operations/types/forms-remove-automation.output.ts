/**
 * Output for `Forms.RemoveAutomation`.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsRemoveAutomationOutput {
    /** The step removed. */
    FormAutomationID: string;
    /** The form it belonged to. */
    FormID: string;
    /** The binding the step ran, left in place; `null` when it ran an Action or Agent. */
    RetainedBindingID: string | null;
    /**
     * Built-in steps seeded in the same transaction, because the removal is what turned the form's
     * own steps on (a form still on Legacy dispatch). Usually empty.
     */
    SeededAutomationIDs: string[];
}
