/**
 * S1 — Public submit transport types, and the sentences both sides of a submit say.
 *
 * The retired `SubmitFormResponse` mutation's `FormSubmissionInput` / `FormSubmissionResult` were
 * removed with #303: the wire shapes are now `Forms.SaveResponse`'s generated
 * `FormsSaveResponseInput` / `FormsSaveResponseOutput`. What stays here is what the widget and the
 * server still share — one answer's shape, client telemetry, a field error, and the refusal
 * sentences. IP-hash is computed server-side from the request and is intentionally absent.
 */
import type { JSONValue } from './json-value';

/** Lightweight client telemetry; IP-hash is derived server-side, not sent here. */
export interface ClientMeta {
  referrer?: string;
  userAgent?: string;
}

/**
 * One answer in a submission. Exactly one (or, for complex answers, `jsonValue`)
 * of the typed value fields is expected per question, matching the
 * `FormResponseAnswer` typed-column layout.
 *
 * Every typed field is `| null`, not merely optional, because the transport really does deliver
 * `null` and a type that denies it makes the defence against it look like dead code. A GraphQL
 * client may send an explicit `null` for any `nullable: true` field, and a mapper that assumes
 * otherwise crashes: `parseJsonValue` carries a `raw == null` guard added after `null.trim()`
 * 500ed every submit for `jsonValue`, and the same crash reached the anonymous public write path
 * again through `dateValue`. With the field typed as it actually arrives, the compiler is the
 * thing that finds the next one instead of a respondent.
 *
 * Absent and null are still the same thing to every reader — "this answer does not use this
 * column" — which is why `answerValueOf` and `applyAnswerValue` both test `!= null`.
 */
export interface FormAnswerInput {
  questionId: string;
  textValue?: string | null;
  numericValue?: number | null;
  dateValue?: string | null;
  booleanValue?: boolean | null;
  /** Structured value for multi/complex answers (e.g. MultiChoice selections). */
  jsonValue?: JSONValue | null;
  /** `MJ: Files` id for FileUpload answers. */
  fileId?: string | null;
}

/** A single validation/processing error, optionally tied to a specific question. */
export interface FieldError {
  questionId?: string;
  message: string;
}

/**
 * What a respondent is told when their final submit would store nothing (#124).
 *
 * Lives in the contract, not in the validator that raises it, because BOTH sides say it: the
 * server refuses the submission with this sentence, and the widget refuses to send one in the
 * first place so the respondent is answered without a round trip. Two string literals in two
 * packages would drift, and the drift would be invisible — the widget's banner and the server's
 * refusal would simply disagree about the same rule. Importing one constant makes them the same
 * sentence by construction, which is the same reason `isAnswerSupplied` and `validateAnswerFormat`
 * are shared rather than reimplemented per side.
 */
export const NOTHING_TO_SUBMIT_MESSAGE = 'Please answer at least one question before submitting.';

/**
 * What a respondent is told when a captcha is required and this host cannot complete one (#122).
 *
 * Here for the same reason as {@link NOTHING_TO_SUBMIT_MESSAGE}, and with one extra job. Both sides
 * say it: the widget when captcha is on but no site key was supplied, so it refuses to render a
 * challenge it cannot produce a token for; the server when a submit arrives needing verification
 * and `FORMS_TURNSTILE_SECRET` is unset. Two halves of one misconfiguration, and nothing the
 * respondent did — so neither sentence blames them.
 *
 * The extra job is that the widget also classifies this refusal. `isTurnstileError` decides whether
 * to clear the spent single-use token and re-arm the challenge, and it decides from the message,
 * because the transport carries no code. While each side spelled the sentence itself, that
 * classification held only by the accident of both spellings containing the word "captcha" — and it
 * broke the moment the server's copy was rewritten to stop blaming the respondent. One constant
 * makes the two sentences the same by construction, so the classifier can match it exactly instead
 * of sniffing for a word that any rewording may drop.
 */
export const CAPTCHA_NOT_CONFIGURED_MESSAGE =
  'This form requires a security check that has not been set up on this server. Please contact the form owner.';
