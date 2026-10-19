/**
 * The shapes `FormSubmissionEngine` takes and returns for a respondent save (#303 Task 8).
 *
 * Internal to the server: `Forms.SaveResponse` maps its PascalCase wire input onto
 * {@link RespondentSaveRequest} and {@link RespondentSaveResult} back onto its generated output. The
 * answers stay in the contracts' `FormAnswerInput` shape because that is what `validateAnswers`,
 * `settleVisibility` and `resolveResponseOutcome` read — one shape from the wire boundary inward.
 */
import type {
  ClientMeta,
  FieldError,
  FormAnswerInput,
  mjBizAppsFormsFormResponseEntity,
  SocialLink,
} from '@mj-biz-apps/forms-entities';

/** `FormResponse.Status`, derived from the generated entity (a CHECK-constrained column). */
export type RespondentResponseStatus = mjBizAppsFormsFormResponseEntity['Status'];

/**
 * What the request says about the caller beyond their verified session — all of it from the HTTP
 * request, none of it from the body. The operation reads it from the request-identity store.
 */
export interface RespondentCaller {
  /**
   * The `x-session-id` header: the caller's OWN correlator, blank when they sent none. It keys
   * dedupe, the per-session gate and the owner column, and nothing that has to hold against
   * someone trying (see `source-metadata.ts`).
   */
  readonly sessionId: string;
  /** Salted hash of the resolved peer address — the one attribute the caller did not choose. */
  readonly ipHash?: string;
  /**
   * The resolved peer address, already screened by the transport (see `RequestIdentity.forwardableIp`).
   * Read by one consumer only — Turnstile's `remoteip` — and never stored, logged or bucketed.
   */
  readonly forwardableIp?: string;
  /** The `Origin` header, checked against the link's author-written allowlist. */
  readonly origin?: string;
}

/** Whether a save banks a draft or submits the response. */
export type RespondentSaveMode = 'partial' | 'final';

/** One respondent save — an autosave or the final submit. */
export interface RespondentSaveRequest {
  readonly distributionSlug: string;
  /** The version the respondent rendered; a save against a re-published form is refused. */
  readonly formVersionId: string;
  readonly mode: RespondentSaveMode;
  /**
   * The widget's client-minted response id (v4 UUID), sent on every save of one sitting. It is the
   * PRIMARY idempotency key: on first save it becomes the response's primary key and every repeat
   * upserts that row. A CAPABILITY only for a row with no owner — the write gate (`responseIsOurs`)
   * refuses a row owned by another session.
   */
  readonly clientResponseId?: string;
  readonly startedAt?: string;
  readonly turnstileToken?: string;
  readonly clientMeta?: ClientMeta;
  readonly answers: FormAnswerInput[];
  readonly caller: RespondentCaller;
}

/** The ending screen the server chose, with the content the widget renders. */
export interface RespondentEnding {
  readonly id: string;
  readonly title: string;
  readonly body?: string;
  readonly buttonLabel?: string;
  readonly mediaURL?: string;
  /** The screen's own redirect, already checked safe; absent when it has none (or an unsafe one). */
  readonly redirectURL?: string;
  readonly socialLinks: readonly SocialLink[];
  readonly isDisqualification: boolean;
}

/**
 * The outcome of one save. A refusal the respondent can act on is `success: false` with `errors`;
 * the engine never throws for one (see `FormSubmissionEngine.SaveResponse`).
 */
export interface RespondentSaveResult {
  success: boolean;
  responseId?: string;
  status?: RespondentResponseStatus;
  /** `ended` once the response is sealed — a final submit, or a knockout on any save. */
  outcome: 'continue' | 'ended';
  ending?: RespondentEnding;
  /** Shown when ended with no redirect: the ending's copy, else the form's confirmation message. */
  confirmationMessage?: string;
  /** Where to send the respondent when ended: the ending's redirect, else the form-wide one. */
  redirectUrl?: string;
  errors: FieldError[];
}
