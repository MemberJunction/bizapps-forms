#!/usr/bin/env node
/**
 * Same-device resume, end to end (#138): a draft, a pointer, a new session, the same row.
 *
 * ⚠️ NEVER EXECUTED. Written alongside the feature but not run: the migration it depends on
 * (`V202609031200__v0.12.x__Resume_Own_Response.sql`) has not been applied to any database, so the
 * two columns and the row filters this exercises do not exist yet, and same-device resume is
 * inactive by construction until they do. Expect to fix things in here on its first real run — that
 * is normal for a smoke script, and it is the reason this notice is at the top rather than in a
 * commit message.
 *
 * WHY IT HAS TO EXIST. `.claude/rules/testing.md` is explicit that the anonymous respondent path is
 * not visible to unit tests, and every load-bearing fact here is a STACK-level one:
 *
 *   - The cookie's attributes are a promise the BROWSER keeps, not TypeScript. `HttpOnly` and
 *     `Path=/f/<slug>` are what stop a page script reading the pointer and what stop two forms on
 *     one host seeing each other's; only a real `Set-Cookie` header can be checked for them.
 *   - Row-level security is a SQL predicate. Whether a resumed session can read its own response —
 *     and, more importantly, whether a public-link session can read ANY — is decided by
 *     `{{ScopeResourceID}}` substitution inside SQL Server, which no fake provider models.
 *   - The two-tab race is settled by core's atomic compare-and-swap on `MagicLinkInvite.UseCount`.
 *     A unit test can assert what we do with a `consumed` answer; only the database decides who
 *     gets it.
 *
 * So this drives the real routes, and reads the results back OUT OF SQL SERVER rather than
 * believing the API's own report.
 *
 * Usage:  set -a && . ./.env && set +a && node smoke/device-resume-path.mjs [distribution-slug]
 * Against a branch harness on its own port:
 *         FORMS_SMOKE_URL=http://localhost:4131 node smoke/device-resume-path.mjs
 */
import { randomUUID } from 'node:crypto';
import { resolveSlug, buildAnswers } from './lib/fixture.mjs';
import { requireDbEnv, sql } from './lib/sqlcmd.mjs';
import { smokeBaseUrl } from './lib/target.mjs';

const BASE = smokeBaseUrl();

/** Every meaningful assertion here is "the database says so", so the database is not optional. */
requireDbEnv('device-resume-path.mjs');
const SLUG = resolveSlug('device-resume-path.mjs');

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, detail) => { failures++; console.error(`  FAIL  ${m}${detail ? `\n          ${detail}` : ''}`); };
const check = (cond, m, detail) => (cond ? pass(m) : fail(m, detail));
const section = (m) => console.log(`\n--- ${m} ---`);

/** Single-quote escaping for the ids this script interpolates into its verification SQL. */
const esc = (v) => String(v).replace(/'/g, "''");

const SUBMIT = `
  mutation S($input: FormSubmissionInputType!) {
    SubmitFormResponse(input: $input) { success responseId status errors { message } }
  }`;

const PUBLISHED = `
  query P($slug: String!) {
    PublishedForm(distributionSlug: $slug) { definitionJSON resumeJSON }
  }`;

/** POST a GraphQL operation as an anonymous respondent, with an explicit session correlator. */
async function gql(token, sessionId, query, variables) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  if (sessionId !== undefined) {
    headers['x-session-id'] = sessionId;
  }
  const res = await fetch(`${BASE}/`, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  const body = await res.json();
  if (body.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(body.errors).slice(0, 300)}`);
  }
  return body.data;
}

/**
 * Load the public page as a browser would, returning its session token AND whether it was told a
 * draft exists. The `data-has-draft` stamp is presence-only by design — the page never receives
 * the pointer itself — so this is the only place the flag can be observed.
 */
async function loadPage(cookie) {
  const res = await fetch(`${BASE}/f/${SLUG}`, { headers: cookie ? { cookie } : {} });
  if (res.status !== 200) {
    throw new Error(`GET /f/${SLUG} returned ${res.status} — is the distribution published with a PublicLinkToken?`);
  }
  const html = await res.text();
  const token = html.match(/data-token="([^"]+)"/)?.[1];
  if (!token) {
    throw new Error('host page carried no anonymous session token');
  }
  return { token, hasDraft: html.includes('data-has-draft="1"') };
}

/** POST one of the three host routes exactly as the page's boot script does. */
async function hostRoute(action, { token, sessionId, body, cookie } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (sessionId) headers['x-session-id'] = sessionId;
  if (cookie) headers['cookie'] = cookie;
  const res = await fetch(`${BASE}/f/${SLUG}/${action}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = {};
  }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}

