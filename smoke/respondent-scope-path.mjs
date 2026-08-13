#!/usr/bin/env node
/**
 * Smoke test for the LIMITS of the anonymous respondent session (issue #39).
 *
 * WHY THIS EXISTS, AND WHY IT IS A SEPARATE FILE FROM `respondent-path.mjs`. That script asserts
 * the respondent path WORKS. This one asserts everything it must not be able to do — and the two
 * failure modes are opposites: a broken happy path is loud and gets found in a day, while a grant
 * that is too wide works perfectly for everyone and is found by whoever looks for it first.
 *
 * The 0.8.0 metadata seed created the `Form Respondent` role's nine permission rows with every RLS
 * filter column explicitly NULL. Two consequences, both live in a shipped release, neither visible
 * from any test that only checks that submitting a form works:
 *
 *   1. MJ publishes a generic `Create<Entity>` mutation for every entity, and
 *      `UserExemptFromRowLevelSecurity` treats a null `CreateRLSFilterID` as exemption from
 *      create-time RLS. So the CanCreate grant that exists to satisfy forms-server's
 *      `checkRespondentScope` gate doubled as direct write access that never enters
 *      `submit-pipeline.ts` — past Turnstile, the rate limiter, the `MaxResponses` quota, field
 *      validation and the distribution's open/close window, all of which live only in that
 *      pipeline. bizapps-caliber proved this class by exploit on its own widget role: an anonymous
 *      session JWT created a response row against an arbitrary FormID in one request.
 *
 *   2. ONE shared anonymous principal backs every respondent, so an unfiltered read is an
 *      instance-wide read: every respondent to any form could enumerate every Form Distribution
 *      row — `PublicLinkToken` included — and every other form's definition.
 *
 * `V202608131600__v0.10.x__Respondent_Grant_Hardening.sql` closes both. This script is the reason
 * to believe it, because it drives the real GraphQL surface with a real redeemed session token
 * rather than reasoning about permission rows. A unit test structurally cannot reach any of this:
 * the entire mechanism is MJ's generated resolvers plus RLS evaluated in SQL Server.
 *
 * WHAT A PASS MEANS. The generic create mutations are denied while `SubmitFormResponse` still
 * succeeds for the SAME session — which is the whole point of the deny-all create filter: it costs
 * the product nothing, because every legitimate write is performed by the elevated system user.
 * And the session can read its own distribution but not another's, and cannot read the five
 * definition entities at all.
 *
 * Zero dependencies: Node's built-in fetch only, so it runs in CI without a browser.
 *
 * Usage:  node smoke/respondent-scope-path.mjs [distribution-slug] [other-distribution-id]
 *         FORMS_SMOKE_URL=http://host:port FORMS_SMOKE_OTHER_DISTRIBUTION_ID=<guid> \
 *           node smoke/respondent-scope-path.mjs my-slug
 *
 * The second argument is a distribution the session is NOT scoped to. Without it the cross-form
 * isolation check is SKIPPED rather than faked — a database with one distribution cannot
 * distinguish "isolated" from "there was nothing else to see", and a check that passes for that
 * reason is worse than one that says it did not run.
 */

const BASE = (process.env.FORMS_SMOKE_URL || 'http://localhost:4121').replace(/\/$/, '');
const SLUG = process.argv[2] || process.env.FORMS_SMOKE_SLUG || 'contact-us-e2e';
const OTHER_DISTRIBUTION_ID = process.argv[3] || process.env.FORMS_SMOKE_OTHER_DISTRIBUTION_ID || '';

let failures = 0;
let skipped = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, detail) => { failures++; console.error(`  FAIL  ${m}${detail ? `\n          ${detail}` : ''}`); };
const skip = (m, why) => { skipped++; console.log(`  skip  ${m}\n          ${why}`); };
const check = (cond, m, detail) => (cond ? pass(m) : fail(m, detail));

/**
 * POST a GraphQL operation as the anonymous respondent, returning BOTH data and errors.
 *
 * Deliberately different from `respondent-path.mjs`'s helper, which throws on `errors`. Here a
 * GraphQL error is the expected result of most operations, so throwing on it would make the
 * denials unreadable — and, worse, indistinguishable from a transport failure.
 */
