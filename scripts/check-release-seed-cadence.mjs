#!/usr/bin/env node
/**
 * RELEASE CADENCE: at most ONE unreleased `Metadata_Sync` migration — the release's own.
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
 * WHY "AT MOST ONE" AND NOT "EXACTLY ONE". A release with no metadata changes owes no seed, and
 * demanding one would teach people to generate empty migrations. The half that IS enforceable is
 * the half that catches the failure: two or more unreleased seeds means the per-PR loop came back.
 *
 * This needs git (tags are the only record of what shipped), which is why it is a SEPARATE command
 * from the coverage check — that one is deliberately pure-fs and runs on any checkout, and folding
 * git into it would break that. Both run at the release, in publish.yml, and nowhere else.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_PATTERN = /Metadata_Sync.*\.sql$/i;

function git(repoRoot, args) {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * The git boundary, and deliberately dumb: it reports which migration files exist at the newest
 * release tag and in the working tree, and decides nothing. Which of them counts as a SEED is
 * domain knowledge that lives in the rule below — a boundary that pre-filtered would make the rule
 * untestable without a git repository, and would let a stub disagree with production about the one
 * definition the check turns on.
 */
export function readMigrationState(repoRoot) {
    const tags = git(repoRoot, ['tag', '--list', 'v*'])
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean)
        .sort((a, b) => {
            const p = (v) => v.replace(/^v/, '').split(/[.-]/).map((n) => (/^\d+$/.test(n) ? Number(n) : -1));
            const [x, y] = [p(a), p(b)];
            for (let i = 0; i < Math.max(x.length, y.length); i++) {
                if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
            }
            return 0;
        });
    if (tags.length === 0) return { tag: null, released: [], current: [] };

    const tag = tags[tags.length - 1];
    const listMigrations = (ref) =>
        git(repoRoot, ['ls-tree', '--name-only', ref, 'migrations/'])
            .split('\n')
            .map((f) => f.trim().replace(/^migrations\//, ''))
            .filter(Boolean);

    return { tag, released: listMigrations(tag), current: listMigrations('HEAD') };
}

export function findUnconsolidatedSeedDeltas(repoRoot = REPO_ROOT, readState = readMigrationState) {
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

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    const { problems, tag, unreleased } = findUnconsolidatedSeedDeltas();
    if (problems.length > 0) {
        console.error('\n❌ Release seed cadence failed:\n');
        for (const p of problems) console.error(`  • ${p}\n`);
        process.exit(1);
    }
    console.log(
        `✅ Release seed cadence passed — ${unreleased.length} unreleased Metadata_Sync migration(s) since ${tag}; a release ships at most one.`,
    );
}
