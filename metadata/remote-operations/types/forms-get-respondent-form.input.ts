/**
 * Input for `Forms.GetRespondentForm`: what an anonymous respondent loads to render a form.
 *
 * Authorized only for a magic-link session scoped to the distribution the slug resolves to (or, on a
 * resume, to the response being resumed).
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsGetRespondentFormInput {
    /** The share link's slug (the `/f/:slug` path segment). */
    Slug: string;
}
