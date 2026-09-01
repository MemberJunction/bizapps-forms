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
import { sessionIdFor } from './lib/session.mjs';
import { buildAnswers, resolveSlug } from './lib/fixture.mjs';
import { smokeBaseUrl } from './lib/target.mjs';

const BASE = smokeBaseUrl();
const SLUG = resolveSlug('respondent-scope-path.mjs');
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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      // Mirrors the widget's per-instance correlator; without it every request shares one
      // rate-limit bucket. See smoke/lib/session.mjs.
      'x-session-id': sessionIdFor(token),
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  return { data: body.data ?? null, errors: body.errors ?? null };
}

/** Join a GraphQL error array into one searchable string. */
const errorText = (errors) => (errors ?? []).map((e) => e.message).join(' | ');

/**
 * The distribution id this session is scoped to, read out of its own JWT.
 *
 * `{{ScopeResourceID}}` in the read filters is substituted with exactly this value, so reading it
 * here is not a shortcut around the test — it is the test's whole premise made visible. The payload
 * is base64url-decoded WITHOUT verifying the signature, which is correct for a smoke: the server
 * already verified it (it answered the request), and this script only needs to know what it claims.
 */
function scopedDistributionId(token) {
  try {
    const payload = token.split('.')[1];
    const json = Buffer.from(payload + '='.repeat((4 - (payload.length % 4)) % 4), 'base64url').toString('utf8');
    return JSON.parse(json)?.mj_scopes?.[0]?.resourceId ?? '';
  } catch {
    return '';
  }
}

/**
 * Does this error say "you are not allowed", as opposed to any other kind of failure?
 *
 * ⚠️ MATCHING THE ERROR CATEGORY IS DELIBERATE, and the looser rule was tried first and was wrong.
 * The original version of this file accepted ANY error as proof of denial. Running it against a
 * database in the pre-#39 state — where the exploit is wide open — showed two checks passing
 * anyway: the direct answer-write "passed" on a FOREIGN KEY violation from a made-up ResponseID,
 * and reads "passed" on a null payload that only meant the probe id matched no row. Both would
 * have reported a vulnerable database as secure, which is the exact failure mode this file exists
 * to prevent. So a denial must LOOK like a denial.
 *
 * The two shapes MJ emits are checked, not one: generated read resolvers call
 * `CheckUserReadPermissions` (→ "does not have read permissions on …") and create goes through
 * `CheckCreateRLS` (→ "Access denied for new … record"). If a future MJ rewords these, this test
 * fails loudly and gets updated — far better than silently going green forever.
 */
const isPermissionError = (errors) => /permission|access denied|not authorized|unauthorized/i.test(errorText(errors));

/**
 * Assert an operation was refused BECAUSE it was not permitted.
 *
 * A null payload with no error is reported as a FAILURE, not a pass: it means the probe proved
 * nothing, and an inconclusive security check that reads as green is worse than a red one.
 */
