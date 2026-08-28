#!/usr/bin/env node
/**
 * Exploit-shaped smoke for issue #78: an owned response cannot be taken over.
 *
 * WHY THIS EXISTS. `session-ownership.spec.ts` covers the same invariant with 15 unit tests, and
 * they are the reason to believe the gate is closed. They cannot be the whole story:
 * `.claude/rules/testing.md` is explicit that the anonymous respondent path is not visible to
 * unit tests, and issue #78's own reproduction was performed against a live API against real SQL
 * Server rows — because the two things that made the takeover reachable are both stack-level
 * facts, not TypeScript ones.
 *
 *   - The client MINTS the row's primary key. The takeover's second route works only because
 *     persistence adopts a caller-supplied uuid as the `FormResponse` PK, so a CREATE collides
 *     with the row already sitting there and recovers ONTO it. A fake provider can be made to
 *     model that; only a real database enforces it.
 *   - The ownership comparison has to agree with a SQL predicate running under SQL Server's
 *     case-insensitive default collation. That agreement is exactly what a unit test with an
 *     in-memory string map cannot check, and case-skew of this shape is what broke the whole
 *     respondent path in 0.2.1 (see respondent-path.mjs).
 *
 * So this drives the PUBLIC mutation, as an attacker would reach it, and then reads the victim's
 * row back OUT OF SQL SERVER rather than believing the API's own report about it. The load-bearing
 * assertions are the database ones: a refusal that still wrote is not a refusal.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT. `checkDuplicate` -> `findResponseById` has no session
 * predicate and was left that way on purpose (issue #101). Probing it is reported as a `note`, not
 * a pass or a fail: asserting the leak is present would turn fixing #101 into a red smoke, and
 * asserting it is absent would fail today for a reason nobody chose. It is printed so the residual
 * stays visible, and so a change in it is noticed.
 *
 * Zero dependencies beyond the suite's own helpers: Node's fetch, and sqlcmd through lib/sqlcmd.
 *
 * Usage:  set -a && . ./.env && set +a && node smoke/session-ownership-path.mjs [distribution-slug]
 */
import { randomUUID } from 'node:crypto';
import { resolveSlug, buildAnswers } from './lib/fixture.mjs';
import { requireDbEnv, sql } from './lib/sqlcmd.mjs';

const BASE = (process.env.FORMS_SMOKE_URL || 'http://localhost:4121').replace(/\/$/, '');

/**
 * The database is not optional here, unlike in respondent-path. Every meaningful assertion in this
 * script is "the victim's row is unchanged", and only SQL Server can answer that — the API's own
 * response is the thing under suspicion.
 */
requireDbEnv('session-ownership-path.mjs');
const SLUG = resolveSlug('session-ownership-path.mjs');

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, detail) => { failures++; console.error(`  FAIL  ${m}${detail ? `\n          ${detail}` : ''}`); };
const check = (cond, m, detail) => (cond ? pass(m) : fail(m, detail));
const note = (m) => console.log(`  note  ${m}`);
const section = (m) => console.log(`--- ${m} ---`);

const VICTIM_EMAIL = 'smoke78-victim@example.com';
const ATTACKER_EMAIL = 'smoke78-attacker@example.com';

