/**
 * End-to-end résumé arc (issue #49) — the test respondent-path.mjs says is missing:
 * "Covering it properly means POSTing to /forms/upload first, which is its own test."
 *
 * Drives the full file-answer path a consumer like bizapps-ats depends on:
 *   anonymous session → POST /forms/upload (bytes + MJ: Files row + provenance ledger row)
 *   → SubmitFormResponse carrying the fileId answer → entity binding verifies provenance at
 *   bind time and copies the file id onto the bound record (Person.PhotoURL stands in for
 *   ATS's Applicant.ResumeFileID) → a SECOND session submitting the same fileId is rejected.
 *
 * First live run (2026-08-18) found both shipped bugs this file now pins:
 *   - `Forms Automation Runner` had no read grant on the upload ledger, so bind-time
 *     verification always failed closed (V202608181030 adds the grant). Pinned by the
 *     binding assertions below: without the grant the automation run fails and the bound
 *     record never receives the file id.
 *   - the upload endpoint accepted a questionId that was not on the published definition and
 *     only failed deep in the ledger insert, orphaning the stored bytes. Pinned by the
 *     unknown-questionId POST, which asserts a 400 AND that no `MJ: Files` row appeared.
 *
 * Seeds (idempotently, dev DB only): a FileUpload question on the form (row + published-
 * snapshot splice) and a binding FieldMap for it. Requires a running MJAPI with a working
 * storage account (any driver), and seed-binding-smoke.mjs run first.
 *
 * THE FORM IS NOT DISCOVERED THE WAY THE OTHER SUITES DISCOVER ONE, and the difference is the
 * whole reason this file works. `resolveSlug` picks the first published form carrying an Email
 * question — alphabetical — which is not necessarily a form that BINDS anything. This fixture
 * patches the smoke binding's FieldMappings and then asserts the file id landed on the record
 * that binding wrote, so it must run against the form whose automation actually points at that
 * binding. It did not: discovery picked a form with its own, differently-mapped binding, so the
 * fixture patched a row nobody ran and then reported the missing `PhotoURL` as a product defect.
 * The patched-row assertion could not catch it either — it checked the ROW, never the WIRING.
 * Everything mutated here therefore belongs to the smoke fixture; no authored binding is touched.
 *
 * Run:  set -a && . ./.env && set +a && node smoke/resume-arc-path.mjs
 */
import { randomUUID } from 'node:crypto';
import { sql } from './lib/sqlcmd.mjs';
import { buildAnswers, pickEmailQuestion, pickNameQuestion, requireQuestion, resolveFormId, resolveQuestions, resolveSeededSlug } from './lib/fixture.mjs';
import { sessionIdFor } from './lib/session.mjs';

const BASE = 'http://localhost:4121';
const BINDING_ID = '11111111-2222-4333-8444-555555555001';

const SLUG = resolveSeededSlug('resume-arc-path.mjs', { bindingId: BINDING_ID });
const FORM_ID = resolveFormId(SLUG);
const FORM_QUESTIONS = resolveQuestions(FORM_ID);
// The résumé question is this fixture's OWN row, so it keeps a fixed id -- the script creates it.
// Everything else is resolved from whatever form was chosen, including the page to hang it on:
// PageID is a real foreign key, so a literal from another form fails on FK_FormQuestion_Page.
const Q_RESUME = 'ABABABAB-0000-4000-8000-000000000010';
const PAGE_ID = requireQuestion(FORM_QUESTIONS[0], 'a page to add the résumé question to', SLUG, FORM_QUESTIONS).pageId;
const EMAIL_Q = requireQuestion(pickEmailQuestion(FORM_QUESTIONS), 'the respondent email', SLUG, FORM_QUESTIONS);
const NAME_Q = requireQuestion(pickNameQuestion(FORM_QUESTIONS), 'the respondent given name', SLUG, FORM_QUESTIONS);

const env = process.env;
let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, d) => { failures++; console.error(`  FAIL  ${m}${d ? `\n          ${d}` : ''}`); };
const check = (c, m, d) => (c ? pass(m) : fail(m, d));

/**
 * On-submit automations are DETACHED from the request: the submit answers the respondent as soon
 * as the response is persisted and lets the binding run after, which is what took a submit from
 * ~8.3s to ~0.3s. Every assertion below about what the BINDING did is therefore an assertion
 * about something that becomes true shortly after the mutation returns — measured ~12s behind it
 * on the stack this was written against. Reading the instant the submit resolves races the work
 * being inspected, and reported `Running` as a failure. Same shape as
 * `automation-semantics-path.mjs`: poll, with a budget, and treat running out as a real failure.
 */
