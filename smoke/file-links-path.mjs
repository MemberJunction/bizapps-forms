/**
 * End-to-end smoke test for file attachments (`__mj.FileEntityRecordLink`).
 *
 * A file uploaded through a form is stored as an `MJ: Files` row and referenced by
 * `FormResponseAnswer.FileID`. MJ's record-attachments panel reads NEITHER of those — it reads
 * `FileEntityRecordLink` filtered by (EntityID, RecordID). Forms now writes those rows in two
 * places: on the form response, and on the business record an entity binding materializes.
 *
 * Unit tests cover the reconciler's decisions against a stub gateway. What only a live run can
 * prove is the wiring around them, and specifically the three things that fail SILENTLY:
 *
 *   - the link table has NO unique constraint on (FileID, EntityID, RecordID), so nothing but the
 *     writer's own read stops an autosave stacking duplicate attachments on a record;
 *   - the automation service principal needs its own grant on the link entity
 *     (V202608251800) — without it every binding attaches nothing and says nothing;
 *   - the reconciler must remove ITS OWN superseded links and leave a hand-attached file alone,
 *     which is a distinction no schema enforces.
 *
 * Prerequisites: MJAPI running. The binding leg additionally needs `smoke/seed-binding-smoke.mjs`;
 * without it that leg reports itself skipped rather than passing vacuously.
 *   set -a && . ./.env && set +a && node smoke/file-links-path.mjs
 */
import { randomUUID } from 'node:crypto';
import { sessionIdFor } from './lib/session.mjs';
import { buildAnswers, resolveFormId, resolveSlug } from './lib/fixture.mjs';
import { sql } from './lib/sqlcmd.mjs';

const BASE = (process.env.FORMS_SMOKE_URL || 'http://localhost:4121').replace(/\/$/, '');
const SLUG = resolveSlug('file-links-path.mjs');
// Resolved up front so a wrong slug fails naming the slugs that would have worked, rather than as
// an HTTP error several steps later that reads like the server is broken.
resolveFormId(SLUG);

const RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';

/**
 * On-submit automations are DETACHED from the request: the submit answers the respondent as soon
 * as the response is persisted and lets the binding run after. So everything on the RESPONSE is
 * true the moment the mutation returns (it is written inside `persistSubmission`), and everything
 * on the BOUND RECORD becomes true shortly afterwards. Reading the second the instant the submit
 * resolves races the work it is inspecting — measured at ~12s on the stack this was written
 * against. Same shape as `automation-semantics-path.mjs`: poll, with a budget, and treat running
 * out as a real failure rather than waiting forever.
 */
const BINDING_BUDGET_MS = 30_000;
const POLL_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll `read` until `isDone` accepts its value, or give up after the budget. Returns the last. */
async function eventually(read, isDone) {
  const deadline = Date.now() + BINDING_BUDGET_MS;
  let value = read();
  while (!isDone(value) && Date.now() < deadline) {
    await sleep(POLL_MS);
    value = read();
  }
  return value;
}

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, d) => { failures++; console.error(`  FAIL  ${m}${d ? `\n          ${d}` : ''}`); };
const check = (cond, m, d) => (cond ? pass(m) : fail(m, d));
const note = (m) => console.log(`  note  ${m}`);

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
  if (body.errors) throw new Error(`GraphQL error: ${JSON.stringify(body.errors).slice(0, 300)}`);
  return body.data;
}

/** A fresh anonymous session, exactly as a browser hitting the public link would get one. */
async function newSession() {
  const html = await (await fetch(`${BASE}/f/${SLUG}`)).text();
  const token = (html.match(/data-token="([^"]+)"/) || [])[1];
  if (!token) throw new Error('no anonymous session token on the host page');
  return token;
}

/**
 * Put a file into the state the submit path requires: an `MJ: Files` row plus a `FormUpload`
 * provenance row attributing it to this response.
 *
 * Tries the REAL upload endpoint first, because that is the path a respondent takes. It needs both
 * a configured blob store and a file-type question on the published form; where either is missing
 * the equivalent rows are seeded and the run continues, because what this test is about is what
 * the LINK reconciler does with a verified file, not how the bytes got there. Which path was taken
 * is printed, so a seeded run is never mistaken for an end-to-end one.
 */
