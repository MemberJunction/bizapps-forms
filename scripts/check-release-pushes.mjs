#!/usr/bin/env node
/**
 * Refuse any push to a ruleset-protected branch from the release path.
 *
 * Required status checks are evaluated against the check runs present on the SHA being introduced.
 * On a direct push that SHA does not exist on the remote until the push lands, so no check run can
 * exist for it yet — a direct push to a ref carrying `required_status_checks` is unsatisfiable by
 * construction, for any commit, with or without `[skip ci]`. It is not a race that a retry wins.
 *
 * That is what #177 was: `ci/commit_push.mjs` pushed the version-bump commit straight to `main` and
 * `ci/merge_main_and_update_lock.mjs` pushed straight to `next`, and once #173 made both rulesets
 * carry required checks, every release stopped at the version-bump step with GH013. The fix was to
 * stop pushing; this gate is what keeps it fixed, because reintroducing such a push breaks nothing
 * until the next release — months later, in someone else's pull request.
 *
 * Tag pushes are deliberately allowed: both rulesets are `target: branch`, scoped to
 * `refs/heads/main` and `refs/heads/next`, so `refs/tags/*` is untouched and the release still
 * tags itself.
 *
 * Plain Node, stdlib only, matching `check-migration-order.mjs`: a gate that guards the release
 * must be runnable in CI without installing anything.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The branches both repository rulesets protect: protect-main (18239666) covers
 * `refs/heads/main`, next-protect (20589383) covers `refs/heads/next`. Pinned in the spec, because
 * the gate is exactly as good as this list.
 */
export const PROTECTED_BRANCHES = Object.freeze(['main', 'next']);

/**
 * Where release automation lives. Deliberately whole directories rather than the three files that
 * happen to be guilty today — the point is that a *new* file cannot reintroduce the push.
 */
export const SCANNED_DIRS = Object.freeze(['.github/workflows', '.github/scripts', 'ci']);

const PROTECTED_ALTERNATION = PROTECTED_BRANCHES.join('|');

/**
 * A refspec target naming a protected branch, and nothing else.
 *
 * The trailing boundary is load-bearing twice over: `mainline` and `next-steps` are ordinary
 * feature branches, and a name that merely begins with a protected one is not that branch.
 */
const PROTECTED_TARGET = String.raw`(?:refs\/heads\/)?(${PROTECTED_ALTERNATION})(?![\w./-])`;

/**
 * `git push … <protected>` in shell, with or without a `HEAD:` / `<local>:` prefix and any flags.
 *
 * Anchored to the start of a line (allowing leading whitespace, a YAML list dash, and a `run: `
 * prefix) so that prose and commented-out history — of which this repo has a great deal, on
 * purpose — do not register. `isCommentary` is what separates the two.
 */
const SHELL_PUSH = new RegExp(
    String.raw`^[ \t-]*(?:run:\s*)?git\s+push\b(?:\s+-{1,2}[\w-]+)*\s+\S+\s+(?:\S*:)?` + PROTECTED_TARGET,
);

/** simple-git's spelling of the same operation: `git.push('origin', 'HEAD:main')`. */
const METHOD_PUSH = new RegExp(
    String.raw`\.push\(\s*['"\`][^'"\`]+['"\`]\s*,\s*['"\`](?:\S*:)?` + PROTECTED_TARGET + String.raw`['"\`]`,
);

/** True when the line is commented out — history and prose, not an instruction. */
function isCommentary(line) {
    return /^\s*(?:#|\/\/|\*|<!--)/.test(line);
}

/**
 * Every push to a protected branch in `text`, as `{ line, ref, snippet }`.
 *
 * Line-by-line rather than whole-file, so a violation can be reported at a line number a reader
 * can go to. Both patterns are single-line by nature — a refspec does not wrap.
 */
export function findProtectedPushes(text) {
    const found = [];
    text.split('\n').forEach((line, index) => {
        if (isCommentary(line)) {
            return;
        }
        const match = SHELL_PUSH.exec(line) ?? METHOD_PUSH.exec(line);
        if (match) {
            found.push({ line: index + 1, ref: match[1], snippet: line.trim() });
        }
    });
    return found;
}

/** Every file under `dir`, recursively. Returns [] for a directory that does not exist. */
function filesUnder(dir) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
        // ENOENT is the expected, correct answer for `ci/`, which #177 deletes. Anything else — a
        // permission error, a file where a directory was — is a gate that cannot see what it is
        // guarding, and must not pass silently.
        if (error.code === 'ENOENT') {
            return [];
        }
        throw new Error(`check-release-pushes cannot read ${dir}: ${error.message}`, { cause: error });
    }
    return entries.flatMap((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? filesUnder(full) : statSync(full).isFile() ? [full] : [];
    });
}

/** Violations across the whole release path, as printable strings. */
export function runCheck(root) {
    const violations = [];
    for (const dir of SCANNED_DIRS) {
        for (const file of filesUnder(join(root, dir))) {
            for (const hit of findProtectedPushes(readFileSync(file, 'utf8'))) {
                violations.push(
                    `${relative(root, file)}:${hit.line}: pushes to '${hit.ref}', which carries required ` +
                        `status checks. A direct push introduces a SHA the remote has never seen, so no check ` +
                        `run can exist for it and the push is rejected permanently (GH013) — see #177. Route ` +
                        `the change through a pull request, or push a tag instead.\n      ${hit.snippet}`,
                );
            }
        }
    }
    return violations;
}

/** CLI entry point. */
function main() {
    const violations = runCheck(REPO_ROOT);
    if (violations.length > 0) {
        console.error('Release-push gate FAILED:\n');
        for (const v of violations) {
            console.error(`  ✗ ${v}\n`);
        }
        console.error(`${violations.length} violation(s).`);
        process.exit(1);
    }
    console.log(`Release-push gate passed (${SCANNED_DIRS.join(', ')}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
