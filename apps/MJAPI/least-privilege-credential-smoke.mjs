#!/usr/bin/env node
/**
 * End-to-end smoke for bizapps-forms#114: closing a share link revokes its credential even when
 * the person closing it is not a Developer.
 *
 * WHY THIS EXISTS. `pnpm run smoke:credentials` proves a revoked token stops redeeming — but every
 * one of its assertions runs as `UserCache.Instance.GetSystemUser()`, which holds Developer,
 * Integration and UI. So it proves revocation works WHEN PERMITTED, and nothing at all about which
 * principals permit it. The credential write lands on `MJ: Magic Link Invites`, a CORE entity whose
 * permissions no Forms seed touches: on this database only Developer and Integration hold Update.
 * A host that gives form authors anything narrower than Developer — which is the ordinary,
 * least-privilege production shape — gets a silent no-op, because provisioning is fail-soft by
 * design and must never fail an author's save.
 *
 * So the subject here is the PRINCIPAL, not the mechanism. It seeds the least-privilege author that
 * such a host would have (full rights on `MJ_BizApps_Forms: Form Distributions`, nothing on the
 * invite entity), drives the ordinary builder operations as that user, and asks core to redeem the
 * token afterwards. The System-user control beside each case is what makes a failure legible: when
 * the same operation succeeds as System and fails as the author, the difference is the principal.
 *
 * Seeded rows (role, user, grant, membership) carry fixed ids and are removed in a `finally`; a
 * crashed run is cleaned up by the next one, which deletes before it inserts.
 *
 * Lives beside `credential-lifecycle-smoke.mjs` for the same reason that one does: it has to run
 * inside the server process to reach the entity layer, so it must import
 * `@memberjunction/server-bootstrap`, which is installed only under `apps/MJAPI`.
 *
 * Usage (from the repo root):
 *   pnpm run smoke:credentials:least-privilege
 */
import 'dotenv/config';
// Must precede the server imports below — see smoke-harness-env.mjs for why a plain statement cannot do this.
import { PORT, BASE } from './smoke-harness-env.mjs';
import { createMJServer } from '@memberjunction/server-bootstrap';
import { RESOLVER_PATHS } from '@mj-biz-apps/forms-server';
import '@memberjunction/server-bootstrap/mj-class-registrations';
import { Metadata, RunView } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { sql, requireDbEnv } from '../../smoke/lib/sqlcmd.mjs';

const DIST_ENTITY = 'MJ_BizApps_Forms: Form Distributions';
const INVITE_ENTITY = 'MJ: Magic Link Invites';

/**
 * Fixed ids for the seeded principal, so a crashed run is repaired by the next one rather than
 * accumulating roles on a database fifteen workspace members share.
 */
const IDS = {
  role: '114C0DE0-0000-4114-9000-000000000001',
  user: '114C0DE0-0000-4114-9000-000000000002',
  distGrant: '114C0DE0-0000-4114-9000-000000000003',
  membership: '114C0DE0-0000-4114-9000-000000000004',
};
const AUTHOR_NAME = 'repro114.least.privilege.author@example.invalid';

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

/**
 * Remove the seeded principal. Runs before the seed as well as after the assertions, so a run that
 * died mid-way leaves nothing for the next one to trip over.
 */
function unseed() {
  sql(`
    -- Two things point back at the User row and must go first, or the whole batch dies on a
    -- foreign key and leaves the seeded principal behind: the audit rows every save writes, and
    -- any invite the author minted, plus the redemption rows this run's own assertions created
    -- against it. The invite outlives its distribution by design — deleting a link revokes the
    -- credential, it does not delete core's row — so these would otherwise be left on a shared
    -- database as exactly the orphans this feature exists to stop creating.
    DELETE FROM __mj.RecordChange WHERE UserID = '${IDS.user}';
    DELETE FROM __mj.MagicLinkRedemption
      WHERE InviteID IN (SELECT ID FROM __mj.MagicLinkInvite WHERE CreatedByUserID = '${IDS.user}');
    DELETE FROM __mj.MagicLinkInvite WHERE CreatedByUserID = '${IDS.user}';
    DELETE FROM __mj.UserRole WHERE ID = '${IDS.membership}';
    DELETE FROM __mj.EntityPermission WHERE ID = '${IDS.distGrant}';
    DELETE FROM __mj.UserRole WHERE UserID = '${IDS.user}';
    DELETE FROM __mj.[User] WHERE ID = '${IDS.user}';
    DELETE FROM __mj.EntityPermission WHERE RoleID = '${IDS.role}';
    DELETE FROM __mj.Role WHERE ID = '${IDS.role}';
  `);
}

