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
 *     verification always failed closed (V202608181030 adds the grant);
 *   - the upload endpoint accepted a questionId that was not on the published definition and
 *     only failed deep in the ledger insert, orphaning the stored bytes.
 *
 * Seeds (idempotently, dev DB only): a FileUpload question on the form (row + published-
 * snapshot splice) and a binding FieldMap for it. Requires a running MJAPI with a working
 * storage account (any driver), and seed-binding-smoke.mjs run first.
 *
 * Run:  set -a && . ./.env && set +a && node smoke/resume-arc-path.mjs
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const BASE = 'http://localhost:4121';
const SLUG = 'contact-us-e2e';
const Q_NAME = '17B03D45-7C90-4CA5-AB78-C98404D2C7EC';
const Q_EMAIL = 'AE1FF634-ADE2-4AE9-9B16-1A417CC73AE8';
const Q_MSG = 'A0AEE39C-C337-45CF-ABBF-B9323BE0CB32';
const Q_PHONE = 'F1B3361D-BF58-4DBE-92A9-FE7AE8FB1ED0';
const Q_RESUME = 'ABABABAB-0000-4000-8000-000000000010';
const PAGE_ID = '4C42F586-2AF0-478D-AE20-CCC447F40EDA';
const BINDING_ID = '11111111-2222-4333-8444-555555555001';

const env = process.env;
let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, d) => { failures++; console.error(`  FAIL  ${m}${d ? `\n          ${d}` : ''}`); };
const check = (c, m, d) => (c ? pass(m) : fail(m, d));

function sql(q) {
  const r = spawnSync('docker', ['exec', 'forms-sql', '/opt/mssql-tools18/bin/sqlcmd', '-S', 'localhost',
    '-d', env.DB_DATABASE, '-U', env.DB_USERNAME, '-P', env.DB_PASSWORD, '-C', '-b', '-h', '-1', '-W', '-Q',
    `SET NOCOUNT ON; ${q}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

async function gql(token, query, variables) {
  const res = await fetch(`${BASE}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 300));
  return body.data;
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
    { targetField: 'Email', source: { kind: 'question', questionId: Q_EMAIL }, required: true },
    { targetField: 'FirstName', source: { kind: 'question', questionId: Q_NAME } },
    { targetField: 'LastName', source: { kind: 'static', value: '(resume-arc)' } },
    // The Applicant.ResumeFileID analogue: the uploaded file's MJ: Files id lands here.
    { targetField: 'PhotoURL', source: { kind: 'question', questionId: Q_RESUME } },
  ],
}).replace(/'/g, "''");
sql(`UPDATE __mj_BizAppsForms.FormEntityBinding SET FieldMappings='${fieldMappings}' WHERE ID='${BINDING_ID}';`);
pass('question row + snapshot splice + binding field map');

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

const published = await gql(token,
  'query P($slug: String!) { PublishedForm(distributionSlug: $slug) { definitionJSON } }', { slug: SLUG });
const definition = JSON.parse(published?.PublishedForm?.definitionJSON ?? '{}');
const formVersionId = definition.formVersionId;
check(Boolean(formVersionId), 'published definition carries formVersionId');
check((definition.pages?.[0]?.questions ?? []).some((q) => q.id.toLowerCase() === Q_RESUME.toLowerCase()),
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
    answers: [
      { questionId: Q_NAME, textValue: 'Resume Arc' },
      { questionId: Q_EMAIL, textValue: email },
      { questionId: Q_MSG, textValue: 'full arc test' },
      { questionId: Q_PHONE, numericValue: 5550101234 },
      { questionId: Q_RESUME, fileId },
    ],
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

const run = sql(`SELECT TOP 1 Status + ' | ' + ISNULL(ErrorMessage,'') FROM __mj_BizAppsForms.FormAutomationRun WHERE FormResponseID='${responseId}' ORDER BY __mj_CreatedAt DESC;`);
check(run.startsWith('Succeeded'), `automation run Succeeded (${run || 'no run row'})`, run);

const person = sql(`SELECT ISNULL(PhotoURL,'NULL') FROM __mj_BizAppsCommon.Person WHERE Email='${email}';`);
check(person.toLowerCase() === fileId.toLowerCase(), 'Person.PhotoURL carries the file id (ResumeFileID analogue)', person);

// ---------- 4. adversarial: a stranger cannot claim the file ----------
console.log('--- adversarial: second session submits the same fileId ---');
const token2 = await session();
const rid2 = randomUUID();
let stolen;
try {
  stolen = await gql(token2, `
    mutation S($input: FormSubmissionInputType!) {
      SubmitFormResponse(input: $input) { success errors { message } }
    }`, {
    input: {
      distributionSlug: SLUG, formVersionId, responseId: rid2, partial: false,
      startedAt: new Date().toISOString(), clientMeta: { referrer: '', userAgent: 'resume-arc-smoke' },
      answers: [
        { questionId: Q_NAME, textValue: 'Thief' },
        { questionId: Q_EMAIL, textValue: `thief+${Date.now()}@example.invalid` },
        { questionId: Q_MSG, textValue: 'stealing a file' },
        { questionId: Q_PHONE, numericValue: 1 },
        { questionId: Q_RESUME, fileId },
      ],
    },
  });
  check(stolen?.SubmitFormResponse?.success !== true, 'stranger submission with stolen fileId is REJECTED',
    JSON.stringify(stolen?.SubmitFormResponse));
} catch (e) {
  pass(`stranger submission rejected (${e.message.slice(0, 80)})`);
}

console.log(failures === 0 ? '\nPASS — the full résumé arc works end to end.' : `\nFAIL — ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
