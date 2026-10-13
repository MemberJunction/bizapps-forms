/**
 * Input for `Forms.RemoveAutomation`.
 *
 * Removing a step never deletes the binding it ran: a binding's ledger of written records outlives
 * the step. The form is marked as owning its automation list in the same transaction, so removing
 * the last step cannot bring the legacy built-ins back.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsRemoveAutomationInput {
    /** The step to remove. */
    FormAutomationID: string;
}
