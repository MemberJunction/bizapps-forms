/**
 * Output for `Forms.ReplayAutomationEvent`.
 *
 * The event is re-queued, then its response is drained once, now. A replay reopens only that event's
 * `Dead-lettered: ` run rows, so a step that already succeeded does not run a second time. `Status` is
 * the state the replay WROTE, not the outcome of the run: the caller reloads the response detail to
 * see how the drain ended.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsReplayAutomationEventOutput {
    /** The event replayed. */
    FormAutomationEventID: string;
    /** The status the replay wrote: always `Pending`, the re-queued state. */
    Status: 'Pending';
}