async function provisionFile(token, responseId, fileQuestionId, label) {
  if (fileQuestionId) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: 'application/pdf' }), `${label}.pdf`);
    form.append('distributionSlug', SLUG);
    form.append('questionId', fileQuestionId);
    form.append('responseId', responseId);
    const res = await fetch(`${BASE}/forms/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const body = await res.json().catch(() => ({}));
    if (res.status === 200 && body.fileId) {
      return { fileId: body.fileId, uploaded: true };
    }
    note(`upload endpoint unavailable for ${label} (${body?.error ?? res.status}); seeding the rows it would have written`);
  }
  return { fileId: seedUploadedFile(responseId, label), uploaded: false };
}

/** The `MJ: Files` + `FormUpload` rows a real upload writes, for environments without blob storage. */
function seedUploadedFile(responseId, label) {
  const fileId = randomUUID();
  sql(`
    ${ensureProviderSql()}
    INSERT INTO __mj.[File] (ID, Name, ProviderID, ProviderKey, ContentType, Status)
    VALUES ('${fileId}', '${label}.pdf', @Prov, 'forms-uploads/smoke/${label}.pdf', 'application/pdf', 'Uploaded');
    DECLARE @Dist UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj_BizAppsForms.FormDistribution WHERE Slug='${SLUG}');
    DECLARE @Form UNIQUEIDENTIFIER = (SELECT TOP 1 FormID FROM __mj_BizAppsForms.FormDistribution WHERE Slug='${SLUG}');
    INSERT INTO __mj_BizAppsForms.FormUpload
      (ID, FileID, DistributionID, FormID, ResponseDraftID, ProviderKey, FileName, ContentType, SizeBytes, Status)
    VALUES (NEWID(), '${fileId}', @Dist, @Form, '${responseId}', 'forms-uploads/smoke/${label}.pdf',
            '${label}.pdf', 'application/pdf', 5, 'Active');`);
  return fileId;
}

/**
 * A file with NO provenance row, attached to a record by hand — what an administrator using the
 * attachments panel produces, and the thing the reconciler must never remove.
 */
function seedHandAttachedFile(entityName, recordId) {
  const fileId = randomUUID();
  sql(`
    ${ensureProviderSql()}
    INSERT INTO __mj.[File] (ID, Name, ProviderID, ProviderKey, ContentType, Status)
    VALUES ('${fileId}', 'attached-by-hand.pdf', @Prov, 'by-hand/attached.pdf', 'application/pdf', 'Uploaded');
    DECLARE @Entity UNIQUEIDENTIFIER = (SELECT ID FROM __mj.Entity WHERE Name='${entityName}');
    INSERT INTO __mj.FileEntityRecordLink (ID, FileID, EntityID, RecordID)
    VALUES (NEWID(), '${fileId}', @Entity, '${recordId}');`);
  return fileId;
}

/** Declares `@Prov`, creating an inactive placeholder provider if this database has none. */
function ensureProviderSql() {
  return `
    DECLARE @Prov UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj.FileStorageProvider);
    IF @Prov IS NULL
    BEGIN
      INSERT INTO __mj.FileStorageProvider (ID, Name, ServerDriverKey, ClientDriverKey, Priority, IsActive)
      VALUES (NEWID(), 'Smoke Provider', 'smoke', 'smoke', 1, 0);
      SET @Prov = (SELECT TOP 1 ID FROM __mj.FileStorageProvider);
    END`;
}

/** The file ids attached to one record, lowercased and sorted — the panel's own query. */
function attachedFileIds(entityName, recordId) {
  const out = sql(`SELECT LOWER(CAST(l.FileID AS varchar(40)))
    FROM __mj.FileEntityRecordLink l JOIN __mj.Entity e ON e.ID = l.EntityID
    WHERE e.Name = '${entityName}' AND l.RecordID = '${recordId}';`);
  return out ? out.split('\n').map((s) => s.trim()).filter(Boolean).sort() : [];
}

/** Submit the form, overriding one question with a file answer. Returns the mutation result. */
async function submit(token, definition, { responseId, fileId, fileQuestionId, complete, email }) {
  const questions = (definition.pages ?? []).flatMap((p) => p.questions ?? []);
  const target = fileQuestionId ?? questions[0]?.id;
  const answers = buildAnswers(questions, {
    email,
    name: 'Ada',
    overrides: fileId ? { [target]: { fileId } } : {},
  });
  const data = await gql(token, `
    mutation S($input: FormSubmissionInputType!) {
      SubmitFormResponse(input: $input) { success responseId status errors { message } }
    }`, {
    input: {
      distributionSlug: SLUG,
      formVersionId: definition.formVersionId,
      partial: !complete,
      startedAt: new Date(0).toISOString(),
      responseId,
      clientMeta: { referrer: '', userAgent: 'file-links-smoke' },
      answers,
    },
  });
  return data?.SubmitFormResponse;
}

/** The binding ledger row for a response, if a binding ran. */
function bindingTargetFor(responseId) {
  const row = sql(`SELECT TOP 1 ISNULL(r.TargetRecordID,'') + '|' + e.Name
    FROM __mj_BizAppsForms.FormEntityBindingRecord r
    JOIN __mj.Entity e ON e.ID = r.TargetEntityID
    WHERE r.FormResponseID = '${responseId}';`);
  if (!row) return null;
  const [recordId, entityName] = row.split('|');
  return recordId ? { recordId: recordId.trim(), entityName: entityName.trim() } : null;
}

async function main() {
  console.log(`File-attachment smoke test\n  target : ${BASE}\n  slug   : ${SLUG}\n`);

  const token = await newSession();
  const published = await gql(token,
    'query P($slug: String!) { PublishedForm(distributionSlug: $slug) { definitionJSON } }', { slug: SLUG });
  const definition = JSON.parse(published?.PublishedForm?.definitionJSON ?? '{}');
  const questions = (definition.pages ?? []).flatMap((p) => p.questions ?? []);
  const fileQuestion = questions.find((q) => q.type === 'FileUpload' || q.type === 'Signature');

  // One response id for the whole arc — minted by the client, adopted as the FormResponse primary
  // key, and recorded on every upload. It is what ties the three together.
  const responseId = randomUUID();
  // One address for the run, so the second response below binds to the SAME business record the
  // first one did. Unique per run, so the first submission is a genuine first sighting.
  const email = `file-links-smoke-${Date.now()}@example.com`;

  // 1. A respondent uploads a file and saves a partial.
  const first = await provisionFile(token, responseId, fileQuestion?.id, 'resume-v1');
  note(first.uploaded ? 'file A came through the real upload endpoint' : 'file A was seeded');
  const partial = await submit(token, definition, { responseId, email, fileId: first.fileId, fileQuestionId: fileQuestion?.id, complete: false });
  check(partial?.success === true, 'a partial save with a file answer succeeds', partial?.errors?.[0]?.message);
  check(
    attachedFileIds(RESPONSE_ENTITY, responseId).join() === first.fileId.toLowerCase(),
    'the uploaded file is attached to the response record',
    `attached: [${attachedFileIds(RESPONSE_ENTITY, responseId).join(', ')}] — the attachments panel reads exactly this`,
  );

  // 2. The autosave fires again with the same answers. No unique constraint stands behind this.
  await submit(token, definition, { responseId, email, fileId: first.fileId, fileQuestionId: fileQuestion?.id, complete: false });
  check(
    attachedFileIds(RESPONSE_ENTITY, responseId).length === 1,
    're-saving the same draft does not attach the file a second time',
    `attached ${attachedFileIds(RESPONSE_ENTITY, responseId).length} — duplicates mean the idempotency read is gone`,
  );

  // 3. Somebody attaches a file to this response by hand, then the respondent replaces their upload.
  const handAttached = seedHandAttachedFile(RESPONSE_ENTITY, responseId);
  const second = await provisionFile(token, responseId, fileQuestion?.id, 'resume-v2');
  const completed = await submit(token, definition, { responseId, email, fileId: second.fileId, fileQuestionId: fileQuestion?.id, complete: true });
  check(completed?.success === true, 'the final submit succeeds', completed?.errors?.[0]?.message);

  const afterReplace = attachedFileIds(RESPONSE_ENTITY, responseId);
  check(afterReplace.includes(second.fileId.toLowerCase()), 'the replacement file is attached');
  check(!afterReplace.includes(first.fileId.toLowerCase()),
    'the superseded file is no longer attached',
    'a respondent who replaces their upload must not leave the old one on display');
  check(afterReplace.includes(handAttached.toLowerCase()),
    'the hand-attached file is untouched',
    'only files with a FormUpload row for this response are Forms’ to remove');

  // 4. The binding leg: the same file has to reach the business record, which is the whole point.
  //    Skipped explicitly — never vacuously — when this form has no binding to run.
  const hasBinding = (definition.automations ?? []).some((a) => a.targetType === 'EntityBinding' && a.isActive !== false);
  if (!hasBinding) {
    note(`"${SLUG}" publishes no active entity binding, so the bound-record leg cannot run here.`);
    note('Run smoke/seed-binding-smoke.mjs, or pass a slug whose form binds to an entity.');
  } else {
    const bound = await eventually(() => bindingTargetFor(responseId), Boolean);
    if (!bound) {
      fail('the binding wrote its identity-ledger row',
        `nothing within ${BINDING_BUDGET_MS / 1000}s — the binding itself did not run or was skipped`);
    } else {
      const onRecord = await eventually(
        () => attachedFileIds(bound.entityName, bound.recordId),
        (ids) => ids.includes(second.fileId.toLowerCase()),
      );
      check(onRecord.includes(second.fileId.toLowerCase()),
        `the file is attached to the bound ${bound.entityName} record too`,
        `attached to ${bound.recordId}: [${onRecord.join(', ')}] — an empty list usually means the ` +
          'automation runner lacks its grant on "MJ: File Entity Record Links" (V202608251800)');
      // Not vacuous, though it looks it: file A has a FormUpload row for this response, so a
      // reconciler that attached the response's UPLOADS rather than its current ANSWERS would put
      // it here. That is the distinction being checked.
      check(!onRecord.includes(first.fileId.toLowerCase()),
        'the bound record gets the current answer, not every file this response ever uploaded');
      check(!onRecord.includes(handAttached.toLowerCase()),
        'reconciling the bound record did not drag the response’s hand-attached file onto it');

      // 5. A SECOND response from the same person binds to the SAME record. Its reconcile is
      //    scoped to its own uploads, so it must add its file WITHOUT stripping the first
      //    response's — the property that keeps one respondent's submission from erasing another's
      //    attachments off a record they share.
      const token2 = await newSession();
      const responseId2 = randomUUID();
      const third = await provisionFile(token2, responseId2, fileQuestion?.id, 'resume-v3');
      const secondSubmission = await submit(token2, definition, {
        responseId: responseId2, email, fileId: third.fileId, fileQuestionId: fileQuestion?.id, complete: true,
      });
      check(secondSubmission?.success === true, 'a second response from the same person submits',
        secondSubmission?.errors?.[0]?.message);

      const bound2 = await eventually(() => bindingTargetFor(responseId2), Boolean);
      check(bound2?.recordId === bound.recordId,
        'the second response binds to the same record',
        `got ${bound2?.recordId} vs ${bound.recordId} — the rest of this leg needs one shared record`);

      const shared = await eventually(
        () => attachedFileIds(bound.entityName, bound.recordId),
        (ids) => ids.includes(third.fileId.toLowerCase()),
      );
      check(shared.includes(third.fileId.toLowerCase()), 'the second response attaches its own file');
      check(shared.includes(second.fileId.toLowerCase()),
        'and leaves the FIRST response’s file attached',
        `attached: [${shared.join(', ')}] — one response reconciling must never remove another ` +
          'response’s attachment from a record they share');
    }
  }

  console.log(failures === 0
    ? '\nPASS — file attachments hold end to end against a real database.'
    : `\nFAIL — ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(`\nFAIL — ${err.message}`); process.exit(1); });
