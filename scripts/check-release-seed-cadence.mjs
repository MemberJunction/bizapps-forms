#!/usr/bin/env node
/**
 * RELEASE CADENCE: ONE consolidated `Metadata_Sync` per release — no more, and not zero when
 * `metadata/` moved.
 *
 * #105 moved metadata seeding to MJ's release-time model: a PR carries declarative JSON, and the
 * build engineer generates ONE consolidated seed per release. `check-release-seed-coverage.mjs`
 * asks whether the seed carries every declared record. It cannot ask the question THIS file exists
 * for, and the difference is the reason both are needed:
 *
 *   coverage — "is this ID named by some shipped migration?"   Blind to WHICH migration names it.
 *   cadence  — "did we ship one consolidated seed, or a pile of per-PR deltas?"
 *
 * A per-PR delta sitting in `migrations/` satisfies coverage perfectly — the ids ARE in a shipped
 * file — while being exactly the cadence #105 abolished. Coverage would go green over it forever.
 *
 * WHY "UNRELEASED" IS THE LINE, NOT "EXISTS". A seed that has been released is append-only history:
 * hosts ran it, and deleting it changes what an already-migrated database believes it ran. A seed
 * that exists only on `next` has reached nobody, so it is still editable — and it is the release's
 * job to fold it into the consolidated seed rather than ship the old cadence one more time.
 *
 * TWO RULES, because "exactly one" is only correct when something changed:
 *
 *   findUnconsolidatedSeedDeltas — at most one unreleased seed. Two or more = the per-PR loop
 *                                  came back.
 *   findUnshippedMetadataDrift   — `metadata/` moved since the last release tag, so a seed is
 *                                  OWED. Zero unreleased seeds is then a release that silently
 *                                  ships none of it.
 *
 * WHY THE SECOND RULE EARNS ITS KEEP, when coverage already reads `metadata/`. Coverage compares
 * declared **ids** against shipped SQL, so it is structurally blind to an EDITED record whose id
 * already ships. That is not hypothetical: `V202608182130` ships the AI Designer prompt saying
 * `Signature`, `metadata/` now says `Doodle` (#97 renamed the type), the id is identical, and
 * coverage is green over it. Drift is the only one of the three checks that sees that.
 *
 * WHY IT IS NOT THE HASH MANIFEST #105 KILLED. The manifest stored hashes IN THE REPO, so
 * regenerating them was the way to make the gate quiet — and doing that without regenerating the
 * seed was the silent pass. This stores nothing. The answer is derived from git history, and the
 * only way to make it green is to actually ship a seed or actually revert the metadata change.
 *
 * This needs git (tags are the only record of what shipped), which is why it is a SEPARATE command
 * from the coverage check — that one is deliberately pure-fs and runs on any checkout, and folding
 * git into it would break that. Both run at the release, in publish.yml, and nowhere else.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_PATTERN = /Metadata_Sync.*\.sql$/i;

function git(repoRoot, args) {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** `v0.10.0-rc.1` → core [0,10,0] plus the prerelease `rc.1`. A non-numeric core part scores -1 so
 *  junk tags (`v-latest`, `vNEXT`) sort below every real version rather than above them. */
function parseVersion(tag) {
    const raw = tag.replace(/^v/, '');
    const dash = raw.indexOf('-');
    const core = (dash === -1 ? raw : raw.slice(0, dash)).split('.').map((n) => (/^\d+$/.test(n) ? Number(n) : -1));
    return { core, pre: dash === -1 ? null : raw.slice(dash + 1) };
}

/**
 * Semver order, and the prerelease rule is the whole reason this is not a one-liner: `0.10.0-rc.1`
 * is LOWER than `0.10.0` (semver §11). Getting that backwards picks the rc as the release baseline,
 * so everything shipped in the final looks unreleased and the gate fails the release that did
 * everything right. A gate that cries wolf is one somebody switches off. The MJ family tags
 * prereleases (`6.1.0-edge.2`), so this is a shape this repo will meet.
 */
function compareVersions(a, b) {
    const [x, y] = [parseVersion(a), parseVersion(b)];
    for (let i = 0; i < Math.max(x.core.length, y.core.length); i++) {
        const d = (x.core[i] ?? 0) - (y.core[i] ?? 0);
        if (d !== 0) return d;
    }
    if (x.pre === null || y.pre === null) return (x.pre === null ? 1 : 0) - (y.pre === null ? 1 : 0);

    const [xs, ys] = [x.pre.split('.'), y.pre.split('.')];
    for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
        const [p, q] = [xs[i], ys[i]];
        if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
        const bothNumeric = /^\d+$/.test(p) && /^\d+$/.test(q);
        if (bothNumeric) {
            const d = Number(p) - Number(q);
            if (d !== 0) return d;
        } else if (p !== q) {
            return p < q ? -1 : 1;
        }
    }
    return 0;
}

/**
 * The git boundary, and deliberately dumb: it reports which migration files exist at the newest
 * release tag and in the working tree, and which files under `metadata/` differ between the two.
 * It decides nothing. Which files count as a SEED, and which count as a RECORD, is domain
 * knowledge that lives in the rules below — a boundary that pre-filtered would make them
 * untestable without a git repository, and would let a stub disagree with production about the
 * definitions the checks turn on.
 */
