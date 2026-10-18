#!/usr/bin/env node
/**
 * Smoke test for the anonymous respondent path, end to end, against a running MJAPI.
 *
 * WHY THIS EXISTS. Version 0.2.1 shipped with this path completely broken — two
 * independent defects, either of which alone made every public submission fail — and
 * the whole unit suite was green throughout. Unit tests could not have caught either
 * one: the first was a case mismatch between a value minted client-side and the same
 * value read back from SQL Server, and the second was a browser doing its default form
 * submit. Both only exist when a real server serves a real published form.
 *
 * So this deliberately drives the PUBLIC surface, in the order a respondent meets it,
 * and asserts the things that were actually wrong rather than the things that are easy
 * to assert.
 *
 * The load-bearing step is step 5. It submits using the `formVersionId` read out of the
 * published snapshot — exactly what the widget sends — rather than one queried from the
 * database. Those two spellings of the same GUID differ in case, and comparing them
 * case-sensitively is what rejected every submission in 0.2.1.
 *
 * Zero dependencies: Node's built-in fetch only, so it runs in CI without a browser.
 *
 * Usage:  node smoke/respondent-path.mjs [distribution-slug]
 *         FORMS_SMOKE_URL=http://host:port node smoke/respondent-path.mjs my-slug
 */
import { randomUUID } from 'node:crypto';
import { buildAnswers, resolveSlug } from './lib/fixture.mjs';
import { definitionQuestions, firstSaveError, getRespondentForm, postGraphQL, saveResponse } from './lib/operations.mjs';
import { smokeBaseUrl } from './lib/target.mjs';

const BASE = smokeBaseUrl();
const SLUG = resolveSlug('respondent-path.mjs');

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, detail) => { failures++; console.error(`  FAIL  ${m}${detail ? `\n          ${detail}` : ''}`); };
const check = (cond, m, detail) => (cond ? pass(m) : fail(m, detail));

