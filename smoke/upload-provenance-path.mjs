/**
 * End-to-end smoke test for upload provenance (F-SEC-1).
 *
 * The check being proved: a respondent can name any `__mj.File` GUID in the instance, because that
 * table has no owner column and no row-level security. Before this, the foreign key was the only
 * gate and it proves existence, not authorship — so one session could claim another's upload, and
 * a binding would then copy it onto a business record other people can read.
 *
 * This drives the real anonymous path: two independent sessions, a real upload, and then session B
 * attempting to submit session A's file id.
 *
 *   set -a && . ./.env && set +a && node smoke/upload-provenance-path.mjs
 */
import { spawnSync } from 'node:child_process';

const BASE = (process.env.FORMS_SMOKE_URL || 'http://localhost:4121').replace(/\/$/, '');
const SLUG = process.argv[2] || 'contact-us-e2e';
const env = process.env;

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, d) => { failures++; console.error(`  FAIL  ${m}${d ? `\n          ${d}` : ''}`); };
const check = (cond, m, d) => (cond ? pass(m) : fail(m, d));

function sql(q) {
  const r = spawnSync('docker', ['exec', 'forms-sql', '/opt/mssql-tools18/bin/sqlcmd', '-S', 'localhost',
    '-d', env.DB_DATABASE, '-U', env.DB_USERNAME, '-P', env.DB_PASSWORD, '-C', '-h', '-1', '-W', '-Q',
    `SET NOCOUNT ON; ${q}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

async function session() {
  const html = await (await fetch(`${BASE}/f/${SLUG}`)).text();
  const token = (html.match(/data-token="([^"]+)"/) || [])[1];
  if (!token) throw new Error('no anonymous session token');
  return token;
}

async function gql(token, query, variables) {
  const res = await fetch(`${BASE}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 200));
  return body.data;
}

/** Upload a small file through the real endpoint, tagged with a response id. */
async function upload(token, responseId) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: 'application/pdf' }), 'smoke.pdf');
  form.append('distributionSlug', SLUG);
  form.append('questionId', 'q-smoke');
  form.append('responseId', responseId);
  const res = await fetch(`${BASE}/forms/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function submitWithFile(token, definition, responseId, fileId) {
  const questions = (definition.pages ?? []).flatMap((p) => p.questions ?? []);
  const answers = questions.map((q) => {
    if (q.type === 'Email') return { questionId: q.id, textValue: 'provenance@example.com' };
    if (['Number', 'Rating', 'NPS'].includes(q.type)) return { questionId: q.id, numericValue: 7 };
    return { questionId: q.id, textValue: 'provenance smoke' };
  });
  // Attach the file id to the first question, which is what a file answer looks like on the wire.
  answers.push({ questionId: questions[0].id, fileId });
  const data = await gql(token, `
    mutation S($input: FormSubmissionInputType!) {
      SubmitFormResponse(input: $input) { success errors { message } }
    }`, {
    input: {
      distributionSlug: SLUG, formVersionId: definition.formVersionId, partial: false,
      startedAt: new Date(0).toISOString(), responseId,
      clientMeta: { referrer: '', userAgent: 'provenance-smoke' }, answers,
    },
  });
  return data?.SubmitFormResponse;
}

async function main() {
  console.log(`Upload provenance smoke test\n  target : ${BASE}\n  slug   : ${SLUG}\n`);

  const tokenA = await session();
  const published = await gql(tokenA,
    'query P($slug: String!) { PublishedForm(distributionSlug: $slug) { definitionJSON } }', { slug: SLUG });
  const definition = JSON.parse(published?.PublishedForm?.definitionJSON ?? '{}');

  const responseA = crypto.randomUUID();
  let fileId;

  const uploaded = await upload(tokenA, responseA);
  if (uploaded.status === 200 && uploaded.body.fileId) {
    fileId = uploaded.body.fileId;
    pass('an anonymous session uploaded a file through the real endpoint');
    const ledger = sql(`SELECT TOP 1 ISNULL(CAST(ResponseDraftID AS varchar(50)),'') + '|' + Status
      FROM __mj_BizAppsForms.FormUpload WHERE FileID='${fileId}';`);
    check(Boolean(ledger), 'the upload wrote a provenance row');
    check(ledger.toLowerCase().includes(responseA.toLowerCase()),
      'the provenance row records the response it was uploaded for');
  } else {
    // No blob storage in this environment. The storage leg is not what this test is about — the
    // control being proved is the SUBMIT check — so the ledger state an upload would have produced
    // is seeded directly and the rest of the test runs unchanged against the real public path.
    console.log(`  note  blob storage unavailable here (${uploaded.body?.error ?? uploaded.status});`);
    console.log('        seeding the ledger state an upload would have written and testing the submit gate.');
    fileId = crypto.randomUUID();
    sql(`
      DECLARE @Prov UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj.FileStorageProvider);
      IF @Prov IS NULL
        BEGIN INSERT INTO __mj.FileStorageProvider (ID, Name, ServerDriverKey, ClientDriverKey, Priority, IsActive)
        VALUES (NEWID(), 'Smoke Provider', 'smoke', 'smoke', 1, 0); SET @Prov = (SELECT TOP 1 ID FROM __mj.FileStorageProvider); END
      INSERT INTO __mj.[File] (ID, Name, ProviderID, ProviderKey, ContentType, Status)
      VALUES ('${fileId}', 'smoke.pdf', @Prov, 'forms-uploads/smoke/smoke.pdf', 'application/pdf', 'Uploaded');
      DECLARE @Dist UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj_BizAppsForms.FormDistribution WHERE Slug='${SLUG}');
      DECLARE @Form UNIQUEIDENTIFIER = (SELECT TOP 1 FormID FROM __mj_BizAppsForms.FormDistribution WHERE Slug='${SLUG}');
      INSERT INTO __mj_BizAppsForms.FormUpload (ID, FileID, DistributionID, FormID, ResponseDraftID, ProviderKey, FileName, ContentType, SizeBytes, Status)
      VALUES (NEWID(), '${fileId}', @Dist, @Form, '${responseA}', 'forms-uploads/smoke/smoke.pdf', 'smoke.pdf', 'application/pdf', 5, 'Active');`);
    pass('seeded a file with provenance belonging to session A');
  }

  // The whole point: session B claims session A's file.
  const tokenB = await session();
  const responseB = crypto.randomUUID();
  const stolen = await submitWithFile(tokenB, definition, responseB, fileId);
  check(stolen?.success === false,
    'a DIFFERENT session cannot submit that file id',
    'this is the cross-tenant disclosure the ledger exists to prevent');

  // And the legitimate owner still can.
  const owned = await submitWithFile(tokenA, definition, responseA, fileId);
  check(owned?.success === true,
    'the session that uploaded it can still submit it',
    owned?.errors?.[0]?.message ?? 'the check must not reject legitimate uploads');

  console.log(failures === 0
    ? '\nPASS — upload provenance holds end to end.'
    : `\nFAIL — ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nFAIL — ${e.message}`); process.exit(1); });
