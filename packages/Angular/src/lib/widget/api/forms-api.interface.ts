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
} from '@mj-biz-apps/forms-entities';

import { InjectionToken } from '@angular/core';

/**
 * The transport contract for the respondent widget. Method signatures mirror the S1
 * GraphQL operations exactly:
 *
 * - `query PublishedForm(distributionSlug: String!): PublishedFormDefinition`
 * - `mutation SubmitFormResponse(input: FormSubmissionInput!): FormSubmissionResult!`
 */
export interface IFormsApiService {
  /**
   * Load a published form by its distribution slug. Resolves to `null` when the slug
   * is unknown, the form is closed, or quota is exhausted (server decides).
   */
  loadPublishedForm(distributionSlug: string): Promise<PublishedFormDefinition | null>;

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
 * DI token for the active {@link IFormsApiService}. The element bootstrap binds either
 * the real GraphQL service or the mock to this token; components inject the token, not
 * a concrete class, so the real/mock swap is a one-line provider change.
 */
export const FORMS_API_SERVICE = new InjectionToken<IFormsApiService>('FORMS_API_SERVICE');
