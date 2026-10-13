/**
 * Real S1 transport — posts the `Forms.GetRespondentForm` and `Forms.SaveResponse` Remote Operations
 * (#303) to the MJAPI endpoint over `fetch`, through MJ's one generic `ExecuteRemoteOperation`
 * mutation.
 *
 * Deliberately uses plain `fetch` rather than `@memberjunction/graphql-dataprovider`:
 * the widget is a tiny, anonymous, embeddable custom element with no Explorer shell
 * and no global MJ provider to lean on — it only needs an endpoint URL and an
 * anonymous bearer token (both supplied as element attributes). The operation I/O is
 * typed end-to-end by the CodeGen-emitted types, imported type-only so none of their
 * module's runtime reaches the respondent bundle (see `forms-api.interface.ts`).
 */
import { Injectable, inject } from '@angular/core';
import type {
  FormsGetRespondentFormInput,
  FormsGetRespondentFormOutput,
  FormsRespondentEnding,
  FormsSaveResponseInput,
  FormsSaveResponseOutput,
} from '@mj-biz-apps/forms-entities';
import { respondentFormDefinitionSchema, type ResumeSnapshot } from '@mj-biz-apps/forms-entities/contracts';

import {
  FormUnavailableError,
  ResponseNotSavedError,
  SessionExpiredError,
  type IFormsApiService,
  type RespondentFormLoad,
} from './forms-api.interface';
import { FORMS_API_CONFIG } from './forms-api.config';
import { generateClientResponseId } from '../core/client-id';

/**
 * Shape of a GraphQL HTTP response envelope.
 *
 * `extensions.code` is the one typed thing a failure carries. MJ's auth middleware answers an
 * expired session JWT with HTTP 401 and this same envelope shape — `{ errors: [{ message:
 * 'Token expired', extensions: { code: 'JWT_EXPIRED' } }] }` — so the code, not the message, is
 * what {@link isSessionExpired} reads.
 */
interface GraphQLEnvelope<TData> {
  data?: TData;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

/** The code MJ's auth middleware attaches when the bearer JWT's `exp` has passed. */
const JWT_EXPIRED_CODE = 'JWT_EXPIRED';

/**
 * Whether a response body says the anonymous session has expired.
 *
 * Judged on the typed code alone, never on the status: a 401 also answers a missing or forged
 * token, and those are not a session that ran out — a preview embed with no token would otherwise
 * be told its "session timed out" when it never had one.
 */
export function isSessionExpired(body: GraphQLEnvelope<unknown> | undefined): boolean {
  return body?.errors?.some((e) => e.extensions?.code === JWT_EXPIRED_CODE) ?? false;
}

/**
 * MJ's generic Remote Operation mutation, spelled as MJ's own client spells it
 * (`GraphQLDataProvider.InternalRouteOperation`). `attached`: the respondent waits for the result.
 */
export const EXECUTE_REMOTE_OPERATION_MUTATION = `
  mutation ExecuteRemoteOperation($operationKey: String!, $inputJSON: String!, $invokeMode: String!) {
    ExecuteRemoteOperation(input: { operationKey: $operationKey, inputJSON: $inputJSON, invokeMode: $invokeMode }) {
      success
      resultCode
      outputJSON
      errorMessage
    }
  }
`;

/** The `ExecuteRemoteOperationResultType` fields selected above (MJServer's `ExecuteRemoteOperationResolver`). */
interface ExecuteRemoteOperationResult {
  success: boolean;
  resultCode?: string | null;
  outputJSON?: string | null;
  errorMessage?: string | null;
}

interface ExecuteRemoteOperationData {
  ExecuteRemoteOperation: ExecuteRemoteOperationResult | null;
}

/** The two operations a respondent can reach, keyed by operation key, with their generated I/O types. */
export interface RespondentOperations {
  'Forms.GetRespondentForm': { input: FormsGetRespondentFormInput; output: FormsGetRespondentFormOutput };
  'Forms.SaveResponse': { input: FormsSaveResponseInput; output: FormsSaveResponseOutput };
}

/**
 * One operation's outcome as the wire reports it, before anyone interprets it: the op ran and
 * answered (its `outputJSON`, still to be checked), or the call itself was refused.
 */
export type RemoteOperationOutcome =
  | { readonly ran: true; readonly output: unknown }
  | { readonly ran: false; readonly resultCode: string; readonly errorMessage: string };

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

  public sessionCorrelator(): string {
    return this.sessionId;
  }

  public async loadRespondentForm(distributionSlug: string): Promise<RespondentFormLoad> {
    const outcome = await this.executeRemoteOperation('Forms.GetRespondentForm', { Slug: distributionSlug });
    if (!outcome.ran) {
      throw new FormUnavailableError(`Forms.GetRespondentForm for '${distributionSlug}' was refused (${outcome.resultCode}): ${outcome.errorMessage}`);
    }
    return respondentFormLoadFrom(outcome.output, distributionSlug);
  }

