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
import { LoadFormsActions, runAuthoring, runChatTurn, setFormsProgressPublisher } from '@mj-biz-apps/forms-actions';
// Side-effect import, exactly as MJAPI does it: the package installs the generated-image store at
// MODULE LOAD (index.ts:77), because MJAPI imports it for RESOLVER_PATHS without ever calling its
// init function. Importing a named symbol here would test a different wiring than production uses.
import '@mj-biz-apps/forms-server';

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
  // The same registration MJAPI performs at module load. Without it every image request degrades
  // with "no store configured", which is honest but proves nothing about the path.
  pass('provider up, Forms entities + actions registered, image store installed');

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

  // ---- 7. The chat, against the real assistant ------------------------------------
  section('7. Authoring chat — real model, real thread');

  /** One chat turn. Returns the params bag so outputs can be read. */
  const chat = async (message, inputs = {}) => {
    const p = { Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' })), ContextUser: user };
    const r = await runChatTurn(message, p, user);
    const get = (n) => p.Params.find((x) => x.Name === n)?.Value;
    return { r, get };
  };

  // (a) A question. Nothing should change.
  const asked = await chat('What text colour works well on a dark navy background? Keep it short.');
  console.log(`  Q: what text colour on navy?`);
  console.log(`  A: ${String(asked.get('Reply')).slice(0, 160).replace(/\n/g, ' ')}…`);
  check(asked.r.Success, 'a question is answered');
  check(asked.get('Action') === 'none', `a question changes nothing (action=${asked.get('Action')})`);
  check(String(asked.get('Reply')).length > 10, 'the answer has substance');
  const threadId = asked.get('ConversationID');
  check(!!threadId, 'a conversation thread was created');

  // (b) The thread persists and the assistant can see it.
  const followUp = await chat('And what about the buttons?', { ConversationID: threadId });
  check(followUp.get('ConversationID') === threadId, 'a follow-up stays in the same thread');
  console.log(`  Q: and the buttons?`);
  console.log(`  A: ${String(followUp.get('Reply')).slice(0, 160).replace(/\n/g, ' ')}…`);

  // Counts are RELATIVE, not absolute: the forms-list thread is keyed on `mj-forms:home` and is
  // deliberately reused, so a second run of this script joins the thread the first one left. An
  // `=== 2` here passed once and then failed forever, which is a fixture bug wearing a defect's hat.
  const stored = await q('MJ: Conversation Details', `ConversationID='${threadId}'`, ['Role', 'Message']);
  check(stored.length >= 4, `every turn is persisted (${stored.length} rows in this thread)`);
  const asked2 = stored.filter((t) => t.Message === 'And what about the buttons?');
  check(asked2.length >= 1 && asked2.at(-1).Role === 'User', 'this run\'s question was recorded verbatim');
  check(stored.filter((t) => t.Role === 'AI').length >= 2, 'answers were recorded');

  // (c) Asking for a form actually builds one.
  const built = await chat('Build me a short volunteer sign-up form: name, email, and which shift they want.');
  console.log(`  Q: build me a volunteer sign-up`);
  console.log(`  A: ${String(built.get('Reply')).slice(0, 160).replace(/\n/g, ' ')}…  [action=${built.get('Action')}]`);
  check(built.get('Action') === 'create', `asking for a form creates one (action=${built.get('Action')})`);
  check(!!built.get('FormID'), 'the new form id comes back so the client can open it');

  // (c2) THE THREAD FOLLOWS THE FORM. Asked for on the forms list, the exchange is re-filed onto
  // the form that came out of it — otherwise the author is carried into a builder whose chat panel
  // looks empty, and the conversation they were mid-way through reads as discarded.
  const builtThread = built.get('ConversationID');
  const [refiled] = await q('MJ: Conversations', `ID='${builtThread}'`, ['ID', 'ExternalID']);
  console.log(`     thread is now filed under ${refiled?.ExternalID}`);
  check(refiled?.ExternalID === `mj-forms:form:${built.get('FormID')}`,
    'the thread was re-filed onto the form it created',
    `expected mj-forms:form:${built.get('FormID')}, got ${refiled?.ExternalID}`);

  // And the builder's own lookup — the query the Angular panel runs — finds it there.
  const asBuilderSees = await q('MJ: Conversations',
    `UserID='${user.ID}' AND ExternalID='mj-forms:form:${built.get('FormID')}' AND IsArchived = 0`, ['ID']);
  check(asBuilderSees.length === 1, 'the builder finds that thread by the key it looks under');

  // (d) Restyling the form we just made.
  const chatFormId = built.get('FormID');
  if (chatFormId) {
    const styled = await chat('Make the buttons a deep forest green.', { FormID: chatFormId });
    console.log(`  Q: make the buttons forest green   [action=${styled.get('Action')}]`);
    const after = await q('MJ_BizApps_Forms: Form Styles',
      `ID IN (SELECT StyleID FROM __mj_BizAppsForms.Form WHERE ID='${chatFormId}')`,
      ['ID', 'CSSVariables']);
    const tokens = JSON.parse(after[0]?.CSSVariables || '{}');
    console.log(`     accent is now ${tokens['--mjf-accent']}`);
    check(styled.get('Action') === 'restyle', `asking to restyle restyles (action=${styled.get('Action')})`);
    check(tokens['--mjf-accent'] !== '#1b7fa8', 'the accent actually changed');
    // The house layout survives a chat restyle, exactly as it survives a generated theme.
    check(tokens['--mjf-btn-radius'] === '999px', 'the house corner radius survived the restyle');
    check(tokens['--mjf-title-align'] === 'center', 'the house title alignment survived the restyle');
  }

  // (e) A picture on the form's start screen — the capability the prompt used to deny having.
  if (chatFormId) {
    const before = await q('MJ_BizApps_Forms: Form Screens',
      `FormID='${chatFormId}' AND ScreenType='Welcome'`, ['ID', 'MediaURL']);
    const imaged = await chat('Add a photo of volunteers sorting boxes in a community hall to the start screen.',
      { FormID: chatFormId });
    console.log(`  Q: add a photo to the start screen   [action=${imaged.get('Action')}]`);
    console.log(`  A: ${String(imaged.get('Reply')).slice(0, 200).replace(/\n/g, ' ')}…`);
    check(imaged.get('Action') === 'image',
      `asking for a picture takes the image action (action=${imaged.get('Action')})`,
      String(imaged.get('Reply')).slice(0, 300));
    check(!/can(?:'|not|\u2019t)?\s*(?:not\s+)?(?:generate|add|make|create)\s+(?:an?\s+)?(?:image|picture|photo)/i
      .test(String(imaged.get('Reply'))),
      'the assistant no longer claims it cannot make images');
    if (before[0]) {
      const [after] = await q('MJ_BizApps_Forms: Form Screens', `ID='${before[0].ID}'`, ['ID', 'MediaURL']);
      console.log(`     start screen media: ${before[0].MediaURL ?? '(none)'} -> ${after?.MediaURL ?? '(none)'}`);
      check(!!after?.MediaURL && after.MediaURL !== before[0].MediaURL,
        'the picture landed on the start screen row',
        `MediaURL is still ${after?.MediaURL ?? 'null'} — reply was: ${String(imaged.get('Reply')).slice(0, 200)}`);
      check(imaged.get('ScreenID') === before[0].ID, 'the turn reports which screen it changed');
      check(String(imaged.get('ImageURL') ?? '').startsWith('http'), 'the turn reports the stored URL');
    } else {
      fail('the generated form has a welcome screen to put a picture on');
    }
  }

  // (f) STRUCTURAL EDITING — the thing the assistant refused twice in the transcript that
  //     prompted this work. Real model, real handles, real rows.
  if (chatFormId) {
    section('8. Structural editing — real handles, real rows');

    const before = await q('MJ_BizApps_Forms: Form Questions', `FormID='${chatFormId}'`, ['ID', 'Prompt', 'QuestionType', 'DisplayOrder']);
    console.log(`  form has ${before.length} question(s) to start`);

    const added = await chat('Add a 1-5 rating question asking how likely they are to recommend us.', { FormID: chatFormId });
    console.log(`  Q: add a rating question   [action=${added.get('Action')}]`);
    console.log(`  A: ${String(added.get('Reply')).slice(0, 220).replace(/\n/g, ' ')}…`);
    check(added.get('Action') === 'edit', `asking to add a question edits (action=${added.get('Action')})`,
      String(added.get('Reply')).slice(0, 300));

    const after = await q('MJ_BizApps_Forms: Form Questions', `FormID='${chatFormId}'`, ['ID', 'Prompt', 'QuestionType', 'DisplayOrder']);
    check(after.length === before.length + 1, `a question was actually added (${before.length} -> ${after.length})`);
    const rating = after.find((x) => !before.some((b) => b.ID === x.ID));
    console.log(`     new question: [${rating?.QuestionType}] ${rating?.Prompt}`);
    check(!!rating, 'the new row exists');
    check(/rating|opinionscale|nps/i.test(String(rating?.QuestionType)), `it is a rating-shaped type (${rating?.QuestionType})`);

    // DisplayOrder must stay unique WITHIN A PAGE — it is per page, not per form, so checking it
    // across the whole form both passes when it should not and fails when it should not.
    const withPages = await q('MJ_BizApps_Forms: Form Questions', `FormID='${chatFormId}'`, ['ID', 'PageID', 'DisplayOrder']);
    const byPage = new Map();
    for (const row of withPages) {
      byPage.set(row.PageID, [...(byPage.get(row.PageID) ?? []), row.DisplayOrder]);
    }
    let clashes = 0;
    for (const [pageId, orders] of byPage) {
      if (new Set(orders).size !== orders.length) {
        clashes++;
        console.log(`     page ${pageId}: ${orders.join(',')}`);
      }
    }
    check(clashes === 0, `display order is unique within every page (${byPage.size} page(s))`);

    // Rewording — the safe edit, and the one that must work on an answered question too.
    const reworded = await chat('Reword the email question to "Your email address".', { FormID: chatFormId });
    console.log(`  Q: reword the email question   [action=${reworded.get('Action')}]`);
    const afterReword = await q('MJ_BizApps_Forms: Form Questions', `FormID='${chatFormId}'`, ['ID', 'Prompt']);
    check(afterReword.some((x) => /your email address/i.test(String(x.Prompt))),
      'the reword landed on a real question',
      afterReword.map((x) => x.Prompt).join(' | '));

    // The capability the transcript was refused. It must not refuse now.
    check(!/can'?t (add|adjust|change)/i.test(String(added.get('Reply'))),
      'it no longer says it cannot add questions');
  }

  // (g) The form list and navigation.
  section('9. Knowing which forms exist');
  const listed = await chat('What forms do I have? Just name a few.');
  console.log(`  A: ${String(listed.get('Reply')).slice(0, 200).replace(/\n/g, ' ')}…`);
  check(listed.r.Success, 'it can answer what forms exist');
  check(!/only see the form you have open|cannot see/i.test(String(listed.get('Reply'))),
    'it no longer claims it can only see the open form');

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
