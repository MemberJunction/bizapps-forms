/**
 * Output for `Forms.GetRespondentForm`.
 *
 * The definition is an ALLOWLIST projection of the published snapshot, built field by field
 * (`toRespondentDefinition` in the contracts): it carries what is needed to render and to validate
 * client-side, and never the answer key, the ending screens, score or knockout conditions, the
 * automations, the quota or the redirect URL. It travels as JSON text so this contract does not
 * duplicate, and then drift from, the contracts tree; the widget parses it with the contracts zod
 * schema.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsGetRespondentFormOutput {
    /** The Published version being served. Sent back on every `Forms.SaveResponse` to pin the response. */
    FormVersionID: string;
    /** JSON text of the `RespondentFormDefinition`: name, render mode, welcome screen, pages, questions, options, rules, style tokens. */
    DefinitionJSON: string;
    /** JSON text of a `ResumeSnapshot` when this session is scoped to one draft response; `null` for an ordinary public-link session. */
    ResumeJSON: string | null;
    /** Whether a final submit must carry a Turnstile token. */
    CaptchaRequired: boolean;
}