  public async saveResponse(input: FormsSaveResponseInput): Promise<FormsSaveResponseOutput> {
    const outcome = await this.executeRemoteOperation('Forms.SaveResponse', input);
    if (!outcome.ran) {
      throw new ResponseNotSavedError(
        `Forms.SaveResponse (${input.Mode}) for response ${input.ClientResponseID} was refused (${outcome.resultCode}): ${outcome.errorMessage}`,
      );
    }
    return saveResponseOutputFrom(outcome.output, input);
  }

  /**
   * Run one respondent Remote Operation, attached, through MJ's generic `ExecuteRemoteOperation`
   * mutation — the ONE way this transport reaches the server.
   *
   * Reports the call's outcome without interpreting the operation's output: an operation that RAN
   * returns its `outputJSON` parsed (still unchecked — each caller knows its own shape); one the
   * server refused before or while running it (`FORBIDDEN`, `EXECUTION_ERROR`, an unknown key) returns
   * its result code and message. Transport failures and an expired session throw, as before.
   */
  public async executeRemoteOperation<K extends keyof RespondentOperations>(
    operationKey: K,
    input: RespondentOperations[K]['input'],
  ): Promise<RemoteOperationOutcome> {
    const data = await this.execute<ExecuteRemoteOperationData>(EXECUTE_REMOTE_OPERATION_MUTATION, {
      operationKey,
      inputJSON: JSON.stringify(input),
      invokeMode: 'attached',
    });
    const result = data.ExecuteRemoteOperation;
    if (!result) {
      throw new Error(`${operationKey}: the server returned no ExecuteRemoteOperation result.`);
    }
    if (!result.success) {
      return { ran: false, resultCode: result.resultCode ?? 'UNKNOWN', errorMessage: result.errorMessage ?? 'no reason given' };
    }
    return { ran: true, output: parseOutputJSON(operationKey, result.outputJSON) };
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
    // Read the body BEFORE judging the status. An expired session arrives as a 401 whose body
    // carries the one code the widget must be able to act on; throwing on `!ok` first is how that
    // code was thrown away and a respondent came to be shown `HTTP 401`. Only a JSON body is read —
    // a proxy's HTML error page falls through to the status check below, unparsed.
    const envelope = await readEnvelope<TData>(response);
    if (isSessionExpired(envelope)) {
      throw new SessionExpiredError();
    }
    if (!response.ok) {
      throw new Error(`Forms API request failed: HTTP ${response.status}`);
    }
    if (envelope?.errors && envelope.errors.length > 0) {
      throw new Error(envelope.errors.map((e) => e.message).join('; '));
    }
    if (!envelope?.data) {
      throw new Error('Forms API returned no data');
    }
    return envelope.data;
  }
}

/** The operation's `outputJSON`, parsed — or a throw naming the operation when it is absent or not JSON. */
function parseOutputJSON(operationKey: string, outputJSON: string | null | undefined): unknown {
  if (!outputJSON) {
    throw new Error(`${operationKey}: the operation ran but returned no output.`);
  }
  try {
    return JSON.parse(outputJSON) as unknown;
  } catch (err) {
    throw new Error(`${operationKey}: the operation's output is not JSON (${err instanceof Error ? err.message : String(err)}).`);
  }
}

/**
 * The checked load: a `FormsGetRespondentFormOutput` whose `DefinitionJSON` parses with the contracts'
 * `respondentFormDefinitionSchema` and names the version it was served as. Anything else is refused
 * with the one fixed sentence — a half-understood form rendered anyway would ask questions the server
 * does not, or validate answers against rules it does not apply.
 */
export function respondentFormLoadFrom(output: unknown, distributionSlug: string): RespondentFormLoad {
  const refuse = (why: string): never => {
    throw new FormUnavailableError(`Forms.GetRespondentForm for '${distributionSlug}': ${why}`);
  };
  if (!isRecord(output) || typeof output['DefinitionJSON'] !== 'string' || typeof output['FormVersionID'] !== 'string') {
    return refuse('the output has no DefinitionJSON or FormVersionID.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(output['DefinitionJSON']) as unknown;
  } catch (err) {
    return refuse(`DefinitionJSON is not JSON (${err instanceof Error ? err.message : String(err)}).`);
  }
  const parsed = respondentFormDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    return refuse(`DefinitionJSON does not match the respondent schema (${where.join('; ')}).`);
  }
  const definition = parsed.data;
  if (definition.formVersionId !== output['FormVersionID']) {
    return refuse(`DefinitionJSON is version ${definition.formVersionId} but was served as ${output['FormVersionID']}.`);
  }
  // The link's own captcha toggle is already folded into the projection server-side; the top-level
  // flag is honoured too, so a server that says "captcha" is never answered by a form that has none.
  if (output['CaptchaRequired'] === true) {
    definition.captchaRequired = true;
  }
  const resumeJSON = output['ResumeJSON'];
  const resume = typeof resumeJSON === 'string' ? parseResume(resumeJSON, distributionSlug) : undefined;
  return resume ? { formVersionId: definition.formVersionId, definition, resume } : { formVersionId: definition.formVersionId, definition };
}

