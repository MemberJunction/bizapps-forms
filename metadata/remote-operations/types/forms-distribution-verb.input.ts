/**
 * Input for `Forms.ReissueDistributionLink`, `Forms.OpenDistribution` and `Forms.CloseDistribution`:
 * each acts on one existing share link and nothing else.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDistributionVerbInput {
    /** The `MJ_BizApps_Forms: Form Distributions` row to act on. */
    FormDistributionID: string;
}
