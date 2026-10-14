/**
 * The respondent surface the smoke scripts drive, spelled the way the widget spells it (#303).
 *
 * Since #303 every respondent read and write is a typed Remote Operation sent through MJ's one
 * generic `ExecuteRemoteOperation` mutation — `Forms.GetRespondentForm` replaced the `PublishedForm`
 * query and `Forms.SaveResponse` replaced the `SubmitFormResponse` mutation. Ten scripts posted those
 * two by hand; keeping the wire spelling here means the next rename is one file, and every script
 * sends exactly the mutation `FormsGraphQLApiService.runOperation` sends (same selection, same
 * `attached` mode, same `x-session-id` correlator), so a smoke cannot pass on a request the widget
 * would never make.
 *
 * Stdlib only, like everything under smoke/lib: Node's built-in fetch.
 */
import { sessionIdFor } from './session.mjs';

/** MJ's generic Remote Operation mutation — byte-for-byte the widget's `EXECUTE_REMOTE_OPERATION_MUTATION`. */
export const EXECUTE_REMOTE_OPERATION = `
  mutation ExecuteRemoteOperation($operationKey: String!, $inputJSON: String!, $invokeMode: String!) {
    ExecuteRemoteOperation(input: { operationKey: $operationKey, inputJSON: $inputJSON, invokeMode: $invokeMode }) {
      success
      resultCode
      outputJSON
      errorMessage
    }
  }
`;

/**
 * Run one Remote Operation and return what came back, without judging it.
 *
 * Returns `{ success, resultCode, errorMessage, output, httpStatus, errors }`: `output` is the parsed
 * `outputJSON` (or `null`), `errors` the GraphQL-level errors array (or `undefined`). A refusal is a
 * VALUE here, not a throw, because half of what these scripts assert is that a call is refused —
 * the caller decides what a refusal means. A response that is not JSON at all does throw, naming the
 * operation and the status, since no assertion can be made about it.
 *
 * `auth` is `{ token }` for an anonymous respondent session (sent as a bearer token plus that
 * session's `x-session-id`), `{ token, sessionId }` to choose the `x-session-id` explicitly — an
 * explicit `sessionId: undefined` OMITS the header, which is an attack route the ownership suites
 * drive — `{ apiKey }` for a user API key (`x-api-key`, whose scopes MJ checks
 * against the operation's `RequiredScope`), or `{ systemKey }` for the host's system key
 * (`x-mj-api-key`, i.e. `MJ_API_KEY`, which runs as the system user); `headers` are added last so a
 * script can probe a specific header.
 */
export async function executeOperation(base, auth, operationKey, input, { headers = {} } = {}) {
  if (!operationKey) {
    throw new Error('executeOperation: an operation key is required.');
  }
  const res = await fetch(`${base}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(auth), ...headers },
    body: JSON.stringify({
      query: EXECUTE_REMOTE_OPERATION,
      variables: { operationKey, inputJSON: JSON.stringify(input), invokeMode: 'attached' },
    }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${operationKey}: HTTP ${res.status} returned a body that is not JSON: ${text.slice(0, 200)}`);
  }
  const result = body.data?.ExecuteRemoteOperation ?? null;
  return {
    httpStatus: res.status,
    errors: body.errors,
    success: result?.success === true,
    resultCode: result?.resultCode ?? null,
    errorMessage: result?.errorMessage ?? null,
    output: parseOutput(operationKey, result?.outputJSON),
  };
}

/**
 * Run an operation that MUST succeed and return its output; throws with the operation, result code
 * and message otherwise. For the steps that set a scenario up, where a refusal is not the subject.
 */
export async function requireOperation(base, auth, operationKey, input, options) {
  const result = await executeOperation(base, auth, operationKey, input, options);
  if (!result.success || !result.output) {
    const graphqlErrors = result.errors ? ` GraphQL errors: ${JSON.stringify(result.errors).slice(0, 300)}` : '';
    throw new Error(
      `${operationKey} was refused (${result.resultCode ?? `HTTP ${result.httpStatus}`}): ${result.errorMessage ?? 'no message'}.${graphqlErrors}`,
    );
  }
  return result.output;
}

