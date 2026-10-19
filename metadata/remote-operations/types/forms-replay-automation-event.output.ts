/**
 * Output for `Forms.ReplayAutomationEvent`.
 *
 * The event is re-queued and run once, now. A replay reopens only that event's `Dead-lettered: ` run
 * rows, so a step that already succeeded does not run a second time. The outcome of the run is read
 * from the event's own `Status` afterwards: the call returns once the run has been attempted.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsReplayAutomationEventOutput {
    /** The event replayed. */
    EventID: string;
    /** The response the event belongs to. */
    FormResponseID: string;
    /** The event's status after the run (the `FormAutomationEvent.Status` CHECK values). */
    Status: 'Pending' | 'Running' | 'Complete' | 'DeadLetter' | 'Abandoned';
}