/**
 * Create the author a least-privilege host would have: every right on the distribution they own,
 * and no row whatsoever on `MJ: Magic Link Invites`.
 *
 * Deliberately NOT granted read on the invite entity either. An operator deciding "may Alice
 * publish forms?" grants rights on forms; nothing about that decision mentions core's magic-link
 * table, which is exactly the point being demonstrated.
 *
 * Must run before the server boots — entity metadata and `UserCache` are both loaded at startup.
 */
function seed() {
  unseed();
  sql(`
    INSERT INTO __mj.Role (ID, Name, Description)
      VALUES ('${IDS.role}', 'Repro 114: Form Author',
              'Temporary least-privilege form author used by smoke:credentials:least-privilege. Delete on sight.');
    INSERT INTO __mj.[User] (ID, Name, Email, Type, IsActive, FirstName, LastName, LinkedRecordType)
      VALUES ('${IDS.user}', '${AUTHOR_NAME}', '${AUTHOR_NAME}', 'User', 1, 'Repro114', 'Author', 'None');
    INSERT INTO __mj.UserRole (ID, UserID, RoleID)
      VALUES ('${IDS.membership}', '${IDS.user}', '${IDS.role}');
    INSERT INTO __mj.EntityPermission (ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete, Type)
      SELECT '${IDS.distGrant}', e.ID, '${IDS.role}', 1, 1, 1, 1, 'Allow'
      FROM __mj.Entity e WHERE e.Name = '${DIST_ENTITY}';
  `);
}

/** Read an invite straight out of the database as System, whatever the author can or cannot see. */
async function readInvite(systemUser, id) {
  if (!id) return null;
  const r = await new RunView().RunView(
    { EntityName: INVITE_ENTITY, ExtraFilter: `ID='${id}'`, ResultType: 'simple' },
    systemUser,
  );
  if (!r.Success) throw new Error(`invite read failed: ${r.ErrorMessage}`);
  return r.Results?.[0] ?? null;
}

async function load(user, id) {
  const d = await new Metadata().GetEntityObject(DIST_ENTITY, user);
  if (!(await d.Load(id))) throw new Error(`could not load distribution ${id} as ${user.Name}`);
  return d;
}

/**
 * Ask core to redeem a raw token, exactly as `/f/:slug` does.
 *
 * A refusal is the interesting outcome, so a non-2xx body is parsed rather than thrown on — "it
 * failed somehow" would let a 500 masquerade as a successful revocation.
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

/** A live public link, created by `creator`, returned with the credential it was issued. */
async function newLiveLink(creator, formId, label) {
  const d = await new Metadata().GetEntityObject(DIST_ENTITY, creator);
  d.NewRecord();
  d.FormID = formId;
  d.Name = `repro114 ${label}`;
  d.Slug = `repro114-${label}-${Date.now().toString(36)}`;
  d.ChannelType = 'PublicLink';
  d.Status = 'Active';
  d.IsActive = true;
  d.ResponseCount = 0;
  d.CaptchaRequired = false;
  if (!(await d.Save())) throw new Error(`create failed: ${d.LatestResult?.CompleteMessage}`);
  return d;
}