/** The `mjf_resume=<token>` pair from a Set-Cookie header, as a browser would send it back. */
function cookiePair(setCookie) {
  const value = setCookie?.match(/mjf_resume=([^;]*)/)?.[1];
  return value ? `mjf_resume=${value}` : undefined;
}

/** A partial submission carrying whatever answers this form's fixture provides. */
function partialInput(versionId, responseId) {
  return {
    distributionSlug: SLUG,
    formVersionId: versionId,
    partial: true,
    responseId,
    answers: buildAnswers(),
  };
}

async function run() {
  const created = { responseIds: [] };

  section('first sitting: a draft, then a pointer');
  const first = await loadPage();
  check(first.hasDraft === false, 'a browser with no cookie is not told there is a draft');
  const definition = JSON.parse((await gql(first.token, undefined, PUBLISHED, { slug: SLUG })).PublishedForm.definitionJSON);
  const versionId = definition.formVersionId;

  const S1 = randomUUID();
  const R1 = randomUUID();
  const saved = await gql(first.token, S1, SUBMIT, { input: partialInput(versionId, R1) });
  check(saved.SubmitFormResponse.success === true, 'the first partial save succeeds');
  const responseId = saved.SubmitFormResponse.responseId;
  created.responseIds.push(responseId);

  const rowLink = sql(`SELECT FormDistributionID FROM __mj_BizAppsForms.vwFormResponses WHERE ID='${esc(responseId)}'`);
  check(/[0-9A-F]{8}-/i.test(rowLink), 'the row records which link it came through (needs the migration + CodeGen)', rowLink);

  const remembered = await hostRoute('remember', {
    token: first.token,
    sessionId: S1,
    body: { responseId, sessionId: S1 },
  });
  check(remembered.status === 204, `/remember accepts an owned draft (got ${remembered.status})`);
  const cookie = cookiePair(remembered.setCookie);
  check(Boolean(cookie), 'a pointer cookie comes back', remembered.setCookie ?? '(no Set-Cookie)');
  check(/HttpOnly/i.test(remembered.setCookie ?? ''), 'the pointer is HttpOnly, so no page script can read it');
  check(/SameSite=Lax/i.test(remembered.setCookie ?? ''), 'the pointer is SameSite=Lax');
  check(
    (remembered.setCookie ?? '').includes(`Path=/f/${SLUG}`),
    'the pointer is scoped to this form only, so two forms never see each other\'s',
    remembered.setCookie ?? '',
  );

  const invite = sql(
    `SELECT TOP 1 MaxUses, ISNULL(Email,'(null)') FROM __mj.MagicLinkInvite ` +
      `WHERE ResourceID='${esc(responseId)}' AND Status='Active' ORDER BY __mj_CreatedAt DESC`,
  );
  check(invite.includes('1'), 'the device invite is single-use', invite);
  check(invite.includes('(null)'), 'the device invite has no email, keeping it out of the re-send match', invite);

  section('second sitting: the pointer becomes a session');
  const reopened = await loadPage(cookie);
  check(reopened.hasDraft === true, 'the page is told a draft exists, from the cookie alone');

  const resumed = await hostRoute('resume', { cookie });
  check(resumed.status === 200, `/resume mints a session (got ${resumed.status} ${JSON.stringify(resumed.json)})`);
  const resumedToken = resumed.json.token;
  const rotated = cookiePair(resumed.setCookie);
  check(Boolean(rotated) && rotated !== cookie, 'the pointer is rotated, so the spent one is worthless');

  const resumeJson = (await gql(resumedToken, undefined, PUBLISHED, { slug: SLUG })).PublishedForm.resumeJSON;
  check(Boolean(resumeJson), 'the resumed session is handed its draft back');
  const snapshot = resumeJson ? JSON.parse(resumeJson) : { answers: [] };
  check(snapshot.responseId?.toLowerCase() === responseId.toLowerCase(), 'it is the SAME draft');
  check(snapshot.answers.length > 0, 'the saved answers come with it');

  const publicResume = (await gql(first.token, undefined, PUBLISHED, { slug: SLUG })).PublishedForm.resumeJSON;
  check(!publicResume, 'an ordinary public-link session is handed NOTHING — the row filter is the gate');

  section('the two-tab race must not orphan the draft');
  const replay = await hostRoute('resume', { cookie });
  check(replay.status === 410, `replaying the spent pointer is refused (got ${replay.status})`);
  check(
    replay.json.reason === 'open-elsewhere',
    'a consumed pointer is reported as "open in another tab", not as a failure',
    JSON.stringify(replay.json),
  );
  check(
    !replay.setCookie,
    'THE POINT: the loser does NOT clear the cookie the winner just rotated — otherwise the next ' +
      'reopen starts a second draft and the real one is orphaned',
    replay.setCookie ?? '',
  );

  section('continuing writes the SAME row');
  const S2 = randomUUID();
  const continued = await gql(resumedToken, S2, SUBMIT, { input: partialInput(versionId, responseId) });
  check(continued.SubmitFormResponse.success === true, 'a save from the resumed session succeeds');
  check(continued.SubmitFormResponse.responseId?.toLowerCase() === responseId.toLowerCase(), 'it lands on the original row');

  const rowCount = sql(
    `SELECT COUNT(*) FROM __mj_BizAppsForms.vwFormResponses ` +
      `WHERE FormVersionID='${esc(versionId)}' AND AnonymousSessionID IN ('${esc(S1)}','${esc(S2)}')`,
  );
  check(rowCount.includes('1'), 'SQL agrees there is exactly ONE row for both sittings', rowCount);
  const owner = sql(`SELECT AnonymousSessionID FROM __mj_BizAppsForms.vwFormResponses WHERE ID='${esc(responseId)}'`);
  check(owner.toLowerCase().includes(S1.toLowerCase()), 'the FIRST sitting is still the recorded owner', owner);

  section('forget');
  const forgotten = await hostRoute('forget', { token: resumedToken, cookie: rotated });
  check(forgotten.status === 204, '/forget answers 204');
  check(/Max-Age=0/.test(forgotten.setCookie ?? ''), 'the cookie is cleared');
  const afterForget = await hostRoute('resume', { cookie: rotated });
  check(afterForget.status === 410, 'the forgotten pointer no longer resumes');

  section('cleanup');
  for (const id of created.responseIds) {
    sql(`DELETE FROM __mj_BizAppsForms.FormResponseAnswer WHERE ResponseID='${esc(id)}'`);
    sql(`DELETE FROM __mj_BizAppsForms.FormResponse WHERE ID='${esc(id)}'`);
    sql(`UPDATE __mj.MagicLinkInvite SET Status='Revoked' WHERE ResourceID='${esc(id)}' AND Status='Active'`);
  }
  const left = sql(`SELECT COUNT(*) FROM __mj_BizAppsForms.vwFormResponses WHERE ID='${esc(responseId)}'`);
  check(left.includes('0'), 'every row this run created is gone', left);
}

run()
  .catch((err) => {
    failures += 1;
    console.error(`\nABORTED: ${err.message}`);
  })
  .finally(() => {
    console.log(failures === 0 ? '\nPASS — same-device resume behaves as designed.' : `\nFAIL — ${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
  });
