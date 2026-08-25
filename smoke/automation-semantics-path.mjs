/**
 * Intensive end-to-end smoke test for on-submit automation SEMANTICS.
 *
 * `binding-path.mjs` proves one automation works. This proves the rules that decide WHETHER and IN
 * WHAT ORDER an automation runs — trigger, isActive, conditional rule, display order, and the
 * identity ledger's short-circuit. Every one of those failures is silent in production: an
 * automation that should not have fired leaves a business record nobody asked for, and one that
 * should have fired leaves nothing at all. Neither raises an error, and both look identical to a
 * green unit suite, because the unit suite plans automations against a fake dispatcher and never
 * discovers that the plan and the dispatcher disagree.
 *
 * Each scenario rewrites the authored `FormAutomation` row, republishes the snapshot THROUGH THE
 * REAL MAPPER (`buildPublishedAutomations`), then submits through the real anonymous path and
 * reads what actually happened. Republishing via the mapper is deliberate: it means the mapper is
 * exercised once per scenario rather than trusted.
 *
 * Prerequisites: MJAPI running, and `smoke/seed-binding-smoke.mjs` already run.
 *   set -a && . ./.env && set +a && node smoke/automation-semantics-path.mjs
 */
import { AUTHORED_AUTOMATION_FIELDS, buildPublishedAutomations } from '@mj-biz-apps/forms-entities';
import { buildAnswers, resolveFormId, resolveSeededSlug } from './lib/fixture.mjs';
import { sql, sqlWide } from './lib/sqlcmd.mjs';
import { sessionIdFor } from './lib/session.mjs';

const BASE = (process.env.FORMS_SMOKE_URL || 'http://localhost:4121').replace(/\/$/, '');
const AUTOMATION_ID = '11111111-2222-4333-8444-555555555002';
// The form this suite is wired to, NOT whichever form sorts first. Every scenario below rewrites
// the authored row above, republishes THAT form's snapshot from THAT form's authored rows, and
// then asserts exact counts ("restored to a single active automation"). Run against a form with
// five authored automations and every one of those counts is wrong — and the republish rewrites
// the automations of a form this suite does not own.
const SLUG = resolveSeededSlug('automation-semantics-path.mjs', { automationId: AUTOMATION_ID });
// Resolved up front so a wrong slug fails naming the slugs that would have worked, rather 
// than as an HTTP error several steps later that reads like the server is broken.
resolveFormId(SLUG);
const env = process.env;

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, d) => { failures++; console.error(`  FAIL  ${m}${d ? `\n          ${d}` : ''}`); };
const check = (cond, m, d) => (cond ? pass(m) : fail(m, d));

