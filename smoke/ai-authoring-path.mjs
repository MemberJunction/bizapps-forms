/**
 * Smoke test for AI form authoring: a real brief, a real model, real rows.
 *
 *   node smoke/ai-authoring-path.mjs          # uses this repo's .env (MJ_Forms_Dev)
 *
 * ── WHY THIS EXISTS, given 700 passing unit tests. ───────────────────────────────────────────
 * Every one of those runs against a stubbed model. What they structurally cannot see is the
 * interaction between metadata on a real database and MJ's prompt runner — and that is where the
 * defects live. The first run of this script found one immediately: `AIPromptRunner` validates
 * output against the prompt's `OutputExample` and treats every key there as REQUIRED unless it ends
 * in '?'. Our examples showed optional fields unmarked, so `ValidationBehavior='Strict'` rejected
 * valid output and burned all three retries on EVERY generation — three model calls where one was
 * needed, and an 82-second build. Nothing failed; a form still came out. No unit test could have
 * caught it, and no human would have noticed except as "the AI is a bit slow".
 *
 * ── SHAPE, and how it differs from its neighbours. ───────────────────────────────────────────
 * The other smoke scripts here drive the ANONYMOUS respondent path over HTTP against a running
 * server. Authoring is an AUTHENTICATED author feature, so this one boots the MJ data provider
 * in-process and calls the action directly — no server to start, no login to obtain.
 *
 * ── WHAT IT DOES NOT COVER. ──────────────────────────────────────────────────────────────────
 * The websocket delivery of progress events and the Explorer UI. Both need a browser; this asserts
 * the events are PUBLISHED with the right shape and identity, not that they arrive.
 *
 * It writes two real Draft forms to whatever database `.env` names, and costs real model calls.
 */
import 'dotenv/config';
import sql from 'mssql';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import { Metadata, RunView } from '@memberjunction/core';
import '@memberjunction/server-bootstrap/mj-class-registrations';
import { LoadGeneratedEntities as LoadFormsEntities } from '@mj-biz-apps/forms-entities';
import { LoadGeneratedEntities as LoadCommonEntities } from '@mj-biz-apps/common-entities';
import { LoadFormsActions, runAuthoring, setFormsProgressPublisher } from '@mj-biz-apps/forms-actions';

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, d) => { failures++; console.error(`  FAIL  ${m}${d ? `\n          ${d}` : ''}`); };
const check = (c, m, d) => (c ? pass(m) : fail(m, d));
const section = (t) => console.log(`\n${t}\n${'─'.repeat(t.length)}`);

const cfg = {
  server: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  options: { trustServerCertificate: true, encrypt: true },
  requestTimeout: 300000,
};

