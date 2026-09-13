# `@angular/cdk` is a compatibility claim, not a pin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `packages/Angular/package.json`'s `@angular/cdk` peer from the exact `21.1.3` to `^21.1.3`, so `mj app install` stops leaving Forms `Disabled` on every host whose CDK is not exactly 21.1.3 — and add the gate that would have caught it, because this shipped in six consecutive releases with nothing in CI able to see it.

**Architecture:** One character in a manifest is the whole behaviour fix. The rest of the plan is about why nobody noticed: no gate in this repo reads a `peerDependencies` range. Task 1 writes that gate first, and it goes red against the repo as it stands — that is the failing test for a packaging bug, since the defect lives in a manifest and no unit test can reach it. Task 2 turns it green with the manifest change. Task 3 wires it into CI so the class cannot return. Task 4 ships the changeset and tells existing operators how to clear the `Disabled` they are already sitting in.

**Tech Stack:** Plain Node ESM (stdlib only, matching `scripts/check-release-pushes.mjs` and `scripts/check-migration-order.mjs`), `node --test` for the gate's spec, GitHub Actions, changesets.

**Spec:** [MemberJunction/bizapps-forms#211](https://github.com/MemberJunction/bizapps-forms/issues/211) — including its two comments, which establish that the bug is live in published `0.10.0` and that `mj app upgrade` takes an `Active` install *offline*. Background: `docs/superpowers/specs/2026-09-12-forms-next-host-install-rehearsal-design.md` (the rehearsal that found it; untracked, do not stage it).

## Global Constraints

- **Branch:** `fix/211-angular-cdk-peer-range`, already cut from `origin/next`. It currently tracks `origin/next`; the first push MUST be `git push -u origin fix/211-angular-cdk-peer-range` so it tracks its own remote, per `CLAUDE.md` → Branching model.
- **NEVER run a bare `pnpm install` in this repo.** It unlinks the MJ source checkout and the MJ host's API stops booting. If an install is ever genuinely needed it happens at the `mj-dev` workspace root, not here. **No task in this plan needs one** — see the lockfile note below.
- **`pnpm-lock.yaml` must not change.** Verified before this plan was written: no `importers:` block in the lockfile records `peerDependencies:` (count is 0), and `packages/Server` links `forms-ng` as a bare `version: link:../Angular` with no peer-suffix hash. Editing our own peer range therefore cannot invalidate the lockfile, and `pnpm install --frozen-lockfile` in CI stays green. If `git status` ever shows `pnpm-lock.yaml` modified, **stop** — an assumption this plan rests on was wrong.
- **Changeset level is `patch`.** `.claude/rules/changesets.md`: `minor` only when the change ships something under `migrations/**.sql` or `metadata/**`. This ships neither. The fixed group (`"fixed": [["@mj-biz-apps/*"]]`) means one stray `minor` moves all four packages, so this is not a judgement call.
- **No `any`, no weak typing, 4-space indent** in new script code, matching `scripts/check-release-pushes.mjs`.
- **Do not hand-edit anything under `packages/*/src/**/generated/`.** No task here goes near it; `.claude/hooks/block-generated-edits.mjs` refuses it anyway.
- **The exact platform pin is `21.1.3`** (`CLAUDE.md` → Angular pinning model). Peers are caret ranges *at* that pin; `devDependencies` anchors stay exact. Task 2 changes the peer only — **leave the `devDependencies` anchor at exact `21.1.3`.**

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/check-peer-ranges.mjs` | Create | The gate. Reads every `packages/*` and `apps/*` manifest and reports any `peerDependencies` entry written as an exact version, plus any allowlist entry that no longer matches anything. |
| `scripts/check-peer-ranges.spec.mjs` | Create | `node --test` spec for the gate's pure functions, driven by synthetic manifests. |
| `packages/Angular/package.json` | Modify (line 30) | The fix: `"@angular/cdk": "21.1.3"` → `"^21.1.3"` in `peerDependencies`. |
| `package.json` | Modify (`scripts`) | `lint:peer-ranges` and `lint:peer-ranges:test` entries. |
| `.github/workflows/build.yml` | Modify (`build-and-test` job) | One step running the gate and its spec. |
| `.changeset/a-peer-range-is-a-compatibility-claim.md` | Create | `patch` bump for `@mj-biz-apps/forms-ng` + the operator-facing prose. |
| `docs/install.md` | Modify (new section 7) | How an operator recognises and clears the `Disabled` they are already in. |

---

### Task 1: The gate that would have caught this

The defect is a manifest string, so the failing test is a gate that reads manifests. Write it first and watch it fail against the repo as it stands.

**Files:**
- Create: `scripts/check-peer-ranges.mjs`
- Test: `scripts/check-peer-ranges.spec.mjs`
- Modify: `package.json` (the `scripts` block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, for Task 2 and Task 3:
  - `isExactVersion(spec: string) => boolean`
  - `findExactPeers(manifest: {name, peerDependencies}, relPath: string) => Array<{package, peer, version, file}>`
  - `runCheck(root: string) => {violations: string[], stale: string[]}`
  - `ALLOWED_EXACT_PEERS` — frozen array of `{package, peer, version, reason}`
  - `SCANNED_DIRS` — frozen array of the manifest directories scanned
  - CLI: `node scripts/check-peer-ranges.mjs`, exit 1 on any violation or stale allowance, exit 0 otherwise.

- [ ] **Step 1: Write the gate's spec first**

Create `scripts/check-peer-ranges.spec.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
    ALLOWED_EXACT_PEERS,
    SCANNED_DIRS,
    isExactVersion,
    findExactPeers,
    runCheck,
} from './check-peer-ranges.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

// ── What counts as an exact version ─────────────────────────────────────────────────────────────

test('a bare version is exact', () => {
    assert.equal(isExactVersion('21.1.3'), true);
});

test('a prerelease version is exact', () => {
    assert.equal(isExactVersion('2.0.0-beta.3'), true);
});

test('a build-metadata version is exact', () => {
    assert.equal(isExactVersion('1.2.3+build.7'), true);
});

// npm treats a leading `=` as "exactly this", so it is the same hazard written differently.
test('an explicitly-equal version is exact', () => {
    assert.equal(isExactVersion('=21.1.3'), true);
});

test('surrounding whitespace does not hide an exact version', () => {
    assert.equal(isExactVersion('  21.1.3  '), true);
});

// ── What must NOT be reported ───────────────────────────────────────────────────────────────────

test('a caret range is not exact', () => {
    assert.equal(isExactVersion('^21.1.3'), false);
});

test('a tilde range is not exact', () => {
    assert.equal(isExactVersion('~21.1.3'), false);
});

test('a comparator range is not exact', () => {
    assert.equal(isExactVersion('>=21.0.0 <22.0.0'), false);
});

test('an or-range is not exact', () => {
    assert.equal(isExactVersion('^21.0.0 || ^22.0.0'), false);
});

test('a hyphen range is not exact', () => {
    assert.equal(isExactVersion('21.1.3 - 21.9.9'), false);
});

test('an x-range is not exact', () => {
    assert.equal(isExactVersion('21.1.x'), false);
});

test('a wildcard is not exact', () => {
    assert.equal(isExactVersion('*'), false);
});

test('a workspace protocol is not exact', () => {
    assert.equal(isExactVersion('workspace:*'), false);
});

test('an empty specifier is not exact', () => {
    assert.equal(isExactVersion(''), false);
});

// ── Finding violations in a manifest ────────────────────────────────────────────────────────────

test('an exact peer is reported with package, peer and version', () => {
    const found = findExactPeers(
        { name: '@mj-biz-apps/forms-ng', peerDependencies: { '@angular/cdk': '21.1.3' } },
        'packages/Angular/package.json',
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].package, '@mj-biz-apps/forms-ng');
    assert.equal(found[0].peer, '@angular/cdk');
    assert.equal(found[0].version, '21.1.3');
    assert.equal(found[0].file, 'packages/Angular/package.json');
});

test('a caret peer is not reported', () => {
    const found = findExactPeers(
        { name: '@mj-biz-apps/forms-ng', peerDependencies: { '@angular/cdk': '^21.1.3' } },
        'packages/Angular/package.json',
    );
    assert.deepEqual(found, []);
});

test('a manifest with no peerDependencies block is not a violation', () => {
    assert.deepEqual(findExactPeers({ name: '@mj-biz-apps/forms-actions' }, 'packages/Actions/package.json'), []);
});

// dependencies and devDependencies are exact ON PURPOSE here — apps pin, and every package anchors
// its Angular version in devDependencies. A gate that read those blocks would fail the repo's own
// documented model on its first run.
test('exact dependencies and devDependencies are none of the gate\'s business', () => {
    const found = findExactPeers(
        {
            name: '@mj-biz-apps/forms-ng',
            dependencies: { '@mj-biz-apps/forms-entities': '0.10.0' },
            devDependencies: { '@angular/cdk': '21.1.3' },
            peerDependencies: { '@angular/cdk': '^21.1.3' },
        },
        'packages/Angular/package.json',
    );
    assert.deepEqual(found, []);
});

test('an allowlisted exact peer is not reported', () => {
    const allowed = ALLOWED_EXACT_PEERS[0];
    const found = findExactPeers(
        { name: allowed.package, peerDependencies: { [allowed.peer]: allowed.version } },
        'packages/Server/package.json',
    );
    assert.deepEqual(found, []);
});

// The allowance is keyed to the VALUE, not just the name. If MJ moves its own exact dependency and
// we follow it, the reasoning that justified the exception has to be re-stated rather than inherited.
test('an allowlisted peer at a different version is still reported', () => {
    const allowed = ALLOWED_EXACT_PEERS[0];
    const found = findExactPeers(
        { name: allowed.package, peerDependencies: { [allowed.peer]: '2.0.0-rc.4' } },
        'packages/Server/package.json',
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].version, '2.0.0-rc.4');
});

// ── The allowlist must not rot ──────────────────────────────────────────────────────────────────

test('every allowlist entry carries a reason', () => {
    for (const entry of ALLOWED_EXACT_PEERS) {
        assert.equal(typeof entry.reason, 'string');
        assert.ok(entry.reason.length > 40, `allowance for ${entry.package} -> ${entry.peer} needs a real reason`);
    }
});

test('the allowlist is frozen', () => {
    assert.equal(Object.isFrozen(ALLOWED_EXACT_PEERS), true);
});

// ── The gate against a synthetic tree ───────────────────────────────────────────────────────────

function writeTree(manifests) {
    const root = mkdtempSync(path.join(tmpdir(), 'peer-ranges-'));
    for (const [relPath, manifest] of Object.entries(manifests)) {
        mkdirSync(path.join(root, path.dirname(relPath)), { recursive: true });
        writeFileSync(path.join(root, relPath), JSON.stringify(manifest, null, 2));
    }
    return root;
}

test('runCheck reports an exact peer found on disk', () => {
    const root = writeTree({
        'packages/Angular/package.json': {
            name: '@mj-biz-apps/forms-ng',
            peerDependencies: { '@angular/cdk': '21.1.3', '@angular/core': '^21.1.3' },
        },
    });
    const { violations } = runCheck(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /@angular\/cdk/);
    assert.match(violations[0], /packages\/Angular\/package\.json/);
});

test('runCheck passes a tree whose peers are all ranges', () => {
    const root = writeTree({
        'packages/Angular/package.json': {
            name: '@mj-biz-apps/forms-ng',
            peerDependencies: { '@angular/cdk': '^21.1.3', '@angular/core': '^21.1.3' },
        },
    });
    const { violations } = runCheck(root);
    assert.deepEqual(violations, []);
});

// A dead exception is worse than no exception: it reads as a considered decision long after the
// thing it excused is gone.
test('runCheck reports an allowance that no longer matches anything', () => {
    const root = writeTree({
        'packages/Angular/package.json': {
            name: '@mj-biz-apps/forms-ng',
            peerDependencies: { '@angular/cdk': '^21.1.3' },
        },
    });
    const { stale } = runCheck(root);
    assert.equal(stale.length, ALLOWED_EXACT_PEERS.length);
    assert.match(stale[0], /no longer/i);
});

test('runCheck tolerates a missing scanned directory', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'peer-ranges-empty-'));
    const { violations } = runCheck(root);
    assert.deepEqual(violations, []);
});

test('the scanned directories are the ones this repo publishes from', () => {
    assert.deepEqual([...SCANNED_DIRS], ['packages', 'apps']);
});

// ── The repo itself ─────────────────────────────────────────────────────────────────────────────

test('this repository has no exact peer ranges', () => {
    const { violations, stale } = runCheck(REPO_ROOT);
    assert.deepEqual(violations, [], violations.join('\n'));
    assert.deepEqual(stale, [], stale.join('\n'));
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `node --test scripts/check-peer-ranges.spec.mjs`
Expected: FAIL — `Cannot find module './check-peer-ranges.mjs'`. The gate does not exist yet.

- [ ] **Step 3: Write the gate**

Create `scripts/check-peer-ranges.mjs`:

```js
#!/usr/bin/env node
/**
 * Refuse an exact version in any package's `peerDependencies`.
 *
 * A peer range is a compatibility CLAIM — "this package works against anything in here". An exact
 * peer claims the package works against one patch release and no other, and npm enforces that
 * claim against the host's installed tree. `@mj-biz-apps/forms-ng` declared `"@angular/cdk":
 * "21.1.3"`, so `mj app install` on a stock MJ 6.1.0-edge.6 host — which ships `@angular/cdk`
 * 21.2.14, a version line that moves independently of `@angular/core` — died with ERESOLVE, and
 * the CLI finalized the app as `Disabled` while telling the operator to fix their npm auth and
 * `.npmrc`. Neither was involved. See #211.
 *
 * It shipped in 0.5.0 through 0.10.0 because nothing here reads a peer range. A unit test cannot
 * reach this defect: it is a string in a manifest that only the host's resolver ever evaluates,
 * and the repo's own pnpm workspace never evaluates it at all (no `importers:` block records
 * `peerDependencies`, so the lockfile is blind to it too). This gate is the only place the claim
 * gets read before a host reads it.
 *
 * Scope is `peerDependencies` and nothing else, deliberately. Exact `dependencies` in `apps/*` and
 * exact `@angular/*` anchors in `devDependencies` are the documented model (`CLAUDE.md` → Angular
 * pinning model); a gate that read those blocks would fail this repo on its first run.
 *
 * Plain Node, stdlib only, matching `check-release-pushes.mjs` and `check-migration-order.mjs`: a
 * gate that guards the distribution must run in CI without installing anything.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Where publishable manifests live. `packages/*` is what npm receives; `apps/*` is scanned too so
 * a peer block added there is never unguarded, even though today those manifests declare none.
 */
export const SCANNED_DIRS = Object.freeze(['packages', 'apps']);

/**
 * Exact peers that are correct, each with the reason it is correct.
 *
 * An entry is matched on package, peer AND version. Matching the version is the point: if the
 * upstream value these track ever moves and we follow it, the exception expires and has to be
 * re-argued here rather than silently inherited by a value nobody checked.
 */
export const ALLOWED_EXACT_PEERS = Object.freeze([
    Object.freeze({
        package: '@mj-biz-apps/forms-server',
        peer: 'type-graphql',
        version: '2.0.0-beta.3',
        reason:
            "@memberjunction/server declares type-graphql as an EXACT direct dependency at this same " +
            'version, so every host that has MJ installed has exactly this build and the peer is always ' +
            'satisfiable — the opposite of the @angular/cdk case, where the host chooses the version. A ' +
            'range here would be the lie instead: type-graphql 2.x is a prerelease line whose betas and ' +
            'rcs break each other, and forms-server has only ever been built against beta.3. This tracks ' +
            "MJ's pin; when MJ moves it, move it here and update this entry.",
    }),
]);

/**
 * True when `spec` names one concrete version rather than a set of them.
 *
 * Everything npm accepts as a range — `^`, `~`, comparators, `||`, hyphen ranges, x-ranges, `*`,
 * `workspace:`, a tag, a URL — is a claim about a set and is therefore fine. Only a bare semver,
 * optionally written `=1.2.3`, pins the host to a single build. Prerelease and build metadata are
 * part of a concrete version (`2.0.0-beta.3` is exactly one release), so they match.
 */
export function isExactVersion(spec) {
    if (typeof spec !== 'string') {
        return false;
    }
    return /^=?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(spec.trim());
}

/** True when this package/peer/version triple is a documented, still-current exception. */
function isAllowed(packageName, peer, version) {
    return ALLOWED_EXACT_PEERS.some(
        (a) => a.package === packageName && a.peer === peer && a.version === version.trim(),
    );
}

/**
 * Every exact, non-allowlisted entry in one manifest's `peerDependencies`.
 *
 * @param {{name?: string, peerDependencies?: Record<string, string>}} manifest parsed package.json
 * @param {string} relPath path reported in the violation, relative to the repo root
 */
export function findExactPeers(manifest, relPath) {
    if (manifest === null || typeof manifest !== 'object') {
        throw new TypeError(`check-peer-ranges: ${relPath} did not parse to an object`);
    }
    const peers = manifest.peerDependencies;
    if (peers === undefined) {
        return [];
    }
    const packageName = manifest.name ?? relPath;
    const found = [];
    for (const [peer, version] of Object.entries(peers)) {
        if (isExactVersion(version) && !isAllowed(packageName, peer, version)) {
            found.push({ package: packageName, peer, version: version.trim(), file: relPath });
        }
    }
    return found;
}

/** Immediate subdirectory manifests of `root/dir`; [] when the directory is absent. */
function manifestsUnder(root, dir) {
    let entries;
    try {
        entries = readdirSync(join(root, dir), { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return [];
        }
        throw err;
    }
    const found = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const relPath = `${dir}/${entry.name}/package.json`;
        try {
            statSync(join(root, relPath));
        } catch (err) {
            if (err.code === 'ENOENT') {
                continue;
            }
            throw err;
        }
        found.push(relPath);
    }
    return found.sort();
}

/**
 * Scan the repo. Returns violations (exact peers) and stale allowances (documented exceptions that
 * no longer match anything on disk). Both fail the gate — a dead exception reads as a considered
 * decision long after the thing it excused is gone.
 */
export function runCheck(root) {
    const violations = [];
    const seenAllowances = new Set();

    for (const dir of SCANNED_DIRS) {
        for (const relPath of manifestsUnder(root, dir)) {
            const raw = readFileSync(join(root, relPath), 'utf8');
            let manifest;
            try {
                manifest = JSON.parse(raw);
            } catch (err) {
                throw new SyntaxError(`check-peer-ranges: ${relPath} is not valid JSON — ${err.message}`);
            }
            for (const hit of findExactPeers(manifest, relPath)) {
                violations.push(
                    `${hit.file}: peerDependencies["${hit.peer}"] is the exact version "${hit.version}". ` +
                        `A peer range is a compatibility claim, and an exact one claims ${hit.package} works ` +
                        `against that single build and no other — so npm fails with ERESOLVE on every host ` +
                        `whose ${hit.peer} differs, 'mj app install' finalizes the app as Disabled, and the ` +
                        `operator is told to fix their npm auth (see #211). Write a range: "^${hit.version}".`,
                );
            }
            const peers = manifest.peerDependencies ?? {};
            for (const allowance of ALLOWED_EXACT_PEERS) {
                if (manifest.name === allowance.package && peers[allowance.peer]?.trim() === allowance.version) {
                    seenAllowances.add(allowance);
                }
            }
        }
    }

    const stale = ALLOWED_EXACT_PEERS.filter((a) => !seenAllowances.has(a)).map(
        (a) =>
            `ALLOWED_EXACT_PEERS allows ${a.package} -> ${a.peer}@${a.version}, which no longer appears in ` +
            `any manifest. Delete the entry, or correct its version if the pin moved.`,
    );

    return { violations, stale };
}

/** CLI entry point. */
function main() {
    const { violations, stale } = runCheck(REPO_ROOT);
    if (violations.length > 0 || stale.length > 0) {
        console.error('Peer-range gate FAILED:\n');
        for (const v of violations) {
            console.error(`  ✗ ${v}\n`);
        }
        for (const s of stale) {
            console.error(`  ✗ ${s}\n`);
        }
        console.error(`${violations.length} exact peer(s), ${stale.length} stale allowance(s).`);
        process.exit(1);
    }
    console.log(`Peer-range gate passed (${SCANNED_DIRS.join(', ')}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
```

- [ ] **Step 4: Run the gate against the repo and watch it catch the real bug**

Run: `node scripts/check-peer-ranges.mjs; echo "exit=$?"`
Expected: **exit=1**, with a violation naming `packages/Angular/package.json` and `@angular/cdk` at `21.1.3`. This is the red state — the gate reproduces #211 from inside the repo.

- [ ] **Step 5: Run the spec**

Run: `node --test scripts/check-peer-ranges.spec.mjs`
Expected: every test passes EXCEPT `this repository has no exact peer ranges`, which fails naming `@angular/cdk`. That one test is the regression test for #211 and Task 2 turns it green.

If any *other* test fails, fix the gate before continuing — do not proceed to Task 2 with a broken gate.

- [ ] **Step 6: Add the npm scripts**

In the root `package.json` `scripts` block, next to the other `lint:` entries:

```json
    "lint:peer-ranges": "node scripts/check-peer-ranges.mjs",
    "lint:peer-ranges:test": "node --test scripts/check-peer-ranges.spec.mjs",
```

- [ ] **Step 7: Commit**

```bash
git add scripts/check-peer-ranges.mjs scripts/check-peer-ranges.spec.mjs package.json
git commit -m "$(cat <<'EOF'
test(ci): a gate that reads peer ranges, which nothing here did

An exact peerDependencies entry is the one defect class this repo cannot
see. It is a string only the host's npm resolver evaluates; the pnpm
workspace never evaluates it (no importers block records peerDependencies),
so neither the lockfile nor any unit test can reach it. #211 shipped in six
consecutive releases behind that blind spot.

The gate goes red on the repo as it stands, naming @angular/cdk. The fix
follows in the next commit.

type-graphql@2.0.0-beta.3 in forms-server is allowlisted with its reason:
MJServer declares that exact version as a direct dependency, so every host
already has precisely it. The allowance is keyed to the version as well as
the name, so following an upstream move expires the exception instead of
inheriting it.

Refs #211

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JXDkGksnskR7AGMDAnU3bG
EOF
)"
```

---

### Task 2: The fix

**Files:**
- Modify: `packages/Angular/package.json:30`

**Interfaces:**
- Consumes: `scripts/check-peer-ranges.mjs` from Task 1 (the gate that must go green).
- Produces: nothing new; `@mj-biz-apps/forms-ng`'s published peer contract changes.

- [ ] **Step 1: Make the change**

In `packages/Angular/package.json`, inside `peerDependencies` only:

```diff
     "@angular/animations": "^21.1.3",
-    "@angular/cdk": "21.1.3",
+    "@angular/cdk": "^21.1.3",
     "@angular/common": "^21.1.3",
```

**Do not touch the `devDependencies` block.** Its `"@angular/cdk": "21.1.3"` is the anchor and is correct exactly as it is — the repo installs one concrete version while claiming compatibility with the range.

- [ ] **Step 2: Run the gate — it must now be green**

Run: `node scripts/check-peer-ranges.mjs; echo "exit=$?"`
Expected: `Peer-range gate passed (packages, apps).` and **exit=0**.

- [ ] **Step 3: Run the gate's spec — all tests must now pass**

Run: `node --test scripts/check-peer-ranges.spec.mjs`
Expected: PASS, including `this repository has no exact peer ranges`.

- [ ] **Step 4: Confirm the lockfile did not move**

Run: `git status --porcelain pnpm-lock.yaml`
Expected: **empty output.** If it is not empty, stop and report — a documented assumption of this plan was wrong. Do **not** run `pnpm install` to "fix" it.

- [ ] **Step 5: Prove the fix against a real npm resolver, not just the gate**

The gate proves the manifest now reads correctly. It does not prove a host can install. Reproduce #211 and its fix end to end. Work in the scratchpad, never in the repo:

```bash
SCRATCH=/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/7fdab869-6296-411a-a122-378b618918bd/scratchpad/verify-211
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH/pkg/dist" && cd "$SCRATCH/pkg"

# Pack the REAL manifest as this branch now has it.
node -e "
const p=require('/Users/sohamdesai/Projects/mj-dev/bizapps-forms/packages/Angular/package.json');
delete p.scripts; delete p.devDependencies;
require('fs').writeFileSync('package.json', JSON.stringify(p,null,2));
console.log('cdk peer being shipped:', p.peerDependencies['@angular/cdk']);
"
echo 'export {};' > dist/public-api.js && echo 'export {};' > dist/public-api.d.ts
npm pack --silent

# A faithful stock MJ 6.1.0-edge.6 host: Angular platform 21.2.23, CDK on its own line at 21.2.14.
mkdir -p "$SCRATCH/host" && cd "$SCRATCH/host"
cat > package.json <<'JSON'
{
  "name": "verify-211-host", "version": "1.0.0", "private": true,
  "dependencies": {
    "@angular/core": "21.2.23", "@angular/common": "21.2.23", "@angular/forms": "21.2.23",
    "@angular/animations": "21.2.23", "@angular/platform-browser": "21.2.23",
    "@angular/cdk": "21.2.14",
    "@memberjunction/ng-base-forms": "6.1.0-edge.6",
    "@mj-biz-apps/forms-ng": "file:../pkg/mj-biz-apps-forms-ng-0.10.0.tgz"
  }
}
JSON
npm install --dry-run; echo "exit=$?"
```

Expected: `added <N> packages`, **exit=0**, no ERESOLVE, **no `--legacy-peer-deps` or `--force`**.

For contrast, the same host against published `0.10.0` (swap the `file:` spec for `"0.10.0"`) must still fail with `peer @angular/cdk@"21.1.3" from @mj-biz-apps/forms-ng@0.10.0`. That is the before/after pair the PR reports.

- [ ] **Step 6: Run the package's own tests**

Run: `cd packages/Angular && pnpm run test` (then return to the repo root)
Expected: PASS. A manifest edit should not move them; if it does, something else is wrong.

Note: if this reports ~38 failed *files* about missing modules, `packages/Entities/dist` has not been built — build it and re-run, that is not a regression from this change.

- [ ] **Step 7: Commit**

```bash
git add packages/Angular/package.json
git commit -m "$(cat <<'EOF'
fix(ng): @angular/cdk is a compatibility claim, not a pin

peerDependencies["@angular/cdk"] was the exact "21.1.3" — the only exact
@angular/* peer in the repo, next to five caret ranges. The CDK version line
moves independently of @angular/core, so a stock MJ 6.1.0-edge.6 host sits on
21.2.14 through no fault of its own, npm refuses the tree with ERESOLVE, and
`mj app install` finalizes Forms as Disabled while telling the operator to log
in to npm or fix their .npmrc. Neither is involved.

Verified on a faithful host (Angular 21.2.23, CDK 21.2.14, MJ 6.1.0-edge.6):
published 0.10.0 fails ERESOLVE exit 1 with the issue's exact message; this
manifest installs 378 packages, exit 0, no flags.

Live in production, not a regression on next: every published version from
0.5.0 through 0.10.0 carries it, so any host already running Forms on a 6.1
line newer than CDK 21.1.3 is sitting at Disabled right now. `mj app upgrade`
takes an Active install offline the same way, exits 0, and prints success.

The devDependencies anchor stays exact at 21.1.3 — that half was always right.

Closes #211

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JXDkGksnskR7AGMDAnU3bG
EOF
)"
```

---

### Task 3: Wire the gate into CI

**Files:**
- Modify: `.github/workflows/build.yml` (the `build-and-test` job)

**Interfaces:**
- Consumes: `lint:peer-ranges` and `lint:peer-ranges:test` from Task 1.
- Produces: nothing later tasks depend on.

**Why this job and not a new workflow:** the two rulesets require seven *job* names and nobody can bypass them. A new workflow would add a check that is not required, and `CLAUDE.md` is explicit that a path filter in `on: paths:` creates no check run at all. `build-and-test` is already required and already runs every other `lint:*` gate this way.

- [ ] **Step 1: Add the step**

In `.github/workflows/build.yml`, in the `build-and-test` job, immediately after the `Release-push gate` step (around line 219) and matching its shape:

```yaml
      - name: Peer-range gate
        run: npm run lint:peer-ranges:test && npm run lint:peer-ranges
```

Run the spec before the gate, exactly as `Release-push gate` does — a gate whose own tests are broken must fail as a broken gate, not as a clean repo.

- [ ] **Step 2: Verify the YAML parses and the step landed in the right job**

```bash
node -e "
const fs=require('fs');const src=fs.readFileSync('.github/workflows/build.yml','utf8');
const i=src.indexOf('Peer-range gate');
if(i<0){console.error('step not found');process.exit(1);}
const job=src.lastIndexOf('\n  build-and-test:',i);
const nextJob=src.slice(i).search(/\n  [a-z-]+:\n/);
console.log('in build-and-test:', job>=0);
console.log(src.slice(i-20,i+120));
"
```
Expected: `in build-and-test: true`, and the printed snippet shows the two-command `run:`.

- [ ] **Step 3: Run exactly what CI will run**

Run: `npm run lint:peer-ranges:test && npm run lint:peer-ranges`
Expected: tests pass, then `Peer-range gate passed (packages, apps).`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "$(cat <<'EOF'
ci: run the peer-range gate in build-and-test

Placed in build-and-test rather than its own workflow on purpose: the two
rulesets require seven job names with no bypass, a new workflow would add a
check nothing requires, and a path filter in `on: paths:` creates no check run
at all. The step runs the gate's own spec first, as the release-push gate does
— a broken gate must fail as a broken gate, not as a clean repo.

Refs #211

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JXDkGksnskR7AGMDAnU3bG
EOF
)"
```

---

### Task 4: The changeset, and telling operators how to get out

The fix reaches a host through a release. It does **not** clear the `Disabled` a host is already in — `mj app upgrade` leaves the status where it found it. Operators need to be told, in the doc they read when installs bite.

**Files:**
- Create: `.changeset/a-peer-range-is-a-compatibility-claim.md`
- Modify: `docs/install.md` (append a new section 7)

**Interfaces:**
- Consumes: nothing. Documentation only.
- Produces: nothing.

- [ ] **Step 1: Write the changeset**

Create `.changeset/a-peer-range-is-a-compatibility-claim.md`. **`patch`** — no migration, no metadata (`.claude/rules/changesets.md`), and the fixed group means a stray `minor` would move all four packages.

```markdown
---
"@mj-biz-apps/forms-ng": patch
---

`@angular/cdk` is a compatibility claim again, so Forms installs on a host that is not on exactly 21.1.3.

`forms-ng` declared `"@angular/cdk": "21.1.3"` in `peerDependencies` — exact, the only exact `@angular/*` peer in the repo, sitting next to five caret ranges. The CDK version line moves independently of `@angular/core`, so a stock MJ `6.1.0-edge.6` host is on `@angular/cdk@21.2.14` through no fault of its own. npm refuses the tree with `ERESOLVE`, and `mj app install` finishes its database work — schema created, all migrations applied, app recorded — and then finalizes Forms as **Disabled**, telling the operator to log in to npm or fix their `.npmrc`. Neither was ever involved.

**This is not a regression the release introduces.** Every published version from `0.5.0` through `0.10.0` carries the same exact peer, so any host that has installed Forms on a 6.1 line newer than CDK 21.1.3 is sitting at `Disabled` right now, and was told the cause was npm auth. `mj app upgrade` reproduces it on an existing installation: a host that went into the upgrade `Active` comes out `Disabled`, exit code 0, `✔ Successfully upgraded` printed — so an unattended operator gets no signal at all.

**The blast radius reached past Forms.** The only way past the `ERESOLVE` is `npm install --legacy-peer-deps`, and that flag disables npm's peer auto-install for the entire tree. A sibling app's required peers then silently fail to install, and it surfaces much later as a bare module-resolution error in the Explorer naming a package nobody was looking at. One exact peer in Forms could take a host's Explorer down through an app Forms does not ship.

**If your Forms app is `Disabled` today**, upgrading is not enough on its own — the upgrade does not clear the status it found. Re-run `npm install` in the host directory (it will now succeed without flags), then `mj app enable mj-bizapps-forms`. `docs/install.md` §7 has the full recovery, including how to tell this apart from a genuine npm auth failure.

A CI gate now reads every `peerDependencies` block and refuses an exact version, because nothing in this repo could see one before: it is a string only the host's resolver evaluates, the pnpm workspace never evaluates it, and no unit test can reach it — which is how it shipped six times.
```

- [ ] **Step 2: Add the operator recovery section**

Append to `docs/install.md`, as section 7, matching the file's existing voice ("the parts that bite"):

```markdown
## 7. `Disabled` after a clean install almost never means npm auth

`mj app install` and `mj app upgrade` do their database work first and resolve npm packages last.
When the npm step fails they still record the app, still exit **0**, still print
`✔ Successfully installed`, and then finalize the app as **Disabled** with:

```
App installed but left DISABLED — npm install failed, so its packages are not resolved.
package.json and config were updated; log in to npm ('npm login') or fix your .npmrc,
run 'npm install', then 'mj app enable mj-bizapps-forms'.
```

That message names npm auth because auth is the *common* cause, not because the CLI diagnosed it.
A dependency-resolution conflict produces the identical ending. Read the npm output above the
banner before touching your credentials:

- `npm error code E401` / `E403` / `ENEEDAUTH` — genuinely auth. `npm login`, or fix `.npmrc`.
- `npm error code ERESOLVE` — a version conflict. Auth is fine; no credential change will help.

An `ERESOLVE` naming a peer of an `@mj-biz-apps/*` package is a packaging defect in the app, and
worth reporting. Forms shipped one: `forms-ng` declared `@angular/cdk` as an exact peer through
`0.10.0`, so every host whose CDK was not exactly `21.1.3` — which is most of them, since the CDK
version line moves independently of `@angular/core` — installed Forms and got `Disabled`
(MemberJunction/bizapps-forms#211).

**Recovery, whatever the cause:** fix the underlying problem first, then

```bash
npm install                          # in the host directory; must exit 0 with no flags
mj app enable mj-bizapps-forms
```

Upgrading does **not** clear a `Disabled` status by itself — it leaves the status where it found
it — so a host that has been sitting at `Disabled` still needs the `enable` after the upgrade.

**Do not reach for `npm install --legacy-peer-deps` to get past an `ERESOLVE`.** It resolves the
symptom and disables npm's peer auto-install for the whole tree, so *other* apps' required peers
stop installing with nothing reporting it. That surfaces later as a bare module-resolution error
during an Explorer build, naming a package unrelated to whatever you were installing.
```

- [ ] **Step 3: Check the changeset against the rest of the branch**

```bash
grep -l "minor\|major" .changeset/*.md | head
```
Expected: whatever `next` already carries is untouched — you are only confirming **your** changeset says `patch`. Do not change anyone else's.

Then confirm yours parses as the tool expects:
```bash
head -4 .changeset/a-peer-range-is-a-compatibility-claim.md
```
Expected: `---`, `"@mj-biz-apps/forms-ng": patch`, `---`, blank.

- [ ] **Step 4: Commit**

```bash
git add .changeset/a-peer-range-is-a-compatibility-claim.md docs/install.md
git commit -m "$(cat <<'EOF'
docs: how to recognise and clear the Disabled this bug leaves behind

The fix reaches a host through a release; it does not clear a status the host
is already in, because `mj app upgrade` leaves the status where it found it.
Hosts running Forms 0.5.0-0.10.0 on a 6.1 line newer than CDK 21.1.3 are at
Disabled now and were told it was npm auth.

install.md gains the discriminator the CLI does not print — E401/E403/ENEEDAUTH
is auth, ERESOLVE is a packaging defect and no credential change will help —
plus the recovery, and why --legacy-peer-deps is the wrong way out of an
ERESOLVE: it disables peer auto-install tree-wide and breaks a sibling app's
Explorer build with an error naming neither.

patch, per .claude/rules/changesets.md: no migration, no metadata.

Refs #211

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JXDkGksnskR7AGMDAnU3bG
EOF
)"
```

---

## Final verification (run before opening the PR)

- [ ] `node --test scripts/check-peer-ranges.spec.mjs` — all pass
- [ ] `npm run lint:peer-ranges` — `Peer-range gate passed (packages, apps).`, exit 0
- [ ] `git status --porcelain pnpm-lock.yaml` — empty
- [ ] `git diff origin/next --stat` — exactly these files and no others:
      `.changeset/a-peer-range-is-a-compatibility-claim.md`, `.github/workflows/build.yml`,
      `docs/install.md`, `docs/superpowers/plans/2026-09-13-211-angular-cdk-peer-range.md`,
      `package.json`, `packages/Angular/package.json`, `scripts/check-peer-ranges.mjs`,
      `scripts/check-peer-ranges.spec.mjs`
- [ ] `git branch -vv` — tracks `origin/fix/211-angular-cdk-peer-range`, **not** `origin/next`
- [ ] The real-resolver check from Task 2 Step 5 passed with exit 0 and no flags

## Deliberately out of scope

Log these; do not build them in this PR.

- **A gate that checks a peer range actually CONTAINS its `devDependencies` anchor.** `^21.1.3` next to an anchor of `22.0.0` would be a different lie, and this gate would pass it. Real, but not what #211 was, and not worth widening the gate on speculation.
- **`type-graphql: 2.0.0-beta.3` in `packages/Server`.** Allowlisted with its reasoning rather than changed. It is the same *shape* but not the same bug: MJServer declares that exact version as a direct dependency, so every host has precisely it. It becomes a real hazard only if MJ moves and Forms does not — which the version-keyed allowlist now makes noisy rather than silent.
- **Anything about `mj app install` exiting 0 on a failed npm step, or its message naming npm auth without diagnosing it.** That is MJ core's CLI, not this repo. `docs/install.md` §7 documents the workaround from the operator's side.
