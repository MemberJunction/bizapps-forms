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

/** Lightweight client telemetry; IP-hash is derived server-side, not sent here. */
export interface ClientMeta {
  referrer?: string;
  userAgent?: string;
}

/**
 * One answer in a submission. Exactly one (or, for complex answers, `jsonValue`)
 * of the typed value fields is expected per question, matching the
 * `FormResponseAnswer` typed-column layout.
 */
export interface FormAnswerInput {
  questionId: string;
  textValue?: string;
  numericValue?: number;
  dateValue?: string;
  booleanValue?: boolean;
  /** Structured value for multi/complex answers (e.g. MultiChoice selections). */
  jsonValue?: JSONValue;
  /** `MJ: Files` id for FileUpload answers. */
  fileId?: string;
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

/** The result returned by the S1 `SubmitFormResponse` mutation. */
export interface FormSubmissionResult {
  success: boolean;
  responseId?: string;
  /** Persisted FormResponse status, e.g. `Partial` | `Complete`. */
  status?: string;
  confirmationMessage?: string;
  redirectUrl?: string;
  errors?: FieldError[];
}