const AUTOMATION_BUDGET_MS = 30_000;
const POLL_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll `read` until `isDone` accepts its value, or give up after the budget. Returns the last. */
async function eventually(read, isDone) {
  const deadline = Date.now() + AUTOMATION_BUDGET_MS;
  let value = read();
  while (!isDone(value) && Date.now() < deadline) {
    await sleep(POLL_MS);
    value = read();
  }
  return value;
}

async function gql(token, query, variables) {
  const body = await gqlRaw(token, query, variables);
  if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 300));
  return body.data;
}

/**
 * The un-throwing form, for the adversarial check.
 *
 * That check asserts a REJECTION, so routing it through `gql` made it unfalsifiable: `gql` throws
 * on a GraphQL error, on a non-JSON body (a 502 or an auth redirect), and on a dead connection,
 * and the caller's `catch` reported every one of those as "rejected — ok". A regression that let a
 * stranger claim the file, occurring alongside any unrelated 500, would have been reported as a
 * pass. The caller now inspects the body itself and matches on WHY it was rejected.
 */
async function gqlRaw(token, query, variables) {
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
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { transportError: `HTTP ${res.status}: ${text.slice(0, 120)}` };
  }
}

async function session() {
  const html = await (await fetch(`${BASE}/f/${SLUG}`)).text();
  const token = (html.match(/data-token="([^"]+)"/) || [])[1];
  if (!token) throw new Error('no anonymous session token on /f/' + SLUG);
  return token;
}

