/**
 * Output for `Forms.ReorderAutomations`.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** One step's position after the reorder. */
export interface FormsAutomationPosition {
    /** The step. */
    FormAutomationID: string;
    /** Its stored DisplayOrder. */
    DisplayOrder: number;
}

export interface FormsReorderAutomationsOutput {
    /** Every step of the form, in run order. */
    Automations: FormsAutomationPosition[];
}
