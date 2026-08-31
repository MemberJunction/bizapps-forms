#!/usr/bin/env node
/**
 * Proves the release-readiness check FIRES.
 *
 * The check it covers replaced one that passed while asserting something false (#105), so "it went
 * green" is not evidence of anything until something has watched it go red. Every case below builds
 * a throwaway repo, runs the real script against it as a child process, and asserts on the exit code
 * and the message — the script is a CLI, and a spec that imported its internals would test a
 * different thing than the one CI runs.
 *
 * Plain Node rather than Vitest, matching the gate it sits beside: the script is stdlib-only so it
 * can run without `npm ci`, and its test must not reintroduce the dependency it avoids.
 *
 * Runs at the release boundary, in `publish.yml`, immediately before the check itself. Not on PRs —
 * the check does not run on PRs either, and a self-test for something that never runs there would be
 * surface without a question behind it.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPTS_DIR, '..');
const SCRIPT = join(SCRIPTS_DIR, 'check-release-seed-coverage.mjs');

let failures = 0;
function check(name, condition, detail) {
    if (condition) {
        console.log(`  ✓ ${name}`);
    } else {
        console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
        failures++;
    }
}

/**
 * A repo-shaped tree whose `scripts/` holds a real copy of the script.
 *
 * A copy rather than a symlink because the script resolves its repo root from its own location:
 * through a link it would resolve to THIS repo and every case would measure the working tree
 * instead of the fixture.
 */
function fixture(build) {
    const root = mkdtempSync(join(tmpdir(), 'release-seed-'));
    mkdirSync(join(root, 'scripts'));
    cpSync(SCRIPT, join(root, 'scripts', 'check-release-seed-coverage.mjs'));
    mkdirSync(join(root, 'metadata'), { recursive: true });
    mkdirSync(join(root, 'migrations'), { recursive: true });
    build(root);
    return root;
}

