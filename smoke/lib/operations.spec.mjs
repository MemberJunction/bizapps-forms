#!/usr/bin/env node
/**
 * The smoke suites' Remote Operation client must send exactly what the widget sends (#303).
 *
 * Ten scripts reach the respondent surface through `operations.mjs` now. Two things about it fail
 * silently, so both are pinned here, with no server and no database:
 *
 *   - The mutation TEXT. A smoke that posts a different selection or invoke mode than
 *     `FormsGraphQLApiService` can pass against a server the widget cannot use. The widget's text is
 *     read out of its TypeScript source (a .mjs smoke cannot import it) and compared whitespace-folded.
 *   - The `x-session-id` header. It is the rate-limit and ownership key, so an ownership suite that
 *     meant to OMIT it and sent the per-token id instead would credit the ownership gate with a
 *     refusal it never made — and a suite that meant to send it and did not would share one bucket.
 *
 * Stdlib-only, like everything under smoke/lib.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXECUTE_REMOTE_OPERATION, executeOperation, postGraphQL, republishForm } from './operations.mjs';
import { sessionIdFor } from './session.mjs';

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

const fold = (text) => text.replace(/\s+/g, ' ').trim();

// --- the wire text is the widget's ------------------------------------------------------------------

const widgetSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../packages/Angular/src/lib/widget/api/forms-api.graphql.service.ts'),
  'utf8',
);
const widgetMutation = widgetSource.match(/EXECUTE_REMOTE_OPERATION_MUTATION = `([^`]+)`/)?.[1];
check('the widget source still declares EXECUTE_REMOTE_OPERATION_MUTATION', Boolean(widgetMutation));
check(
  'the smoke mutation is the widget mutation, byte for byte modulo whitespace',
  widgetMutation !== undefined && fold(widgetMutation) === fold(EXECUTE_REMOTE_OPERATION),
  `widget: ${fold(widgetMutation ?? '')}\n      smoke : ${fold(EXECUTE_REMOTE_OPERATION)}`,
);

// --- the headers ---------------------------------------------------------------------------------------

/** Run one call against a fake fetch and return the request it made. */
async function capture(auth, body = { data: { ExecuteRemoteOperation: { success: true, resultCode: 'SUCCESS', outputJSON: '{"A":1}', errorMessage: null } } }) {
  let seen;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const result = await executeOperation('http://smoke.test', auth, 'Forms.Example', { X: 1 });
    return { ...seen, result };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const token = 'header.payload.signature';

const plain = await capture({ token });
check('a token session sends its bearer token', plain.init.headers.Authorization === `Bearer ${token}`);
check('and the per-token session id the widget would', plain.init.headers['x-session-id'] === sessionIdFor(token));
const posted = JSON.parse(plain.init.body);
check('the operation key, JSON input and attached mode travel as variables',
  posted.variables.operationKey === 'Forms.Example' && posted.variables.inputJSON === '{"X":1}' && posted.variables.invokeMode === 'attached');
check('the parsed output comes back', plain.result.success === true && plain.result.output?.A === 1);

const omitted = await capture({ token, sessionId: undefined });
check('an explicit sessionId: undefined OMITS the header (ownership route 2)', !('x-session-id' in omitted.init.headers));

const chosen = await capture({ token, sessionId: 'attacker-choice' });
check('an explicit sessionId is sent verbatim', chosen.init.headers['x-session-id'] === 'attacker-choice');

const keyed = await capture({ apiKey: 'mj_sk_test' });
check('a user API key travels as x-api-key, with no session id',
  keyed.init.headers['x-api-key'] === 'mj_sk_test' && !('x-session-id' in keyed.init.headers));

const system = await capture({ systemKey: 'sys' });
check('the system key travels as x-mj-api-key', system.init.headers['x-mj-api-key'] === 'sys');

// --- a refusal is a value, not a throw -----------------------------------------------------------------

const refused = await capture({ token }, { data: { ExecuteRemoteOperation: { success: false, resultCode: 'FORBIDDEN', outputJSON: null, errorMessage: 'no' } } });
check('a refused operation is returned, with its result code', refused.result.success === false && refused.result.resultCode === 'FORBIDDEN' && refused.result.output === null);

let threw = '';
try {
  await executeOperation('http://smoke.test', {}, 'Forms.Example', {});
} catch (err) {
  threw = err.message;
}
check('a call with no credential throws, naming the forms it accepts', /token.*apiKey.*systemKey/.test(threw), threw);

let missingKey = '';
try {
  await republishForm('http://smoke.test', 'form-1', {});
} catch (err) {
  missingKey = err.message;
}
check('republishing without MJ_API_KEY throws naming it', missingKey.includes('MJ_API_KEY'), missingKey);

// --- a raw GraphQL probe carries the same credentials ------------------------------------------------

{
  let seen;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ data: { mjBizAppsFormsFormVersion: null } }), { status: 200 });
  };
  try {
    const probe = await postGraphQL('http://smoke.test', { token }, 'query Q($id: String!) { mjBizAppsFormsFormVersion(ID: $id) { ID } }', { id: 'v-1' });
    check('a raw probe sends the session bearer token and its session id',
      seen.init.headers.Authorization === `Bearer ${token}` && seen.init.headers['x-session-id'] === sessionIdFor(token));
    check('a raw probe sends its document and variables', JSON.parse(seen.init.body).variables.id === 'v-1');
    check('a raw probe returns the status and the parsed body unjudged', probe.httpStatus === 200 && probe.body.data.mjBizAppsFormsFormVersion === null);
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log(failures === 0 ? '\nPASS — the smoke operation client speaks the widget\'s wire.' : `\nFAIL — ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