async function main() {
  console.log(`Respondent-path smoke test\n  target : ${BASE}\n  slug   : ${SLUG}\n`);

  // 1. The public host page must render for an anonymous visitor with no session.
  const pageRes = await fetch(`${BASE}/f/${SLUG}`);
  check(pageRes.status === 200, `GET /f/${SLUG} serves 200`,
    `got ${pageRes.status} — 409 means either no PublicLinkToken (host magicLink not enabled?) or, ` +
      'since bizapps-forms#118, that the form has no Published version; 503 means the link has an ' +
      'OpenAt in the future. The page body says which.');
  const html = await pageRes.text();

  // 2. The page must carry a redeemed anonymous session token.
  const token = (html.match(/data-token="([^"]+)"/) || [])[1];
  check(Boolean(token), 'host page carries an anonymous session token');
  if (!token) { console.error('\ncannot continue without a session token'); process.exit(1); }

  // 3. The widget bundle must actually be served, not 404. Without it the page renders
  //    an empty shell — which looks like a styling problem, not a missing build step.
  //    And served COMPRESSED (#121): `fetch` offers gzip like a browser does, and a 1.2 MB
  //    bundle with no Content-Encoding is the whole first-load cost on a phone. A route
  //    registered ahead of MJAPI's compression middleware fails this while still answering 200.
  const widget = await fetch(`${BASE}/forms/widget/mj-form.js`, { headers: { 'Accept-Encoding': 'gzip' } });
  check(widget.status === 200, 'widget bundle is served', `got ${widget.status} — run "npm run build:packages"`);
  const encoding = widget.headers.get('content-encoding');
  check(encoding === 'gzip', 'widget bundle is served compressed', `Content-Encoding: ${encoding ?? '(none)'}`);

  // 4. The published definition must load for that anonymous session, through
  //    `Forms.GetRespondentForm` — the operation the widget calls (#303).
  const { formVersionId, definition } = await getRespondentForm(BASE, token, SLUG);
  const questions = definitionQuestions(definition);
  check(questions.length > 0, `published definition loads (${questions.length} question(s))`);

  // 4b. The respondent projection must not carry the answer key (#302): no scoring, no ending
  //     screens, no automations. A regression here leaks knockouts and endings to every visitor.
  const leaked = ['endScreens', 'automations', 'scoring'].filter((key) => JSON.stringify(definition).includes(`"${key}"`));
  check(leaked.length === 0, 'the respondent definition carries no scoring, endings or automations', `leaked: ${leaked.join(', ')}`);

  // 4c. ...and the raw snapshot must not be one generic query away either (#302). The respondent
  //     role holds no read on Form Versions any more (V202610172102); the server reads the version
  //     as the system user. MJ's generated resolvers honour role + row filter only, so with the old
  //     grant both reads below returned the whole DefinitionSnapshot — scoring, endings, knockouts.
  const byId = await postGraphQL(BASE, { token },
    'query V($id: String!) { mjBizAppsFormsFormVersion(ID: $id) { ID DefinitionSnapshot } }',
    { id: formVersionId }, { label: 'mjBizAppsFormsFormVersion' });
  check(!byId.body.data?.mjBizAppsFormsFormVersion,
    'an anonymous session reading mjBizAppsFormsFormVersion(ID) gets nothing',
    JSON.stringify(byId.body).slice(0, 300));
  const byView = await postGraphQL(BASE, { token },
    'query R($input: RunDynamicViewInput!) { RunmjBizAppsFormsFormVersionDynamicView(input: $input) { Success ErrorMessage Results { ID } } }',
    { input: { EntityName: 'MJ_BizApps_Forms: Form Versions', ExtraFilter: '' } }, { label: 'RunmjBizAppsFormsFormVersionDynamicView' });
  const viewRows = byView.body.data?.RunmjBizAppsFormsFormVersionDynamicView?.Results ?? [];
  check(viewRows.length === 0,
    'an anonymous RunView on Form Versions returns no rows',
    JSON.stringify(byView.body).slice(0, 300));

  // 5. THE REGRESSION TEST. Submit with the snapshot's own formVersionId, which is the
  //    client-minted (lowercase) spelling — not the uppercase one SQL Server returns.
  //    Comparing those case-sensitively rejected every submission in 0.2.1.
  const versionIdFromSnapshot = definition.formVersionId;
  check(Boolean(versionIdFromSnapshot), 'snapshot carries a formVersionId');
  check(versionIdFromSnapshot?.toLowerCase() === formVersionId?.toLowerCase(),
    'the operation\'s FormVersionID names the same version as the snapshot',
    `operation: ${formVersionId}, snapshot: ${versionIdFromSnapshot}`);

  // Answers must FIT THEIR QUESTION'S TYPE, and choice answers must be one of the OFFERED
  // options -- the server enforces a type-derived format, so a smoke run has to send what a
  // real respondent would. `buildAnswers` reads the published definition's own options, which
  // is what makes this work on a form with real choices rather than only on the fixture.
  const answers = buildAnswers(questions, { email: 'smoke@example.com' });

  const submission = await saveResponse(BASE, token, {
    Slug: SLUG,
    FormVersionID: versionIdFromSnapshot,
    Mode: 'final',
    ClientResponseID: randomUUID(),
    StartedAt: new Date(0).toISOString(),
    Answers: answers,
  });

  const result = submission.output;
  check(result?.Success === true,
    'anonymous submission is accepted using the snapshot formVersionId',
    firstSaveError(submission));
  check(Boolean(result?.ResponseID), 'a ResponseID comes back');
  check(result?.Status === 'Complete', `response status is Complete (got ${result?.Status ?? 'null'})`);
  check(result?.Outcome === 'ended', `the server ends the form after a final submit (got ${result?.Outcome ?? 'null'})`);

  console.log(failures === 0 ? '\nPASS — the anonymous respondent path works end to end.' : `\nFAIL — ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\nSMOKE ERROR: ${e.message}`);
  console.error('Is MJAPI running, and has a form been published to this slug?');
  process.exit(1);
});
