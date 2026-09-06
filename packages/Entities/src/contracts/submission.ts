/**
 * S1 — Public submit transport types.
 *
 * These mirror the GraphQL `FormSubmissionInput` / `FormSubmissionResult` shapes
 * (PHASE1_DECOMPOSITION §S1). The widget (WP-C) builds a {@link FormSubmissionInput}
 * and the server (WP-B) returns a {@link FormSubmissionResult}. IP-hash is computed
 * server-side from the request and is intentionally absent from these client-facing
 * types.
 */
import type { JSONValue } from './json-value';
import type { mjBizAppsFormsFormResponseEntity } from '../generated/entity_subclasses';

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

/** The payload posted to the S1 `SubmitFormResponse` mutation. */
export interface FormSubmissionInput {
  /** Resolves FormDistribution -> Form -> published FormVersion. */
  distributionSlug: string;
  /** Echoed back from `PublishedForm`; pins the response to a version. */
  formVersionId: string;
  /** `true` => save as `Partial`; `false`/absent => `Complete`. */
  partial?: boolean;
  /** ISO-8601 timestamp the respondent began the form. */
  startedAt?: string;
  /** Cloudflare Turnstile token; required iff the form/distribution has captcha on. */
  turnstileToken?: string;
  clientMeta?: ClientMeta;
  answers: FormAnswerInput[];
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

/** The result returned by the S1 `SubmitFormResponse` mutation. */
export interface FormSubmissionResult {
  success: boolean;
  responseId?: string;
  /**
   * Persisted `FormResponse` status. DERIVED from the entity rather than restated: the value list
   * comes from a CHECK constraint, so the next migration that widens it widens this too. It was
   * `string` with a comment naming only `Partial` and `Complete`, which stopped being true the
   * moment `Disqualified` shipped — and a caller branching on it had no compile-time help.
   */
  status?: mjBizAppsFormsFormResponseEntity['Status'];
  confirmationMessage?: string;
  redirectUrl?: string;
  errors?: FieldError[];
}
