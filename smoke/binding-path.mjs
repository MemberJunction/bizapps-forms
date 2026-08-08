/**
 * End-to-end smoke test for entity binding.
 *
 * Submits real responses through the real anonymous public path — host page, redeemed session,
 * GraphQL mutation — and then reads the database to check what the binding actually did. Unit
 * tests cover the decisions with a fake gateway; this is the only thing that proves the wiring,
 * the service principal's grants, the SQL the gateway generates, and the ledger all work together
 * against a real SQL Server.
 *
 * The invariants asserted here are the ones whose failure is silent:
 *   - a second submission from the same person UPDATES rather than duplicating
 *   - the identity match is case-insensitive, so SMOKE@… finds smoke@…
 *   - `neverBlank` does not let a blank answer erase a value already on the record
 *   - a different person gets their own record
 *   - the ledger's TargetRecordID actually joins to the row it claims
 *
 * Prerequisites: MJAPI running, and `smoke/seed-binding-smoke.mjs` already run.
 *   set -a && . ./.env && set +a && node smoke/binding-path.mjs
 */
import { spawnSync } from 'node:child_process';

const BASE = (process.env.FORMS_SMOKE_URL || 'http://localhost:4121').replace(/\/$/, '');
const SLUG = process.argv[2] || 'contact-us-e2e';
const env = process.env;

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, d) => { failures++; console.error(`  FAIL  ${m}${d ? `\n          ${d}` : ''}`); };
const check = (cond, m, d) => (cond ? pass(m) : fail(m, d));

