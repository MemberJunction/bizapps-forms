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
import { BASE } from './smoke-harness-env.mjs';
import { Metadata } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { sql, requireDbEnv } from '../../smoke/lib/sqlcmd.mjs';
import {
  DIST_ENTITY,
  INVITE_ENTITY,
  anyFormId,
  assertions,
  bootAndRun,
  deleteDistributions,
  loadDistribution,
  newLiveLink,
  readInvite,
  redeem,
} from './credential-smoke-lib.mjs';

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

const { check, eq, section, summary } = assertions();

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
    const controlLink = await newLiveLink(system, formId, 'repro114', 'control');
    created.push(controlLink.ID);
    const controlInvite = controlLink.MagicLinkInviteID;
    const controlToken = controlLink.PublicLinkToken;
    check('the new link was issued a credential', !!controlInvite && !!controlToken);
    check('and that token redeems', (await redeem(BASE, controlToken)).ok);

    const controlPaused = await loadDistribution(system, controlLink.ID);
    controlPaused.IsActive = false;
    check('System can save the pause', await controlPaused.Save());
    eq('the invite is Revoked', (await readInvite(system, controlInvite))?.Status, 'Revoked');
    const controlRedeem = await redeem(BASE, controlToken);
    check('and the token no longer redeems', !controlRedeem.ok, `status ${controlRedeem.status}`);
    eq('core refuses it as revoked', controlRedeem.errorCode, 'revoked');

    // ───────────────────────────── the defect: the identical close, performed by the author ─────
    section('bizapps-forms#114 — the same close, performed by a least-privilege author');
    const link = await newLiveLink(system, formId, 'repro114', 'author');
    created.push(link.ID);
    const inviteId = link.MagicLinkInviteID;
    const token = link.PublicLinkToken;
    check('the link starts out with a credential that redeems', !!token && (await redeem(BASE, token)).ok);

    const paused = await loadDistribution(author, link.ID);
    paused.IsActive = false;
    check('the author can save the pause — they own this link', await paused.Save());

    eq(
      'the invite is Revoked, exactly as it was for System',
      (await readInvite(system, inviteId))?.Status,
      'Revoked',
    );
    const authorRedeem = await redeem(BASE, token);
    check(
      'THE HEADLINE — the paused link\'s token no longer redeems',
      !authorRedeem.ok,
      `it still redeemed: status ${authorRedeem.status}`,
    );
    eq('and core refuses it as revoked', authorRedeem.errorCode, 'revoked');

    // ────────────────────────────────── the other half: can a least-privilege author publish? ───
    section('and the author can publish a link in the first place');
    const minted = await newLiveLink(author, formId, 'repro114', 'minted-by-author');
    created.push(minted.ID);
    check('the link they created holds a credential', !!minted.MagicLinkInviteID && !!minted.PublicLinkToken);
    check(
      'which redeems, so the form is actually reachable',
      minted.PublicLinkToken ? (await redeem(BASE, minted.PublicLinkToken)).ok : false,
    );
  } finally {
    await deleteDistributions(system, created);
  }
  return summary();
}

requireDbEnv('../apps/MJAPI/least-privilege-credential-smoke.mjs');
seed();
bootAndRun(run, {
  cleanup: () => {
    unseed();
    console.log('seeded principal removed');
  },
});
