# Publish Pipeline Pushes Nothing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the release pipeline stop pushing to `main` and `next`, so that required status checks — which a direct push can never satisfy — no longer block every release (#177).

**Architecture:** Required status checks are evaluated against the check runs present on the SHA being introduced. On a direct push that SHA does not exist on the remote until the push lands, so no check run can exist for it yet: a direct push to a ref carrying `required_status_checks` is unsatisfiable *by construction*, for any commit, with or without `[skip ci]`. Rather than work around that, the pipeline stops introducing commits. The version bump moves onto the `next → main` promotion PR (which CLAUDE.md already calls "a single coordinating PR"), and `publish.yml` is reduced to build → validate → `changeset publish` → push a **tag**. Tags are untouched by both rulesets, which are `target: branch` scoped to `refs/heads/main` and `refs/heads/next`. A new stdlib gate, `scripts/check-release-pushes.mjs`, makes the regression impossible to reintroduce silently.

**Tech Stack:** GitHub Actions, changesets, pnpm workspaces, plain Node (ESM, stdlib only) for gates, `node --test` for gate specs.

**Spec:** [GitHub issue #177](https://github.com/MemberJunction/bizapps-forms/issues/177), plus the investigation recorded in this plan's "Evidence" section below. Fix chosen: a third option not in the issue — "push nothing" — selected over the issue's two because fix #1 needs `admin:org` and fix #2 does **not** in fact avoid needing repo/org admin (see Evidence).

## Global Constraints

- Branch from `next`; PR into `next`. Never commit to `main`. (CLAUDE.md)
- No `any` types. No hand-edits of `packages/*/src/**/generated/**`.
- Gate scripts are **plain Node, stdlib only** — no dependency may be needed to run them in CI. Match `scripts/check-migration-order.mjs`: exported pure functions, a `main()` guarded by `if (process.argv[1] === fileURLToPath(import.meta.url))`, and comments that carry the *why*.
- Gate specs are `node --test`, named `<script>.spec.mjs`, and must include **allow-cases** so a future "deny everything" cannot pass as a fix.
- Changeset bump level: **`patch`** — this PR ships no migration and no `metadata/` change. (`.claude/rules/changesets.md`)
- Do **not** run `pnpm install` anywhere but the `mj-dev` workspace root. `pnpm install --lockfile-only` is the one exception used below, and only in Task 6, which is optional and self-verifying.
- Every required status check must keep reporting on every PR. A job or step skipped by an `if:` reports `skipped` (passes); a workflow skipped by `on: paths:` creates no check run at all (blocks forever). Never move a path filter into `on:`.

## Evidence (why this is the fix)

Gathered read-only against the live repo on 2026-09-08:

| Fact | Value |
|---|---|
| `protect-main` (18239666), `next-protect` (20589383) | `enforcement: active`, `bypass_actors: []`, `current_user_can_bypass: never`, `strict: true`, 7 contexts, `target: branch`, `include: ["refs/heads/main"]` / `["refs/heads/next"]` |
| `1ae7c02` — main's head, the `Version Packages [skip ci]` commit | 3 check runs (`deploy`, `report-build-status`, `build`); **none** of the 7 required contexts |
| `changes.yml` triggers | `['pull_request']` only — `changes_and_migrations` can never report on a push |
| The other six gates' push filter | `branches: [next, main]` — a staging branch triggers none of them |
| Repo Actions setting | `can_approve_pull_request_reviews: true`, `default_workflow_permissions: read` |
| Secrets referenced by any workflow | `secrets.GITHUB_TOKEN` only — no PAT, no App token |

Why the issue's fix #2 ("route those two pushes through pull requests… no org permissions needed") does not hold: both PR-routing and staged-branch-then-push require the 7 contexts to report on the release SHA, and every trigger for them would be an event the workflow itself authors with `GITHUB_TOKEN` — which GitHub deliberately does not start workflow runs from. It therefore needs a PAT or App-token secret, which needs repo/org admin, the same thing fix #1 needs.

## The release flow this plan produces

Two pull requests per release. No direct push to a protected branch anywhere.

1. **Release PR.** `git switch -c release/vX.Y.Z origin/next` → `pnpm run version` → `pnpm install --lockfile-only` → commit → PR **into `main`**, titled `Release vX.Y.Z`. This is the `next → main` promotion PR CLAUDE.md already describes, now also carrying the version bump. All 7 checks run on it because it is a human-authored PR.
2. Merging it pushes to `main`, which triggers `publish.yml`: build, validate, `changeset publish`, `git tag vX.Y.Z` + push the tag. Nothing else is pushed.
3. **Sync PR.** `git switch -c chore/sync-main-into-next-vX.Y.Z origin/main` → PR **into `next`** → merge. Required because the merge commit the release PR left on `main` is not in `next`, and `protect-main`'s `strict: true` would otherwise block the *following* release PR ("branch must be up to date with base").

## File Structure

| File | Responsibility |
|---|---|
| `scripts/check-release-pushes.mjs` | **New.** Pure functions + CLI. Answers one question: does anything in the release path push to a ruleset-protected branch? |
| `scripts/check-release-pushes.spec.mjs` | **New.** `node --test` spec: deny-cases, allow-cases (tag pushes, unprotected branches), and a pin on the protected-ref list. |
| `.github/workflows/publish.yml` | **Modify.** Publish and tag only. Every step that wrote to the repo is removed or converted to a verification. |
| `ci/commit_push.mjs`, `ci/merge_main_and_update_lock.mjs`, `ci/merge_main.mjs` | **Delete.** All three push to a protected branch. `ci/` disappears. |
| `scripts/sync-app-version.mjs` | **New.** One place that derives `mj-app.json`'s `version` and `mjVersionRange` from `packages/Entities/package.json`. Writes by default, verifies under `--check`. Replaces an inline bash block in `publish.yml` that ran only in CI and only on the path that no longer exists. |
| `package.json` | **Modify.** Drop `commitpush` / `mergemain` / `mergemain:update-lock`; extend `version`; add `lint:release-pushes` and `lint:release-pushes:test`. |
| `.github/workflows/build.yml` | **Modify.** Run the new gate and its spec in `build-and-test`; widen the `scope` path list so a workflow-only or `ci/`-only PR still runs it. |
| `scripts/check-paths-touched.spec.mjs` | **Modify.** `EXPECTED_SCOPE` is a `deepEqual` pin on that list — it has to move with it. |
| `docs/release.md` | **New.** The two-PR runbook above. |
| `CLAUDE.md` | **Modify.** Its "Known follow-up, and it will bite the next release" paragraph describes the state this PR removes. |
| `.changeset/publish-pipeline-pushes-nothing.md` | **New.** `patch`. |

---

### Task 1: The regression gate — `check-release-pushes`

This task is also the **reproduction**. Written first, it fails on the tree as it stands today, naming `ci/commit_push.mjs` and `ci/merge_main_and_update_lock.mjs` — the two pushes #177 is about — and it stays red until Task 3 deletes them.

**Files:**
- Create: `scripts/check-release-pushes.mjs`
- Create: `scripts/check-release-pushes.spec.mjs`
- Modify: `package.json` (scripts block)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PROTECTED_BRANCHES: readonly string[]` — `['main', 'next']`
  - `SCANNED_DIRS: readonly string[]` — `['.github/workflows', '.github/scripts', 'ci']`
  - `findProtectedPushes(text: string): Array<{ line: number, ref: string, snippet: string }>`
  - `runCheck(root: string): string[]` — human-readable violations
  Task 4 relies on the `lint:release-pushes` and `lint:release-pushes:test` script names.

- [ ] **Step 1: Write the failing test**

Create `scripts/check-release-pushes.spec.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTECTED_BRANCHES, findProtectedPushes, runCheck } from './check-release-pushes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