function checkDenied(label, field, { data, errors }) {
  const payload = data?.[field];
  if (payload) {
    fail(label, `NOT denied — the server returned ${JSON.stringify(payload).slice(0, 160)}`);
  } else if (isPermissionError(errors)) {
    pass(`${label} is denied  (${errorText(errors).slice(0, 90)})`);
  } else if (errors) {
    fail(label, `failed, but NOT on permissions — so this proves nothing: ${errorText(errors).slice(0, 200)}`);
  } else {
    fail(label, 'no error and no payload: inconclusive, not a denial');
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

  // ── 3. And the pipeline still works for the same session. ───────────────────────────────────
  // Without this the file would prove only that something is broken. The deny-all create filter is
  // supposed to cost nothing, because `PublicFormResolver` elevates to the system user for every
  // response write; this is what makes that claim testable rather than asserted.
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
      // `buildAnswers`, not a local copy of it — see the note in binding-path.mjs. This check is
      // the one that proves the deny-all create filter costs the pipeline nothing, so a fixture
      // that cannot produce an acceptable submission reports that claim as false.
      answers: buildAnswers(questions, { email: 'scope-smoke@example.com', name: 'Scope Smoke' }),
    },
  });
  const result = submission.data?.SubmitFormResponse;
  check(result?.success === true,
    'the SAME session still submits through the pipeline (the deny-all filter costs nothing)',
    result?.errors?.[0]?.message ?? errorText(submission.errors) ?? 'no error message returned');

  // ── 3b. The second half of the exploit: writing an answer onto a REAL response row. ─────────
  // Deliberately ordered AFTER the legitimate submit, so it can cite a response id that genuinely
  // exists. With a made-up id the INSERT is rejected by `FK_FormResponseAnswer_FormResponse` — an
  // error, and therefore a "denial" to a naive check, on a database where the grant is wide open.
  // Pointing it at a real row leaves entity permissions as the ONLY thing that can stop it, which
  // is the whole point of the probe. It also mirrors the realistic attack: append answers to a
  // response that the pipeline already validated.
  if (result?.responseId) {
    checkDenied('generic CreatemjBizAppsFormsFormResponseAnswer (onto a REAL response row)',
      'CreatemjBizAppsFormsFormResponseAnswer',
      await gql(token, `
        mutation X($input: CreatemjBizAppsFormsFormResponseAnswerInput!) {
          CreatemjBizAppsFormsFormResponseAnswer(input: $input) { ID }
        }`, {
        input: {
          ResponseID: result.responseId,
          QuestionID: questions[0]?.id,
          TextValue: 'direct write, bypassing the pipeline',
        },
      }));
  } else {
    skip('generic CreatemjBizAppsFormsFormResponseAnswer (onto a REAL response row)',
      'the legitimate submit above returned no responseId, so there is no real row to target; a made-up id would be rejected by the foreign key rather than by permissions, which proves nothing');
  }

  // ── 4. The five retired definition reads are gone. ──────────────────────────────────────────
  // Not merely filtered — removed, because no anonymous code path ever read them: the published
  // version's DefinitionSnapshot already carries the questions, options, pages and style tokens.
  // All FIVE are probed, not a representative sample: the five were removed in one decision, and a
  // loop that covers three of them would let a partially-applied migration pass while the file
  // claims otherwise.
  //
  // Each probe uses a REAL id wherever the published snapshot carries one (the form, its pages, its
  // questions and their options), so that on a database still holding these grants the query
  // returns an actual row — a visible leak — rather than a null that could be mistaken for a
  // denial. `MJ: Row Level Security`-style permission checks run BEFORE the row lookup
  // (`CheckUserReadPermissions` is the first statement of every generated read resolver), so the
  // denial is reported identically whether or not the id exists; the real ids are there to make
  // the FAILING case unambiguous, not the passing one.
  const firstOptionId = questions.flatMap((q) => q.options ?? []).map((o) => o.id)[0];
  const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000';
  for (const [label, field, probeId] of [
    ['Forms', 'mjBizAppsFormsForm', definition.formId],
    ['Form Questions', 'mjBizAppsFormsFormQuestion', questions[0]?.id],
    ['Form Question Options', 'mjBizAppsFormsFormQuestionOption', firstOptionId],
    ['Form Pages', 'mjBizAppsFormsFormPage', (definition.pages ?? [])[0]?.id],
    // The snapshot embeds style TOKENS, not the style row's id, so this one has no real id to cite.
    // It still proves the grant is gone, because the permission check precedes the lookup.
    ['Form Styles', 'mjBizAppsFormsFormStyle', undefined],
  ]) {
    checkDenied(`read on ${label}`, field,
      await gql(token, `query R($id: String!) { ${field}(ID: $id) { ID } }`, { id: probeId ?? UNKNOWN_ID }));
  }

  // ── 5. Cross-form isolation on the one entity that still carries a read. ────────────────────
  // Form Distributions is the enumeration surface finding 2 named: the row carries
  // `PublicLinkToken`, so an unfiltered read handed every respondent every other form's live link.
  const ownDistributionId = scopedDistributionId(token);
  if (ownDistributionId) {
    const own = await gql(token,
      'query D($id: String!) { mjBizAppsFormsFormDistribution(ID: $id) { ID Slug } }',
      { id: ownDistributionId });
    check(own.data?.mjBizAppsFormsFormDistribution?.ID,
      'the session CAN read the distribution it was scoped to',
      errorText(own.errors) || 'returned null — the scope filter is rejecting the session\'s OWN row, which would break every form');
  } else {
    skip('the session CAN read the distribution it was scoped to',
      'the session JWT carries no mj_scopes[0].resourceId — if that is true on a real host, the read filters can never match and every form is broken');
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
      'pass a second distribution id as the SECOND argument (after the slug), or set FORMS_SMOKE_OTHER_DISTRIBUTION_ID. Not faked: with one distribution in the database, "isolated" and "nothing else existed" are the same observation.');
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
