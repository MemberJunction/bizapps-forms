#!/usr/bin/env node
/**
 * End-to-end smoke for bizapps-forms#104: a share link's credential dies with the link, and a
 * reissue rotates it without moving the URL.
 *
 * WHY THIS EXISTS, when the unit suites already cover the same invariants thoroughly.
 * Every server-side test of this feature mocks away the one thing the feature IS. The runner
 * specs hand `runProvisioning` a fake minter; `MagicLinkInviteMinter.spec.ts` mocks `Metadata`
 * and `RunView`. Both are the right shape for what they test — the decision table and the write
 * verdicts — and between them they establish that the code asks for a revocation. Neither can
 * establish the claim the whole change is FOR:
 *
 *     a token that has been revoked no longer redeems.
 *
 * That sentence is true only if `MagicLinkInvite.Status='Revoked'` is genuinely what MJ core's
 * redeem path refuses on, if our write actually lands on the row core reads, and if the two agree
 * about which invite belongs to which distribution. Those are facts about core's SQL, our entity
 * layer and a live database at once — exactly the class `.claude/rules/testing.md` says the unit
 * suites here cannot reach. A code review of PR #109 found that no test in the repo, automated or
 * manual, ever redeemed a real token after a real revoke. This is that test.
 *
 * It runs IN PROCESS rather than over HTTP for the state changes, because the subject is what a
 * `Save()` does: the real `FormDistributionEntityServer` hook, the real minter, real
 * `__mj.MagicLinkInvite` rows. The redemptions go over HTTP against this same booted server,
 * because that is the surface a respondent actually reaches.
 *
 * Cleans up after itself — every distribution it creates is deleted in a `finally`, and the
 * deletion is itself one of the assertions.
 *
 * WHY IT LIVES HERE and not in `smoke/` with its siblings. Every other smoke script talks to an
 * already-running harness over HTTP and sqlcmd, so it needs no dependencies and sits at the repo
 * root. This one has to run INSIDE the server process to reach the entity layer, which means
 * importing `@memberjunction/server-bootstrap` — and that package is installed only under
 * `apps/MJAPI`, because the harness is the only thing in this repo that boots MJ. Node resolves
 * bare specifiers from the importing FILE's location, not the working directory, so a copy in
 * `smoke/` cannot load it however it is invoked. It belongs next to the process it runs in.
 *
 * Usage (from the repo root):
 *   pnpm run smoke:credentials
 */
import 'dotenv/config';
import { createMJServer } from '@memberjunction/server-bootstrap';
import { RESOLVER_PATHS } from '@mj-biz-apps/forms-server';
import '@memberjunction/server-bootstrap/mj-class-registrations';
import { Metadata, RunView } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';

const DIST_ENTITY = 'MJ_BizApps_Forms: Form Distributions';
const INVITE_ENTITY = 'MJ: Magic Link Invites';
const PORT = process.env.GRAPHQL_PORT || '4141';
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
const failures = [];

const check = (name, ok, detail = '') => {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.error(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`);
  }
};
const eq = (name, actual, expected) =>
  check(name, String(actual) === String(expected), `expected ${expected}, got ${actual}`);
const section = (m) => console.log(`\n--- ${m} ---`);

/** Read an invite straight out of the database, bypassing any in-memory entity state. */
async function readInvite(user, id) {
  if (!id) return null;
  const r = await new RunView().RunView(
    { EntityName: INVITE_ENTITY, ExtraFilter: `ID='${id}'`, ResultType: 'simple' },
    user,
  );
  if (!r.Success) throw new Error(`invite read failed: ${r.ErrorMessage}`);
  return r.Results?.[0] ?? null;
}

async function reload(user, id) {
  const d = await new Metadata().GetEntityObject(DIST_ENTITY, user);
  if (!(await d.Load(id))) throw new Error(`could not reload distribution ${id}`);
  return d;
}

/**
 * Ask core to redeem a raw token, exactly as `/f/:slug` does.
 *
 * Returns `{ ok, errorCode }`. A refusal is the interesting outcome for most of this file, so the
 * non-2xx body is parsed rather than thrown on — "it failed somehow" would let a 500 masquerade
 * as a successful revocation, which is the one mistake that would make this whole script lie.
 */
async function redeem(rawToken) {
  const res = await fetch(`${BASE}/magic-link/redeem?format=json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: rawToken }),
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  return {
    ok: res.ok && !!(body.token || body.accessToken || body.jwt),
    status: res.status,
    errorCode: body.errorCode ?? body.error ?? null,
  };
}

