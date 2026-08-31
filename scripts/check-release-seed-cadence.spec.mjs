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
import { findUnconsolidatedSeedDeltas, readMigrationState } from './check-release-seed-cadence.mjs';

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

/** A stubbed git boundary: which migration files the tag holds, and which the tree holds. */
const state = (tag, released, current) => () => ({ tag, released, current });

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

// 9. Real git: a seed added AFTER the tag is unreleased; one in the tag is not.
withGitRepo(
    (root, git) => {
        writeFileSync(join(root, 'migrations', A), '-- released\n');
        git('add', '-A'); git('commit', '-qm', 'released seed'); git('tag', 'v0.10.0');
        writeFileSync(join(root, 'migrations', B), '-- delta 1\n');
        writeFileSync(join(root, 'migrations', C), '-- delta 2\n');
        git('add', '-A'); git('commit', '-qm', 'two deltas');
    },
    (root) => {
        const s = readMigrationState(root);
        check('real git: resolves the newest tag', s.tag === 'v0.10.0', s.tag);
        check('real git: released seed read from the tag', s.released.length === 1 && s.released[0] === A);
        const r = findUnconsolidatedSeedDeltas(root);
        check('real git: the two post-tag deltas fail the check', r.problems.length === 1 && r.unreleased.length === 2, JSON.stringify(r.unreleased));
    },
);

// 10. Real git: tags sort by version, not lexically — v0.10.0 is newer than v0.9.0.
withGitRepo(
    (root, git) => {
        writeFileSync(join(root, 'migrations', A), '-- old\n');
        git('add', '-A'); git('commit', '-qm', 'v9'); git('tag', 'v0.9.0');
        writeFileSync(join(root, 'migrations', B), '-- newer\n');
        git('add', '-A'); git('commit', '-qm', 'v10'); git('tag', 'v0.10.0');
    },
    (root) => {
        const s = readMigrationState(root);
        check('real git: v0.10.0 beats v0.9.0 (version order, not lexical)', s.tag === 'v0.10.0', s.tag);
        check('real git: both seeds count as released at that tag', s.released.length === 2);
    },
);

// 11. The CLI is what CI reads: exit code and report text.
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