// ---------- 1. seed ----------
console.log('--- seeding résumé question + binding map ---');
sql(`
IF NOT EXISTS (SELECT 1 FROM __mj_BizAppsForms.FormQuestion WHERE ID='${Q_RESUME}')
INSERT INTO __mj_BizAppsForms.FormQuestion (ID, FormID, PageID, QuestionType, Prompt, IsRequired, DisplayOrder)
SELECT '${Q_RESUME}', f.ID, '${PAGE_ID}', 'FileUpload', N'Upload your résumé', 0, 4
FROM __mj_BizAppsForms.Form f JOIN __mj_BizAppsForms.FormDistribution d ON d.FormID=f.ID WHERE d.Slug='${SLUG}';
`);
sql(`
DECLARE @VerID UNIQUEIDENTIFIER = (
  SELECT TOP 1 v.ID FROM __mj_BizAppsForms.FormVersion v
  JOIN __mj_BizAppsForms.FormDistribution d ON d.FormID=v.FormID
  WHERE d.Slug='${SLUG}' AND v.Status='Published' ORDER BY v.VersionNumber DESC);
DECLARE @Snap NVARCHAR(MAX) = (SELECT DefinitionSnapshot FROM __mj_BizAppsForms.FormVersion WHERE ID=@VerID);
IF CHARINDEX('${Q_RESUME}', @Snap) = 0
BEGIN
  SET @Snap = JSON_MODIFY(@Snap, 'append $.pages[0].questions',
    JSON_QUERY('{"id":"${Q_RESUME}","type":"FileUpload","prompt":"Upload your resume","isRequired":false,"displayOrder":4,"options":[]}'));
  UPDATE __mj_BizAppsForms.FormVersion SET DefinitionSnapshot=@Snap WHERE ID=@VerID;
END
`);
const fieldMappings = JSON.stringify({
  version: 1,
  fields: [
    { targetField: 'Email', source: { kind: 'question', questionId: EMAIL_Q.id }, required: true },
    { targetField: 'FirstName', source: { kind: 'question', questionId: NAME_Q.id } },
    { targetField: 'LastName', source: { kind: 'static', value: '(resume-arc)' } },
    // The Applicant.ResumeFileID analogue: the uploaded file's MJ: Files id lands here.
    { targetField: 'PhotoURL', source: { kind: 'question', questionId: Q_RESUME } },
  ],
}).replace(/'/g, "''");
sql(`UPDATE __mj_BizAppsForms.FormEntityBinding SET FieldMappings='${fieldMappings}' WHERE ID='${BINDING_ID}';`);
// Assert the seeding actually landed rather than announcing it. Each statement above exits 0 when
// it affects zero rows — a missing distribution, or seed-binding-smoke.mjs never having run — so an
// unconditional pass() here reported "ok" for a fixture that had established nothing.
check(
  sql(`SELECT COUNT(*) FROM __mj_BizAppsForms.FormQuestion WHERE ID='${Q_RESUME}';`) === '1',
  'FileUpload question row exists',
);
check(
  sql(`SELECT COUNT(*) FROM __mj_BizAppsForms.FormEntityBinding WHERE ID='${BINDING_ID}' AND FieldMappings LIKE '%${Q_RESUME}%';`) === '1',
  'binding field map references the résumé question (seed-binding-smoke.mjs has run)',
);

// The automation that RUNS the patched binding on this form. `resolveSeededSlug` has already
// refused a slug whose form is not wired to the binding, so this resolves — but it is asserted
// rather than assumed, because the id below scopes the run lookup and a silent blank there would
// send the automation check looking at some other automation's row.
const BINDING_AUTOMATION_ID = sql(
  `SELECT TOP 1 CAST(a.ID AS varchar(40)) FROM __mj_BizAppsForms.FormAutomation a
   JOIN __mj_BizAppsForms.FormDistribution d ON d.FormID = a.FormID
   WHERE d.Slug = '${SLUG}' AND a.TargetType = 'EntityBinding' AND a.IsActive = 1
     AND a.BindingID = '${BINDING_ID}';`,
).trim();
check(
  Boolean(BINDING_AUTOMATION_ID),
  'the binding this fixture patches is wired to an ACTIVE automation on the form under test',
  'the form runs it, but the automation is disabled — re-enable it or re-run smoke:binding:seed',
);

// ---------- 2. drive the public path ----------
console.log('--- driving the public path ---');
const token = await session();
pass('anonymous session minted');

const rid = randomUUID();
const email = `resume-arc+${Date.now()}@example.invalid`;
const form = new FormData();
form.append('file', new Blob([new TextEncoder().encode('%PDF-1.4 resume arc test payload')], { type: 'application/pdf' }), 'resume.pdf');
form.append('distributionSlug', SLUG);
form.append('questionId', Q_RESUME);
form.append('responseId', rid);
const up = await fetch(`${BASE}/forms/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
const upBody = await up.json().catch(() => ({}));
check(up.status === 200 && upBody.fileId, `upload accepted (HTTP ${up.status})`, JSON.stringify(upBody));
const fileId = upBody.fileId;

// The Bug 2 rejection path, driven for real. Without this the file only ever sent a VALID
// questionId, which the pre-fix code also accepted — so the whole smoke passed unchanged against
// the buggy build and the header's claim to pin this bug was false.
const filesBefore = sql('SELECT COUNT(*) FROM __mj.[File];');
const bogus = new FormData();
bogus.append('file', new Blob([new TextEncoder().encode('%PDF-1.4 should never be stored')], { type: 'application/pdf' }), 'bogus.pdf');
bogus.append('distributionSlug', SLUG);
bogus.append('questionId', randomUUID());
bogus.append('responseId', randomUUID());
const bogusRes = await fetch(`${BASE}/forms/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: bogus });
const bogusBody = await bogusRes.json().catch(() => ({}));
check(bogusRes.status === 400, `unknown questionId is rejected 400 (got ${bogusRes.status})`, JSON.stringify(bogusBody));
check(/unknown "questionid"/i.test(bogusBody.error ?? ''), 'rejected for the right reason', JSON.stringify(bogusBody));
// The load-bearing half: rejected BEFORE storage, so no orphaned bytes or MJ: Files row.
check(sql(`SELECT COUNT(*) FROM __mj.[File];`) === filesBefore, 'no MJ: Files row was created by the rejected upload');

const published = await gql(token,
  'query P($slug: String!) { PublishedForm(distributionSlug: $slug) { definitionJSON } }', { slug: SLUG });
const definition = JSON.parse(published?.PublishedForm?.definitionJSON ?? '{}');
const formVersionId = definition.formVersionId;
check(Boolean(formVersionId), 'published definition carries formVersionId');
const definitionQuestions = (definition.pages ?? []).flatMap((pg) => pg.questions ?? []);
check(definitionQuestions.some((q) => q.id.toLowerCase() === Q_RESUME.toLowerCase()),
  'published definition now contains the FileUpload question');

const submission = await gql(token, `
  mutation S($input: FormSubmissionInputType!) {
    SubmitFormResponse(input: $input) { success responseId status errors { message } }
  }`, {
  input: {
    distributionSlug: SLUG,
    formVersionId,
    responseId: rid,
    partial: false,
    startedAt: new Date().toISOString(),
    clientMeta: { referrer: '', userAgent: 'resume-arc-smoke' },
    // Built from the published definition rather than a fixed list, so this runs against whatever
    // form was resolved. Only the résumé is supplied by hand: a file id has to come from a real
    // upload for its provenance to be attributable, which is the whole point of this test.
    answers: buildAnswers(definitionQuestions, {
      email,
      name: 'Resume Arc',
      overrides: { [Q_RESUME]: { fileId } },
    }),
  },
});
const result = submission?.SubmitFormResponse;
check(result?.success === true, 'submission accepted', result?.errors?.[0]?.message);
check(result?.status === 'Complete', `status Complete (got ${result?.status})`);
const responseId = result?.responseId;