// ── What the gate must catch ────────────────────────────────────────────────────────────────────

test('a shell push to main is a violation', () => {
    const found = findProtectedPushes('git push origin HEAD:main\n');
    assert.equal(found.length, 1);
    assert.equal(found[0].ref, 'main');
});

test('a shell push to next is a violation', () => {
    assert.equal(findProtectedPushes('git push origin HEAD:next\n').length, 1);
});

test('a bare branch push is a violation', () => {
    assert.equal(findProtectedPushes('git push origin main\n').length, 1);
});

test('a fully-qualified ref is a violation', () => {
    assert.equal(findProtectedPushes('git push origin HEAD:refs/heads/next\n').length, 1);
});

test('a force push is still a push', () => {
    assert.equal(findProtectedPushes('git push --force origin HEAD:main\n').length, 1);
});

// simple-git spells the same operation as a method call, which is how both of #177's pushes were
// written. A gate that only reads shell would have seen neither.
test('the simple-git form is a violation', () => {
    assert.equal(findProtectedPushes("await git.push('origin', 'HEAD:main');\n").length, 1);
});

test('the simple-git form with double quotes is a violation', () => {
    assert.equal(findProtectedPushes('await git.push("origin", "HEAD:next");\n').length, 1);
});

test('the reported line number is the offending line', () => {
    const found = findProtectedPushes('a\nb\ngit push origin HEAD:main\n');
    assert.equal(found[0].line, 3);
});

// ── Allow-cases: what stops "deny everything" from passing as a fix ─────────────────────────────

test('pushing a tag is allowed — both rulesets are target: branch', () => {
    assert.deepEqual(findProtectedPushes("git push origin refs/tags/v1.2.3\n"), []);
    assert.deepEqual(findProtectedPushes("await git.push('origin', `refs/tags/${version}`);\n"), []);
});

test('pushing an unprotected branch is allowed', () => {
    assert.deepEqual(findProtectedPushes('git push origin HEAD:chore/sync-main-into-next\n'), []);
});

test('a branch whose name merely starts with a protected name is allowed', () => {
    assert.deepEqual(findProtectedPushes('git push origin HEAD:mainline\n'), []);
    assert.deepEqual(findProtectedPushes('git push origin HEAD:next-steps\n'), []);
});

test('prose mentioning the push is not a violation', () => {
    assert.deepEqual(findProtectedPushes('# the pipeline used to git push origin HEAD:main here\n'), []);
    assert.deepEqual(findProtectedPushes('  // git push origin HEAD:next was removed in #177\n'), []);
});

test('fetching or merging a protected branch is allowed', () => {
    assert.deepEqual(findProtectedPushes("await git.fetch('origin', 'main');\n"), []);
    assert.deepEqual(findProtectedPushes('git merge --ff-only origin/next\n'), []);
});

// ── The list itself ─────────────────────────────────────────────────────────────────────────────

// Pinned because the gate is exactly as good as this list. Both refs come from live rulesets:
// protect-main (18239666) covers refs/heads/main, next-protect (20589383) covers refs/heads/next.
test('the protected-branch list matches the two rulesets', () => {
    assert.deepEqual([...PROTECTED_BRANCHES].sort(), ['main', 'next']);
});

