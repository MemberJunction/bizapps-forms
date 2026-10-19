/**
 * Input for `Forms.SaveResponse`: every respondent write, partial autosave and final submit alike.
 *
 * Carries everything the retired `SubmitFormResponse` mutation accepted (`FormSubmissionInputType`),
 * renamed to PascalCase: `distributionSlug` is `Slug`, `formVersionId` is `FormVersionID`,
 * `partial` is `Mode`, `responseId` is `ClientResponseID`, and the answer fields keep their meaning.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/**
 * One answer. Exactly one typed value (or JSONValue) is expected per question, matching the
 * `FormResponseAnswer` typed-column layout; absent and `null` both mean "this answer does not use
 * this column", because a client may send an explicit `null` for any of them.
 */
export interface FormsAnswerInput {
    /** The question answered. Unknown questions are refused. */
    QuestionID: string;
    /** Text and single-choice answers. */
    TextValue?: string | null;
    /** Number, rating and NPS answers. */
    NumericValue?: number | null;
    /** Date answers, ISO-8601. */
    DateValue?: string | null;
    /** Yes/no and consent answers. */
    BooleanValue?: boolean | null;
    /** JSON text for multi-select and other structured answers (a JSON array of values for multi-select). */
    JSONValue?: string | null;
    /** The uploaded file's `MJ: Files` id for a file answer; proved against the upload ledger for this link and ClientResponseID. */
    FileID?: string | null;
}

/** Lightweight client telemetry; the IP hash is derived server-side and never sent. */
export interface FormsClientMeta {
    /** `document.referrer` of the embedding page. */
    Referrer?: string;
    /** The browser's user agent. */
    UserAgent?: string;
}

export interface FormsSaveResponseInput {
    /** The share link's slug; resolves the distribution, form and published version. */
    Slug: string;
    /** Echoed from `Forms.GetRespondentForm`; pins the response to the version the respondent saw. */
    FormVersionID: string;
    /** `partial` banks a Partial draft (and may end it on a knockout); `final` submits it as Complete. */
    Mode: 'partial' | 'final';
    /** Client-minted v4 UUID, stable across every save of one sitting: adopted as the response's primary key and the idempotency key. */
    ClientResponseID: string;
    /** ISO-8601 instant the respondent began; kept from the first save on later ones. */
    StartedAt?: string;
    /** Cloudflare Turnstile token; required on a final submit when the form or link has captcha on. */
    TurnstileToken?: string;
    /** Client telemetry. */
    ClientMeta?: FormsClientMeta;
    /** Every answer the respondent currently has; the server reconciles stored answers to this set. */
    Answers: FormsAnswerInput[];
}