// ---------- 3. verify artifacts ----------
console.log('--- verifying artifacts ---');
const answerRow = sql(`SELECT CONVERT(varchar(36), FileID) FROM __mj_BizAppsForms.FormResponseAnswer WHERE ResponseID='${responseId}' AND QuestionID='${Q_RESUME}';`);
check(answerRow.toLowerCase() === fileId.toLowerCase(), 'FormResponseAnswer.FileID = uploaded fileId', answerRow);

const ledger = sql(`SELECT Status FROM __mj_BizAppsForms.FormUpload WHERE FileID='${fileId}';`);
check(ledger === 'Active', 'provenance ledger row Active', ledger);

// Scoped to the BINDING's run, not `TOP 1 ... ORDER BY created DESC` across every automation the
// form fires. A form carrying an unrelated failing automation would otherwise fail this check for
// a reason that has nothing to do with the résumé arc.
const readRun = () => sql(
  `SELECT TOP 1 Status + ' | ' + ISNULL(ErrorMessage,'')
   FROM __mj_BizAppsForms.FormAutomationRun
   WHERE FormResponseID='${responseId}' AND FormAutomationID='${BINDING_AUTOMATION_ID}'
   ORDER BY __mj_CreatedAt DESC;`,
);
const run = await eventually(readRun, (v) => /^(Succeeded|Failed)/.test(v));
check(run.startsWith('Succeeded'), `binding automation run Succeeded (${run || 'no run row within budget'})`, run);

const readPerson = () => sql(`SELECT ISNULL(PhotoURL,'NULL') FROM __mj_BizAppsCommon.Person WHERE Email='${email}';`);
const person = await eventually(readPerson, (v) => v.toLowerCase() === fileId.toLowerCase());
check(person.toLowerCase() === fileId.toLowerCase(), 'Person.PhotoURL carries the file id (ResumeFileID analogue)', person);

// ---------- 4. adversarial: a stranger cannot claim the file ----------
console.log('--- adversarial: second session submits the same fileId ---');
const token2 = await session();
const rid2 = randomUUID();
const stolen = await gqlRaw(token2, `
  mutation S($input: FormSubmissionInputType!) {
    SubmitFormResponse(input: $input) { success errors { message } }
  }`, {
  input: {
    distributionSlug: SLUG, formVersionId, responseId: rid2, partial: false,
    startedAt: new Date().toISOString(), clientMeta: { referrer: '', userAgent: 'resume-arc-smoke' },
    answers: buildAnswers(definitionQuestions, {
      email: `thief+${Date.now()}@example.invalid`,
      name: 'Thief',
      overrides: { [Q_RESUME]: { fileId } },
    }),
  },
});

// Assert POSITIVELY on the reason. A transport failure or an unrelated server error is a FAILED
// run, not a pass — the whole point of this check is that the file was refused *for provenance*.
const stolenResult = stolen.data?.SubmitFormResponse;
const rejectionText = JSON.stringify(stolen.errors ?? stolenResult?.errors ?? '');
if (stolen.transportError) {
  fail('stranger submission with stolen fileId is REJECTED', `transport failure, not a rejection: ${stolen.transportError}`);
} else if (stolenResult?.success === true) {
  fail('stranger submission with stolen fileId is REJECTED', 'the submission SUCCEEDED — provenance did not hold');
} else {
  // Anchored on the message the submit pipeline actually emits for a file it cannot attribute
  // (`submit-pipeline.ts` — "That file could not be verified as your upload."), plus the
  // provenance vocabulary a future rewording would plausibly use. Matching the real string is the
  // point: the first version of this check guessed at the wording and reported a correct rejection
  // as a failure, which is the honest direction to fail in but still a false alarm.
  check(
    /could not be verified as your upload|provenance|unattributable|unknown-file|wrong-distribution|revoked/i.test(rejectionText),
    'stranger submission with stolen fileId is REJECTED for provenance',
    `rejected, but not for a provenance reason: ${rejectionText.slice(0, 200)}`,
  );
}

console.log(failures === 0 ? '\nPASS — the full résumé arc works end to end.' : `\nFAIL — ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
