#!/usr/bin/env node
/**
 * Does the credential backfill (`V202608302210`) leave every reopenable link reopenable?
 *
 * A code review of PR #109 found a population the migration walked past: a paused link whose
 * invite had ended `Consumed` (core flips an invite to that status on its last permitted use).
 * Step 1 revokes only `Active` invites, and step 2 cleared only rows whose invite was `Revoked`, so
 * such a link kept both credential columns. After the upgrade, reopening it reads as `current` —
 * both halves present, link live — and nothing ever re-mints: a permanently dead link the builder
 * badges as Live. The fix is one predicate; this is the test that goes red without it.
 *
 * HOW IT RUNS THE MIGRATION. The statements are read from the shipped file and run VERBATIM —
 * placeholders substituted the way `mj migrate` substitutes them, `GO` separators dropped because
 * they are sqlcmd's, not SQL's — against fixture rows, inside one transaction that is ALWAYS rolled
 * back. Nothing this script does survives it, including on the rows it did not create: the
 * migration's UPDATEs are not scoped to the fixtures, so any real row they would touch is touched
 * and then undone. That is the point of running the file rather than a copy with the fixture ids
 * spliced into its WHERE clauses — a fixture that reproduces the thing under test is not a test of
 * it (`.claude/rules/testing.md`).
 *
 * Fixed ids, so a run that died before its ROLLBACK (the connection drop rolls it back anyway)
 * cannot leave anything for the next one to trip over.
 *
 * Usage (from the repo root):
 *   set -a && . ./.env && set +a && node smoke/backfill-path.mjs
 */
import { readFileSync } from 'node:fs';
import { sql, requireDbEnv } from './lib/sqlcmd.mjs';

requireDbEnv('backfill-path.mjs');

const MIGRATION = 'migrations/V202608302210__v0.12.x__Revoke_Credentials_Of_Retired_Links.sql';
const FORMS = '__mj_BizAppsForms';
const MJ = '__mj';

/** One fixture per population the migration must treat differently. */
const CASES = [
  {
    label: 'paused-active',
    why: 'a paused link holding a live credential: revoke it and clear the pair',
    dist: { id: 'B4CF111D-0000-4104-9000-000000000001', status: 'Closed', isActive: 1 },
    invite: { id: 'B4CF111D-0000-4104-9000-000000000011', status: 'Active' },
    expect: { inviteId: 'NULL', token: 'NULL', inviteStatus: 'Revoked' },
  },
  {
    label: 'paused-consumed',
    why: 'a paused link whose invite ended Consumed: the pair must clear so a reopen re-mints',
    dist: { id: 'B4CF111D-0000-4104-9000-000000000002', status: 'Active', isActive: 0 },
    invite: { id: 'B4CF111D-0000-4104-9000-000000000012', status: 'Consumed' },
    expect: { inviteId: 'NULL', token: 'NULL', inviteStatus: 'Consumed' },
  },
  {
    label: 'live-revoked',
    why: "an operator's deliberate kill on a LIVE link: leave it alone, clearing would revive it",
    dist: { id: 'B4CF111D-0000-4104-9000-000000000003', status: 'Active', isActive: 1 },
    invite: { id: 'B4CF111D-0000-4104-9000-000000000013', status: 'Revoked' },
    expect: { inviteId: 'B4CF111D-0000-4104-9000-000000000013', token: 'tok-live-revoked', inviteStatus: 'Revoked' },
  },
  {
    label: 'paused-not-ours',
    why: "a paused row pointing at ANOTHER link's live invite: nothing proves it is this link's",
    dist: { id: 'B4CF111D-0000-4104-9000-000000000004', status: 'Closed', isActive: 1 },
    invite: { id: 'B4CF111D-0000-4104-9000-000000000014', status: 'Active', resourceId: 'B4CF111D-0000-4104-9000-000000000003' },
    expect: { inviteId: 'B4CF111D-0000-4104-9000-000000000014', token: 'tok-paused-not-ours', inviteStatus: 'Active' },
  },
];

function migrationBody() {
  return readFileSync(MIGRATION, 'utf8')
    .replace(/\$\{flyway:defaultSchema\}/g, FORMS)
    .replace(/\$\{mjSchema\}/g, MJ)
    .replace(/^\s*GO\s*$/gim, '');
}

function fixtureSql() {
  return CASES.map(({ label, dist, invite }) => `
    INSERT INTO ${MJ}.MagicLinkInvite
      (ID, TokenHash, ApplicationID, RoleID, ExpiresAt, MaxUses, UseCount, CreatedByUserID, Status,
       IdentityMode, Kind, ResourceID)
    SELECT '${invite.id}', 'hash-${label}', (SELECT TOP 1 ID FROM ${MJ}.[Application]),
           (SELECT TOP 1 ID FROM ${MJ}.Role), '9999-12-31', 1000000, 0, (SELECT TOP 1 ID FROM ${MJ}.[User]),
           '${invite.status}', 'anonymous', 'resource-share', '${invite.resourceId ?? dist.id}';
    INSERT INTO ${FORMS}.FormDistribution
      (ID, FormID, Name, Slug, ChannelType, Status, IsActive, ResponseCount, CaptchaRequired,
       MagicLinkInviteID, PublicLinkToken)
    SELECT '${dist.id}', (SELECT TOP 1 ID FROM ${FORMS}.Form), 'backfill smoke ${label}',
           'backfill-smoke-${label}', 'PublicLink', '${dist.status}', ${dist.isActive}, 0, 0,
           '${invite.id}', 'tok-${label}';`).join('\n');
}

function readbackSql() {
  return `
    SELECT d.Slug + '|' + ISNULL(CAST(d.MagicLinkInviteID AS nvarchar(50)), 'NULL') + '|' +
           ISNULL(d.PublicLinkToken, 'NULL') + '|' + i.Status
    FROM ${FORMS}.FormDistribution d
    INNER JOIN ${MJ}.MagicLinkInvite i ON i.ID IN (${CASES.map((c) => `'${c.invite.id}'`).join(',')})
      AND i.ID = CASE d.Slug ${CASES.map((c) => `WHEN 'backfill-smoke-${c.label}' THEN '${c.invite.id}'`).join(' ')} END
    WHERE d.ID IN (${CASES.map((c) => `'${c.dist.id}'`).join(',')})
    ORDER BY d.Slug;`;
}

const out = sql(`
  BEGIN TRAN;
  ${fixtureSql()}
  ${migrationBody()}
  ${readbackSql()}
  ROLLBACK;
`);

const rows = new Map(
  out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [slug, inviteId, token, inviteStatus] = line.split('|');
      return [slug.replace('backfill-smoke-', ''), { inviteId, token, inviteStatus }];
    }),
);

let failed = 0;
for (const c of CASES) {
  const got = rows.get(c.label);
  const ok =
    got &&
    got.inviteId.toUpperCase() === c.expect.inviteId.toUpperCase() &&
    got.token === c.expect.token &&
    got.inviteStatus === c.expect.inviteStatus;
  if (ok) {
    console.log(`  ok    ${c.label} — ${c.why}`);
  } else {
    failed++;
    console.error(`  FAIL  ${c.label} — ${c.why}\n          expected ${JSON.stringify(c.expect)}\n          got      ${JSON.stringify(got ?? null)}`);
  }
}
console.log(`\n${CASES.length - failed} passed, ${failed} failed (every write rolled back)`);
process.exit(failed ? 1 : 0);