/** Runs the script in a fixture and hands back what a build engineer would see. */
function run(build) {
    const root = fixture(build);
    try {
        const out = execFileSync(process.execPath, [join(root, 'scripts', 'check-release-seed-coverage.mjs')], {
            stdio: 'pipe',
            encoding: 'utf-8',
        });
        return { status: 0, output: out };
    } catch (error) {
        return { status: error.status ?? -1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

const COVERED = 'AAAA1111-2222-4333-8444-555566667777';
const UNCOVERED = 'BBBB1111-2222-4333-8444-555566667777';

/** One record file, in the shape `mj sync push` reads. */
function records(...ids) {
    return JSON.stringify(ids.map((id) => ({ fields: { Name: id }, primaryKey: { ID: id } })), null, 2);
}

console.log('release seed coverage:');

// 1. The defect this exists for, and the exact shape that reached bizapps-sales: a record declared
//    under metadata/ that no shipped migration names. CHECK 1 passed on this whenever the manifest
//    had been regenerated; here it must not.
{
    const { status, output } = run((root) => {
        writeFileSync(join(root, 'metadata', '.things.json'), records(UNCOVERED));
        writeFileSync(join(root, 'migrations', 'V1__Seed.sql'), `-- nothing about ${COVERED}\n`);
    });
    check('flags a declared primaryKey that appears in no migration', status === 1 && output.includes(UNCOVERED), output);
}

// 2. A MUST PASS, or the check is just always-red and nobody will believe the red one either.
{
    const { status, output } = run((root) => {
        writeFileSync(join(root, 'metadata', '.things.json'), records(COVERED));
        writeFileSync(join(root, 'migrations', 'V1__Seed.sql'), `EXEC spCreateThing @ID = '${COVERED}';\n`);
    });
    check('passes when every declared primaryKey is named by the shipped chain', status === 0, output);
}

// 3. Case matters nowhere in T-SQL and must not matter here. `uuidgen` yields upper case, the
//    generator has shipped both, and a case-sensitive compare would report a record as missing
//    that is right there in the file.
{
    const { status, output } = run((root) => {
        writeFileSync(join(root, 'metadata', '.things.json'), records(COVERED));
        writeFileSync(join(root, 'migrations', 'V1__Seed.sql'), `EXEC spCreateThing @ID = '${COVERED.toLowerCase()}';\n`);
    });
    check('matches a UUID regardless of case', status === 0, output);
}

// 4. `@parent` nesting puts child records inside the parent's file. A child that ships nowhere is as
//    invisible to a host as a root one, so the walk must reach it.
{
    const { status, output } = run((root) => {
        writeFileSync(
            join(root, 'metadata', '.things.json'),
            JSON.stringify(
                [{ fields: { Name: 'parent' }, primaryKey: { ID: COVERED }, relatedEntities: { Children: [{ fields: {}, primaryKey: { ID: UNCOVERED } }] } }],
                null,
                2,
            ),
        );
        writeFileSync(join(root, 'migrations', 'V1__Seed.sql'), `EXEC spCreateThing @ID = '${COVERED}';\n`);
    });
    check('reaches a nested @parent child record', status === 1 && output.includes(UNCOVERED), output);
}

// 5. `sql_logging/` is the raw push output that BECOMES a seed, and `.backups/` is what a push
//    writes before updating in place. Both are gitignored and both are left on disk by a local run,
//    so reading either would report ids nobody declared — red on the very push that fixed things.
{
    const { status, output } = run((root) => {
        writeFileSync(join(root, 'metadata', '.things.json'), records(COVERED));
        mkdirSync(join(root, 'metadata', 'sql_logging'));
        mkdirSync(join(root, 'metadata', '.backups'));
        writeFileSync(join(root, 'metadata', 'sql_logging', 'push.json'), records(UNCOVERED));
        writeFileSync(join(root, 'metadata', '.backups', 'old.json'), records(UNCOVERED));
        writeFileSync(join(root, 'migrations', 'V1__Seed.sql'), `EXEC spCreateThing @ID = '${COVERED}';\n`);
    });
    check('ignores generator output and push backups', status === 0, output);
}

// 6. `.mj-sync.json` is directory configuration, never a record. It carries no primaryKey today, so
//    this pins the exclusion rather than an outcome that happens to hold.
{
    const { status, output } = run((root) => {
        writeFileSync(join(root, 'metadata', '.mj-sync.json'), records(UNCOVERED));
        writeFileSync(join(root, 'metadata', '.things.json'), records(COVERED));
        writeFileSync(join(root, 'migrations', 'V1__Seed.sql'), `EXEC spCreateThing @ID = '${COVERED}';\n`);
    });
    check('does not read .mj-sync.json as a record file', status === 0, output);
}

// 7. Never swallowed. A record file the script cannot parse is a record it cannot vouch for, and
//    passing over it silently is the exact failure mode that retired CHECK 1.
{
    const { status, output } = run((root) => {
        writeFileSync(join(root, 'metadata', '.broken.json'), '{ not json');
        writeFileSync(join(root, 'metadata', '.things.json'), records(COVERED));
        writeFileSync(join(root, 'migrations', 'V1__Seed.sql'), `EXEC spCreateThing @ID = '${COVERED}';\n`);
    });
    check('reports an unparseable record file instead of skipping it', status === 1 && output.includes('.broken.json'), output);
}

// 8. The vacuity guard, and the reason this file exists at all. A walk that finds nothing must not
//    report success — "I examined zero records" and "every record is fine" are the same green
//    otherwise, which is how CHECK 1 went green over a record that shipped nowhere.
{
    const { status, output } = run((root) => {
        writeFileSync(join(root, 'metadata', '.things.json'), '[]');
        writeFileSync(join(root, 'migrations', 'V1__Seed.sql'), '-- a seed\n');
    });
    check('refuses to pass when it measured nothing', status === 1 && output.includes('measured NOTHING'), output);
}

// 9. An empty migrations/ would make every record look missing, which is a broken run dressed as a
//    finding. It must say so instead.
{
    const { status, output } = run((root) => {
        writeFileSync(join(root, 'metadata', '.things.json'), records(COVERED));
    });
    check('fails loudly when migrations/ holds no SQL at all', status !== 0 && output.includes('no .sql files'), output);
}

// 10. The real repository must pass, or the check is not describing this codebase. This is the
//     assertion a release actually leans on.
{
    const out = execFileSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, stdio: 'pipe', encoding: 'utf-8' });
    check('the repository itself passes', out.includes('Release seed coverage passed'), out);
}

if (failures > 0) {
    console.error(`\n❌ ${failures} release-seed-coverage self-test(s) failed.\n`);
    process.exit(1);
}
console.log('\nAll release-seed-coverage self-tests passed.');