export function readReleaseState(repoRoot) {
    const tags = git(repoRoot, ['tag', '--list', 'v*'])
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean)
        .sort(compareVersions);
    if (tags.length === 0) return { tag: null, released: [], current: [] };

    const tag = tags[tags.length - 1];
    const listMigrations = (ref) =>
        git(repoRoot, ['ls-tree', '--name-only', ref, 'migrations/'])
            .split('\n')
            .map((f) => f.trim().replace(/^migrations\//, ''))
            .filter(Boolean);

    // No `HEAD` argument: `git diff <tag> -- <path>` compares the tag against the WORKING TREE, so
    // an edit the engineer has not committed yet still counts. Untracked files are the one thing
    // this cannot see; a brand-new record with a brand-new id is caught by the coverage check.
    const metadataChanged = git(repoRoot, ['diff', '--name-only', tag, '--', 'metadata/'])
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);

    const migrationsDir = join(repoRoot, 'migrations');
    const current = existsSync(migrationsDir) ? readdirSync(migrationsDir) : [];

    return { tag, released: listMigrations(tag), current, metadataChanged };
}

export function findUnconsolidatedSeedDeltas(repoRoot = REPO_ROOT, readState = readReleaseState) {
    let state;
    try {
        state = readState(repoRoot);
    } catch (error) {
        // Never a silent pass: if we cannot read what shipped, we do not know the answer.
        return { problems: [`could not read git history to determine what has been released: ${error.message}`], tag: null, unreleased: [] };
    }

    if (state.tag === null) {
        return {
            problems: ['no v* release tag found, so "what has already shipped" has no answer here. A shallow clone without tags cannot run this check — fetch tags, or run it where they exist.'],
            tag: null,
            unreleased: [],
        };
    }

    // SEED_PATTERN is applied HERE, not at the boundary. Ordinary DDL and CodeGen metadata backfills
    // (`…Element_Parity_Metadata_Backfill.sql`, `…Rename_Signature_Question_To_Doodle.sql`) ship per
    // feature by design and are none of this rule's business.
    const released = new Set(state.released.filter((f) => SEED_PATTERN.test(f)));
    const unreleased = state.current.filter((f) => SEED_PATTERN.test(f) && !released.has(f)).sort();
    const problems = [];
    if (unreleased.length > 1) {
        problems.push(
            `${unreleased.length} unreleased Metadata_Sync migrations, but a release ships ONE consolidated seed (#105).\n` +
                unreleased.map((f) => `      ${f}`).join('\n') +
                `\n\n  None of these is in ${state.tag}, so none has reached a host and none is append-only history yet.\n` +
                '  Fold them into one consolidated seed generated from a clean database at ' +
                `${state.tag} (migrations/README.md), delete the per-PR deltas, and re-run.`,
        );
    }
    return { problems, tag: state.tag, unreleased };
}

/**
 * Records only. `metadata/README.md` is prose about the directory, not a record in it, and a
 * documentation edit owes no seed — gating on it would teach people that the way to quiet this
 * check is to not write documentation. `.backups/` and `sql_logging/` are push by-products, ignored
 * for the same reason `check-release-seed-coverage.mjs` ignores them.
 */
function isRecordPath(file) {
    if (/(^|\/)README\.md$/i.test(file)) return false;
    if (/(^|\/)\.mj-sync\.json$/.test(file)) return false;
    return !/(^|\/)(\.backups|sql_logging)(\/|$)/.test(file);
}

export function findUnshippedMetadataDrift(repoRoot = REPO_ROOT, readState = readReleaseState) {
    let state;
    try {
        state = readState(repoRoot);
    } catch (error) {
        return { problems: [`could not read git history to compare metadata/ against the last release: ${error.message}`], tag: null, changed: [] };
    }
    if (state.tag === null) {
        return {
            problems: ['no v* release tag found, so "has metadata/ moved since the last release?" has no answer here. Fetch tags, or run it where they exist.'],
            tag: null,
            changed: [],
        };
    }

    const changed = (state.metadataChanged ?? []).filter(isRecordPath).sort();
    const unreleasedSeeds = state.current.filter((f) => SEED_PATTERN.test(f) && !new Set(state.released).has(f));
    const problems = [];
    if (changed.length > 0 && unreleasedSeeds.length === 0) {
        problems.push(
            `${changed.length} metadata record file(s) changed since ${state.tag}, but this release ships NO new Metadata_Sync.\n` +
                changed.map((f) => `      ${f}`).join('\n') +
                '\n\n  Coverage cannot catch this: it compares declared ids against shipped SQL, and an EDITED\n' +
                '  record keeps its id. Generate the consolidated seed (migrations/README.md) — the push emits\n' +
                '  spUpdate* for edited records by construction, which is the half no id check can see.',
        );
    }
    return { problems, tag: state.tag, changed };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    const cadence = findUnconsolidatedSeedDeltas();
    const drift = findUnshippedMetadataDrift();
    const problems = [...cadence.problems, ...drift.problems];
    if (problems.length > 0) {
        console.error('\n❌ Release seed cadence failed:\n');
        for (const p of problems) console.error(`  • ${p}\n`);
        process.exit(1);
    }
    console.log(
        `✅ Release seed cadence passed — ${cadence.unreleased.length} unreleased Metadata_Sync migration(s) since ${cadence.tag}, ` +
            `and ${drift.changed.length} changed metadata record file(s): a release ships exactly one seed when metadata moved, and at most one always.`,
    );
}
