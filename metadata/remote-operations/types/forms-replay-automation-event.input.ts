/**
 * Input for `Forms.ReplayAutomationEvent` — names one dead-lettered automation event to run again.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsReplayAutomationEventInput {
    /** The `FormAutomationEvent` to replay; it must be `DeadLetter`, or the call is refused and nothing is written. */
    FormAutomationEventID: string;
}
