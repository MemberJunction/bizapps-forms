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

const BASE = (process.env.FORMS_SMOKE_URL || 'http://localhost:4121').replace(/\/$/, '');
const SLUG = process.argv[2] || process.env.FORMS_SMOKE_SLUG || 'contact-us-e2e';

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, detail) => { failures++; console.error(`  FAIL  ${m}${detail ? `\n          ${detail}` : ''}`); };
const check = (cond, m, detail) => (cond ? pass(m) : fail(m, detail));

/** POST a GraphQL operation as the anonymous respondent. */
async function gql(token, query, variables) {
  const res = await fetch(`${BASE}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(`GraphQL error: ${JSON.stringify(body.errors).slice(0, 300)}`);
  return body.data;
}

async function main() {
  console.log(`Respondent-path smoke test\n  target : ${BASE}\n  slug   : ${SLUG}\n`);

  // 1. The public host page must render for an anonymous visitor with no session.
  const pageRes = await fetch(`${BASE}/f/${SLUG}`);
  check(pageRes.status === 200, `GET /f/${SLUG} serves 200`, `got ${pageRes.status} — 409 means the distribution has no PublicLinkToken (host magicLink not enabled?)`);
  const html = await pageRes.text();

  // 2. The page must carry a redeemed anonymous session token.
  const token = (html.match(/data-token="([^"]+)"/) || [])[1];
  check(Boolean(token), 'host page carries an anonymous session token');
  if (!token) { console.error('\ncannot continue without a session token'); process.exit(1); }

  // 3. The widget bundle must actually be served, not 404. Without it the page renders
  //    an empty shell — which looks like a styling problem, not a missing build step.
  const widget = await fetch(`${BASE}/forms/widget/mj-form.js`);
  check(widget.status === 200, 'widget bundle is served', `got ${widget.status} — run "npm run build:packages"`);

  // 4. The published definition must load for that anonymous session.
  const published = await gql(token,
    'query P($slug: String!) { PublishedForm(distributionSlug: $slug) { definitionJSON } }',
    { slug: SLUG });
  const definition = JSON.parse(published?.PublishedForm?.definitionJSON ?? '{}');
  const questions = (definition.pages ?? []).flatMap((p) => p.questions ?? []);
  check(questions.length > 0, `published definition loads (${questions.length} question(s))`);

  // 5. THE REGRESSION TEST. Submit with the snapshot's own formVersionId, which is the
  //    client-minted (lowercase) spelling — not the uppercase one SQL Server returns.
  //    Comparing those case-sensitively rejected every submission in 0.2.1.
  const versionIdFromSnapshot = definition.formVersionId;
  check(Boolean(versionIdFromSnapshot), 'snapshot carries a formVersionId');

  // Answers must FIT THEIR QUESTION'S TYPE. Until 2026-08-01 the server ignored question
  // type and applied only the author's ValidationRule, so this test could post
  // "smoke check <date>" into a Number question and still get a Complete response — the
  // same hole that let `not-an-email` persist into an Email question. Now that the server
  // enforces a type-derived format — the one the widget already applied to Email/Number/
  // Rating/NPS, plus Phone and Date, which neither side used to check — a smoke run has to
  // send what a real respondent would, which is what it should have been sending all along.
  // Mirrors the widget's `toAnswerInput` (packages/Angular/src/lib/widget/core/answer-value.ts):
  // same TYPE must reach the same typed COLUMN. This used to send `textValue` for every type, so
  // a Date answer arrived in the column `answerValueOf` reads first and the run never touched
  // `dateValue` at all — the one column this branch hardened, since `isDate` now rejects
  // non-strings. Sending what the widget sends is the whole point of a smoke test.
  const answerFor = (type) => {
    switch (type) {
      case 'Number':
      case 'Rating':
      case 'NPS':
        return { numericValue: 7 };
      case 'YesNo':
        return { booleanValue: true };
      case 'Date':
      case 'Time':
        return { dateValue: new Date(0).toISOString() };
      case 'MultiChoice':
        return { jsonValue: ['smoke'] };
      case 'Email':
        return { textValue: 'smoke@example.com' };
      case 'Phone':
        return { textValue: '+1 555 010 1234' };
      default:
        return { textValue: `smoke check ${new Date(0).toISOString()}` };
    }
  };
  const answers = questions.map((q) => ({ questionId: q.id, ...answerFor(q.type) }));

  const submission = await gql(token, `
    mutation S($input: FormSubmissionInputType!) {
      SubmitFormResponse(input: $input) { success responseId status errors { message } }
    }`, {
    input: {
      distributionSlug: SLUG,
      formVersionId: versionIdFromSnapshot,
      partial: false,
      startedAt: new Date(0).toISOString(),
      clientMeta: { referrer: '', userAgent: 'forms-smoke' },
      answers,
    },
  });

  const result = submission?.SubmitFormResponse;
  check(result?.success === true,
    'anonymous submission is accepted using the snapshot formVersionId',
    result?.errors?.[0]?.message ?? 'no error message returned');
  check(Boolean(result?.responseId), 'a responseId comes back');
  check(result?.status === 'Complete', `response status is Complete (got ${result?.status ?? 'null'})`);

  console.log(failures === 0 ? '\nPASS — the anonymous respondent path works end to end.' : `\nFAIL — ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\nSMOKE ERROR: ${e.message}`);
  console.error('Is MJAPI running, and has a form been published to this slug?');
  process.exit(1);
});
