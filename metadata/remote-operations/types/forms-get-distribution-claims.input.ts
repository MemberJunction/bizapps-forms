/**
 * Input for `Forms.GetDistributionClaims`: which of a form's share-link slugs other installed apps
 * own (for example an interview step in another app that publishes the link itself).
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsGetDistributionClaimsInput {
    /** The form whose share-link slugs are checked. */
    FormID: string;
}
