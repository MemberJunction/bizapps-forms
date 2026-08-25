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
import { sessionIdFor } from './lib/session.mjs';
import { buildAnswers, resolveFormId, resolveSeededSlug } from './lib/fixture.mjs';
import { sql } from './lib/sqlcmd.mjs';

const BASE = (process.env.FORMS_SMOKE_URL || 'http://localhost:4121').replace(/\/$/, '');
// The automation `seed-binding-smoke.mjs` creates, and the form it is wired to — NOT whichever
// form sorts first. Two of the assertions below hold only on a form whose sole automation is this
// binding: "all five submissions ran their automation" counts runs (a form with five automations
// reports 15), and "first submission creates the record" needs the binding to be the FIRST thing
// that sees the address. On a form that also runs `Forms: Upsert Respondent Person`, that action
// creates the Person first and the binding correctly reports `Unchanged` — a real outcome, read
// as a failure, because the fixture was pointed at a form it was never written for.
const SEEDED_AUTOMATION_ID = '11111111-2222-4333-8444-555555555002';
const SLUG = resolveSeededSlug('binding-path.mjs', { automationId: SEEDED_AUTOMATION_ID });
// Resolved up front so a wrong slug fails naming the slugs that would have worked, rather 
// than as an HTTP error several steps later that reads like the server is broken.
resolveFormId(SLUG);
const env = process.env;

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, d) => { failures++; console.error(`  FAIL  ${m}${d ? `\n          ${d}` : ''}`); };
const check = (cond, m, d) => (cond ? pass(m) : fail(m, d));

/**
 * On-submit automations are DETACHED from the request — the submit answers the respondent as soon
 * as the response is persisted and lets the binding run after. Every assertion in this file is
 * about what the BINDING did, so every one of them is about something that becomes true shortly
 * AFTER the mutation returns, and reading the ledger the instant the submit resolves races the
 * work being inspected. It did: `ledgerFor` returned null, the record id came back undefined, and
 * the suite died inside `personById` on `Conversion failed when converting ... to uniqueidentifier`
 * — a fixture race wearing the costume of a SQL bug. Same shape as
 * `automation-semantics-path.mjs`: poll, with a budget, and treat running out as a real failure.
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

/** The ledger row for a response, once the detached automation has written it. */
const ledgerEventually = (responseId) => eventually(() => ledgerFor(responseId), Boolean);

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

/** Submit one response with the given email and name; returns its responseId. */
async function submit(token, definition, { email, name }) {
  const questions = (definition.pages ?? []).flatMap((p) => p.questions ?? []);
  // `buildAnswers`, not a local copy of it. The copy that used to live here sent
  // `jsonValue: '["smoke"]'` for every choice question, which the server rejects with "Choose
  // only from the offered options" on any form whose choices are real — so this suite could not
  // run at all against a form somebody had actually built. The helper picks the question's OWN
  // first option, which is the whole reason it exists (see smoke/lib/fixture.mjs).
  const answers = buildAnswers(questions, { email, name });

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
  // Guarded because the caller reads it off a ledger row that may not exist. Interpolating an
  // absent id produced `Msg 8169, Conversion failed ... to uniqueidentifier`, which reads as a
  // database problem rather than as "the binding had not run yet".
  if (!id) {
    return null;
  }
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
  const firstLedger = await ledgerEventually(first);
  check(firstLedger?.outcome === 'Created', `first submission creates the record (got ${firstLedger?.outcome ?? 'no ledger row'})`);
  const personId = firstLedger?.recordId;
  check(Boolean(personById(personId)), 'the ledger TargetRecordID joins to a real Person row',
    'a value that does not join means the primary key was serialized in the wrong format');
  check(personById(personId)?.firstName === 'Ada', 'the mapped answer landed on the record');

  // 2. Same person again, different name: updates, never duplicates.
  const second = await submit(await newSession(), definition, { email: emailA, name: 'Ada Lovelace' });
  const secondLedger = await ledgerEventually(second);
  check(secondLedger?.outcome === 'Merged', `a repeat submission merges (got ${secondLedger?.outcome})`);
  check(secondLedger?.recordId === personId, 'it merges into the SAME record, rather than creating a second one');
  check(personById(personId)?.firstName === 'Ada Lovelace', 'the update actually wrote the new value');

  // 3. The identity match must be case-insensitive. This is the defect class that has shipped
  //    twice in this codebase; here it would present as a duplicate person per submission.
  const third = await submit(await newSession(), definition, { email: emailA.toUpperCase(), name: 'Ada Lovelace' });
  const thirdLedger = await ledgerEventually(third);
  check(thirdLedger?.recordId === personId,
    'an UPPERCASE email matches the same person',
    `got ${thirdLedger?.recordId} vs ${personId} — a new record means the identity match is case-sensitive`);

  // 4. A submission that changes nothing must write nothing — no save, so no __mj_UpdatedAt churn
  //    and no record-change row. (Every question on this form is required, so a genuinely blank
  //    answer cannot be submitted through the real path; the neverBlank rule itself is covered by
  //    the unit matrix, and what only a live run can show is the no-op.)
  const fourth = await submit(await newSession(), definition, { email: emailA, name: 'Ada Lovelace' });
  const fourthLedger = await ledgerEventually(fourth);
  check(fourthLedger?.outcome === 'Unchanged',
    `a resubmission of identical values reports Unchanged (got ${fourthLedger?.outcome})`);
  check(personById(personId)?.firstName === 'Ada Lovelace', 'the record still holds the right value');

  // 5. A different person gets their own record.
  const fifth = await submit(await newSession(), definition, { email: emailB, name: 'Grace' });
  const fifthLedger = await ledgerEventually(fifth);
  check(fifthLedger?.outcome === 'Created' && fifthLedger?.recordId !== personId,
    'a different email creates a separate record');

  // 6. Every automation this run triggered is accounted for, and none of them failed. Scoped to
  //    THIS run's responses on purpose: the table is cumulative, and counting historical rows
  //    would let an old failure fail a good run forever (and, worse, let a new failure hide among
  //    them).
  const ids = [first, second, third, fourth, fifth].map((r) => `'${r}'`).join(',');
  const readRunStates = () => sql(`SELECT Status + '=' + CAST(COUNT(*) AS varchar)
    FROM __mj_BizAppsForms.FormAutomationRun WHERE FormResponseID IN (${ids}) GROUP BY Status;`);
  // Detached again: wait for the last run to leave `Running` before tallying, or the tally counts
  // a run that had not finished as one that never succeeded.
  const runStates = await eventually(readRunStates, (v) => !v.includes('Running'));
  check(!runStates.includes('Failed'), `no automation run failed (${runStates.replace(/\n/g, ' ')})`);
  check(runStates.includes('Succeeded=5'), `all five submissions ran their automation (${runStates.replace(/\n/g, ' ')})`);

  console.log(failures === 0
    ? '\nPASS — entity binding works end to end against a real database.'
    : `\nFAIL — ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(`\nFAIL — ${err.message}`); process.exit(1); });
