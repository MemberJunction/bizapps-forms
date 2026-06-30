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

  /** Submit (or partial-save) a response. The server re-validates before persisting. */
  submitResponse(input: FormSubmissionInput): Promise<FormSubmissionResult>;
}

/**
 * DI token for the active {@link IFormsApiService}. The element bootstrap binds either
 * the real GraphQL service or the mock to this token; components inject the token, not
 * a concrete class, so the real/mock swap is a one-line provider change.
 */
export const FORMS_API_SERVICE = new InjectionToken<IFormsApiService>('FORMS_API_SERVICE');