test('the repository has no protected-branch push in its release path', () => {
    const violations = runCheck(REPO_ROOT);
    assert.deepEqual(violations, [], violations.join('\n'));
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test scripts/check-release-pushes.spec.mjs`
Expected: FAIL — `Cannot find module ... check-release-pushes.mjs`.

- [ ] **Step 3: Write the gate**

Create `scripts/check-release-pushes.mjs`:

```javascript
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
 * feature branches, and `refs/tags/main` would not be a branch at all.
 */
const PROTECTED_TARGET = String.raw`(?:refs\/heads\/)?(${PROTECTED_ALTERNATION})(?![\w./-])`;

/**
 * `git push … <protected>` in shell, with or without a `HEAD:` / `<local>:` prefix and any flags.
 *
 * Anchored to the start of a line (allowing leading whitespace and a `run: `-style prefix) so that
 * prose and commented-out history — of which this repo has a great deal, on purpose — do not
 * register. A comment marker before the command is what distinguishes the two.
 */
const SHELL_PUSH = new RegExp(
    String.raw`^[ \t-]*(?:run:\s*)?git\s+push\b(?:\s+-{1,2}[\w-]+)*\s+\S+\s+(?:\S*:)?` + PROTECTED_TARGET,
    'm',
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
        // ENOENT is the expected, correct answer for `ci/`, which this change deletes. Anything
        // else — a permission error, a file where a directory was — is a gate that cannot see what
        // it is guarding, and must not pass silently.
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
```

- [ ] **Step 4: Run the spec — it must now fail only on the repository check**

Run: `node --test scripts/check-release-pushes.spec.mjs`
Expected: every unit test PASSES; `the repository has no protected-branch push in its release path` FAILS, listing `ci/commit_push.mjs:10` and `ci/merge_main_and_update_lock.mjs:45` (and `ci/merge_main.mjs:11`). **This is the reproduction of #177** — do not fix it here.

- [ ] **Step 5: Confirm the CLI reproduces it too**

Run: `node scripts/check-release-pushes.mjs`
Expected: exit 1, `Release-push gate FAILED`, three violations named.

- [ ] **Step 6: Wire the scripts up**

In `package.json`, beside the other `lint:*` entries:

```json
"lint:release-pushes": "node scripts/check-release-pushes.mjs",
"lint:release-pushes:test": "node --test scripts/check-release-pushes.spec.mjs",
```

- [ ] **Step 7: Commit the red gate**

```bash
git add scripts/check-release-pushes.mjs scripts/check-release-pushes.spec.mjs package.json
git commit -m "test(ci): a gate that refuses a push to a ruleset-protected branch"
```

---

### Task 2: `sync-app-version` — one place that derives mj-app.json

`publish.yml` derives `mj-app.json`'s `version` and `mjVersionRange` in an inline bash block that runs only in CI, on a path this change removes. The derivation has to happen on the release PR now, so it moves into a script the releaser runs — and CI verifies rather than performs it, so a hand-edited `mj-app.json` cannot ship.

**Files:**
- Create: `scripts/sync-app-version.mjs`
- Create: `scripts/sync-app-version.spec.mjs`
- Modify: `package.json` (the `version` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `deriveAppFields(entitiesPkg: object): { version: string, mjVersionRange: string }`
  - `syncAppVersion({ root: string, check: boolean }): string[]` — mismatches (always empty when `check` is false, because it has just written them)
  Task 3 relies on `node scripts/sync-app-version.mjs --check` exiting non-zero on a mismatch.

- [ ] **Step 1: Write the failing test**

Create `scripts/sync-app-version.spec.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveAppFields, syncAppVersion } from './sync-app-version.mjs';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the app version is the entities package version', () => {
    const { version } = deriveAppFields({ version: '0.11.0', dependencies: { '@memberjunction/core': '6.1.0-edge.5' } });
    assert.equal(version, '0.11.0');
});

// The range is ">= the pinned MJ version, < the next MJ major" — the pinning model in CLAUDE.md.
test('the MJ range spans from the pin to the next MJ major', () => {
    const { mjVersionRange } = deriveAppFields({ version: '0.11.0', dependencies: { '@memberjunction/core': '6.1.0-edge.5' } });
    assert.equal(mjVersionRange, '>=6.1.0-edge.5 <7.0.0');
});

test('a caret peer dependency is read when there is no direct dependency', () => {
    const { mjVersionRange } = deriveAppFields({ version: '1.0.0', peerDependencies: { '@memberjunction/core': '^6.1.0' } });
    assert.equal(mjVersionRange, '>=6.1.0 <7.0.0');
});

// Guard clause, not a silent skip: an entities package with no MJ dependency at all means the
// derivation has lost its input, and writing a stale range would be worse than stopping.
test('an entities package with no MJ dependency throws', () => {
    assert.throws(
        () => deriveAppFields({ version: '1.0.0' }),
        /@memberjunction\/core/,
    );
});

test('a package with no version throws', () => {
    assert.throws(() => deriveAppFields({ dependencies: { '@memberjunction/core': '6.1.0' } }), /version/);
});

function scratchRepo({ entitiesVersion, mjPin, app }) {
    const root = mkdtempSync(path.join(tmpdir(), 'sync-app-version-'));
    mkdirSync(path.join(root, 'packages', 'Entities'), { recursive: true });
    writeFileSync(
        path.join(root, 'packages', 'Entities', 'package.json'),
        JSON.stringify({ version: entitiesVersion, dependencies: { '@memberjunction/core': mjPin } }, null, 2),
    );
    writeFileSync(path.join(root, 'mj-app.json'), JSON.stringify(app, null, 2) + '\n');
    return root;
}

test('check reports a stale app version', () => {
    const root = scratchRepo({
        entitiesVersion: '0.11.0',
        mjPin: '6.1.0-edge.5',
        app: { version: '0.10.0', mjVersionRange: '>=6.1.0-edge.5 <7.0.0' },
    });
    const mismatches = syncAppVersion({ root, check: true });
    assert.equal(mismatches.length, 1);
    assert.match(mismatches[0], /version/);
});

test('check reports a stale MJ range', () => {
    const root = scratchRepo({
        entitiesVersion: '0.11.0',
        mjPin: '6.1.0-edge.5',
        app: { version: '0.11.0', mjVersionRange: '>=5.0.0 <6.0.0' },
    });
    assert.equal(syncAppVersion({ root, check: true }).length, 1);
});

test('check passes on a synced tree', () => {
    const root = scratchRepo({
        entitiesVersion: '0.11.0',
        mjPin: '6.1.0-edge.5',
        app: { version: '0.11.0', mjVersionRange: '>=6.1.0-edge.5 <7.0.0' },
    });
    assert.deepEqual(syncAppVersion({ root, check: true }), []);
});

test('writing makes a stale tree pass its own check, and preserves other keys', () => {
    const root = scratchRepo({
        entitiesVersion: '0.11.0',
        mjPin: '6.1.0-edge.5',
        app: { name: 'forms', version: '0.10.0', mjVersionRange: '>=5.0.0 <6.0.0', dependencies: ['common'] },
    });
    assert.deepEqual(syncAppVersion({ root, check: false }), []);
    assert.deepEqual(syncAppVersion({ root, check: true }), []);
    const written = JSON.parse(readFileSync(path.join(root, 'mj-app.json'), 'utf8'));
    assert.equal(written.name, 'forms');
    assert.deepEqual(written.dependencies, ['common']);
});