/** Single-quote escaping for the ids this script interpolates into its verification SQL. */
const esc = (v) => String(v).replace(/'/g, "''");

/**
 * POST a GraphQL operation as an anonymous respondent.
 *
 * `sessionId` is passed EXPLICITLY rather than derived from the token, which is the whole point of
 * this script: the attack is a caller choosing what to put in (or leave out of) `x-session-id`
 * while presenting somebody else's response id. `undefined` omits the header entirely — that is
 * route 2, and it must not be more permissive than sending the wrong value.
 */
async function gql(token, sessionId, query, variables) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  if (sessionId !== undefined) {
    headers['x-session-id'] = sessionId;
  }
  const res = await fetch(`${BASE}/`, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  const body = await res.json();
  if (body.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(body.errors).slice(0, 300)}`);
  }
  return body.data;
}

/** Mint a fresh anonymous session by fetching the public host page, as a real respondent does. */
async function newAnonymousSession() {
  const res = await fetch(`${BASE}/f/${SLUG}`);
  if (res.status !== 200) {
    throw new Error(`GET /f/${SLUG} returned ${res.status} — is the distribution published with a PublicLinkToken?`);
  }
  const token = (await res.text()).match(/data-token="([^"]+)"/)?.[1];
  if (!token) {
    throw new Error('host page carried no anonymous session token');
  }
  return token;
}

const SUBMIT = `
  mutation S($input: FormSubmissionInputType!) {
    SubmitFormResponse(input: $input) { success responseId status errors { message } }
  }`;

/** One submission attempt. Returns the `SubmitFormResponse` payload. */
async function submit(token, sessionId, { responseId, answers, formVersionId, partial }) {
  const data = await gql(token, sessionId, SUBMIT, {
    input: {
      distributionSlug: SLUG,
      formVersionId,
      partial,
      responseId,
      startedAt: new Date(0).toISOString(),
      clientMeta: { referrer: '', userAgent: 'forms-smoke-78' },
      answers,
    },
  });
  return data?.SubmitFormResponse;
}

/** The victim row as SQL Server holds it: status and stored owner. */
function readRow(responseId) {
  const out = sql(
    `SELECT Status, ISNULL(AnonymousSessionID, '<null>')
     FROM __mj_BizAppsForms.FormResponse WHERE ID = '${esc(responseId)}';`,
  ).trim();
  if (!out) {
    return undefined;
  }
  const [status, owner] = out.split('|');
  return { status: status.trim(), owner: owner.trim() };
}

/** Every text answer stored against a response, so a replaced answer set is visible. */
function readAnswers(responseId) {
  const out = sql(
    `SELECT ISNULL(TextValue, '') FROM __mj_BizAppsForms.FormResponseAnswer
     WHERE ResponseID = '${esc(responseId)}';`,
  ).trim();
  return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

/** How many rows exist at an id — the PK-collision route must never produce a second. */
function countRows(responseId) {
  return Number(sql(`SELECT COUNT(*) FROM __mj_BizAppsForms.FormResponse WHERE ID = '${esc(responseId)}';`).trim());
}

async function main() {
  console.log(`Session-ownership exploit smoke (issue #78)\n  target : ${BASE}\n  slug   : ${SLUG}\n`);

  // ---------------------------------------------------------------- the victim
  section('the victim starts filling in a form');

  const victimToken = await newAnonymousSession();
  const victimSession = randomUUID();
  const victimResponseId = randomUUID();

  const published = await gql(victimToken, victimSession,
    'query P($slug: String!) { PublishedForm(distributionSlug: $slug) { definitionJSON } }',
    { slug: SLUG });
  const definition = JSON.parse(published?.PublishedForm?.definitionJSON ?? '{}');
  const questions = (definition.pages ?? []).flatMap((p) => p.questions ?? []);
  const formVersionId = definition.formVersionId;
  check(questions.length > 0 && Boolean(formVersionId),
    `published definition loads (${questions.length} question(s))`);

  const victimAnswers = buildAnswers(questions, { email: VICTIM_EMAIL, name: 'Victim' });
  const attackerAnswers = buildAnswers(questions, { email: ATTACKER_EMAIL, name: 'Attacker' });

  const saved = await submit(victimToken, victimSession,
    { responseId: victimResponseId, answers: victimAnswers, formVersionId, partial: true });
  check(saved?.success === true, 'victim saves a Partial', saved?.errors?.[0]?.message);
  check(saved?.responseId?.toLowerCase() === victimResponseId.toLowerCase(),
    'the client-minted responseId became the row primary key',
    `sent ${victimResponseId}, got ${saved?.responseId}`);

  const initial = readRow(victimResponseId);
  check(initial?.status === 'Partial', `row is Partial in SQL Server (got ${initial?.status})`);
  check(initial?.owner?.toLowerCase() === victimSession.toLowerCase(),
    'row records the victim as its owner',
    `stored "${initial?.owner}", expected "${victimSession}"`);

  // ------------------------------------------------------------- the takeover
  section('the three routes issue #78 described');

  const attackerToken = await newAnonymousSession();
  const attackerSession = randomUUID();
  const attempt = { responseId: victimResponseId, answers: attackerAnswers, formVersionId, partial: true };

  // Route 2. The reported defect: the gate was opt-in, and this is opting out. A blank session
  // skipped the ownership-keyed lookup and took the client-id lookup, which matched on the
  // SourceMetadata proof and asked nothing about who owned the row.
  const omitted = await submit(attackerToken, undefined, attempt);
  check(omitted?.success === false, 'REFUSED: attacker omits x-session-id', `got success=${omitted?.success}`);

  // Route 3. No lookup matches this caller at all, so the pipeline falls through to CREATE,
  // persistence adopts the supplied uuid as the primary key, the insert collides with the row
  // already there, and duplicate-key recovery picks the victim's row up. This is the route a gate
  // in front of the lookups could never have closed, and the only one a real database can prove.
  const forged = await submit(attackerToken, attackerSession, attempt);
  check(forged?.success === false, 'REFUSED: attacker sends a DIFFERENT x-session-id', `got success=${forged?.success}`);

  // The header is not a credential just by being present. Whitespace is no more an owner than an
  // absent header, and the two have to land in the same place.
  const blank = await submit(attackerToken, '   ', attempt);
  check(blank?.success === false, 'REFUSED: attacker sends a BLANK x-session-id', `got success=${blank?.success}`);

  // ------------------------------------------------- what the database says now
  section('the victim\'s row, read back out of SQL Server');

  const afterAttack = readRow(victimResponseId);
  check(afterAttack?.status === 'Partial',
    'still Partial — never sealed by the attacker', `got ${afterAttack?.status}`);
  check(afterAttack?.owner?.toLowerCase() === victimSession.toLowerCase(),
    'ownership record intact — not blanked, not reassigned',
    `stored "${afterAttack?.owner}", expected "${victimSession}"`);
  check(countRows(victimResponseId) === 1, 'exactly one row still exists at that id');

  const answersAfter = readAnswers(victimResponseId);
  check(answersAfter.includes(VICTIM_EMAIL), 'the victim\'s answers are still there',
    `stored answers: ${answersAfter.join(', ') || '(none)'}`);
  check(!answersAfter.includes(ATTACKER_EMAIL), 'none of the attacker\'s answers were written',
    `stored answers: ${answersAfter.join(', ') || '(none)'}`);

  // A refusal that varied by cause would report which gate was hit, and so confirm what the caller
  // was probing for. Absent, forged and blank are one answer.
  const messages = [omitted, forged, blank].map((r) => r?.errors?.[0]?.message ?? '(none)');
  check(new Set(messages).size === 1, 'one refusal message for all three routes (no oracle)',
    messages.join(' / '));
  check(!/session/i.test(messages[0]) && !messages[0].includes(victimSession),
    'the refusal names neither the owner nor that there is one', messages[0]);

  // ------------------------------------------- the flows that must keep working
  section('the owner is not locked out of their own response');

  const sealed = await submit(victimToken, victimSession,
    { responseId: victimResponseId, answers: victimAnswers, formVersionId, partial: false });
  check(sealed?.success === true, 'victim completes their own response', sealed?.errors?.[0]?.message);
  check(sealed?.status === 'Complete', `status Complete (got ${sealed?.status})`);
  check(readRow(victimResponseId)?.status === 'Complete', 'SQL Server agrees the row is Complete');

  // The genuinely headerless flow the client-id lookup exists for: the row has no owner, so the
  // 122-bit id in SourceMetadata is the only capability there is — and it still is.
  section('a genuinely headerless client still adopts its OWN row');

  const looseToken = await newAnonymousSession();
  const looseResponseId = randomUUID();
  const first = await submit(looseToken, undefined,
    { responseId: looseResponseId, answers: victimAnswers, formVersionId, partial: true });
  check(first?.success === true, 'headerless client creates its row', first?.errors?.[0]?.message);
  const second = await submit(looseToken, undefined,
    { responseId: looseResponseId, answers: victimAnswers, formVersionId, partial: true });
  check(second?.success === true, 'headerless client re-saves the SAME row', second?.errors?.[0]?.message);
  check(countRows(looseResponseId) === 1, 'still one row — autosave upsert, not a duplicate');

  // ------------------------------------------------ the sealed-row status oracle
  section('the sealed-row short-circuit (the follow-up commit)');

  // A terminal row returns an idempotent no-op — its id and status, with nothing written — and
  // that branch never reaches the write seam. Before the follow-up commit the gate sat only at the
  // write, so a caller presenting somebody else's SEALED response id was answered success:true
  // with that response's status. The victim's row is Complete now, so this probes exactly that.
  const oracle = await submit(attackerToken, attackerSession,
    { responseId: victimResponseId, answers: attackerAnswers, formVersionId, partial: true });
  check(oracle?.success === false,
    'REFUSED: attacker probes the victim\'s SEALED row with a partial save',
    `got success=${oracle?.success} status=${oracle?.status}`);
  check(oracle?.status === null || oracle?.status === undefined,
    'no status is reported back for a response the caller does not own',
    `got status=${oracle?.status}`);

  // ------------------------------------------------------- the documented residual
  section('known-open: the idempotent-resubmit lookup (issue #101)');

  // NOT an assertion, by design — see the header. `checkDuplicate` runs only on a completion and
  // resolves the id through `findResponseById`, which has no session predicate. PR #94 left this
  // deliberately rather than reintroduce a second enforcement point in the lookup layer.
  const residual = await submit(attackerToken, attackerSession,
    { responseId: victimResponseId, answers: attackerAnswers, formVersionId, partial: false });
  if (residual?.success === true && residual?.status) {
    note(`#101 still open, as documented: a FINAL submit reports status="${residual.status}" ` +
      'to a caller holding only the id (read-only; no answers disclosed, nothing written).');
    const stillVictims = readAnswers(victimResponseId);
    check(!stillVictims.includes(ATTACKER_EMAIL),
      'even so, the residual leak wrote nothing to the victim\'s row',
      `stored answers: ${stillVictims.join(', ')}`);
  } else {
    note(`#101 appears CLOSED: final-submit probe returned success=${residual?.success}. ` +
      'If that was deliberate, update this script and close the issue.');
  }

  console.log(failures === 0
    ? '\nPASS — an owned response cannot be taken over, and the flows that had to keep working still do.'
    : `\nFAIL — ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\nSMOKE ERROR: ${e.message}`);
  console.error('Is MJAPI running against the branch build, and is a form published at this slug?');
  process.exit(1);
});
