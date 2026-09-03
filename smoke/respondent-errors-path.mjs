#!/usr/bin/env node
/**
 * Smoke test: nothing a public host says to an anonymous respondent describes the host (issue #119).
 *
 * WHY THIS IS ITS OWN FILE. `respondent-path.mjs` proves the public surface WORKS and
 * `respondent-scope-path.mjs` proves what the session must not be able to DO. This one proves what
 * the session must not be TOLD. The two leaks it guards against were both found on a real host with
 * nothing but the session the form link mints:
 *
 *   (a) Apollo's `extensions.stacktrace` — absolute server paths and pinned dependency versions on
 *       every error unless NODE_ENV is `production`, which MJ's server never overrides. A Forms
 *       Apollo plugin (`StacktraceRedactionMiddleware`) now strips it whatever NODE_ENV says.
 *   (b) The driver's own words in the resolver's TYPED result: `errors[].message` carried
 *       `Error executing SQL … FOREIGN KEY constraint "FK_…" … database "…" … table "__mj_…"`
 *       plus the whole T-SQL batch, inside an HTTP 200 — so no Apollo setting could touch it,
 *       and NODE_ENV=production leaked it identically. Persistence now returns one authored
 *       sentence and logs the detail server-side.
 *
 * Every response body this script receives — error or not — is scanned for the fingerprints of a
 * leak: stack frames, filesystem paths, `pkg@version`, the database/schema/constraint vocabulary,
 * and the SQL provider's `Error executing SQL` prefix. A pass means none of them appeared anywhere.
 *
 * THE FK CASE NEEDS A FIXTURE THIS SCRIPT WILL NOT CREATE. Leak (b) fires only when a question in
 * the published snapshot has no `FormQuestion` row behind it (the answer insert then violates
 * `FK_FormResponseAnswer_Question`). A healthy form cannot produce that, and a smoke that edits a
 * published snapshot and hopes to restore it is worse than one that says it did not run — so the
 * check is SKIPPED unless a snapshot-only question id is supplied, and the skip prints the recipe.
 * With one supplied, the script asserts the respondent sees the authored sentence and nothing else.
 *
 * Zero dependencies: Node's built-in fetch only, so it runs against a deployed API with no docker
 * or sqlcmd anywhere near it (a slug must then be given — discovery is the only step that reads
 * the database).
 *
 * Usage:  node smoke/respondent-errors-path.mjs [distribution-slug] [ghost-question-id]
 *         FORMS_SMOKE_URL=http://host:port FORMS_SMOKE_GHOST_QUESTION_ID=<guid> \
 *           node smoke/respondent-errors-path.mjs my-slug
 *
 * Run it against the host with NODE_ENV unset AND with NODE_ENV=production: (a) is dev-only, (b)
 * is not, and a fix that covers one and not the other passes one of the two runs.
 */
import { randomUUID } from 'node:crypto';
import { sessionIdFor } from './lib/session.mjs';
import { buildAnswers, resolveSlug } from './lib/fixture.mjs';

const BASE = (process.env.FORMS_SMOKE_URL || 'http://localhost:4121').replace(/\/$/, '');
const SLUG = resolveSlug('respondent-errors-path.mjs');
const GHOST_QUESTION_ID = process.argv[3] || process.env.FORMS_SMOKE_GHOST_QUESTION_ID || '';

let failures = 0;
let skipped = 0;
let warnings = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, detail) => { failures++; console.error(`  FAIL  ${m}${detail ? `\n          ${detail}` : ''}`); };
const warn = (m, detail) => { warnings++; console.log(`  warn  ${m}${detail ? `\n          ${detail}` : ''}`); };
const skip = (m, why) => { skipped++; console.log(`  skip  ${m}\n          ${why}`); };
const check = (cond, m, detail) => (cond ? pass(m) : fail(m, detail));

/**
 * Why two of the probes below WARN instead of FAIL when they leak.
 *
 * Apollo answers an HTTP request it cannot even start on — a JSON body with no `query`, a body
 * that is not JSON — from `executeHTTPGraphQLRequest` before the request pipeline exists, so no
 * plugin (`StacktraceRedactionMiddleware` included) ever sees the response; the second one never
 * reaches Apollo at all, Express's `body-parser` throws and Express's default handler renders it.
 * Both carry a stack only while NODE_ENV is not `production`, and both are settable in ONE place:
 * `includeStacktraceInErrorResponses` on MJ core's `buildApolloServer`, plus a JSON error handler
 * on its GraphQL route. That is not this repo. A FAIL here would be red on every dev host until
 * core changes, which teaches people to ignore red; a warn keeps it visible and keeps PASS honest
 * about what Forms owns. On a production-configured host both come out clean and print `ok`.
 */
