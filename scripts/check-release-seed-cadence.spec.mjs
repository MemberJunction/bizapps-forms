#!/usr/bin/env node
/**
 * Proves the cadence check FIRES.
 *
 * Same standard as its neighbours: this gate replaces nothing, but it guards a rule whose whole
 * failure mode is silence — a per-PR seed delta looks exactly like a consolidated one to every
 * other check in the repo, and to `git log`. Six of the cases below assert a FAILURE, and two of
 * those assert that an unanswerable question is reported as a problem rather than a pass.
 *
 * In-process against `findUnconsolidatedSeedDeltas(repoRoot, readState)`, whose second argument is
 * the git boundary. Stubbing it keeps the cases about the RULE; two cases at the end use real git
 * repositories, because the rule is worthless if `readSeedState` cannot actually read a tag.
 *
 * Plain Node rather than Vitest, matching the gates it sits beside.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findUnconsolidatedSeedDeltas, findUnshippedMetadataDrift, readReleaseState } from './check-release-seed-cadence.mjs';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(SCRIPTS_DIR, 'check-release-seed-cadence.mjs');

let failures = 0;
function check(name, condition, detail) {
    if (condition) {
        console.log(`  ✓ ${name}`);
    } else {
        console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
        failures++;
    }
}

/** A stubbed git boundary: what the tag holds, what the tree holds, what moved under metadata/. */
const state = (tag, released, current, metadataChanged = []) => () => ({ tag, released, current, metadataChanged });

const A = 'V202608081700__v0.8.x__Metadata_Sync.sql';
const B = 'V202608182130__v0.11.x__Metadata_Sync_Designer_Taxonomy.sql';
const C = 'V202608241800__v0.11.x__Metadata_Sync_OnSubmit_Params.sql';

console.log('release seed cadence:');

// 1. The steady state: everything in the tree already shipped.
{
    const r = findUnconsolidatedSeedDeltas('/x', state('v0.10.0', [A], [A]));
    check('nothing unreleased is a pass', r.problems.length === 0, JSON.stringify(r.problems));
}

// 2. THE release's own consolidated seed. Exactly what a good release looks like at this point.
{
    const r = findUnconsolidatedSeedDeltas('/x', state('v0.10.0', [A], [A, B]));
    check('ONE unreleased seed is a pass — that is the release seed', r.problems.length === 0);
}

// 3. The failure this file exists for.
{
    const r = findUnconsolidatedSeedDeltas('/x', state('v0.10.0', [A], [A, B, C]));
    check('TWO unreleased seeds fail', r.problems.length === 1);
    check('  …and the message names BOTH files', r.problems[0]?.includes(B) && r.problems[0]?.includes(C));
    check('  …and names the tag it compared against', r.problems[0]?.includes('v0.10.0'));
    check('  …and says none is append-only history yet', r.problems[0]?.includes('none has reached a host'));
    check('  …and reports both in `unreleased`', r.unreleased.length === 2);
}

// 4. A released seed is never counted, however many there are — deleting one is a DIFFERENT defect
//    and this check must not muddy it by reporting it here.
{
    const r = findUnconsolidatedSeedDeltas('/x', state('v0.10.0', [A, B, C], [A, B, C]));
    check('three RELEASED seeds are not a cadence problem', r.problems.length === 0);
}

// 5. An unanswerable question is a problem, not a pass — the failure mode CHECK 1 died of.
{
    const r = findUnconsolidatedSeedDeltas('/x', state(null, [], []));
    check('no release tag is reported as a PROBLEM, not a pass', r.problems.length === 1);
    check('  …and says why it cannot answer', r.problems[0]?.includes('no v* release tag'));
}

// 6. Same for git blowing up: never swallowed, and the reason survives.
{
    const boom = () => { throw new Error('not a git repository'); };
    const r = findUnconsolidatedSeedDeltas('/x', boom);
    check('a git failure is a PROBLEM, not a pass', r.problems.length === 1);
    check('  …and keeps the reason', r.problems[0]?.includes('not a git repository'));
}

// 7. The pattern is the one migrations/ actually uses, case-insensitively.
{
    const r = findUnconsolidatedSeedDeltas('/x', state('v1.0.0', [], ['V1__metadata_sync_lower.sql', 'V2__METADATA_SYNC_UPPER.sql']));
    check('matches Metadata_Sync case-insensitively', r.problems.length === 1 && r.unreleased.length === 2);
}

