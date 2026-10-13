/**
 * Input for `Forms.IssueDistributionLink`.
 *
 * Creates a share link for a form and opens it. Slug generation, its uniqueness retry and the
 * magic-link provisioning all happen server-side; a caller supplies a preferred slug at most.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsIssueDistributionLinkInput {
    /** The form the link serves. */
    FormID: string;
    /** The channel this link is shared through (the `FormDistribution.ChannelType` CHECK values). */
    ChannelType: 'Email' | 'Embed' | 'PublicLink' | 'QR';
    /** Display name for the link. Omitted or blank: the server derives one from the form and channel. */
    Name?: string;
    /** Preferred URL slug. Omitted: derived from the name. Taken: a random suffix is appended. */
    Slug?: string;
    /** Response cap for this link. Omitted or `null`: uncapped. */
    MaxResponses?: number | null;
    /** ISO-8601 instant the link starts accepting responses. Omitted or `null`: immediately. */
    OpenAt?: string | null;
    /** ISO-8601 instant the link stops accepting responses. Omitted or `null`: never. */
    CloseAt?: string | null;
    /** Require a Turnstile check on submit. Omitted: `false` (captcha is opt-in). */
    CaptchaRequired?: boolean;
}
