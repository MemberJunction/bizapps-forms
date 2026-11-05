/**
 * Input for `Forms.ReorderAutomations`.
 *
 * The COMPLETE desired order, not a single move: the server rewrites DisplayOrder for every step in
 * one transaction, so there is no half-applied swap to compensate for. Sync steps always run before
 * Async ones whatever DisplayOrder says, so an order placing an Async step ahead of a Sync step is
 * refused rather than saved and silently ignored by the runner.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsReorderAutomationsInput {
    /** The form whose steps are reordered. */
    FormID: string;
    /** Every one of the form's automation ids exactly once, in run order. */
    OrderedAutomationIDs: string[];
}