// 8. Ordinary DDL is not a seed. `V202608301200__Rename_Signature_Question_To_Doodle.sql` is the
//    real example: a CHECK-constraint rename that shipped in the same PR as a seed delta.
{
    const r = findUnconsolidatedSeedDeltas('/x', state('v0.10.0', [A], [A, 'V202608301200__v0.12.x__Rename_Signature_Question_To_Doodle.sql', 'V9__Element_Parity_Metadata_Backfill.sql']));
    check('non-seed migrations are ignored, including CodeGen metadata backfills', r.problems.length === 0, JSON.stringify(r.unreleased));
}

// ---------------------------------------------------------------------------------------------
// DRIFT: metadata/ moved since the last release, so a seed is OWED. The half coverage cannot see.
// ---------------------------------------------------------------------------------------------

const REC = 'metadata/templates/templates/forms-form-designer.template.md';

// 9. The Signature/Doodle shape, which is the reason this rule exists: a record file EDITED since
//    the last release, its id unchanged and already shipped, and no new seed carrying the edit.
//    Coverage is green over exactly this. Drift is not.
{
    const r = findUnshippedMetadataDrift('/x', state('v0.10.0', [A], [A], [REC]));
    check('metadata moved with NO new seed fails', r.problems.length === 1);
    check('  …and names the changed file', r.problems[0]?.includes(REC));
    check('  …and names the tag compared against', r.problems[0]?.includes('v0.10.0'));
    // The message wraps, so assert on a phrase that does not straddle the line break.
    check('  …and says why coverage cannot catch it', (r.problems[0] ?? '').includes('Coverage cannot catch this'));
}

// 10. The same drift WITH the release's seed present is a correct release, not a finding.
{
    const r = findUnshippedMetadataDrift('/x', state('v0.10.0', [A], [A, B], [REC]));
    check('metadata moved WITH a new seed is a pass', r.problems.length === 0, JSON.stringify(r.problems));
}

// 11. A release that changed no metadata owes no seed. Demanding one would teach people to
//     generate empty migrations, which is worse than the gap.
{
    const r = findUnshippedMetadataDrift('/x', state('v0.10.0', [A], [A], []));
    check('no metadata change and no seed is a pass', r.problems.length === 0);
}

// 12. Documentation is not a record. Gating on README would teach people that the way to quiet
//     this check is to stop writing documentation.
{
    const r = findUnshippedMetadataDrift('/x', state('v0.10.0', [A], [A], ['metadata/README.md']));
    check('a README-only change owes no seed', r.problems.length === 0, JSON.stringify(r.changed));
}

// 13. Push by-products are not records — the same two directories coverage ignores.
{
    const r = findUnshippedMetadataDrift('/x', state('v0.10.0', [A], [A], [
        'metadata/sql_logging/2026-08-31.sql',
        'metadata/actions/.backups/.actions.json.bak',
    ]));
    check('sql_logging and .backups changes owe no seed', r.problems.length === 0, JSON.stringify(r.changed));
}

// 14. Unanswerable is a problem, not a pass — the same standard the cadence rule holds.
{
    const noTag = findUnshippedMetadataDrift('/x', state(null, [], [], []));
    check('drift: no release tag is a PROBLEM, not a pass', noTag.problems.length === 1);
    const boom = findUnshippedMetadataDrift('/x', () => { throw new Error('detached HEAD'); });
    check('drift: a git failure is a PROBLEM, not a pass', boom.problems.length === 1);
    check('  …and keeps the reason', boom.problems[0]?.includes('detached HEAD'));
}

