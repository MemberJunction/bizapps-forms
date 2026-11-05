/**
 * Output for every distribution verb: `Forms.IssueDistributionLink`, `Forms.ReissueDistributionLink`,
 * `Forms.OpenDistribution` and `Forms.CloseDistribution`.
 *
 * The link's state AFTER the verb, read back from the database inside the same server call — the
 * provisioning hook writes the token on the server, so a client copy of the row is stale by design.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDistributionLinkOutput {
    /** The distribution acted on (the new one, for an issue). */
    FormDistributionID: string;
    /** Its slug; `null` for a row that has none (the column is nullable). Reissue keeps it, so every shared URL keeps working; only the credential changes. */
    Slug: string | null;
    /** Its status after the verb (the `FormDistribution.Status` CHECK values). */
    Status: 'Active' | 'Closed' | 'Draft';
    /** The public URL a respondent opens. `null` while the link is closed or no access token could be provisioned. */
    RespondentURL: string | null;
}