const CORE_RESIDUAL =
  'dev-only; Apollo/Express answer this before any plugin runs, and only MJ core can set ' +
  'includeStacktraceInErrorResponses — clean under NODE_ENV=production';

/**
 * The fingerprints of the two leaks, each named so a failure says WHAT got out, not just that
 * something did. `\d+\.\d+\.\d+` alone would false-positive on a version-shaped answer value; it
 * is anchored to the `pkg@` form Apollo's frames actually carry.
 */
const LEAK_FINGERPRINTS = [
  [/"stacktrace"/, 'extensions.stacktrace'],
  [/\s+at .+\(.+:\d+:\d+\)/, 'a stack frame'],
  [/\/Users\/|\/home\/|\/srv\/|[A-Z]:\\|node_modules/i, 'a filesystem path'],
  [/[\w.-]+@\d+\.\d+\.\d+/, 'a pinned dependency version'],
  [/Error executing SQL/i, "the SQL provider's error prefix"],
  [/FOREIGN KEY|PRIMARY KEY|UNIQUE KEY|CHECK constraint|FK_\w+|PK_\w+/i, 'a constraint name'],
  [/__mj\b|__mj_\w+|\bdbo\.|\bsp[A-Z]\w+\b|\bDECLARE @|\bEXEC \[/i, 'schema, table or procedure vocabulary'],
  [/conflict occurred in database|table "\w+/i, 'a database or table name'],
];

/** The fingerprints present in a response body, by name; an empty list is a clean body. */
function leaksIn(text) {
  return LEAK_FINGERPRINTS.filter(([re]) => re.test(text)).map(([, name]) => name);
}

/** POST a GraphQL operation as the respondent; return the raw text so nothing is lost to parsing. */
async function post(token, body, headers = {}) {
  const res = await fetch(`${BASE}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-session-id': sessionIdFor(token),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

/**
 * One probe: fire it, assert its body carries no fingerprint, and run any extra assertion.
 * `coreResidual` marks the two requests Apollo/Express answer before any plugin can run — a leak
 * there is reported, but as MJ core's (see {@link CORE_RESIDUAL}), not as a Forms failure.
 */
async function probe(token, label, body, { extra, coreResidual = false } = {}) {
  const res = await post(token, body);
  const leaks = leaksIn(res.text);
  const summary = `${label} (HTTP ${res.status}) says nothing about the host`;
  if (leaks.length === 0) {
    pass(summary);
  } else if (coreResidual) {
    warn(`${summary} — ${CORE_RESIDUAL}`, `leaked ${leaks.join(', ')}: ${res.text.slice(0, 160).replace(/\s+/g, ' ')}`);
  } else {
    fail(summary, `LEAKED ${leaks.join(', ')}: ${res.text.slice(0, 240)}`);
  }
  if (extra) {
    extra(res);
  }
  return res;
}

const SUBMIT = `mutation S($input: FormSubmissionInputType!) {
  SubmitFormResponse(input: $input) { success responseId status errors { questionId message } }
}`;

async function main() {
  console.log(`Respondent-errors smoke test\n  target : ${BASE}\n  slug   : ${SLUG}\n`);

  // A real redeemed session, exactly as a respondent gets one. Everything below rides this token.
  const pageRes = await fetch(`${BASE}/f/${SLUG}`);
  if (pageRes.status !== 200) {
    console.error(
      `\nSMOKE ERROR: GET /f/${SLUG} returned ${pageRes.status}. 409 means either that the ` +
        'distribution has no PublicLinkToken, or that its form has no Published version ' +
        '(bizapps-forms#118 made the door refuse that too) — the page body says which.',
    );
    process.exit(1);
  }
  const token = (await pageRes.text()).match(/data-token="([^"]+)"/)?.[1];
  if (!token) {
    console.error('\nSMOKE ERROR: the host page carried no anonymous session token.');
    process.exit(1);
  }
  pass('anonymous session redeemed from the public host page');

  // Scanned like every other response, not merely parsed. This is the one SUCCESSFUL body the suite
  // sees, so it is the only thing that can support the header's claim to check "error or not" — and
  // it is the largest body on the public surface, carrying the whole published definition.
  const publishedRes = await post(token,
    { query: 'query P($slug: String!) { PublishedForm(distributionSlug: $slug) { definitionJSON } }', variables: { slug: SLUG } },
  );
  const publishedLeaks = leaksIn(publishedRes.text);
  check(publishedLeaks.length === 0, 'the successful PublishedForm response says nothing about the host',
    publishedLeaks.length ? `leaked ${publishedLeaks.join(', ')}` : '');
  const published = JSON.parse(publishedRes.text);
  const definition = JSON.parse(published.data?.PublishedForm?.definitionJSON ?? '{}');
  const questions = (definition.pages ?? []).flatMap((p) => p.questions ?? []);
  check(questions.length > 0 && typeof definition.formVersionId === 'string',
    `the published definition loads (${questions.length} question(s))`,
    'PublishedForm returned nothing — the probes below would then be testing an unpublished link');

  // ── (a) Every way to make Apollo itself produce an error. ───────────────────────────────────
  // The issue's exact reproduction: a field that does not exist on the type.
  await probe(token, 'a malformed query (validation error)',
    { query: '{ SubmitFormResponse { message } }' });
  // A query that does not parse at all.
  await probe(token, 'an unparseable query (parse error)',
    { query: '{ PublishedForm(' });
  // A request that resolves to an error INSIDE a resolver — the only probe here that reaches one,
  // and so the only one that can carry MJ resolver frames rather than graphql-js validation frames.
  //
  // It must be a field that EXISTS and is REFUSED. `mjBizAppsFormsFormVersions` (plural) was neither:
  // CodeGen emits no list root, so graphql-js rejected it at validation exactly like the malformed
  // query two probes up, and this check never once exercised a resolver. Nor is any read refused
  // outright — the anonymous session legitimately reads its OWN distribution and version, which is
  // how the widget loads the form. `Form Responses` is the entity the respondent may CREATE but not
  // READ, so reading one is refused by the authorization layer, inside the resolver, with a `path`.
  await probe(token, 'a resolver error (out-of-scope read)',
    { query: `{ mjBizAppsFormsFormResponse(ID: "${randomUUID()}") { ID Status } }` });
  // Apollo and Express answer these before any plugin runs — see CORE_RESIDUAL.
  await probe(token, 'a body that is not JSON (bad request)', '{not json', { coreResidual: true });
  await probe(token, 'a body with no query (bad request)', {}, { coreResidual: true });

  // ── (b) The typed result. Authored refusals must stay authored… ─────────────────────────────
  await probe(token, 'a submit against a stale version (typed refusal)', {
    query: SUBMIT,
    variables: { input: { distributionSlug: SLUG, formVersionId: randomUUID(), answers: [] } },
  }, { extra: (res) => {
    const body = JSON.parse(res.text);
    const message = body.data?.SubmitFormResponse?.errors?.[0]?.message ?? '';
    check(/unavailable|version/i.test(message), 'the stale-version refusal is the authored sentence',
      `got: ${message || res.text.slice(0, 200)}`);
  } });

  // …and a save the database refuses must not quote the database.
  if (GHOST_QUESTION_ID) {
    // EVERY REQUIRED QUESTION IS ANSWERED, not just the ghost. Validation runs before persistence,
    // so on a form with an unanswered required question the pipeline refuses at the validation
    // stage, no INSERT is attempted, and `FK_FormResponseAnswer_Question` is never violated. The
    // leak scan below would then pass while exercising nothing — the check exists to prove the
    // driver's words cannot reach a respondent, and there would be no driver in it. That is not
    // hypothetical: `resolveSlug` deliberately discovers a form with an Email question, and Email
    // questions are commonly required.
    // `buildAnswers` is the shared synthesiser every other smoke uses: it picks the right typed
    // column per question type and throws a legible error for a required question it cannot answer
    // (a Doodle, a FileUpload) rather than submitting something the server will reject.
    const requiredAnswers = buildAnswers(
      questions.filter((q) => q.isRequired && q.id !== GHOST_QUESTION_ID),
      { email: `errors-smoke-${Date.now()}@example.com`, name: 'Errors Smoke' },
    );
    await probe(token, 'a submit whose answer row the database refuses (FK violation)', {
      query: SUBMIT,
      variables: {
        input: {
          distributionSlug: SLUG,
          formVersionId: definition.formVersionId,
          responseId: randomUUID(),
          answers: [...requiredAnswers, { questionId: GHOST_QUESTION_ID, textValue: 'ghost' }],
        },
      },
    }, { extra: (res) => {
      const body = JSON.parse(res.text);
      const result = body.data?.SubmitFormResponse;
      check(result && result.success === false, 'the refused save reports success:false, not a GraphQL error',
        res.text.slice(0, 200));
      // EQUALITY, not a loose match. `/could not be saved|try again/` also matches three OTHER
      // authored refusals that never reach persistence — the rate limiter's "Too many submissions.
      // Please wait N seconds and try again.", the in-flight cap's "The form is receiving a lot of
      // traffic right now. Please try again in a moment.", and the pipeline's own
      // SUBMIT_FAILED_MESSAGE, which would mean a stage THREW. This is the 7th request of the run,
      // so the rate limiter is not hypothetical, and each of those passing here would report a
      // different bug as a success. Kept as a literal because a .mjs smoke cannot import the
      // TypeScript constant; it is asserted against `SAVE_FAILED_MESSAGE` in
      // `persistence-failure-message.spec.ts`, which fails if the two ever drift.
      const SAVE_FAILED = 'Your response could not be saved. Please try again.';
      const message = result?.errors?.[0]?.message ?? '';
      check(message === SAVE_FAILED, 'the refused save shows the authored sentence',
        `got: ${message || res.text.slice(0, 200)}\n          ` +
          'Anything other than that exact sentence means persistence was never reached and the FK ' +
          'was never violated, so this check proved nothing. A "required"/"valid" message means ' +
          `validation refused first (${requiredAnswers.length} required question(s) were answered ` +
          'here); "Too many submissions" or "receiving a lot of traffic" means a ceiling refused ' +
          'first — rerun outside the window; "Something went wrong while submitting" means a stage ' +
          'threw, which is its own bug.');
    } });
  } else {
    skip('a submit whose answer row the database refuses (FK violation)',
      'needs a question that exists in the published snapshot but has no FormQuestion row. Pass ' +
        'its id as the SECOND argument (after the slug) or set FORMS_SMOKE_GHOST_QUESTION_ID. ' +
        'Recipe: append a question with a fresh GUID to the snapshot ONLY —\n' +
        "          UPDATE __mj_BizAppsForms.FormVersion SET DefinitionSnapshot = JSON_MODIFY(DefinitionSnapshot,\n" +
        "            'append $.pages[0].questions', JSON_QUERY('{\"id\":\"<GUID>\",\"type\":\"ShortText\",\"prompt\":\"Ghost\",\"isRequired\":false,\"displayOrder\":99,\"options\":[]}'))\n" +
        "          WHERE ID = '<published FormVersion.ID>';\n" +
        '          — and afterwards put the snapshot back (verified byte-identical):\n' +
        "          UPDATE v SET DefinitionSnapshot = JSON_MODIFY(DefinitionSnapshot, '$.pages[0].questions', JSON_QUERY('[' + ISNULL((\n" +
        "            SELECT STRING_AGG(j.value, ',') WITHIN GROUP (ORDER BY CAST(j.[key] AS int))\n" +
        "            FROM OPENJSON(v.DefinitionSnapshot, '$.pages[0].questions') j WHERE JSON_VALUE(j.value, '$.id') <> '<GUID>'), '') + ']'))\n" +
        "          FROM __mj_BizAppsForms.FormVersion v WHERE v.ID = '<published FormVersion.ID>';");
  }

  const notes = [
    skipped ? `${skipped} check(s) skipped` : '',
    warnings ? `${warnings} MJ-core residual(s) — see the warn lines; clean under NODE_ENV=production` : '',
  ].filter(Boolean);
  console.log(
    failures === 0
      ? `\nPASS — nothing Forms says to a respondent describes the host.${notes.length ? ` (${notes.join('; ')})` : ''}`
      : `\nFAIL — ${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\nSMOKE ERROR: ${e.message}`);
  console.error('Is MJAPI running, and has a form been published to this slug?');
  process.exit(1);
});