async function run() {
  const system = UserCache.Instance.GetSystemUser();
  if (!system) throw new Error('no system user — cannot drive the entity layer');
  const author = UserCache.Users.find((u) => u.Name === AUTHOR_NAME);
  if (!author) throw new Error(`seeded author ${AUTHOR_NAME} is not in the user cache`);

  const roles = (u) => (u.UserRoles ?? []).map((r) => r.RoleName || r.RoleID).join(', ') || 'none';
  console.log(`System user: ${system.Name} (${roles(system)})`);
  console.log(`Author user: ${author.Name} (${roles(author)})`);

  const formId = await anyFormId(system);
  const created = [];

  try {
    // ── the premise: this author really can run the builder, and really cannot touch the invite ──
    section('the seeded author is a form author and nothing more');
    const invites = new Metadata().EntityByName(INVITE_ENTITY);
    const dists = new Metadata().EntityByName(DIST_ENTITY);
    check('may update the share links they own', dists.GetUserPermisions(author).CanUpdate);
    check(
      'may NOT update core magic-link invites',
      !invites.GetUserPermisions(author).CanUpdate,
      'the seeded role granted it — the reproduction is void',
    );
    check('System, by contrast, may', invites.GetUserPermisions(system).CanUpdate);

    // ───────────────────────────────────────── control: the same close, performed by System ─────
    section('control — System closes a link and the credential dies with it');
    const controlLink = await newLiveLink(system, formId, 'control');
    created.push(controlLink.ID);
    const controlInvite = controlLink.MagicLinkInviteID;
    const controlToken = controlLink.PublicLinkToken;
    check('the new link was issued a credential', !!controlInvite && !!controlToken);
    check('and that token redeems', (await redeem(controlToken)).ok);

    const controlPaused = await load(system, controlLink.ID);
    controlPaused.IsActive = false;
    check('System can save the pause', await controlPaused.Save());
    eq('the invite is Revoked', (await readInvite(system, controlInvite))?.Status, 'Revoked');
    const controlRedeem = await redeem(controlToken);
    check('and the token no longer redeems', !controlRedeem.ok, `status ${controlRedeem.status}`);
    eq('core refuses it as revoked', controlRedeem.errorCode, 'revoked');

    // ───────────────────────────── the defect: the identical close, performed by the author ─────
    section('bizapps-forms#114 — the same close, performed by a least-privilege author');
    const link = await newLiveLink(system, formId, 'author');
    created.push(link.ID);
    const inviteId = link.MagicLinkInviteID;
    const token = link.PublicLinkToken;
    check('the link starts out with a credential that redeems', !!token && (await redeem(token)).ok);

    const paused = await load(author, link.ID);
    paused.IsActive = false;
    check('the author can save the pause — they own this link', await paused.Save());

    eq(
      'the invite is Revoked, exactly as it was for System',
      (await readInvite(system, inviteId))?.Status,
      'Revoked',
    );
    const authorRedeem = await redeem(token);
    check(
      'THE HEADLINE — the paused link\'s token no longer redeems',
      !authorRedeem.ok,
      `it still redeemed: status ${authorRedeem.status}`,
    );
    eq('and core refuses it as revoked', authorRedeem.errorCode, 'revoked');

    // ────────────────────────────────── the other half: can a least-privilege author publish? ───
    section('and the author can publish a link in the first place');
    const minted = await newLiveLink(author, formId, 'minted-by-author');
    created.push(minted.ID);
    check('the link they created holds a credential', !!minted.MagicLinkInviteID && !!minted.PublicLinkToken);
    check(
      'which redeems, so the form is actually reachable',
      minted.PublicLinkToken ? (await redeem(minted.PublicLinkToken)).ok : false,
    );
  } finally {
    for (const id of created) {
      try {
        const d = await new Metadata().GetEntityObject(DIST_ENTITY, system);
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

requireDbEnv('../apps/MJAPI/least-privilege-credential-smoke.mjs');
seed();

createMJServer({
  resolverPaths: RESOLVER_PATHS,
  afterStart: async () => {
    let ok = false;
    try {
      ok = await run();
    } catch (e) {
      console.error('\nSMOKE THREW:', e);
    } finally {
      try {
        unseed();
        console.log('seeded principal removed');
      } catch (e) {
        console.error(`  cleanup: could not remove the seeded principal: ${e instanceof Error ? e.message : e}`);
      }
    }
    process.exit(ok ? 0 : 1);
  },
}).catch((e) => {
  console.error(e);
  try {
    unseed();
  } catch {
    /* the boot failure is the interesting error; a cleanup failure here would mask it */
  }
  process.exit(1);
});