/**
 * The checked save result. The fields the widget acts on (`Success`, `Outcome`, `Errors`) must be
 * there and well-typed; a body without them is not a save result, and acting on a guess — say,
 * "no Outcome, so continue" past a knockout — is worse than reporting the save as failed. An `Ending`
 * the widget cannot render is dropped (and logged) instead: the save itself landed.
 */
export function saveResponseOutputFrom(output: unknown, input: Pick<FormsSaveResponseInput, 'Mode' | 'ClientResponseID'>): FormsSaveResponseOutput {
  const ok =
    isRecord(output) &&
    typeof output['Success'] === 'boolean' &&
    (output['Outcome'] === 'continue' || output['Outcome'] === 'ended') &&
    Array.isArray(output['Errors']);
  if (!ok) {
    throw new ResponseNotSavedError(
      `Forms.SaveResponse (${input.Mode}) for response ${input.ClientResponseID} returned something that is not a save result.`,
    );
  }
  const result = output as unknown as FormsSaveResponseOutput;
  if (result.Ending !== undefined && !isRespondentEnding(result.Ending)) {
    // The save DID land; only the screen to show is unreadable. Dropping it shows the built-in
    // confirmation (or the server's ConfirmationMessage) rather than failing a save the server
    // accepted — which would retry it, and for a knockout would never show the screen at all.
    console.warn(
      `[mj-form] Forms.SaveResponse (${input.Mode}) for response ${input.ClientResponseID} returned a malformed Ending; ` +
        'showing the default ending instead.',
    );
    const { Ending: _dropped, ...withoutEnding } = result;
    void _dropped;
    return withoutEnding;
  }
  return result;
}

/** Whether `value` has every field `endingScreenFrom` reads, with the types it reads them as. */
function isRespondentEnding(value: unknown): value is FormsRespondentEnding {
  if (!isRecord(value)) {
    return false;
  }
  const nullableText = (key: string): boolean => value[key] === null || typeof value[key] === 'string';
  const links = value['SocialLinks'];
  return (
    typeof value['ID'] === 'string' &&
    typeof value['Title'] === 'string' &&
    nullableText('Body') &&
    nullableText('ButtonLabel') &&
    nullableText('MediaURL') &&
    nullableText('RedirectURL') &&
    typeof value['IsDisqualification'] === 'boolean' &&
    Array.isArray(links) &&
    links.every((link: unknown) => isRecord(link) && typeof link['Platform'] === 'string' && typeof link['URL'] === 'string')
  );
}

/**
 * Read the resume snapshot back, or nothing.
 *
 * Guarded rather than trusted: this is the one field on the read path whose absence is ORDINARY
 * (every first sitting), so a parse failure is treated as absence — a respondent whose draft cannot
 * be understood gets a blank form, not an error page. The alternative, letting the throw escape,
 * would take down `load()` for the commonest case in the product. Never silently: it is logged.
 */
function parseResume(json: string, distributionSlug: string): ResumeSnapshot | undefined {
  try {
    const value = JSON.parse(json) as unknown;
    if (isRecord(value) && typeof value['responseId'] === 'string' && typeof value['status'] === 'string' && Array.isArray(value['answers'])) {
      return value as unknown as ResumeSnapshot;
    }
    console.warn(`[mj-form] the draft served for '${distributionSlug}' is not a resume snapshot; starting a fresh response.`);
    return undefined;
  } catch (err) {
    console.warn(`[mj-form] the draft served for '${distributionSlug}' did not parse; starting a fresh response.`, err);
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The response's JSON envelope, or `undefined` when the server did not send JSON at all.
 *
 * Decided by the declared content type rather than by trying to parse and catching: a body that
 * CLAIMS to be JSON and is not is a real defect, and its parse error should surface as such. A body
 * that never claimed to be JSON (a gateway's HTML 502 page) is simply not an envelope.
 */
async function readEnvelope<TData>(response: Response): Promise<GraphQLEnvelope<TData> | undefined> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return undefined;
  }
  return (await response.json()) as GraphQLEnvelope<TData>;
}