// The repository itself must be synced, or the release PR ships an mj-app.json that disagrees
// with the packages it installs.
test('this repository is in sync', () => {
    assert.deepEqual(syncAppVersion({ root: REPO_ROOT, check: true }), []);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test scripts/sync-app-version.spec.mjs`
Expected: FAIL — `Cannot find module ... sync-app-version.mjs`.

- [ ] **Step 3: Write the script**

Create `scripts/sync-app-version.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Keep `mj-app.json`'s `version` and `mjVersionRange` derived from `packages/Entities/package.json`.
 *
 * This lived as an inline bash block in publish.yml, where it ran *after* `changeset version` and
 * was committed by a push straight to `main`. #177 removed that push, so the derivation has to
 * happen where the version bump now happens — on the release pull request — and CI's job changes
 * from performing it to checking it. `--check` is that half: a hand-edited mj-app.json, or a
 * release PR that forgot `pnpm run version`, fails before anything is published.
 *
 * Both halves are the same function on purpose. A separate checker is a second copy of the
 * derivation rule, and the two drift.
 *
 * Plain Node, stdlib only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The MJ package whose pin decides the supported range. */
const MJ_ANCHOR = '@memberjunction/core';

/**
 * `mj-app.json`'s derived fields, from the entities package's own manifest.
 *
 * `mjVersionRange` is `>=<pin> <(major+1).0.0>`, the pinning model CLAUDE.md describes: an app
 * supports the MJ line it is built against, up to but not including the next major.
 */
export function deriveAppFields(entitiesPkg) {
    const version = entitiesPkg?.version;
    if (!version) {
        throw new Error('packages/Entities/package.json has no version — cannot derive mj-app.json');
    }
    const pin = entitiesPkg.dependencies?.[MJ_ANCHOR] ?? entitiesPkg.peerDependencies?.[MJ_ANCHOR];
    if (!pin) {
        throw new Error(
            `packages/Entities/package.json declares no ${MJ_ANCHOR} in dependencies or peerDependencies — ` +
                'mjVersionRange has no input to derive from',
        );
    }
    const min = pin.replace(/^[^0-9]*/, '');
    const nextMajor = `${Number(min.split('.')[0]) + 1}.0.0`;
    return { version, mjVersionRange: `>=${min} <${nextMajor}` };
}

/**
 * Sync (or, with `check`, verify) `mj-app.json` against the entities package.
 *
 * Returns the mismatches found. Writing mode returns `[]` because it has just removed them.
 */
export function syncAppVersion({ root = REPO_ROOT, check = false } = {}) {
    const appPath = join(root, 'mj-app.json');
    const app = JSON.parse(readFileSync(appPath, 'utf8'));
    const derived = deriveAppFields(JSON.parse(readFileSync(join(root, 'packages', 'Entities', 'package.json'), 'utf8')));

    const mismatches = Object.entries(derived)
        .filter(([field, expected]) => app[field] !== expected)
        .map(([field, expected]) => `mj-app.json ${field} is ${JSON.stringify(app[field])}, expected ${JSON.stringify(expected)}`);

    if (check || mismatches.length === 0) {
        return mismatches;
    }
    writeFileSync(appPath, JSON.stringify({ ...app, ...derived }, null, 2) + '\n');
    return [];
}

/** CLI entry point. */
function main() {
    const check = process.argv.includes('--check');
    const mismatches = syncAppVersion({ check });
    if (mismatches.length > 0) {
        console.error('mj-app.json is out of sync with packages/Entities/package.json:\n');
        for (const m of mismatches) {
            console.error(`  ✗ ${m}`);
        }
        console.error('\nRun `pnpm run version` on the release branch and commit the result.');
        process.exit(1);
    }
    console.log(check ? 'mj-app.json is in sync.' : 'mj-app.json synced.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
```

- [ ] **Step 4: Run the spec**

Run: `node --test scripts/sync-app-version.spec.mjs`
Expected: PASS, all tests, including `this repository is in sync`. If that last one fails, the repository's `mj-app.json` was already stale — run `node scripts/sync-app-version.mjs`, inspect the one-line diff, and include it.

- [ ] **Step 5: Make `pnpm run version` do the whole bump**

In `package.json`, replace the `version` script so the releaser runs one command:

```json
"version": "changeset version && node scripts/sync-app-version.mjs",
```

- [ ] **Step 6: Commit**

```bash
git add scripts/sync-app-version.mjs scripts/sync-app-version.spec.mjs package.json mj-app.json
git commit -m "refactor(ci): derive mj-app.json's version in one place, checkable from CI"
```

---

### Task 3: Publish, tag, push nothing

**Files:**
- Modify: `.github/workflows/publish.yml`
- Delete: `ci/commit_push.mjs`, `ci/merge_main_and_update_lock.mjs`, `ci/merge_main.mjs`
- Modify: `package.json` (drop `commitpush`, `mergemain`, `mergemain:update-lock`)

**Interfaces:**
- Consumes: `node scripts/sync-app-version.mjs --check` (Task 2), `node scripts/check-release-pushes.mjs` (Task 1).
- Produces: a `publish.yml` whose only remote write is `git push origin refs/tags/vX.Y.Z`.

- [ ] **Step 1: Delete the three push scripts**

```bash
git rm ci/commit_push.mjs ci/merge_main_and_update_lock.mjs ci/merge_main.mjs
```

- [ ] **Step 2: Drop their package.json entries**

Remove these three lines from the `scripts` block:

```json
"commitpush": "node ci/commit_push.mjs",
"mergemain": "node ci/merge_main.mjs",
"mergemain:update-lock": "node ci/merge_main_and_update_lock.mjs",
```

- [ ] **Step 3: Run the gate — it must now be green**

Run: `node scripts/check-release-pushes.mjs`
Expected: `Release-push gate passed`. If it still names a file, `publish.yml` has an inline push that Step 4 removes; finish Step 4 first, then re-run.

- [ ] **Step 4: Rewrite publish.yml's release half**

Everything up to and including `Validate repository.url for npm provenance` is unchanged. Replace everything from `Configure git credentials` to the end of the file with the following.

The gate this replaces was `steps.changeset_check.outputs.pending != '0'` on every step — "are there changesets to consume?" — which was the right question only while CI itself ran `changeset version`. It no longer does, so pending changesets on `main` now mean the opposite: the release PR never ran the bump. The 2×2 is explicit below.

```yaml
      - name: Configure git credentials
        run: |
          git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git config --global user.name "github-actions[bot]"

      # #177: this workflow no longer writes to the repository. Required status checks are
      # evaluated against the check runs on the SHA being introduced, and a direct push introduces
      # a SHA the remote has never seen — so no check run can exist for it and the push is rejected
      # permanently (GH013). That is not a race a retry wins, which is why the version bump moved
      # onto the release pull request (docs/release.md) instead of being worked around here.
      #
      # What is left is a pure reader of the tree it was handed, plus one tag push. Tags are
      # untouched: both rulesets are `target: branch`, scoped to refs/heads/main and refs/heads/next.
      #
      # The gate below replaces "are there changesets to consume?", which was the right question
      # only while this workflow ran `changeset version` itself:
      #
      #   pending changesets | version on npm | what it means
      #   -------------------|----------------|-----------------------------------------------
      #   > 0                | —              | the release PR never ran `pnpm run version` — FAIL
      #   0                  | yes            | already released; nothing to do
      #   0                  | no             | publish and tag
      - name: What is there to release?
        id: release_check
        run: |
          PENDING=$(find .changeset -name "*.md" -not -name "README.md" 2>/dev/null | wc -l | tr -d ' ')
          VERSION=$(jq -r .version packages/Entities/package.json)
          PKG=$(jq -r .name packages/Entities/package.json)

          if [ "$PENDING" -ne 0 ]; then
            echo "::error::$PENDING changeset(s) are still on this branch, so the version was never bumped. Publishing now would republish $VERSION. Cut the release on a branch off next with 'pnpm run version' and open the release PR — see docs/release.md."
            exit 1
          fi

          # `npm view` exits non-zero for a version that is not published, which is the answer we
          # want rather than an error. A registry outage also exits non-zero and would read as
          # "not published", so the version list is fetched once and matched exactly — an empty
          # list from a reachable registry is a real first publish, an unreachable registry fails
          # the step.
          VERSIONS=$(npm view "$PKG" versions --json) || {
            echo "::error::could not reach the npm registry to ask whether $PKG@$VERSION is published"
            exit 1
          }
          if echo "$VERSIONS" | jq -e --arg v "$VERSION" 'index($v)' >/dev/null; then
            echo "$PKG@$VERSION is already on npm — nothing to release"
            echo "publish=false" >> "$GITHUB_OUTPUT"
          else
            echo "$PKG@$VERSION is not on npm — this run releases it"
            echo "publish=true" >> "$GITHUB_OUTPUT"
          fi
          echo "VERSION=$VERSION" >> "$GITHUB_OUTPUT"

      # The derivation used to happen here, in bash, and was committed by the push #177 removed.
      # It happens on the release PR now (`pnpm run version`), so this end only verifies — a
      # hand-edited mj-app.json, or a release PR that skipped the script, stops the release before
      # anything reaches npm.
      - name: mj-app.json agrees with the packages being published
        if: steps.release_check.outputs.publish == 'true'
        run: node scripts/sync-app-version.mjs --check

      # A migration is a schema change, so it must not ship as a patch. changes.yml enforces the
      # rule on PRs into `next` by reading the changeset; by the time a release runs, the changesets
      # are consumed and gone, so this backstop asks the same question of the artifacts instead:
      # did migrations/ move since the last release, and did the version move by more than a patch?
      # Deliberately carries no ref condition — it must hold on every path that can cut a release,
      # including workflow_dispatch. A dry run dispatched from `next` once shipped a patch carrying
      # a new migration because the gate sat inside a step that path never reached.
      - name: Enforce schema-change version policy
        if: steps.release_check.outputs.publish == 'true'
        env:
          VERSION: ${{ steps.release_check.outputs.VERSION }}
        run: |
          LAST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -1)
          if [ -z "$LAST_TAG" ]; then
            echo "No previous v* tag — first release, no previously-shipped schema to have changed"
            exit 0
          fi

          NEW_MIGRATIONS=$(git --no-pager diff --name-only "$LAST_TAG" "$GITHUB_SHA" -- migrations/ || true)
          if [ -z "$NEW_MIGRATIONS" ]; then
            echo "No migrations changed since $LAST_TAG — a patch release is in policy"
            exit 0
          fi

          PREV="${LAST_TAG#v}"
          IFS='.' read -r PREV_MAJOR PREV_MINOR _ <<< "$PREV"
          IFS='.' read -r NEW_MAJOR NEW_MINOR _ <<< "$VERSION"
          if [ "$NEW_MAJOR" -gt "$PREV_MAJOR" ] || [ "$NEW_MINOR" -gt "$PREV_MINOR" ]; then
            echo "migrations/ changed since $LAST_TAG and $PREV -> $VERSION is at least a minor — in policy"
            exit 0
          fi

          echo "$NEW_MIGRATIONS"
          echo "::error::migrations/ changed since $LAST_TAG but $PREV -> $VERSION is only a patch. A schema change must ship as at least a minor. Redo the release PR with a 'minor' changeset."
          exit 1

      # RELEASE READINESS, and the only place these run. PRs contribute declarative JSON under
      # metadata/ and no Metadata_Sync migration; the build engineer generates ONE consolidated seed
      # per release from a clean database (MJ/metadata/CLAUDE.md §1b and §10). Nothing on a feature
      # PR can tell whether that has happened yet, so the question is asked HERE, where the answer
      # is actionable. A red step means the release seed has not been regenerated: fix it by
      # generating the Metadata_Sync (migrations/README.md), never by editing these steps. Both sit
      # before `Publish to npm` and the tag, so a failure costs nothing but a re-run.
      #
      # Each self-test runs first, for the reason the checks exist at all: a gate nobody has watched
      # fail is indistinguishable from one that returns "pass" unconditionally, which is precisely
      # how their predecessor went green over a record that shipped nowhere (#105). Node stdlib
      # only, so neither needs anything installed.
      - name: Release readiness (every metadata record is in the shipped seed)
        if: steps.release_check.outputs.publish == 'true'
        run: |
          node scripts/check-release-seed-coverage.spec.mjs
          npm run check:release-seed

      # The OTHER half of #105, and the one coverage structurally cannot ask. Coverage answers "is
      # this ID named by some shipped migration?" — a per-PR seed delta satisfies that perfectly
      # while being exactly the cadence #105 abolished. This asks whether the release ships ONE
      # consolidated seed or a pile of per-PR deltas. Separate step so a red run names the rule that
      # broke, and a separate SCRIPT because it needs git tags to know what has shipped —
      # `fetch-depth: 0` and `fetch-tags: true` on this job's checkout are what make them available.
      - name: Release readiness (one consolidated seed, not per-PR deltas)
        if: steps.release_check.outputs.publish == 'true'
        run: |
          node scripts/check-release-seed-cadence.spec.mjs
          npm run check:seed-cadence

      - name: Build all packages
        run: pnpm run build:packages

      # Four consecutive releases (0.2.0, 0.2.1, 0.3.0, 0.4.0) shipped forms-ng without its <mj-form>
      # browser bundle, so every public form rendered an empty shell. Nothing failed at build, test or
      # boot time — the artifact was simply absent from the tarball. This is the last point at
      # which that is still catchable.
      - name: Validate the forms-ng widget bundle will ship
        run: ./.github/scripts/validate-widget-bundle.sh

      - name: Publish to npm
        if: steps.release_check.outputs.publish == 'true'
        run: pnpm exec changeset publish

      # The one remote write this workflow still makes. Tags are outside both rulesets — they are
      # `target: branch`, scoped to refs/heads/main and refs/heads/next — so this is not the push
      # #177 is about, and check-release-pushes.mjs allows it for that reason.
      #
      # `changeset publish` has already created its own per-package tags locally; this adds the
      # single repo-wide `v<version>` the release-readiness checks and the schema-policy gate above
      # both read, and pushes only that one.
      - name: Tag the release
        if: steps.release_check.outputs.publish == 'true'
        env:
          VERSION: ${{ steps.release_check.outputs.VERSION }}
        run: |
          git tag "v$VERSION"
          git push origin "refs/tags/v$VERSION"
          echo "## Published v$VERSION" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "**Next step, and it is manual on purpose:** open a pull request from \`main\` into \`next\` to carry this release's merge commit back. Until it merges, \`next\` is not up to date with \`main\` and the following release PR cannot merge. See \`docs/release.md\`." >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 5: Verify the workflow still parses and says what it should**

```bash
node -e "const y=require('js-yaml')" 2>/dev/null || true
python3 -c "
import yaml
d = yaml.safe_load(open('.github/workflows/publish.yml'))
steps = d['jobs']['build-and-publish']['steps']
names = [s.get('name', s.get('uses')) for s in steps]
print('\n'.join(f'  {n}' for n in names))
assert not any('commitpush' in str(s.get('run','')) for s in steps), 'commitpush still invoked'
assert not any('mergemain' in str(s.get('run','')) for s in steps), 'mergemain still invoked'
print('OK')
"
```

Expected: the step list ends `… Publish to npm / Tag the release`, then `OK`.

- [ ] **Step 6: Confirm the reproduction is now green**

Run: `node --test scripts/check-release-pushes.spec.mjs`
Expected: PASS — including `the repository has no protected-branch push in its release path`, which was the red one in Task 1 Step 4.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/publish.yml package.json
git commit -m "fix(ci): the publish pipeline publishes and tags, and pushes no branch

Required status checks are evaluated against the check runs on the SHA
being introduced, and a direct push introduces a SHA the remote has never
seen — so no check run can exist for it and the push is rejected
permanently. The version bump moves onto the release pull request.

Fixes #177"
```

---

### Task 4: Make the gate un-skippable

A gate that only runs when someone happens to touch the right directory is a gate that reports `skipped` — which a required status check treats as passing — on exactly the pull request that reintroduces the defect.

**Files:**
- Modify: `.github/workflows/build.yml` (the `scope` path list, and two steps in `build-and-test`)
- Modify: `scripts/check-paths-touched.spec.mjs` (`EXPECTED_SCOPE` is a `deepEqual` pin on that list)

**Interfaces:**
- Consumes: `lint:release-pushes`, `lint:release-pushes:test` (Task 1 Step 6).
- Produces: nothing later tasks read.

- [ ] **Step 1: Write the failing test**

In `scripts/check-paths-touched.spec.mjs`, update `EXPECTED_SCOPE`: replace the `'.github/workflows/build.yml'` entry with a prefix entry, and add `ci/`.

```javascript
    '.github/workflows/': 'check-release-pushes.mjs reads every workflow, so a PR editing any one of them must run it',
    'ci/': 'the release scripts that pushed straight to main and next lived here (#177); a PR reintroducing the directory must run the gate that forbids it',
```

Then add, at the end of the file:

```javascript
// #177. The gate that forbids a push to a ruleset-protected branch lives in build-and-test, and a
// skipped job reports SUCCESS to a required status check — so the pull request most likely to
// reintroduce the push is precisely the one that would skip the gate. Both shapes are pinned: the
// workflow-only PR (which is how the push would come back today, publish.yml being a workflow) and
// the ci/-only PR (which is how it came back before).
test('build-and-test runs when only a workflow changes', () => {
    assert.equal(
        pathsTouched({ changed: ['.github/workflows/publish.yml'], patterns: scopeListFromWorkflow() }),
        true,
        'a workflow-only PR skips build-and-test, and `skipped` passes a required check — over the ' +
        'release-push gate that reads that very file.',
    );
});

test('build-and-test runs when only a ci/ script changes', () => {
    assert.equal(
        pathsTouched({ changed: ['ci/commit_push.mjs'], patterns: scopeListFromWorkflow() }),
        true,
        'reintroducing ci/ must run the gate that forbids what used to be in it.',
    );
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm run lint:paths-touched:test`
Expected: FAIL — `build.yml's scope list and this spec have diverged`, plus the two new tests failing because `build.yml` still lists only `.github/workflows/build.yml`.

- [ ] **Step 3: Widen the scope list**

In `.github/workflows/build.yml`, inside the `Does this change touch anything build-and-test reads?` step, replace the line `.github/workflows/build.yml \` with:

```
            .github/workflows/ \
            ci/ \
```

And in the comment block above the `scope` job, replace the bullet that reads
`#   - .github/scripts/** and this file: …` with:

```
  #   - .github/scripts/** and .github/workflows/**: the gates themselves live here, and a PR
  #               editing only a gate must still run the gate. Four releases shipped without the
  #               widget bundle because it did not. Widened from just this file to the whole
  #               directory by #177: check-release-pushes.mjs reads EVERY workflow, so a push to a
  #               protected branch reintroduced in any of them must fail a check that actually ran.
  #               The cost is that a workflow-only PR now runs the full job; that is the intended
  #               side of this trade, because the alternative is a green required check over a gate
  #               that never executed.
  #   - ci/       the release scripts that pushed straight to `main` and `next` lived here (#177).
  #               The directory is gone; the entry is not, because it is a pattern for a directory
  #               that must fail the gate if it ever comes back. An absent path is inert.
```

- [ ] **Step 4: Run the spec again**

Run: `npm run lint:paths-touched:test`
Expected: PASS.

- [ ] **Step 5: Run the gate inside build-and-test**

In `.github/workflows/build.yml`, after the `Commit-gate hook tests` step, add:

```yaml
      # #177. Stdlib-only, like the gate specs above. The defect it guards is invisible until a
      # release: a push to `main` or `next` reintroduced in any workflow or script breaks nothing
      # in the pull request that adds it, and then stops the next release with GH013 — months later,
      # in someone else's change. Its own spec runs first, and carries the allow-cases (tag pushes,
      # unprotected branches, commented-out history) that stop a future "deny everything" passing
      # as a fix.
      - name: Release-push gate
        run: npm run lint:release-pushes:test && npm run lint:release-pushes

      # Same shape: mj-app.json's version is derived, not typed, and publish.yml only CHECKS it now
      # (#177). A drift caught here is a one-line fix; caught at release it is a red publish run.
      - name: App version derivation tests
        run: node --test scripts/sync-app-version.spec.mjs
```

- [ ] **Step 6: Verify both new steps pass locally**

```bash
npm run lint:release-pushes:test && npm run lint:release-pushes
node --test scripts/sync-app-version.spec.mjs
npm run lint:paths-touched:test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/build.yml scripts/check-paths-touched.spec.mjs
git commit -m "ci: run the release-push gate in build-and-test, and widen scope so it cannot skip"
```

---

### Task 5: The runbook, and the docs that now describe a state that no longer exists

**Files:**
- Create: `docs/release.md`
- Modify: `CLAUDE.md`
- Modify: `CONTRIBUTING.md`
- Create: `.changeset/publish-pipeline-pushes-nothing.md`

**Interfaces:** none.

- [ ] **Step 1: Write the runbook**

Create `docs/release.md`:

````markdown
# Cutting a release

Two pull requests. Nothing is pushed directly to `main` or `next` at any point — required status
checks make such a push impossible, not merely discouraged (see the note at the bottom).

## 1. The release PR

```bash
git fetch origin
git switch -c release/vX.Y.Z origin/next
pnpm run version              # changeset version + scripts/sync-app-version.mjs
pnpm install --lockfile-only  # the bumped internal pins; linkWorkspacePackages resolves them locally
git add -A
git commit -m "Release vX.Y.Z"
git push -u origin release/vX.Y.Z
gh pr create --base main --title "Release vX.Y.Z"
```

`pnpm run version` consumes `.changeset/*.md`, bumps every `@mj-biz-apps/*` package (they are one
`fixed` group), rewrites the CHANGELOGs, and syncs `mj-app.json`. Read the diff before pushing: the
version it chose is the version that will be published, and no gate can second-guess it.

This is the `next → main` promotion PR CLAUDE.md describes — it just carries the bump as well. All
seven required checks run on it, because it is an ordinary human-authored pull request.

Merge it with a **merge commit**.

## 2. Publishing happens by itself

The merge pushes to `main`, which triggers `publish.yml`. It builds, runs the release-readiness
checks, publishes to npm, and pushes the tag `vX.Y.Z`. It writes nothing else to the repository.

If it fails, the failure is in front of you and nothing has been published — every gate sits before
`Publish to npm`.

## 3. The sync PR

```bash
git fetch origin
git switch -c chore/sync-main-into-next-vX.Y.Z origin/main
git push -u origin chore/sync-main-into-next-vX.Y.Z
gh pr create --base next --title "chore: sync main into next after vX.Y.Z"
```

This is not bookkeeping. The release PR left a merge commit on `main` that `next` does not contain,
and `protect-main` sets `strict: true` — "branch must be up to date with base" — so until this
merges, the *following* release PR cannot merge either.

## Why none of this is automated

Required status checks are evaluated against the check runs present on the SHA being introduced. A
direct push introduces a SHA the remote has never seen, so no check run can exist for it yet and the
push is rejected permanently with `GH013`. It is not a race a retry wins.

Routing the pushes through pull requests opened by the workflow does not help either: GitHub does
not start workflow runs from events authored with `GITHUB_TOKEN`, so the seven required contexts
would never report on such a PR and it could never merge. That needs a PAT or App-token secret,
which needs repo or org admin — the same permission the other remedy (a GitHub Actions bypass actor
on both rulesets) needs.

So the release is human-driven by construction. `scripts/check-release-pushes.mjs` keeps it that
way; see #177 for the full investigation.
````

- [ ] **Step 2: Correct CLAUDE.md**

In the `Branching model: next → main` section, replace the whole `**Known follow-up, and it will bite the next release:**` bullet with:

```markdown
- **The release is human-driven, and that is the fix, not a workaround.** Required status checks
  are evaluated against the check runs on the SHA being introduced, so a direct push — which
  introduces a SHA the remote has never seen — can never satisfy them. The publish pipeline
  therefore pushes no branch at all: the version bump rides the `next` → `main` release PR, and
  `publish.yml` only builds, publishes to npm and pushes a **tag** (tags are outside both rulesets,
  which are `target: branch`). A second, manual PR carries `main` back into `next` afterwards,
  because `strict: true` blocks the following release PR until it lands. Full runbook:
  [`docs/release.md`](docs/release.md). `npm run lint:release-pushes` fails any workflow or script
  that reintroduces a push to `main` or `next` (#177).
```

- [ ] **Step 3: Point CONTRIBUTING.md at the runbook**

In `CONTRIBUTING.md`, on the line reading `- **`main`** is the release branch — it publishes on push.`, append:

```markdown
 Cutting one is two pull requests and no direct pushes — [`docs/release.md`](docs/release.md).
```

- [ ] **Step 4: Add the changeset**

Create `.changeset/publish-pipeline-pushes-nothing.md`. `patch`, per `.claude/rules/changesets.md`:
this ships no migration and no `metadata/` change.

```markdown
---
"@mj-biz-apps/forms-entities": patch
---

The publish pipeline no longer pushes to `main` or `next`.

Required status checks are evaluated against the check runs present on the SHA being introduced. A
direct push introduces a SHA the remote has never seen, so no check run can exist for it and the
push is rejected permanently with `GH013` — which is where every release has stopped since CI became
blocking. `[skip ci]` made it permanent but was never the deciding fact: `changes.yml` carries only a
`pull_request` trigger, so `changes_and_migrations` could not report on a pushed commit in any case.

The version bump now rides the `next` → `main` release pull request, where all seven checks run
normally, and `publish.yml` is reduced to build, validate, publish, and push a tag — tags being
outside both rulesets, which are `target: branch`. `scripts/check-release-pushes.mjs` fails any
workflow or script that reintroduces a protected-branch push, a defect that is otherwise invisible
until the next release.

Fixes #177.
```

- [ ] **Step 5: Verify the links resolve**

```bash
test -f docs/release.md && grep -q 'docs/release.md' CLAUDE.md && grep -q 'docs/release.md' CONTRIBUTING.md && echo OK
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add docs/release.md CLAUDE.md CONTRIBUTING.md .changeset/publish-pipeline-pushes-nothing.md
git commit -m "docs: the two-PR release runbook, and correct the notes that describe the old pipeline"
```

---

### Task 6 (optional, last): retire the now-unused `simple-git`

`simple-git` is a root `devDependency` whose only consumers were the three deleted `ci/` scripts.
Left in place it is dead weight; removed carelessly it desynchronises `pnpm-lock.yaml`, and
`publish.yml` installs with `--frozen-lockfile`, so a bad lockfile breaks the very pipeline this PR
fixes. Do it only if the verification below is clean; otherwise leave it and say so in the PR.

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Confirm nothing else imports it**

```bash
grep -rn "simple-git" --exclude-dir=node_modules --exclude-dir=.git . | grep -v pnpm-lock.yaml
```

Expected: one line, the `devDependencies` entry in `package.json`. Any other hit → stop, skip this task.

- [ ] **Step 2: Remove the entry and regenerate the lockfile**

```bash
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.devDependencies['simple-git'];fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
pnpm install --lockfile-only
```

- [ ] **Step 3: Verify the lockfile diff is confined to simple-git**

```bash
git --no-pager diff --stat pnpm-lock.yaml
git --no-pager diff pnpm-lock.yaml | grep '^[-+]' | grep -v '^[-+][-+]' | grep -vi 'simple-git\|@kwsites\|debug\|ms@' | head
```

Expected: a small stat, and the second command printing nothing. **If it prints unrelated
resolutions, revert both files (`git checkout -- package.json pnpm-lock.yaml`) and skip this task** —
a wholesale re-resolve is not this PR's business.

- [ ] **Step 4: Verify the lockfile still satisfies the release install**

```bash
pnpm install --frozen-lockfile --ignore-scripts --dir . 2>&1 | tail -5
```

Expected: no `ERR_PNPM_OUTDATED_LOCKFILE`. If it errors, revert and skip.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: drop simple-git, whose only consumers were the deleted ci/ scripts"
```

---

## Verification before the PR

- [ ] `node scripts/check-release-pushes.mjs` → `Release-push gate passed`
- [ ] `node --test scripts/check-release-pushes.spec.mjs` → all pass
- [ ] `node --test scripts/sync-app-version.spec.mjs` → all pass
- [ ] `npm run lint:paths-touched:test` → all pass
- [ ] `python3 -c "import yaml; [yaml.safe_load(open(f)) for f in __import__('glob').glob('.github/workflows/*.yml')]"` → no output
- [ ] `git --no-pager grep -n "commitpush\|mergemain" -- package.json .github ci` → no hits
- [ ] The plan's own claim holds: `gh api repos/MemberJunction/bizapps-forms/rulesets/18239666 --jq .target` prints `branch`, so the tag push in `publish.yml` is outside both rulesets.

## Self-review notes

- **Spec coverage.** #177's two stated fixes are both rejected in Evidence with the reason; the
  chosen third is Tasks 1–5. The issue's "urgency" claim (fails the next release at the version-bump
  step) is what Task 3 removes.
- **What this does not do.** It does not add a bypass actor, add a PAT, widen any gate's branch
  filter, or touch either ruleset. Nothing here needs a permission the repository does not have.
- **The one behaviour change outside the release path** is Task 4 Step 3: a workflow-only PR now
  runs `build-and-test`. Called out deliberately, with its reason, in the workflow comment and in
  the PR body.
