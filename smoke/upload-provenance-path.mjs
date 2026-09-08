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
import { sessionIdFor } from './lib/session.mjs';
import { buildAnswers, resolveFormId, resolveSlug } from './lib/fixture.mjs';
import { sql } from './lib/sqlcmd.mjs';
import { smokeBaseUrl } from './lib/target.mjs';

const BASE = smokeBaseUrl();
const SLUG = resolveSlug('upload-provenance-path.mjs');
// Resolved up front so a wrong slug fails naming the slugs that would have worked, rather 
// than as an HTTP error several steps later that reads like the server is broken.
resolveFormId(SLUG);
const env = process.env;

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, d) => { failures++; console.error(`  FAIL  ${m}${d ? `\n          ${d}` : ''}`); };
const check = (cond, m, d) => (cond ? pass(m) : fail(m, d));

async function session() {
  const html = await (await fetch(`${BASE}/f/${SLUG}`)).text();
  const token = (html.match(/data-token="([^"]+)"/) || [])[1];
  if (!token) throw new Error('no anonymous session token');
  return token;
}

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
  if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 200));
  return body.data;
}

/**
 * Upload a small file through the real endpoint, tagged with a response id.
 *
 * The question id comes from the PUBLISHED DEFINITION. It used to be the literal `'q-smoke'`,
 * which the endpoint correctly rejects as unknown — so this leg never once ran for real, and the
 * fallback below reported the rejection as "blob storage unavailable". That reads as an
 * environment limitation rather than a fixture that names a question no form has.
 */
async function upload(token, responseId, fileQuestionId) {
  if (!fileQuestionId) {
    return { status: 0, body: { error: 'this form has no file question to upload against' } };
  }
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: 'application/pdf' }), 'smoke.pdf');
  form.append('distributionSlug', SLUG);
  form.append('questionId', fileQuestionId);
  form.append('responseId', responseId);
  const res = await fetch(`${BASE}/forms/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/**
 * Submit the form with the file id attached to one question.
 *
 * Built with `buildAnswers` rather than by hand. The hand-rolled version sent a literal
 * `textValue` for every non-numeric question, which any form with real choices rejects with
 * "Choose only from the offered options" — the exact failure `smoke/lib/fixture.mjs`'s header
 * describes and the helper exists to prevent. It also pushed a SECOND answer for question one
 * rather than overriding it, so the response carried a duplicate.
 */
async function submitWithFile(token, definition, responseId, fileId, fileQuestionId) {
  const questions = (definition.pages ?? []).flatMap((p) => p.questions ?? []);
  const target = fileQuestionId ?? questions[0]?.id;
  const answers = buildAnswers(questions, {
    email: `provenance-${responseId.slice(0, 8)}@example.com`,
    name: 'Provenance',
    overrides: { [target]: { fileId } },
  });
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
  // The question a real upload would be made against, from the published definition.
  const fileQuestion = (definition.pages ?? [])
    .flatMap((p) => p.questions ?? [])
    .find((q) => q.type === 'FileUpload' || q.type === 'Doodle');
  let fileId;

  const uploaded = await upload(tokenA, responseA, fileQuestion?.id);
  if (uploaded.status === 200 && uploaded.body.fileId) {
    fileId = uploaded.body.fileId;
    pass('an anonymous session uploaded a file through the real endpoint');
    const ledger = sql(`SELECT TOP 1 ISNULL(CAST(ResponseDraftID AS varchar(50)),'') + '|' + Status
      FROM __mj_BizAppsForms.FormUpload WHERE FileID='${fileId}';`);
    check(Boolean(ledger), 'the upload wrote a provenance row');
    check(ledger.toLowerCase().includes(responseA.toLowerCase()),
      'the provenance row records the response it was uploaded for');
  } else {
    // The upload could not be made — no file question on this form, or no storage configured. The
    // storage leg is not what this test is about (the control being proved is the SUBMIT check),
    // so the ledger state an upload would have produced is seeded directly and the rest of the
    // test runs unchanged against the real public path. The REASON is printed rather than
    // guessed at: this used to announce "blob storage unavailable" for what was actually a
    // fixture naming a question no form has.
    console.log(`  note  could not upload for real (${uploaded.body?.error ?? uploaded.status});`);
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
  const stolen = await submitWithFile(tokenB, definition, responseB, fileId, fileQuestion?.id);
  check(stolen?.success === false,
    'a DIFFERENT session cannot submit that file id',
    'this is the cross-tenant disclosure the ledger exists to prevent');

  // And the legitimate owner still can.
  const owned = await submitWithFile(tokenA, definition, responseA, fileId, fileQuestion?.id);
  check(owned?.success === true,
    'the session that uploaded it can still submit it',
    owned?.errors?.[0]?.message ?? 'the check must not reject legitimate uploads');

  console.log(failures === 0
    ? '\nPASS — upload provenance holds end to end.'
    : `\nFAIL — ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nFAIL — ${e.message}`); process.exit(1); });
