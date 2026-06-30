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
  FormAnswerInput,
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

/**
 * `FormAnswerInputType` per WP-B's SDL: `jsonValue` is a JSON STRING (not an object)
 * and `dateValue` is a String. Mirrors {@link FormAnswerInput} except `jsonValue`.
 */
interface FormAnswerInputType {
  questionId: string;
  textValue?: string;
  numericValue?: number;
  dateValue?: string;
  booleanValue?: boolean;
  jsonValue?: string;
  fileId?: string;
}

/** `FormSubmissionInputType` per WP-B's SDL (answers use {@link FormAnswerInputType}). */
interface FormSubmissionInputType {
  distributionSlug: string;
  formVersionId: string;
  partial?: boolean;
  startedAt?: string;
  turnstileToken?: string;
  clientMeta?: { referrer?: string; userAgent?: string };
  answers: FormAnswerInputType[];
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

  public async submitResponse(input: FormSubmissionInput): Promise<FormSubmissionResult> {
    const data = await this.execute<SubmitFormResponseData>(SUBMIT_RESPONSE_MUTATION, {
      input: this.toInputType(input),
    });
    return data.SubmitFormResponse;
  }

  /**
   * Map the contract {@link FormSubmissionInput} onto WP-B's `FormSubmissionInputType`.
   * Only `jsonValue` differs: the contract carries a structured `JSONValue`, the SDL
   * expects a JSON STRING, so each answer's `jsonValue` is stringified here.
   */
  private toInputType(input: FormSubmissionInput): FormSubmissionInputType {
    return {
      distributionSlug: input.distributionSlug,
      formVersionId: input.formVersionId,
      partial: input.partial,
      startedAt: input.startedAt,
      turnstileToken: input.turnstileToken,
      clientMeta: input.clientMeta,
      answers: input.answers.map((a) => this.toAnswerInputType(a)),
    };
  }

  /** Map one contract answer onto `FormAnswerInputType`, stringifying `jsonValue`. */
  private toAnswerInputType(answer: FormAnswerInput): FormAnswerInputType {
    return {
      questionId: answer.questionId,
      textValue: answer.textValue,
      numericValue: answer.numericValue,
      dateValue: answer.dateValue,
      booleanValue: answer.booleanValue,
      jsonValue: answer.jsonValue === undefined ? undefined : JSON.stringify(answer.jsonValue),
      fileId: answer.fileId,
    };
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