async function gql(token, query, variables) {
  const res = await fetch(`${BASE}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  return { data: body.data ?? null, errors: body.errors ?? null };
}

/** Join a GraphQL error array into one searchable string. */
const errorText = (errors) => (errors ?? []).map((e) => e.message).join(' | ');

/**
 * Assert an operation was refused. Checks that it FAILED and that no row came back, rather than
 * matching MJ's wording: the denial arrives as a thrown permission error today, but a future MJ
 * could answer with a null payload instead, and this test's invariant is "no row was written or
 * read", not "the message said Permission".
 */
function checkDenied(label, field, { data, errors }) {
  const payload = data?.[field];
  if (errors && !payload) {
    pass(`${label} is denied  (${errorText(errors).slice(0, 90)})`);
  } else {
    fail(label, payload ? `NOT denied — the server returned ${JSON.stringify(payload).slice(0, 160)}` : 'no error and no payload; expected an explicit denial');
  }
}

async function main() {
  console.log(`Respondent-scope smoke test\n  target : ${BASE}\n  slug   : ${SLUG}\n`);

  // A real redeemed session, exactly as a respondent gets one. Everything below rides this token.
  const pageRes = await fetch(`${BASE}/f/${SLUG}`);
  if (pageRes.status !== 200) {
    console.error(`\nSMOKE ERROR: GET /f/${SLUG} returned ${pageRes.status}. 409 means the distribution has no PublicLinkToken.`);
    process.exit(1);
  }
  const html = await pageRes.text();
  const token = (html.match(/data-token="([^"]+)"/) || [])[1];
  if (!token) {
    console.error('\nSMOKE ERROR: the host page carried no anonymous session token.');
    process.exit(1);
  }
  pass('anonymous session redeemed from the public host page');

  // ── 1. The published definition must still load. ────────────────────────────────────────────
  // The read filters are ANDed onto the definition loader's own queries, so this is the check that
  // would fail first if the Form Distributions / Form Versions scope filters were wrong — and it
  // would take the entire product with it. It is asserted BEFORE the denials for that reason.
  const published = await gql(token,
    'query P($slug: String!) { PublishedForm(distributionSlug: $slug) { definitionJSON } }',
    { slug: SLUG });
  const definition = JSON.parse(published.data?.PublishedForm?.definitionJSON ?? '{}');
  const questions = (definition.pages ?? []).flatMap((p) => p.questions ?? []);
  check(questions.length > 0,
    `scope-filtered read still resolves the published definition (${questions.length} question(s))`,
    errorText(published.errors) || 'PublishedForm returned no questions — the Form Versions read filter may not match this session\'s scope');

  // ── 2. THE EXPLOIT, on both response entities. ──────────────────────────────────────────────
  // This is the check the whole file exists for. Before the deny-all create filter, this mutation
  // succeeded and wrote a row — against any FormID the caller named, bypassing the pipeline
  // entirely. `checkRespondentScope` still passes for this session (proved by step 3, which
  // submits successfully), so a denial here is the FILTER working, not the grant being missing.
  const arbitraryFormId = definition.formId ?? '00000000-0000-0000-0000-000000000000';
  checkDenied('generic CreatemjBizAppsFormsFormResponse', 'CreatemjBizAppsFormsFormResponse',
    await gql(token, `
      mutation X($input: CreatemjBizAppsFormsFormResponseInput!) {
        CreatemjBizAppsFormsFormResponse(input: $input) { ID Status }
      }`, {
      input: {
        FormID: arbitraryFormId,
        FormVersionID: definition.formVersionId,
        Status: 'Complete',
        StartedAt: new Date(0).toISOString(),
      },
    }));

  checkDenied('generic CreatemjBizAppsFormsFormResponseAnswer', 'CreatemjBizAppsFormsFormResponseAnswer',
    await gql(token, `
      mutation X($input: CreatemjBizAppsFormsFormResponseAnswerInput!) {
        CreatemjBizAppsFormsFormResponseAnswer(input: $input) { ID }
      }`, {
      input: { FormResponseID: '00000000-0000-0000-0000-000000000001', TextValue: 'direct write' },
    }));

  // ── 3. And the pipeline still works for the same session. ───────────────────────────────────
  // Without this the file would prove only that something is broken. The deny-all create filter is
  // supposed to cost nothing, because `PublicFormResolver` elevates to the system user for every
  // response write; this is what makes that claim testable rather than asserted.
  const answerFor = (type) => {
    switch (type) {
      case 'Number': case 'Rating': case 'NPS': return { numericValue: 7 };
      case 'YesNo': return { booleanValue: true };
      case 'Date': case 'Time': return { dateValue: new Date(0).toISOString() };
      case 'MultiChoice': return { jsonValue: JSON.stringify(['smoke']) };
      case 'Email': return { textValue: 'smoke@example.com' };
      case 'Phone': return { textValue: '+1 555 010 1234' };
      default: return { textValue: `scope smoke ${new Date(0).toISOString()}` };
    }
  };
  const submission = await gql(token, `
    mutation S($input: FormSubmissionInputType!) {
      SubmitFormResponse(input: $input) { success responseId status errors { message } }
    }`, {
    input: {
      distributionSlug: SLUG,
      formVersionId: definition.formVersionId,
      partial: false,
      startedAt: new Date(0).toISOString(),
      clientMeta: { referrer: '', userAgent: 'forms-scope-smoke' },
      answers: questions.map((q) => ({ questionId: q.id, ...answerFor(q.type) })),
    },
  });
  const result = submission.data?.SubmitFormResponse;
  check(result?.success === true,
    'the SAME session still submits through the pipeline (the deny-all filter costs nothing)',
    result?.errors?.[0]?.message ?? errorText(submission.errors) ?? 'no error message returned');

  // ── 4. The five retired definition reads are gone. ──────────────────────────────────────────
  // Not merely filtered — removed, because no anonymous code path ever read them: the published
  // version's DefinitionSnapshot already carries the questions, options, pages and style tokens.
  for (const [label, field, query] of [
    ['Forms', 'mjBizAppsFormsForm', 'query R($id: String!) { mjBizAppsFormsForm(ID: $id) { ID Name } }'],
    ['Form Questions', 'mjBizAppsFormsFormQuestion', 'query R($id: String!) { mjBizAppsFormsFormQuestion(ID: $id) { ID } }'],
    ['Form Styles', 'mjBizAppsFormsFormStyle', 'query R($id: String!) { mjBizAppsFormsFormStyle(ID: $id) { ID } }'],
  ]) {
    checkDenied(`read on ${label}`, field, await gql(token, query, { id: arbitraryFormId }));
  }

  // ── 5. Cross-form isolation on the one entity that still carries a read. ────────────────────
  // Form Distributions is the enumeration surface finding 2 named: the row carries
  // `PublicLinkToken`, so an unfiltered read handed every respondent every other form's live link.
  const own = await gql(token,
    'query D($id: String!) { mjBizAppsFormsFormDistribution(ID: $id) { ID Slug } }',
    { id: definition.distributionId ?? '' });
  if (definition.distributionId) {
    check(own.data?.mjBizAppsFormsFormDistribution?.ID,
      'the session CAN read the distribution it was scoped to',
      errorText(own.errors) || 'returned null — the scope filter is rejecting the session\'s own row');
  } else {
    skip('the session CAN read the distribution it was scoped to',
      'the published snapshot carries no distributionId to probe with');
  }

  if (OTHER_DISTRIBUTION_ID) {
    const other = await gql(token,
      'query D($id: String!) { mjBizAppsFormsFormDistribution(ID: $id) { ID Slug PublicLinkToken } }',
      { id: OTHER_DISTRIBUTION_ID });
    const row = other.data?.mjBizAppsFormsFormDistribution;
    check(!row,
      'the session CANNOT read another form\'s distribution (no link-token harvesting)',
      row ? `LEAKED ${JSON.stringify(row).slice(0, 160)}` : undefined);
  } else {
    skip('the session CANNOT read another form\'s distribution',
      'pass a second distribution id as argv[2] or FORMS_SMOKE_OTHER_DISTRIBUTION_ID. Not faked: with one distribution in the database, "isolated" and "nothing else existed" are the same observation.');
  }

  console.log(
    failures === 0
      ? `\nPASS — the anonymous session is confined to its own form.${skipped ? ` (${skipped} check(s) skipped)` : ''}`
      : `\nFAIL — ${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\nSMOKE ERROR: ${e.message}`);
  console.error('Is MJAPI running, and has a form been published to this slug?');
  process.exit(1);
});
