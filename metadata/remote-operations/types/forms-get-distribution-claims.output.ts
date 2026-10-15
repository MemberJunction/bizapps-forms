/**
 * Output for `Forms.GetDistributionClaims`.
 *
 * A claimant that could not be consulted is a FAILURE entry, not a thrown error: one app being down
 * must not hide the claims the others reported.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** One share-link slug another app owns. */
export interface FormsDistributionClaim {
    /** The app that owns the slug, for example "Caliber". */
    AppName: string;
    /** The claimed slug; always one of the form's own. */
    Slug: string;
    /** What inside the app owns the slug, for example an interview step name. */
    OwnerLabel: string;
    /** The owning app's own public link, or `null` when it must not be published. */
    RespondentURL: string | null;
}

/** An app that could not be consulted, or whose answer was partly refused. */
export interface FormsDistributionClaimFailure {
    /** The app that failed. */
    AppName: string;
    /** What went wrong, fit to show an author. */
    Message: string;
}

export interface FormsGetDistributionClaimsOutput {
    /** Every claimed slug, across all claimant apps. */
    Claims: FormsDistributionClaim[];
    /** Claimants that could not answer in full. */
    Failures: FormsDistributionClaimFailure[];
}
