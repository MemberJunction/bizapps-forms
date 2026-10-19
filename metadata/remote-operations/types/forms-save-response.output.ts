/**
 * Output for `Forms.SaveResponse`.
 *
 * Carries every field the retired `SubmitFormResponse` result had (`FormSubmissionResult`), in
 * PascalCase, plus the server-resolved outcome. The SERVER now decides whether the form ends and
 * which ending shows: a partial save that trips a knockout returns `ended` with the disqualification
 * screen, and a final submit returns the matched ending. The widget no longer evaluates scoring or
 * ending rules on the live path, because the respondent never receives them.
 *
 * A refusal the respondent can act on (validation, captcha, quota, a closed link) is a RESULT with
 * `Success: false` and Errors, not a thrown error; a thrown error is a failure of the system.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** One social link under an ending screen. */
export interface FormsEndingSocialLink {
    /** A `SocialPlatformId` from the contracts; a platform the widget cannot draw is skipped. */
    Platform: string;
    /** The link target. */
    URL: string;
}

/** The ending screen the server chose, with the content the widget renders. */
export interface FormsRespondentEnding {
    /** The `MJ_BizApps_Forms: Form Screens` row. */
    ID: string;
    /** Headline. */
    Title: string;
    /** Body copy under the title; plain text. `null` when none. */
    Body: string | null;
    /** The single button's label. `null`: the widget's default. */
    ButtonLabel: string | null;
    /** Image above the title, possibly a `/forms/asset/<id>` path relative to the API base. `null` when none. */
    MediaURL: string | null;
    /** Where to send the respondent instead of showing the screen; already checked safe. `null` when none. */
    RedirectURL: string | null;
    /** Social links shown under the message. Empty when none. */
    SocialLinks: FormsEndingSocialLink[];
    /** True when this ending is a knockout (the response is stored as Disqualified). */
    IsDisqualification: boolean;
}

/** A validation or processing error, tied to a question when it is about one. */
export interface FormsFieldError {
    /** The question the error is about; `null` for a form-level refusal (captcha, quota, closed link). */
    QuestionID: string | null;
    /** What to show the respondent. */
    Message: string;
}

export interface FormsSaveResponseOutput {
    /** Whether the save was accepted. `false` means nothing was stored and Errors says why. */
    Success: boolean;
    /** The response row written (equal to the input's ClientResponseID once adopted); `null` when nothing was stored. */
    ResponseID: string | null;
    /** The stored status (the `FormResponse.Status` CHECK values); `null` when nothing was stored. */
    Status: 'Complete' | 'Disqualified' | 'Partial' | null;
    /** `continue`: keep answering. `ended`: show the final screen (a final submit, or a knockout on a partial save). */
    Outcome: 'continue' | 'ended';
    /** The ending screen to show when Outcome is `ended` and an ending screen matched; absent otherwise. */
    Ending?: FormsRespondentEnding;
    /** Resolved confirmation text when ended with no redirect: the ending's body, else the form's confirmation message. */
    ConfirmationMessage?: string;
    /** Resolved, safety-checked redirect when ended: the ending's, else the form-wide fallback. */
    RedirectURL?: string;
    /** Why the save was refused, or problems with individual answers. Empty on success. */
    Errors: FormsFieldError[];
}