/** A throwaway git repo with a tag, so `readSeedState` is exercised for real. */
function withGitRepo(build, assert) {
    const root = mkdtempSync(join(tmpdir(), 'seed-cadence-'));
    try {
        const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
        git('init', '-q');
        git('config', 'user.email', 'spec@example.com');
        git('config', 'user.name', 'spec');
        mkdirSync(join(root, 'migrations'), { recursive: true });
        build(root, git);
        assert(root);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

// 15. Real git: a seed added AFTER the tag is unreleased; one in the tag is not.
withGitRepo(
    (root, git) => {
        writeFileSync(join(root, 'migrations', A), '-- released\n');
        git('add', '-A'); git('commit', '-qm', 'released seed'); git('tag', 'v0.10.0');
        writeFileSync(join(root, 'migrations', B), '-- delta 1\n');
        writeFileSync(join(root, 'migrations', C), '-- delta 2\n');
        git('add', '-A'); git('commit', '-qm', 'two deltas');
    },
    (root) => {
        const s = readReleaseState(root);
        check('real git: resolves the newest tag', s.tag === 'v0.10.0', s.tag);
        check('real git: released seed read from the tag', s.released.length === 1 && s.released[0] === A);
        const r = findUnconsolidatedSeedDeltas(root);
        check('real git: the two post-tag deltas fail the check', r.problems.length === 1 && r.unreleased.length === 2, JSON.stringify(r.unreleased));
        const d = findUnshippedMetadataDrift(root);
        check('real git: drift passes when seeds exist', d.problems.length === 0, JSON.stringify(d.problems));
    },
);

// 16. Real git: tags sort by version, not lexically — v0.10.0 is newer than v0.9.0.
withGitRepo(
    (root, git) => {
        writeFileSync(join(root, 'migrations', A), '-- old\n');
        git('add', '-A'); git('commit', '-qm', 'v9'); git('tag', 'v0.9.0');
        writeFileSync(join(root, 'migrations', B), '-- newer\n');
        git('add', '-A'); git('commit', '-qm', 'v10'); git('tag', 'v0.10.0');
    },
    (root) => {
        const s = readReleaseState(root);
        check('real git: v0.10.0 beats v0.9.0 (version order, not lexical)', s.tag === 'v0.10.0', s.tag);
        check('real git: both seeds count as released at that tag', s.released.length === 2);
    },
);

// ---------------------------------------------------------------------------------------------
// Cases 18-20 were written RED, from probing, and each names a defect the earlier cases missed.
// ---------------------------------------------------------------------------------------------

// 18. A PRERELEASE MUST NOT OUTRANK ITS OWN FINAL RELEASE. Semver is explicit: 0.10.0-rc.1 < 0.10.0.
//     Picking the rc as the baseline makes everything released in the final look unreleased, so the
//     gate cries wolf at exactly the release that is doing the right thing — and a gate that cries
//     wolf is one somebody switches off. The MJ family tags prereleases (`6.1.0-edge.2`), so this
//     is a shape this repo will meet, not a hypothetical.
withGitRepo(
    (root, git) => {
        writeFileSync(join(root, 'migrations', A), '-- released\n');
        git('add', '-A'); git('commit', '-qm', 'release');
        git('tag', 'v0.10.0-rc.1');
        git('tag', 'v0.10.0');
    },
    (root) => {
        const s = readReleaseState(root);
        check('a prerelease does NOT outrank its own final release', s.tag === 'v0.10.0', `picked ${s.tag}`);
    },
);

// 19. THE WORKING TREE IS WHAT THE ENGINEER IS LOOKING AT. migrations/README.md step 6 says to move
//     the generated seed into migrations/ and run these checks — before committing. Reading HEAD
//     instead of the disk shows them red for the seed they just wrote. The coverage check running
//     in the SAME publish.yml step reads the filesystem, so the two would disagree about what
//     "shipped" means in the one moment both are consulted.
withGitRepo(
    (root, git) => {
        writeFileSync(join(root, 'migrations', A), '-- released\n');
        git('add', '-A'); git('commit', '-qm', 'release'); git('tag', 'v0.10.0');
        // The release seed, written but not yet committed — exactly the README's step 6 state.
        writeFileSync(join(root, 'migrations', B), '-- the consolidated release seed\n');
    },
    (root) => {
        const s = readReleaseState(root);
        check('an uncommitted seed on disk counts as present', s.current.includes(B), JSON.stringify(s.current));
    },
);

// 20. `.mj-sync.json` IS NOT A RECORD FILE. It carries the entity name and push options; editing it
//     creates nothing and so owes no seed. `check-release-seed-coverage.mjs` already excludes it by
//     name when collecting records, and two checks in the same step must not disagree about what a
//     record is.
{
    const r = findUnshippedMetadataDrift('/x', state('v0.10.0', [A], [A], ['metadata/actions/.mj-sync.json']));
    check('a .mj-sync.json-only change owes no seed', r.problems.length === 0, JSON.stringify(r.changed));
}

// 17. The CLI is what CI reads: exit code and report text.
{
    let code = 0, out = '';
    try {
        out = execFileSync('node', [SCRIPT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
        code = error.status;
        out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    check('the CLI runs on this repository and reports a verdict', code === 0 || code === 1, `exit ${code}`);
    check('  …and says which rule it applied', /cadence/i.test(out), out.slice(0, 200));
}

if (failures > 0) {
    console.error(`\n${failures} cadence self-test(s) FAILED.`);
    process.exit(1);
}
console.log('\nAll release-seed-cadence self-tests passed.');