async function main() {
  section(`Connecting to ${cfg.database} on ${cfg.server}:${cfg.port}`);
  const pool = await new sql.ConnectionPool(cfg).connect();
  await setupSQLServerClient(new SQLServerProviderConfigData(pool, '__mj', 0));
  LoadFormsEntities();
  LoadCommonEntities();
  LoadFormsActions();
  pass('provider up, Forms entities + actions registered');

  const md = new Metadata();
  const provider = Metadata.Provider;
  await UserCache.Instance.Refresh(provider);
  const all = UserCache.Instance.Users ?? [];
  const user = all.find((u) => u.Email === process.env.MJ_SMOKE_USER) ?? all.find((u) => u.IsActive) ?? all[0];
  if (!user) throw new Error('No users in the UserCache — cannot run as anybody.');
  pass(`running as ${user.Email ?? user.Name}`);

  // ---- 1. Metadata prerequisites --------------------------------------------------
  section('1. Prompt + action metadata is present on this database');
  const rv = new RunView();
  const prompts = await rv.RunView({
    EntityName: 'MJ: AI Prompts',
    ExtraFilter: "Name LIKE 'Forms:%'",
    ResultType: 'simple',
    Fields: ['Name', 'Status'],
  }, user);
  const names = (prompts.Results ?? []).map((p) => p.Name);
  for (const wanted of ['Forms: Form Designer', 'Forms: Form Outline', 'Forms: Page Detail', 'Forms: Theme Designer']) {
    check(names.includes(wanted), `AI Prompt present: ${wanted}`, `found: ${names.join(', ')}`);
  }

  // ---- 2. The staged route, with a real model --------------------------------------
  section('2. Staged generation (SessionID present) — real model, real rows');
  const events = [];
  setFormsProgressPublisher({
    publish(sessionId, ownerUserId, event) { events.push({ sessionId, ownerUserId, event }); },
  });

  const brief =
    'A two-page conference registration form. Page one collects the attendee’s contact details ' +
    'and whether they are attending in person or online. Page two asks about dietary requirements ' +
    'and t-shirt size, but only for people attending in person. Add a welcome screen and a ' +
    'thank-you screen, and make it feel warm and professional.';

  const params = { Params: [], ContextUser: user };
  const t0 = Date.now();
  const result = await runAuthoring(brief, user.ID, params, user, {
    inputMode: 'brief',
    channel: { sessionId: 'smoke-session-1', ownerUserId: user.ID },
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n  result: ${result.ResultCode} — ${result.Message}`);
  console.log(`  elapsed: ${elapsed}s`);
  check(result.Success, 'staged run succeeded', result.Message);
  check(Number(elapsed) < 70,
    `staged build finished in a plausible time (${elapsed}s) — a much larger number means the ` +
    'prompts are burning their OutputExample retries on optional fields');

  const out = (n) => params.Params.find((p) => p.Name === n)?.Value;
  const formId = out('FormID');
  check(!!formId, 'FormID output set');

  // ---- 3. Progress events -----------------------------------------------------------
  section('3. Progress events');
  const stages = events.map((e) => e.event.stage);
  console.log(`  stages: ${stages.join(' → ')}`);
  check(stages[0] === 'outline', 'first event is the outline');
  check(stages.at(-1) === 'complete', 'last event is complete');
  check(events.every((e) => e.ownerUserId === user.ID), 'every event carries ownerUserId (6.x fails closed without it)');
  check(events.every((e) => e.sessionId === 'smoke-session-1'), 'every event carries the session');
  const totals = new Set(events.map((e) => e.event.total));
  check(totals.size === 1, `total never changed mid-build (saw ${[...totals].join(', ')})`);
  check(events[0].event.total > 1, 'bar is determinate from event 1');
  const outlineAt = events.findIndex((e) => e.event.stage === 'outline');
  check(outlineAt === 0 && !!events[0].event.formId, 'form id is known from the first event');

  // ---- 4. What actually landed in the database --------------------------------------
  section('4. The persisted form');
  const q = async (entity, filter, fields) => {
    const r = await rv.RunView({ EntityName: entity, ExtraFilter: filter, ResultType: 'simple', Fields: fields }, user);
    if (!r.Success) throw new Error(`${entity}: ${r.ErrorMessage}`);
    return r.Results ?? [];
  };

  const forms = await q('MJ_BizApps_Forms: Forms', `ID='${formId}'`, ['ID', 'Name', 'Status', 'RenderMode', 'StyleID', 'Description']);
  const form = forms[0];
  console.log(`  form: "${form?.Name}" (${form?.Status})`);
  check(form?.Status === 'Draft', 'form is a Draft');
  check(!!form?.StyleID, 'form is linked to a style row');

  const pages = await q('MJ_BizApps_Forms: Form Pages', `FormID='${formId}'`, ['ID', 'Title', 'DisplayOrder', 'ConditionalRule']);
  const questions = await q('MJ_BizApps_Forms: Form Questions', `FormID='${formId}'`, ['ID', 'PageID', 'QuestionType', 'Prompt', 'IsRequired', 'DisplayOrder', 'ConditionalRule', 'ValidationRule']);
  const screens = await q('MJ_BizApps_Forms: Form Screens', `FormID='${formId}'`, ['ID', 'ScreenType', 'Title', 'Body', 'IsDefault', 'ConditionalRule', 'MediaURL']);
  const qIds = questions.map((x) => `'${x.ID}'`).join(',');
  const opts = qIds ? await q('MJ_BizApps_Forms: Form Question Options', `QuestionID IN (${qIds})`, ['ID', 'QuestionID', 'Label', 'Value', 'ImageURL']) : [];

  console.log(`  ${pages.length} page(s), ${questions.length} question(s), ${opts.length} option(s), ${screens.length} screen(s)`);
  for (const p of pages.sort((a, b) => a.DisplayOrder - b.DisplayOrder)) {
    console.log(`    page ${p.DisplayOrder}: "${p.Title}"${p.ConditionalRule ? '  [conditional]' : ''}`);
    for (const qq of questions.filter((x) => x.PageID === p.ID).sort((a, b) => a.DisplayOrder - b.DisplayOrder)) {
      const o = opts.filter((x) => x.QuestionID === qq.ID);
      console.log(`      - [${qq.QuestionType}] ${qq.Prompt}${qq.IsRequired ? ' *' : ''}` +
        `${o.length ? ` (${o.map((x) => x.Label).join(' / ')})` : ''}` +
        `${qq.ConditionalRule ? '  [conditional]' : ''}${qq.ValidationRule ? '  [validated]' : ''}`);
    }
  }
  for (const s of screens) {
    console.log(`    screen [${s.ScreenType}]${s.IsDefault ? ' (default)' : ''}: "${s.Title}"${s.MediaURL ? '  [image]' : ''}`);
  }

  check(pages.length >= 1, 'at least one page');
  check(questions.length >= 2, 'questions were created');
  check(questions.every((x) => !!x.PageID), 'every question is attached to a page');

  // ---- 5. The things Phase A added, which never existed before -----------------------
  section('5. Screens, logic and theme — the Phase A gaps');
  const welcome = screens.filter((s) => s.ScreenType === 'Welcome');
  const endings = screens.filter((s) => s.ScreenType === 'Ending');
  check(welcome.length <= 1, 'at most one welcome screen (filtered unique index)');
  check(welcome.length === 1, 'a welcome screen was authored');
  check(endings.length >= 1, 'at least one ending screen');
  check(endings.filter((e) => e.IsDefault).length === 1, `exactly one default ending (found ${endings.filter((e) => e.IsDefault).length})`);

  // Counted across questions, pages AND ending screens, not just questions. "Only ask page two of
  // in-person attendees" is most correctly expressed as a PAGE rule, and an assertion that only
  // looked at questions called a better answer a failure.
  const ruled = questions.filter((x) => x.ConditionalRule);
  const ruledPages = pages.filter((p) => p.ConditionalRule);
  const ruledScreens = screens.filter((s) => s.ConditionalRule);
  const totalRules = ruled.length + ruledPages.length + ruledScreens.length;
  check(totalRules >= 1,
    `conditional logic was authored (${ruled.length} question, ${ruledPages.length} page, ${ruledScreens.length} screen)`);
  // Every rule must resolve to a real question ON THIS FORM — the key→id substitution working.
  let danglingRefs = 0;
  const idSet = new Set(questions.map((x) => x.ID.toLowerCase()));
  for (const r of [...ruled, ...ruledPages, ...ruledScreens]) {
    const rule = JSON.parse(r.ConditionalRule);
    for (const c of [...(rule.show?.all ?? []), ...(rule.show?.any ?? [])]) {
      if (!c.questionId || !idSet.has(String(c.questionId).toLowerCase())) danglingRefs++;
      if (c.questionKey) danglingRefs++; // a key that survived substitution
    }
  }
  check(danglingRefs === 0, `every conditional rule resolves to a real question id (${danglingRefs} dangling)`);

  // Guarded: the style is best-effort, so StyleID can legitimately be null. Interpolating it
  // unguarded queried `ID='null'` and aborted the whole run with a GUID conversion error — hiding
  // the actual finding, which was that the style could not be created.
  const styles = form.StyleID
    ? await q('MJ_BizApps_Forms: Form Styles', `ID='${form.StyleID}'`, ['ID', 'Name', 'CSSVariables', 'DisplayRank'])
    : [];
  const style = styles[0];
  const tokens = JSON.parse(style?.CSSVariables || '{}');
  console.log(`  style "${style?.Name}" (rank ${style?.DisplayRank}) — ${Object.keys(tokens).length} token(s)`);
  for (const [k, v] of Object.entries(tokens)) console.log(`      ${k}: ${v}`);
  check(style?.DisplayRank === 0, 'style is per-form (rank 0), so the Design tab edits it in place');
  check(Object.keys(tokens).length > 0, 'the theme stage wrote tokens');
  check(Object.keys(tokens).every((k) => k.startsWith('--mjf-')), 'every token is in the --mjf-* vocabulary');

  // ---- 6. The single-shot route still works -----------------------------------------
  section('6. Single-shot route (no SessionID) — unchanged behaviour');
  const before = events.length;
  const p2 = { Params: [], ContextUser: user };
  const r2 = await runAuthoring('A three-question customer feedback form with an NPS score.', user.ID, p2, user, {
    inputMode: 'brief',
  });
  console.log(`  result: ${r2.ResultCode} — ${r2.Message}`);
  check(r2.Success, 'single-shot run succeeded', r2.Message);
  check(events.length === before, 'emitted zero progress events (no channel)');
  const f2 = p2.Params.find((p) => p.Name === 'FormID')?.Value;
  check(!!f2, 'single-shot produced a form');

  section(failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`);
  console.log(`generated forms: ${formId} , ${f2}`);
  await pool.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nSMOKE ABORTED:', e?.message ?? e);
  console.error(e?.stack?.split('\n').slice(1, 6).join('\n'));
  process.exit(1);
});