/** A form to hang test distributions off — whatever this database happens to carry. */
async function anyFormId(user) {
  const r = await new RunView().RunView(
    { EntityName: 'MJ_BizApps_Forms: Forms', ResultType: 'simple', Fields: ['ID'], MaxRows: 1 },
    user,
  );
  if (!r.Success || !r.Results?.length) {
    throw new Error(`no Form rows to test against: ${r.ErrorMessage ?? 'empty'}`);
  }
  return r.Results[0].ID;
}

async function newLiveLink(user, formId, label) {
  const d = await new Metadata().GetEntityObject(DIST_ENTITY, user);
  d.NewRecord();
  d.FormID = formId;
  d.Name = `smoke104 ${label}`;
  d.Slug = `smoke104-${label}-${Date.now().toString(36)}`;
  d.ChannelType = 'PublicLink';
  d.Status = 'Active';
  d.IsActive = true;
  d.ResponseCount = 0;
  d.CaptchaRequired = false;
  if (!(await d.Save())) throw new Error(`create failed: ${d.LatestResult?.CompleteMessage}`);
  return d;
}

async function run() {
  const user = UserCache.Instance.GetSystemUser();
  if (!user) throw new Error('no system user — cannot drive the entity layer');
  console.log(`Context user: ${user.Name}`);
  const formId = await anyFormId(user);
  const created = [];

  try {
    // ─────────────────────────────────────────────── a live link holds one live credential
    section('a new live public link is issued a credential that redeems');
    const dist = await newLiveLink(user, formId, 'main');
    created.push(dist.ID);
    const slug = dist.Slug;

    let d = await reload(user, dist.ID);
    const token1 = d.PublicLinkToken;
    const invite1 = d.MagicLinkInviteID;
    check('a raw token was written', !!token1);
    check('an invite id was written', !!invite1);
    eq('the invite is scoped to this distribution', (await readInvite(user, invite1))?.ResourceID, dist.ID);
    eq('the invite is Active', (await readInvite(user, invite1))?.Status, 'Active');

    const r1 = await redeem(token1);
    check('the freshly minted token redeems', r1.ok, `status ${r1.status}, code ${r1.errorCode}`);

    const page = await fetch(`${BASE}/f/${slug}`);
    const html = await page.text();
    check('/f/:slug serves the respondent page', page.status === 200, `status ${page.status}`);
    check('and bakes a session token into it', /data-token="[^"]+"/.test(html));

    // ───────────────────────────────────────────── THE HEADLINE: pausing kills the credential
    section('pausing the link revokes the credential — the claim #104 is about');
    d = await reload(user, dist.ID);
    d.IsActive = false;
    if (!(await d.Save())) throw new Error(`pause failed: ${d.LatestResult?.CompleteMessage}`);

    d = await reload(user, dist.ID);
    eq('the invite id is cleared from the record', d.MagicLinkInviteID, 'null');
    eq('the raw token is cleared from the record', d.PublicLinkToken, 'null');
    eq('the invite row is Revoked', (await readInvite(user, invite1))?.Status, 'Revoked');

    // The whole point. Everything above could hold with a token that still redeemed.
    const r2 = await redeem(token1);
    check('the old token NO LONGER REDEEMS', !r2.ok, `it still redeemed: status ${r2.status}`);
    eq('and core refuses it as revoked', r2.errorCode, 'revoked');

    // ──────────────────────────────────────────────── reopening issues a fresh one, same URL
    section('reopening issues a NEW credential at the SAME web address');
    d = await reload(user, dist.ID);
    d.IsActive = true;
    d.Status = 'Active';
    if (!(await d.Save())) throw new Error(`reopen failed: ${d.LatestResult?.CompleteMessage}`);

    d = await reload(user, dist.ID);
    const token2 = d.PublicLinkToken;
    check('a new token was issued', !!token2 && token2 !== token1);
    eq('the slug is unchanged', d.Slug, slug);
    check('the new token redeems', (await redeem(token2)).ok);
    check('the old token is still dead', !(await redeem(token1)).ok);

    // ───────────────────────────────────────────────────── reissue rotates without moving
    section('clearing the token is a reissue request — rotate, keep the URL');
    const invite2 = d.MagicLinkInviteID;
    d.PublicLinkToken = null;
    if (!(await d.Save())) throw new Error(`reissue failed: ${d.LatestResult?.CompleteMessage}`);

    d = await reload(user, dist.ID);
    const token3 = d.PublicLinkToken;
    check('a third token was issued', !!token3 && token3 !== token2);
    check('pointing at a different invite', d.MagicLinkInviteID && d.MagicLinkInviteID !== invite2);
    eq('the slug STILL has not moved', d.Slug, slug);
    eq('the replaced invite is Revoked', (await readInvite(user, invite2))?.Status, 'Revoked');
    check('the replaced token no longer redeems', !(await redeem(token2)).ok);
    check('the new token does', (await redeem(token3)).ok);

    // ───────────────────────────────────── a client cannot install or steal a credential
    section('the credential columns are server-owned');
    const other = await newLiveLink(user, formId, 'other');
    created.push(other.ID);
    const otherInvite = (await reload(user, other.ID)).MagicLinkInviteID;

    d = await reload(user, dist.ID);
    d.MagicLinkInviteID = otherInvite; // a stale tab, an import, or a hand-written mutation
    await d.Save();
    d = await reload(user, dist.ID);
    check('a client write of MagicLinkInviteID is refused', d.MagicLinkInviteID !== otherInvite);
    eq("and the other link's invite is untouched", (await readInvite(user, otherInvite))?.Status, 'Active');
    check("the other link's token still redeems", (await reload(user, other.ID)).PublicLinkToken
      ? (await redeem((await reload(user, other.ID)).PublicLinkToken)).ok
      : false);

    // ───────────────────────────────────────────────────────── deleting takes it with it
    section('deleting a link withdraws its credential too');
    const doomed = await newLiveLink(user, formId, 'doomed');
    const doomedInvite = (await reload(user, doomed.ID)).MagicLinkInviteID;
    const doomedToken = (await reload(user, doomed.ID)).PublicLinkToken;
    check('the doomed link redeems before deletion', (await redeem(doomedToken)).ok);

    const dd = await reload(user, doomed.ID);
    if (!(await dd.Delete())) {
      created.push(doomed.ID);
      throw new Error(`delete failed: ${dd.LatestResult?.CompleteMessage}`);
    }
    eq('its invite is Revoked after the delete', (await readInvite(user, doomedInvite))?.Status, 'Revoked');
    check('and its token no longer redeems', !(await redeem(doomedToken)).ok);
  } finally {
    for (const id of created) {
      try {
        const d = await new Metadata().GetEntityObject(DIST_ENTITY, user);
        if (await d.Load(id)) await d.Delete();
      } catch (e) {
        console.error(`  cleanup: could not delete ${id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(`  - ${f}`));
  }
  return failed === 0;
}

createMJServer({
  resolverPaths: RESOLVER_PATHS,
  afterStart: async () => {
    let ok = false;
    try {
      ok = await run();
    } catch (e) {
      console.error('\nSMOKE THREW:', e);
    }
    process.exit(ok ? 0 : 1);
  },
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
