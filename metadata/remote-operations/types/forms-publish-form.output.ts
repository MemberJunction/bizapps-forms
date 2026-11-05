/**
 * Output for `Forms.PublishForm`.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsPublishFormOutput {
    /** The new `MJ_BizApps_Forms: Form Versions` row, now the form's one Published version. */
    FormVersionID: string;
    /** Its version number: the form's highest existing VersionNumber plus one. */
    VersionNumber: number;
    /** Versions this publish moved from Published to Retired (empty on a first publish). */
    RetiredVersionIDs: string[];
}