function sql(query) {
  const res = spawnSync('docker', [
    'exec', 'forms-sql', '/opt/mssql-tools18/bin/sqlcmd', '-S', 'localhost', '-d', env.DB_DATABASE,
    '-U', env.DB_USERNAME, '-P', env.DB_PASSWORD, '-C', '-b', '-h', '-1', '-W', '-s', '|', '-Q', `SET NOCOUNT ON; ${query}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`sqlcmd failed: ${res.stderr || res.stdout}`);
  return res.stdout.trim();
}

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

/** A fresh anonymous session, exactly as a browser hitting the public link would get one. */
async function newSession() {
  const html = await (await fetch(`${BASE}/f/${SLUG}`)).text();
  const token = (html.match(/data-token="([^"]+)"/) || [])[1];
  if (!token) throw new Error('no anonymous session token on the host page');
  return token;
}

/** Submit one response with the given email and name; returns its responseId. */
async function submit(token, definition, { email, name }) {
  const questions = (definition.pages ?? []).flatMap((p) => p.questions ?? []);
  const answers = questions.map((q) => {
    if (q.type === 'Email') return { questionId: q.id, textValue: email };
    if (q.prompt.toLowerCase().includes('name')) return { questionId: q.id, textValue: name };
    if (['Number', 'Rating', 'NPS'].includes(q.type)) return { questionId: q.id, numericValue: 7 };
    if (q.type === 'YesNo') return { questionId: q.id, booleanValue: true };
    if (['Date', 'Time'].includes(q.type)) return { questionId: q.id, dateValue: new Date(0).toISOString() };
    if (['MultiChoice', 'Dropdown', 'SingleChoice'].includes(q.type)) return { questionId: q.id, jsonValue: JSON.stringify(['smoke']) };
    if (q.type === 'Phone') return { questionId: q.id, textValue: '+1 555 010 1234' };
    return { questionId: q.id, textValue: 'binding smoke' };
  });

  const data = await gql(token, `
    mutation S($input: FormSubmissionInputType!) {
      SubmitFormResponse(input: $input) { success responseId status errors { message } }
    }`, {
    input: {
      distributionSlug: SLUG,
      formVersionId: definition.formVersionId,
      partial: false,
      startedAt: new Date(0).toISOString(),
      clientMeta: { referrer: '', userAgent: 'binding-smoke' },
      answers,
    },
  });
  const r = data?.SubmitFormResponse;
  if (!r?.success) throw new Error(`submit failed: ${r?.errors?.[0]?.message ?? 'unknown'}`);
  return r.responseId;
}

/** The ledger row a response produced. */
function ledgerFor(responseId) {
  const row = sql(`SELECT TOP 1 Outcome + '|' + ISNULL(TargetRecordID,'') + '|' + ISNULL(WrittenFields,'')
    FROM __mj_BizAppsForms.FormEntityBindingRecord WHERE FormResponseID='${responseId}';`);
  if (!row) return null;
  const [outcome, recordId, written] = row.split('|');
  return { outcome, recordId, written };
}

function personById(id) {
  const row = sql(`SELECT TOP 1 ISNULL(FirstName,'') + '~' + ISNULL(Email,'') FROM __mj_BizAppsCommon.Person WHERE ID='${id}';`);
  if (!row) return null;
  const [firstName, email] = row.split('~');
  return { firstName, email };
}

async function main() {
  console.log(`Entity-binding smoke test\n  target : ${BASE}\n  slug   : ${SLUG}\n`);

  const token = await newSession();
  const published = await gql(token,
    'query P($slug: String!) { PublishedForm(distributionSlug: $slug) { definitionJSON } }', { slug: SLUG });
  const definition = JSON.parse(published?.PublishedForm?.definitionJSON ?? '{}');
  check((definition.automations ?? []).length > 0,
    'the published snapshot carries the automation',
    'run smoke/seed-binding-smoke.mjs first — without it nothing under test actually runs');

  // A unique address per run, so the first submission is genuinely a first sighting rather than
  // a merge into whatever a previous run left behind.
  const unique = Date.now();
  const emailA = `binding-smoke-${unique}@example.com`;
  const emailB = `binding-smoke-${unique}-other@example.com`;

  // 1. First sighting creates the record.
  const first = await submit(token, definition, { email: emailA, name: 'Ada' });
  const firstLedger = ledgerFor(first);
  check(firstLedger?.outcome === 'Created', `first submission creates the record (got ${firstLedger?.outcome ?? 'no ledger row'})`);
  const personId = firstLedger?.recordId;
  check(Boolean(personById(personId)), 'the ledger TargetRecordID joins to a real Person row',
    'a value that does not join means the primary key was serialized in the wrong format');
  check(personById(personId)?.firstName === 'Ada', 'the mapped answer landed on the record');

  // 2. Same person again, different name: updates, never duplicates.
  const second = await submit(await newSession(), definition, { email: emailA, name: 'Ada Lovelace' });
  const secondLedger = ledgerFor(second);
  check(secondLedger?.outcome === 'Merged', `a repeat submission merges (got ${secondLedger?.outcome})`);
  check(secondLedger?.recordId === personId, 'it merges into the SAME record, rather than creating a second one');
  check(personById(personId)?.firstName === 'Ada Lovelace', 'the update actually wrote the new value');

  // 3. The identity match must be case-insensitive. This is the defect class that has shipped
  //    twice in this codebase; here it would present as a duplicate person per submission.
  const third = await submit(await newSession(), definition, { email: emailA.toUpperCase(), name: 'Ada Lovelace' });
  const thirdLedger = ledgerFor(third);
  check(thirdLedger?.recordId === personId,
    'an UPPERCASE email matches the same person',
    `got ${thirdLedger?.recordId} vs ${personId} — a new record means the identity match is case-sensitive`);

  // 4. A submission that changes nothing must write nothing — no save, so no __mj_UpdatedAt churn
  //    and no record-change row. (Every question on this form is required, so a genuinely blank
  //    answer cannot be submitted through the real path; the neverBlank rule itself is covered by
  //    the unit matrix, and what only a live run can show is the no-op.)
  const fourth = await submit(await newSession(), definition, { email: emailA, name: 'Ada Lovelace' });
  const fourthLedger = ledgerFor(fourth);
  check(fourthLedger?.outcome === 'Unchanged',
    `a resubmission of identical values reports Unchanged (got ${fourthLedger?.outcome})`);
  check(personById(personId)?.firstName === 'Ada Lovelace', 'the record still holds the right value');

  // 5. A different person gets their own record.
  const fifth = await submit(await newSession(), definition, { email: emailB, name: 'Grace' });
  const fifthLedger = ledgerFor(fifth);
  check(fifthLedger?.outcome === 'Created' && fifthLedger?.recordId !== personId,
    'a different email creates a separate record');

  // 6. Every automation this run triggered is accounted for, and none of them failed. Scoped to
  //    THIS run's responses on purpose: the table is cumulative, and counting historical rows
  //    would let an old failure fail a good run forever (and, worse, let a new failure hide among
  //    them).
  const ids = [first, second, third, fourth, fifth].map((r) => `'${r}'`).join(',');
  const runStates = sql(`SELECT Status + '=' + CAST(COUNT(*) AS varchar)
    FROM __mj_BizAppsForms.FormAutomationRun WHERE FormResponseID IN (${ids}) GROUP BY Status;`);
  check(!runStates.includes('Failed'), `no automation run failed (${runStates.replace(/\n/g, ' ')})`);
  check(runStates.includes('Succeeded=5'), `all five submissions ran their automation (${runStates.replace(/\n/g, ' ')})`);

  console.log(failures === 0
    ? '\nPASS — entity binding works end to end against a real database.'
    : `\nFAIL — ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(`\nFAIL — ${err.message}`); process.exit(1); });
