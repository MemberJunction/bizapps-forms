/**
 * Real S1 transport — issues the `PublishedForm` / `SubmitFormResponse` GraphQL
 * operations against the MJAPI endpoint over `fetch`.
 *
 * Deliberately uses plain `fetch` rather than `@memberjunction/graphql-dataprovider`:
 * the widget is a tiny, anonymous, embeddable custom element with no Explorer shell
 * and no global MJ provider to lean on — it only needs an endpoint URL and an
 * anonymous bearer token (both supplied as element attributes). This also keeps the
 * transport strongly typed end-to-end instead of routing through `ExecuteGQL`'s
 * untyped result.
 */
import { Injectable, inject } from '@angular/core';
import type {
  PublishedFormDefinition,
  FormSubmissionInput,
  FormSubmissionResult,
} from '@mj-biz-apps/forms-entities';

import type { IFormsApiService } from './forms-api.interface';
import { FORMS_API_CONFIG } from './forms-api.config';

/** Shape of a GraphQL HTTP response envelope. */
interface GraphQLEnvelope<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

/** Result wrapper for the `PublishedForm` query. */
interface PublishedFormQueryData {
  PublishedForm: PublishedFormDefinition | null;
}

/** Result wrapper for the `SubmitFormResponse` mutation. */
interface SubmitFormResponseData {
  SubmitFormResponse: FormSubmissionResult;
}

const PUBLISHED_FORM_QUERY = `
  query PublishedForm($distributionSlug: String!) {
    PublishedForm(distributionSlug: $distributionSlug) {
      formId
      formVersionId
      name
      description
      renderMode
      settings
      styleTokens
      pages
    }
  }
`;

const SUBMIT_RESPONSE_MUTATION = `
  mutation SubmitFormResponse($input: FormSubmissionInput!) {
    SubmitFormResponse(input: $input) {
      success
      responseId
      status
      confirmationMessage
      redirectUrl
      errors { questionId message }
    }
  }
`;

@Injectable()
export class FormsGraphQLApiService implements IFormsApiService {
  private readonly config = inject(FORMS_API_CONFIG);

  public async loadPublishedForm(
    distributionSlug: string,
  ): Promise<PublishedFormDefinition | null> {
    const data = await this.execute<PublishedFormQueryData>(PUBLISHED_FORM_QUERY, {
      distributionSlug,
    });
    return data.PublishedForm;
  }

  public async submitResponse(input: FormSubmissionInput): Promise<FormSubmissionResult> {
    const data = await this.execute<SubmitFormResponseData>(SUBMIT_RESPONSE_MUTATION, {
      input,
    });
    return data.SubmitFormResponse;
  }

  /** POST a GraphQL operation and unwrap its `data`, throwing on transport/GraphQL errors. */
  private async execute<TData>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<TData> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }
    const response = await fetch(this.config.graphqlUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`Forms API request failed: HTTP ${response.status}`);
    }
    const envelope = (await response.json()) as GraphQLEnvelope<TData>;
    if (envelope.errors && envelope.errors.length > 0) {
      throw new Error(envelope.errors.map((e) => e.message).join('; '));
    }
    if (!envelope.data) {
      throw new Error('Forms API returned no data');
    }
    return envelope.data;
  }
}
