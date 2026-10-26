/**
 * Seam S1 — the public read + save API the respondent widget consumes.
 *
 * Two Remote Operations, `Forms.GetRespondentForm` and `Forms.SaveResponse` (#303), posted through
 * MJ's one generic `ExecuteRemoteOperation` mutation. The widget codes ONLY against this interface so
 * the real transport ({@link FormsGraphQLApiService}) and the standalone {@link FormsMockApiService}
 * are interchangeable — swap the DI provider, nothing else changes.
 *
 * The wire shapes are the CodeGen-emitted operation types (`FormsSaveResponseInput` /
 * `FormsSaveResponseOutput`), imported with `import type` from the package root: a type-only import
 * is erased, so none of the root's runtime — the entity subclasses whose `@RegisterClass` side effects
 * drag MJCore, MJGlobal, sql-dialect and acorn in (#245) — reaches the respondent bundle. Every RUNTIME
 * import in a widget file still comes from the `/contracts` subpath; `scripts/build-widget.mjs` fails
 * the build if the root's runtime is ever bundled.
 */
import type { FormsSaveResponseInput, FormsSaveResponseOutput } from '@mj-biz-apps/forms-entities';
import type { RespondentFormDefinition, ResumeSnapshot } from '@mj-biz-apps/forms-entities/contracts';

import { InjectionToken } from '@angular/core';

/**
 * What one `Forms.GetRespondentForm` call returns: the projection to render and — when the session's
 * magic-link scope names a Form Response — the draft it may continue.
 *
 * The two travel TOGETHER rather than in a second call, deliberately. They are decided by the same
 * session: whether there is a draft to resume is a property of the JWT the widget is mounted with,
 * and a second round trip could observe a different one (a token rotated in between, a session
 * expired). It also means the widget knows at MOUNT whether it is resuming, which is what lets a
 * sealed draft show its screen before the autosave controller is ever wired.
 */
export interface RespondentFormLoad {
  /** The Published version served; echoed on every save. Equal to `definition.formVersionId` (checked). */
  formVersionId: string;
  /** The respondent projection, parsed and checked with the contracts zod schema. */
  definition: RespondentFormDefinition;
  /** Absent for an ordinary public-link session, which is every first sitting. */
  resume?: ResumeSnapshot;
}

/** The transport contract for the respondent widget, one method per operation. */
export interface IFormsApiService {
  /**
   * Load the form behind a distribution slug, plus any draft this session may continue.
   *
   * Rejects with {@link FormUnavailableError} when the server refuses (unknown or closed link, an
   * unpublished form, a session scoped elsewhere) or serves something the widget cannot render; with
   * {@link SessionExpiredError} when the session has lapsed; with a plain `Error` on a transport failure.
   */
  loadRespondentForm(distributionSlug: string): Promise<RespondentFormLoad>;

  /**
   * Save (`Mode: 'partial'`) or submit (`Mode: 'final'`) a response. The server re-validates, decides
   * whether the form ended, and which ending shows (`Outcome`, `Ending`).
   *
   * A refusal the respondent can act on (validation, captcha, quota) RESOLVES with `Success: false`;
   * a refusal of the call itself rejects with {@link ResponseNotSavedError}.
   */
  saveResponse(input: FormsSaveResponseInput): Promise<FormsSaveResponseOutput>;

  /**
   * The `x-session-id` this service sends — the OWNERSHIP RECORD for every row it writes.
   *
   * Part of the contract rather than a private field because the hosting page needs it: asking the
   * server to remember a draft means proving the draft is this caller's, and on a first sitting the
   * header is the only proof there is. Without this the page would be asking for a credential on a
   * bare response id, which is exactly the replay weakness the feature closes.
   *
   * It is a correlator, never a credential: it is already sent on every request in clear, and
   * knowing it grants nothing that sending it does not.
   */
  sessionCorrelator(): string;
}

/**
 * The one failure an {@link IFormsApiService} reports by TYPE rather than by message: the
 * anonymous session this widget was minted with has expired.
 *
 * Part of the seam, not of the GraphQL transport, because the widget has to react to it — and it
 * reacts differently from every other failure. A network blip or a refused submission returns the
 * respondent to the form to try again; an expired session cannot be retried at all. The token is
 * dead, MJ issues no refresh tokens, and the only way to a new one is a new page. A string cannot
 * carry that distinction to the component without the component parsing server copy, which is
 * what left it showing `HTTP 401` to a member of the public (bizapps-forms#123).
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('The anonymous session has expired; a new page is needed to mint a new one.');
    this.name = 'SessionExpiredError';
  }
}

/**
 * The one sentence for every reason a form cannot be shown.
 *
 * The same words as the server's `FORM_UNAVAILABLE_MESSAGE`, deliberately, but a separate literal:
 * nothing matches on it (the widget reacts to {@link FormUnavailableError} by type), and the server's
 * constant lives in a package the widget cannot import. If the two ever differ, a respondent reads one
 * sentence from the widget and never sees the server's, so nothing breaks.
 */
export const FORM_UNAVAILABLE_MESSAGE = 'This form is not available.';

/**
 * The one sentence for a save refused as a CALL (a rejected session binding, a malformed request)
 * rather than as a result. The server's own wording for a system failure (`SUBMIT_FAILED_MESSAGE`),
 * separate for the reason {@link FORM_UNAVAILABLE_MESSAGE} is; what went wrong goes to the console.
 */
export const RESPONSE_NOT_SAVED_MESSAGE = 'Something went wrong while submitting your response. Please try again.';

/**
 * The one sentence for a request that never reached the server. Replaces the browser's own
 * `TypeError` text, which differs per engine ("Failed to fetch", "Load failed", "NetworkError when
 * attempting to fetch resource.") and says nothing a respondent can act on.
 */
export const API_UNREACHABLE_MESSAGE = "You appear to be offline. Your answers are still here — try again when you're connected.";

/**
 * `Forms.GetRespondentForm` was refused, or served a definition the widget cannot render.
 *
 * `message` is always {@link FORM_UNAVAILABLE_MESSAGE}, which is what the respondent sees; `reason`
 * says what happened, for the console and for tests — never for the screen.
 */
export class FormUnavailableError extends Error {
  constructor(public readonly reason: string) {
    super(FORM_UNAVAILABLE_MESSAGE);
    this.name = 'FormUnavailableError';
  }
}

/**
 * `Forms.SaveResponse` was refused as a call (`FORBIDDEN`, `EXECUTION_ERROR`, …) or answered with
 * something that is not a save result. `message` is {@link RESPONSE_NOT_SAVED_MESSAGE}; `reason`
 * carries the server's code and text for the console.
 */
export class ResponseNotSavedError extends Error {
  constructor(public readonly reason: string) {
    super(RESPONSE_NOT_SAVED_MESSAGE);
    this.name = 'ResponseNotSavedError';
  }
}

/**
 * The request never got an answer: `fetch` rejected (offline, DNS, connection reset, CORS). `message`
 * is {@link API_UNREACHABLE_MESSAGE}; `reason` carries the browser's own text for the console.
 */
export class FormsApiUnreachableError extends Error {
  constructor(public readonly reason: string) {
    super(API_UNREACHABLE_MESSAGE);
    this.name = 'FormsApiUnreachableError';
  }
}

/**
 * DI token for the active {@link IFormsApiService}. The element bootstrap binds either
 * the real GraphQL service or the mock to this token; components inject the token, not
 * a concrete class, so the real/mock swap is a one-line provider change.
 */
export const FORMS_API_SERVICE = new InjectionToken<IFormsApiService>('FORMS_API_SERVICE');