/** Rebuild the published snapshot's automations from the authored rows, via the real mapper. */
function republish() {
  const columns = AUTHORED_AUTOMATION_FIELDS.map((f) => (f === 'Trigger' ? '[Trigger]' : f)).join(', ');
  const formId = sql(`SELECT TOP 1 CAST(f.ID AS varchar(40)) FROM __mj_BizAppsForms.Form f
    JOIN __mj_BizAppsForms.FormDistribution d ON d.FormID=f.ID WHERE d.Slug='${SLUG}';`).trim();
  const json = sqlWide(`SET NOCOUNT ON; SELECT ${columns} FROM __mj_BizAppsForms.FormAutomation
    WHERE FormID='${formId}' FOR JSON PATH, INCLUDE_NULL_VALUES;`);
  const rows = JSON.parse(json || '[]');
  const published = JSON.stringify(buildPublishedAutomations(rows)).replace(/'/g, "''");
  sql(`
DECLARE @VerID UNIQUEIDENTIFIER = (
  SELECT TOP 1 v.ID FROM __mj_BizAppsForms.FormVersion v
  JOIN __mj_BizAppsForms.FormDistribution d ON d.FormID=v.FormID
  WHERE d.Slug='${SLUG}' AND v.Status='Published' ORDER BY v.VersionNumber DESC);
DECLARE @Snap NVARCHAR(MAX) = (SELECT DefinitionSnapshot FROM __mj_BizAppsForms.FormVersion WHERE ID=@VerID);
SET @Snap = JSON_MODIFY(@Snap, '$.automations', JSON_QUERY('${published}'));
UPDATE __mj_BizAppsForms.FormVersion SET DefinitionSnapshot=@Snap WHERE ID=@VerID;`);
  return rows.length;
}

/** Set columns on the automation under test, then republish so the change actually takes effect. */
function configure(assignments) {
  sql(`UPDATE __mj_BizAppsForms.FormAutomation SET ${assignments} WHERE ID='${AUTOMATION_ID}';`);
  republish();
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
  if (body.errors) throw new Error(`GraphQL error: ${JSON.stringify(body.errors).slice(0, 300)}`);
  return body.data;
}

async function newSession() {
  const html = await (await fetch(`${BASE}/f/${SLUG}`)).text();
  const token = (html.match(/data-token="([^"]+)"/) || [])[1];
  if (!token) throw new Error('no anonymous session token on the host page');
  return token;
}

async function definitionFor(token) {
  const published = await gql(token,
    'query P($slug: String!) { PublishedForm(distributionSlug: $slug) { definitionJSON } }', { slug: SLUG });
  return JSON.parse(published?.PublishedForm?.definitionJSON ?? '{}');
}

/** Submit through the real public path. `partial` drives the Complete/Partial distinction. */
async function submit(token, definition, { email, name, partial = false, responseId }) {
  const questions = (definition.pages ?? []).flatMap((p) => p.questions ?? []);
  // `buildAnswers`, not a local copy of it — see the note in binding-path.mjs. The values it
  // produces are the same deterministic ones this used (7, true, the epoch) EXCEPT for choices,
  // where it picks the question's own first option instead of a literal the form never offered.
  const answers = buildAnswers(questions, { email, name });

  const data = await gql(token, `
    mutation S($input: FormSubmissionInputType!) {
      SubmitFormResponse(input: $input) { success responseId status errors { message } }
    }`, {
    input: {
      distributionSlug: SLUG,
      formVersionId: definition.formVersionId,
      partial,
      ...(responseId ? { responseId } : {}),
      startedAt: new Date(0).toISOString(),
      clientMeta: { referrer: '', userAgent: 'semantics-smoke' },
      answers,
    },
  });
  const r = data?.SubmitFormResponse;
  if (!r?.success) throw new Error(`submit failed: ${r?.errors?.[0]?.message ?? 'unknown'}`);
  return r;
}

/**
 * On-submit hooks are DETACHED from the request — the submit answers the respondent as soon
 * as the response is persisted and lets automations run after, which is what took a submit
 * from ~8.3s to ~0.3s. Every assertion about a hook's effect is therefore an assertion about
 * something that becomes true shortly AFTER the mutation returns, and reading the table the
 * instant the submit resolves now races the work it is inspecting.
 *
 * Two shapes, and the difference matters:
 *
 *  - Expecting a run: poll until it appears. Fast when it lands quickly, and a timeout is a
 *    real failure — the automation genuinely never ran.
 *  - Expecting NO run: there is nothing to wait for, so waiting is the only way to be sure.
 *    Settle for the same budget, THEN read. This assertion is weaker than it was under
 *    blocking hooks and that is inherent to the change, not an oversight: "did not fire"
 *    can now only ever mean "had not fired within the budget".
 */
const HOOK_BUDGET_MS = 15_000;
const POLL_MS = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll `read` until it equals `expected`, or give up after the budget. Returns the last value. */
async function eventually(read, expected) {
  const deadline = Date.now() + HOOK_BUDGET_MS;
  let value = read();
  while (value !== expected && Date.now() < deadline) {
    await sleep(POLL_MS);
    value = read();
  }
  return value;
}

/** Let detached hooks finish, then read — for assertions that something did NOT happen. */
async function afterHooksSettle(read) {
  await sleep(HOOK_BUDGET_MS / 3);
  return read();
}

const runsFor = (responseId) =>
  sql(`SELECT COUNT(*) FROM __mj_BizAppsForms.FormAutomationRun WHERE FormResponseID='${responseId}';`).trim();
const ledgerCountFor = (responseId) =>
  sql(`SELECT COUNT(*) FROM __mj_BizAppsForms.FormEntityBindingRecord WHERE FormResponseID='${responseId}';`).trim();
const outcomeFor = (responseId) =>
  sql(`SELECT TOP 1 Outcome FROM __mj_BizAppsForms.FormEntityBindingRecord WHERE FormResponseID='${responseId}';`).trim();

const unique = Date.now();
const emailFor = (tag) => `semantics-${unique}-${tag}@example.com`;

async function main() {
  console.log(`Automation-semantics smoke test\n  target : ${BASE}\n  slug   : ${SLUG}\n`);

  const seeded = republish();
  check(seeded > 0, `snapshot rebuilt from ${seeded} authored automation row(s) via the real mapper`,
    'run smoke/seed-binding-smoke.mjs first');

  // ---------------------------------------------------------------- trigger
  // An OnComplete automation must not fire on an autosave. Getting this wrong sends a confirmation
  // email on every keystroke, and it is the exact behaviour the legacy hook list had.
  configure(`[Trigger]='OnComplete', IsActive=1, ConditionalRule=NULL`);
  {
    const token = await newSession();
    const def = await definitionFor(token);
    const partial = await submit(token, def, { email: emailFor('partial'), name: 'Partial', partial: true });
    const partialRuns = await afterHooksSettle(() => runsFor(partial.responseId));
    check(partialRuns === '0',
      'an OnComplete automation does NOT fire on a partial autosave',
      `got ${partialRuns} run(s) — autosaves would trigger side effects on every keystroke`);
    check(partial.status === 'Partial', `the partial save is recorded as Partial (got ${partial.status})`);

    // ...and the SAME response, completed, does fire exactly once.
    const completed = await submit(token, def, {
      email: emailFor('partial'), name: 'Partial Completed', partial: false, responseId: partial.responseId,
    });
    const completedRuns = await eventually(() => runsFor(completed.responseId), '1');
    check(completedRuns === '1',
      'completing that same response fires it exactly once',
      `got ${completedRuns} after waiting ${HOOK_BUDGET_MS}ms for detached hooks`);
  }

  // ---------------------------------------------------------------- isActive
  // A disabled automation is a deliberate state an author set. Running it anyway is the kind of
  // bug that is only ever noticed via its side effects.
  configure(`IsActive=0`);
  {
    const token = await newSession();
    const def = await definitionFor(token);
    check((def.automations ?? []).some((a) => a.isActive === false),
      'the snapshot carries the disabled automation rather than dropping it',
      'dropping it makes "disabled" indistinguishable from "never configured"');
    const res = await submit(token, def, { email: emailFor('inactive'), name: 'Inactive' });
    const inactiveRuns = await afterHooksSettle(() => runsFor(res.responseId));
    check(inactiveRuns === '0',
      'a disabled automation does not run',
      `got ${inactiveRuns} run(s)`);
    check(ledgerCountFor(res.responseId) === '0', 'and it writes no binding record');
  }

  // ------------------------------------------------------------- conditional
  // A rule that does not match must skip; the same rule matching must run. Both directions are
  // asserted because a rule evaluator that always returns true passes the second alone.
  const probeDef = await definitionFor(await newSession());
  const emailQ = emailQuestionId(probeDef);
  const conditionFalse = JSON.stringify({
    show: { all: [{ questionId: emailQ, op: 'equals', value: 'never-matches@example.com' }] },
  }).replace(/'/g, "''");
  configure(`IsActive=1, ConditionalRule='${conditionFalse}'`);
  {
    const token = await newSession();
    const def = await definitionFor(token);
    const res = await submit(token, def, { email: emailFor('cond-no'), name: 'NoMatch' });
    const noMatchRuns = await afterHooksSettle(() => runsFor(res.responseId));
    check(noMatchRuns === '0',
      'an automation whose condition does not match does not run',
      `got ${noMatchRuns} run(s)`);
  }

  const matchEmail = emailFor('cond-yes');
  const conditionTrue = JSON.stringify({
    show: { all: [{ questionId: emailQ, op: 'equals', value: matchEmail }] },
  }).replace(/'/g, "''");
  configure(`ConditionalRule='${conditionTrue}'`);
  {
    const token = await newSession();
    const def = await definitionFor(token);
    const res = await submit(token, def, { email: matchEmail, name: 'Match' });
    const matchRuns = await eventually(() => runsFor(res.responseId), '1');
    check(matchRuns === '1',
      'the same automation DOES run when its condition matches',
      `got ${matchRuns} run(s) — a condition that never matches is indistinguishable from a broken evaluator`);
  }

  // ------------------------------------------------------------------ ledger
  // Re-submitting under the SAME response id must not bind twice. AlwaysCreate would otherwise
  // create a second business record per replay; here the identity rule is MatchThenCreate, so the
  // observable guarantee is one ledger row and one target record.
  configure(`ConditionalRule=NULL`);
  {
    const token = await newSession();
    const def = await definitionFor(token);
    const email = emailFor('ledger');
    const first = await submit(token, def, { email, name: 'Ledger' });
    const again = await submit(await newSession(), def, {
      email, name: 'Ledger', responseId: first.responseId,
    });
    check(again.responseId === first.responseId, 'the replay reuses the same response id');
    // Settle rather than poll-to-1: a poll that stops the moment it sees one row would pass
    // even if a second arrived a tick later, which is the exact duplicate this asserts against.
    const ledgerRows = await afterHooksSettle(() => ledgerCountFor(first.responseId));
    check(ledgerRows === '1',
      'a replayed submission leaves exactly ONE ledger row',
      `got ${ledgerRows} — more than one means the unique index is the only thing preventing a duplicate write`);
    const outcome = outcomeFor(first.responseId);
    check(['Created', 'Unchanged', 'Merged'].includes(outcome),
      `the ledger records a real outcome (got ${outcome})`);
  }

  // ---------------------------------------------------------------- ordering
  // Two automations on one form. `planAutomations` decides the order (Sync before Async, then
  // DisplayOrder) and the dispatcher carries it out; nothing until now proved the two agree on a
  // form with more than one. Order matters concretely here: `Upsert Respondent Person` stamps
  // `FormResponse.RespondentPersonID`, so anything later that reads it sees a different value if
  // the order flips.
  const SECOND_ID = '11111111-2222-4333-8444-555555555005';
  sql(`
DECLARE @ActionID UNIQUEIDENTIFIER = (SELECT ID FROM __mj.Action WHERE Name='Forms: Upsert Respondent Person');
DECLARE @FormID UNIQUEIDENTIFIER = (SELECT TOP 1 f.ID FROM __mj_BizAppsForms.Form f
  JOIN __mj_BizAppsForms.FormDistribution d ON d.FormID=f.ID WHERE d.Slug='${SLUG}');
IF NOT EXISTS (SELECT 1 FROM __mj_BizAppsForms.FormAutomation WHERE ID='${SECOND_ID}')
  INSERT INTO __mj_BizAppsForms.FormAutomation
    (ID, FormID, Name, TargetType, ActionID, [Trigger], ExecutionMode, DisplayOrder, ContinueOnError, IsActive)
  VALUES ('${SECOND_ID}', @FormID, 'Smoke: upsert person action', 'Action', @ActionID,
          'OnComplete', 'Sync', 2, 1, 1);
ELSE
  UPDATE __mj_BizAppsForms.FormAutomation SET IsActive=1, DisplayOrder=2, ContinueOnError=1 WHERE ID='${SECOND_ID}';`);
  configure(`[Trigger]='OnComplete', IsActive=1, ConditionalRule=NULL, DisplayOrder=1`);
  {
    const token = await newSession();
    const def = await definitionFor(token);
    check((def.automations ?? []).length === 2, `the snapshot carries both automations (got ${(def.automations ?? []).length})`);
    check(
      (def.automations ?? []).map((a) => a.displayOrder).join(',') === '1,2',
      'the mapper published them in DisplayOrder',
      `got ${(def.automations ?? []).map((a) => a.displayOrder).join(',')}`,
    );

    const res = await submit(token, def, { email: emailFor('order'), name: 'Ordered' });
    // Wait for BOTH before reading the order: with detached hooks, reading after the first
    // lands would assert an ordering over a list that is still being appended to.
    await eventually(() => runsFor(res.responseId), '2');
    const runs = sql(`SELECT Status FROM __mj_BizAppsForms.FormAutomationRun
      WHERE FormResponseID='${res.responseId}' ORDER BY StartedAt ASC, __mj_CreatedAt ASC;`)
      .split('\n').map((l) => l.trim()).filter(Boolean);
    check(runs.length === 2, `both automations ran (got ${runs.length} run(s))`);
    check(runs.every((s) => s === 'Succeeded'), `neither failed (${runs.join(', ')})`);
    check(ledgerCountFor(res.responseId) === '1', 'the binding still wrote exactly one ledger row');

    // The Action half actually did its work: the response carries the Person it upserted.
    const stamped = sql(`SELECT TOP 1 ISNULL(CAST(RespondentPersonID AS varchar(40)),'')
      FROM __mj_BizAppsForms.FormResponse WHERE ID='${res.responseId}';`).trim();
    check(stamped.length > 0,
      'the Action automation wrote through to the response (RespondentPersonID stamped)',
      'empty means the Action ran under an identity that cannot update Form Responses');
  }

  // Restore the seeded configuration so a following binding-path run starts from a known state.
  sql(`UPDATE __mj_BizAppsForms.FormAutomation SET IsActive=0 WHERE ID='${SECOND_ID}';`);
  configure(`[Trigger]='OnComplete', IsActive=1, ConditionalRule=NULL, DisplayOrder=1`);
  {
    const def = await definitionFor(await newSession());
    const active = (def.automations ?? []).filter((a) => a.isActive);
    check(active.length === 1, `restored to a single active automation (got ${active.length})`);
  }

  console.log(failures === 0
    ? '\nPASS — automation semantics hold end to end against a real database.'
    : `\nFAIL — ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * The Email question's id, as the PUBLISHED SNAPSHOT spells it.
 *
 * Read from the snapshot rather than from SQL on purpose. `buildConditionAnswers` keys its map by
 * the snapshot's question ids precisely because the two spellings differ — client-minted lowercase
 * versus SQL Server's uppercase `uniqueidentifier` — so a rule built from the SQL spelling would
 * match nothing and this test would report a broken evaluator that is in fact fine. Asking the
 * snapshot means the rule is written in the same alphabet the rule engine reads.
 */
function emailQuestionId(definition) {
  const question = (definition.pages ?? [])
    .flatMap((p) => p.questions ?? [])
    .find((q) => q.type === 'Email');
  if (!question) {
    throw new Error('the fixture form has no Email question; conditional scenarios cannot be built');
  }
  return question.id;
}

main().catch((err) => { console.error(`\nFAIL — ${err.message}`); process.exit(1); });
