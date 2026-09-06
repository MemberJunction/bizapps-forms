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
import { generateClientResponseId } from '../core/client-id';
import { toInputType } from './submission-mapping';

/** Shape of a GraphQL HTTP response envelope. */
interface GraphQLEnvelope<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

/**
 * Raw `PublishedFormType` row from WP-B's SDL. The deep pages/questions/options tree
 * lives ONLY inside `definitionJSON` (a JSON string); the top-level scalars are
 * redundant once it is parsed, so we select + parse `definitionJSON`.
 */
interface PublishedFormType {
  definitionJSON: string;
}

/** Result wrapper for the `PublishedForm` query. */
interface PublishedFormQueryData {
  PublishedForm: PublishedFormType | null;
}

/** Result wrapper for the `SubmitFormResponse` mutation. */
interface SubmitFormResponseData {
  SubmitFormResponse: FormSubmissionResult;
}

const PUBLISHED_FORM_QUERY = `
  query PublishedForm($distributionSlug: String!) {
    PublishedForm(distributionSlug: $distributionSlug) {
      definitionJSON
    }
  }
`;

const SUBMIT_RESPONSE_MUTATION = `
  mutation SubmitFormResponse($input: FormSubmissionInputType!) {
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

  /**
   * Per-widget-instance anonymous session correlator, sent as the `x-session-id` header MJ
   * core reads into `UserPayload.sessionId` (and thence `FormResponse.AnonymousSessionID`).
   *
   * NOT best-effort telemetry, whatever this said before. It is the OWNERSHIP RECORD: the server
   * stamps it on the row this widget creates, and thereafter only that session may write to the
   * row (issue #78) or be told its status (issues #100/#101). The client response id in the
   * payload is still the idempotency key, and it is the whole capability for a row created with
   * NO session — but once a row has an owner, a request that arrives without this header, or with
   * a different value, is refused rather than degrading gracefully.
   *
   * That costs a real client nothing, because the two identifiers travel together: this one is
   * minted per SERVICE instance and the client response id per `load()`, so a given response id is
   * only ever presented alongside the session that created it. An intermediary that strips the
   * header on a retry but not on the original request is what would break, and it would break
   * loudly rather than by taking somebody else's row.
   */
  private readonly sessionId = generateClientResponseId();

  public async loadPublishedForm(
    distributionSlug: string,
  ): Promise<PublishedFormDefinition | null> {
    const data = await this.execute<PublishedFormQueryData>(PUBLISHED_FORM_QUERY, {
      distributionSlug,
    });
    if (!data.PublishedForm) {
      return null;
    }
    // The full nested pages/questions/options graph is delivered as a JSON string in
    // `definitionJSON`; parse it into the contract's PublishedFormDefinition.
    return JSON.parse(data.PublishedForm.definitionJSON) as PublishedFormDefinition;
  }

  public async submitResponse(
    input: FormSubmissionInput,
    existingResponseId?: string,
  ): Promise<FormSubmissionResult> {
    const data = await this.execute<SubmitFormResponseData>(SUBMIT_RESPONSE_MUTATION, {
      input: toInputType(input, existingResponseId),
    });
    return data.SubmitFormResponse;
  }

  /** POST a GraphQL operation and unwrap its `data`, throwing on transport/GraphQL errors. */
  private async execute<TData>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<TData> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // The ownership record for every row this widget writes, not telemetry — see
      // `this.sessionId` for what the server does with it, and why omitting it is refused rather
      // than degraded. Still never the idempotency key: that is the client response id, in the
      // payload.
      'x-session-id': this.sessionId,
    };
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