/**
 * `Forms.GetRespondentForm` for an anonymous session, parsed: `{ formVersionId, definition, resume,
 * captchaRequired }`. `definition` is the respondent projection (`RespondentFormDefinition`), `resume`
 * the parsed `ResumeSnapshot` or `null`.
 */
export async function getRespondentForm(base, token, slug) {
  const output = await requireOperation(base, { token }, 'Forms.GetRespondentForm', { Slug: slug });
  return {
    formVersionId: output.FormVersionID,
    definition: JSON.parse(output.DefinitionJSON),
    resume: output.ResumeJSON ? JSON.parse(output.ResumeJSON) : null,
    captchaRequired: output.CaptchaRequired === true,
  };
}

/** Every question in a respondent definition, page order then question order. */
export function definitionQuestions(definition) {
  return (definition?.pages ?? []).flatMap((p) => p.questions ?? []);
}

/**
 * `Forms.SaveResponse` as the anonymous session `token`. Returns the raw `executeOperation` result,
 * because a refused save (`output.Success: false`) is what several scripts are checking for.
 *
 * `input` is a `FormsSaveResponseInput`; `Mode` defaults to `final` and `ClientMeta` to the smoke
 * user agent, the two fields every caller would otherwise repeat.
 */
export function saveResponse(base, token, input, options) {
  return executeOperation(
    base,
    { token },
    'Forms.SaveResponse',
    { Mode: 'final', ClientMeta: { Referrer: '', UserAgent: 'forms-smoke' }, ...input },
    options,
  );
}

/** The first message a SaveResponse result carries, wherever it was reported. */
export function firstSaveError(result) {
  return (
    result?.output?.Errors?.[0]?.Message ??
    result?.errorMessage ??
    (result?.errors ? JSON.stringify(result.errors).slice(0, 300) : undefined) ??
    'no error message returned'
  );
}

/**
 * Republish `formId` through `Forms.PublishForm`, authenticated with the host's system key.
 *
 * WHY A FIXTURE NEEDS THIS. Since #303 publish freezes each automation's binding settings
 * (FieldMappings, IdentityRule, MergePolicy) into the snapshot, and the automation handler runs
 * from the snapshot; the live `FormEntityBinding` row is read only as a kill switch. A fixture that
 * patches the live row and submits therefore tests the OLD mapping — it ran green-looking and left
 * the patched field unwritten. Republishing is how an author's edit reaches respondents, so it is
 * also how a fixture's must.
 *
 * Needs `MJ_API_KEY` (the harness's system key, sent as `x-mj-api-key`); throws naming it when unset.
 */
export async function republishForm(base, formId, env = process.env) {
  const systemKey = env.MJ_API_KEY?.trim();
  if (!systemKey) {
    throw new Error(
      'Republishing a fixture form needs MJ_API_KEY (the API host\'s system key) in the environment; ' +
        'set it in .env and restart the API with the same value.',
    );
  }
  return requireOperation(base, { systemKey }, 'Forms.PublishForm', { FormID: formId });
}

function authHeaders(auth) {
  if (auth?.token) {
    const headers = { Authorization: `Bearer ${auth.token}` };
    if (!('sessionId' in auth)) {
      // Mirrors the widget's per-instance correlator; without it every request shares one
      // rate-limit bucket. See smoke/lib/session.mjs.
      headers['x-session-id'] = sessionIdFor(auth.token);
    } else if (auth.sessionId !== undefined) {
      headers['x-session-id'] = auth.sessionId;
    }
    return headers;
  }
  if (auth?.apiKey) {
    return { 'x-api-key': auth.apiKey };
  }
  if (auth?.systemKey) {
    return { 'x-mj-api-key': auth.systemKey };
  }
  throw new Error('executeOperation: pass { token }, { apiKey } or { systemKey }.');
}

function parseOutput(operationKey, outputJSON) {
  if (!outputJSON) {
    return null;
  }
  try {
    return JSON.parse(outputJSON);
  } catch (err) {
    throw new Error(`${operationKey}: outputJSON is not JSON (${err.message}).`);
  }
}
