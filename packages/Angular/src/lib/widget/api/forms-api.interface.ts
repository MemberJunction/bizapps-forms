/**
 * Seam S1 — the public read + submit API the respondent widget consumes.
 *
 * `PublishedForm(distributionSlug)` and `SubmitFormResponse(input)` are implemented
 * server-side by WP-B as anonymous-scope custom resolvers. The widget codes ONLY
 * against this interface so the real GraphQL transport ({@link FormsGraphQLApiService})
 * and the standalone {@link FormsMockApiService} are interchangeable — swap the DI
 * provider, nothing else changes.
 *
 * The shapes (`PublishedFormDefinition`, `FormSubmissionInput`, `FormSubmissionResult`)
 * are imported from the frozen contract in `@mj-biz-apps/forms-entities`; they are NOT
 * redefined here.
 */
import type {
  PublishedFormDefinition,
  FormSubmissionInput,
  FormSubmissionResult,
  ResumeSnapshot,
} from '@mj-biz-apps/forms-entities';

import { InjectionToken } from '@angular/core';

/**
 * What one `PublishedForm` call returns: the definition, and — when the session's magic-link scope
 * names a Form Response — the draft it may continue.
 *
 * The two travel TOGETHER rather than in a second call, deliberately. They are decided by the same
 * session: whether there is a draft to resume is a property of the JWT the widget is mounted with,
 * and a second round trip could observe a different one (a token rotated in between, a session
 * expired). It also means the widget knows at MOUNT whether it is resuming, which is what lets a
 * sealed draft show its screen before the autosave controller is ever wired.
 */
export interface PublishedFormLoad {
  definition: PublishedFormDefinition;
  /** Absent for an ordinary public-link session, which is every first sitting. */
  resume?: ResumeSnapshot;
}

/**
 * The transport contract for the respondent widget. Method signatures mirror the S1
 * GraphQL operations exactly:
 *
 * - `query PublishedForm(distributionSlug: String!): PublishedFormDefinition`
 * - `mutation SubmitFormResponse(input: FormSubmissionInput!): FormSubmissionResult!`
 */
export interface IFormsApiService {
  /**
   * Load a published form by its distribution slug, plus any draft this session may continue.
   * Resolves to `null` when the slug is unknown, the form is closed, or quota is exhausted
   * (server decides).
   */
  loadPublishedForm(distributionSlug: string): Promise<PublishedFormLoad | null>;

  /**
   * Submit (or partial-save) a response. The server re-validates before persisting.
   *
   * `existingResponseId` is the id returned by a prior partial save; passing it lets the
   * server UPSERT the same in-progress response (autosave) rather than creating a new
   * one. It is a transport-level parameter — NOT part of the frozen `FormSubmissionInput`
   * contract — because it is a widget-session concern (cross-session resume is Phase 2).
   */
  submitResponse(
    input: FormSubmissionInput,
    existingResponseId?: string,
  ): Promise<FormSubmissionResult>;

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
 * DI token for the active {@link IFormsApiService}. The element bootstrap binds either
 * the real GraphQL service or the mock to this token; components inject the token, not
 * a concrete class, so the real/mock swap is a one-line provider change.
 */
export const FORMS_API_SERVICE = new InjectionToken<IFormsApiService>('FORMS_API_SERVICE');
