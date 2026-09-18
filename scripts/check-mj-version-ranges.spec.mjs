import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
    isExactVersion,
    admitsOwnPrereleases,
    classifyPeerRange,
    findExactMJDeps,
    findNonPrereleasePeers,
    scannedManifests,
    runCheck,
} from './check-mj-version-ranges.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

/**
 * A synthetic repo shaped like this one: a root manifest (default `{}`, Rule 1 only) plus an
 * empty `packages/P/` a test can populate, plus a default `mj-app.json` (Rule 2's floor tuple —
 * `6.1.0-edge.6`, matching this repo's own `mjVersionRange`) that a test can suppress with
 * `mjAppRange: null` to exercise the missing/invalid-floor case.
 */
function scratchRepo({ rootManifest = {}, mjAppRange = '>=6.1.0-edge.6 <7.0.0' } = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'mjrange-'));
    mkdirSync(path.join(root, 'packages', 'P'), { recursive: true });
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'root', ...rootManifest }));
    if (mjAppRange !== null) {
        writeFileSync(path.join(root, 'mj-app.json'), JSON.stringify({ mjVersionRange: mjAppRange }));
    }
    return root;
}

// ── stdlib-only regression guard ────────────────────────────────────────────
// This is the regression guard for the actual defect being fixed: the gate previously
// `import`ed the `semver` package, which resolved only on the author's machine because that
// checkout sits inside a larger shared pnpm workspace whose hoisted node_modules happens to
// contain it. CI installs this repo standalone and has no such hoist, so every run failed with
// `ERR_MODULE_NOT_FOUND`. Assert directly against the module's own source so nobody can
// reintroduce a bare-specifier import here without this spec catching it.

test('the gate module imports nothing outside node: builtins', () => {
    const source = readFileSync(path.join(HERE, 'check-mj-version-ranges.mjs'), 'utf8');
    const specifiers = [...source.matchAll(/^import\s+.*?\sfrom\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    assert.ok(specifiers.length > 0, 'expected to find at least one import statement to check');
    for (const specifier of specifiers) {
        assert.ok(specifier.startsWith('node:'), `expected "${specifier}" to be a node: builtin import`);
    }
});

// ── isExactVersion ──────────────────────────────────────────────────────────

test('a bare version is exact', () => {
    assert.equal(isExactVersion('6.1.1'), true);
});

test('a prerelease version is exact', () => {
    assert.equal(isExactVersion('6.1.0-edge.6'), true);
});

test('a leading "=" version is exact — npm/pnpm treat it identically to the bare form', () => {
    assert.equal(isExactVersion('=6.1.1'), true);
});

test('a caret range is not exact', () => {
    assert.equal(isExactVersion('^6.1.1'), false);
});

test('a workspace protocol is not exact', () => {
    assert.equal(isExactVersion('workspace:*'), false);
});

test('an x-range is not exact — it would still link to a workspace sibling', () => {
    assert.equal(isExactVersion('6.x'), false);
});

test('a hyphen range is not exact — it would still link to a workspace sibling', () => {
    assert.equal(isExactVersion('6.1.1 - 6.2.0'), false);
});

test('a leading "v" (git-tag spelling) is still exact', () => {
    assert.equal(isExactVersion('v6.1.1'), true);
});

// ── admitsOwnPrereleases ────────────────────────────────────────────────────

test('a caret on a stable version admits no prerelease', () => {
    assert.equal(admitsOwnPrereleases('^6.1.1'), false);
});

test('a caret anchored at a prerelease admits that tuple', () => {
    assert.equal(admitsOwnPrereleases('^6.1.0-edge.6'), true);
});

test('a bare wildcard admits no prerelease', () => {
    assert.equal(admitsOwnPrereleases('*'), false);
});

test('an x wildcard (either case) admits no prerelease', () => {
    assert.equal(admitsOwnPrereleases('x'), false);
    assert.equal(admitsOwnPrereleases('X'), false);
});

test('the empty-after-trim string admits no prerelease — it is a valid wildcard, not garbage', () => {
    assert.equal(admitsOwnPrereleases('   '), false);
});

test('a tilde range reads the floor past a single-character operator', () => {
    assert.equal(admitsOwnPrereleases('~6.1.0'), false);
    assert.equal(admitsOwnPrereleases('~6.1.0-edge.1'), true);
});

test('a ">=" range strips the two-character operator before falling back to single-character ones', () => {
    assert.equal(admitsOwnPrereleases('>=6.1.0 <7.0.0'), false);
    assert.equal(admitsOwnPrereleases('>=6.1.0-edge.6 <7.0.0'), true);
});

test('a hyphen range reads its first comparator only, never the upper bound', () => {
    // Rule: find the FLOOR from the first comparator. No range intersection, no upper-bound
    // parsing — "6.1.1 - 6.2.0" must be read as floor 6.1.1, never as spanning to 6.2.0.
    assert.equal(admitsOwnPrereleases('6.1.1 - 6.2.0'), false);
    assert.equal(admitsOwnPrereleases('6.1.1-edge.1 - 6.2.0'), true);
});

test('a leading "v" on a range floor is accepted the same as on a bare version', () => {
    assert.equal(admitsOwnPrereleases('^v6.1.0-edge.6'), true);
});

// ── classifyPeerRange ───────────────────────────────────────────────────────

test('classifyPeerRange passes a range anchored at the target line and its own prerelease', () => {
    assert.equal(classifyPeerRange('^6.1.0-edge.6', '6.1.0-edge.6'), null);
});

test('classifyPeerRange fails a stable-only range as no-prerelease', () => {
    assert.equal(classifyPeerRange('^6.1.1', '6.1.0-edge.6'), 'no-prerelease');
});

test('classifyPeerRange fails a range anchored to a different tuple as wrong-line even though it admits its own prereleases', () => {
    // ^6.0.0-edge.1 admits 6.0.0's own prereleases (the property admitsOwnPrereleases checks) but
    // it refuses 6.1.0-edge.6 — the actual floor this app targets — so it must still fail.
    assert.equal(classifyPeerRange('^6.0.0-edge.1', '6.1.0-edge.6'), 'wrong-line');
});

test('classifyPeerRange fails workspace:*, latest, and ^^6.1.1 as invalid, not no-prerelease', () => {
    for (const v of ['workspace:*', 'latest', '^^6.1.1']) {
        assert.equal(classifyPeerRange(v, '6.1.0-edge.6'), 'invalid', `expected "${v}" to classify as invalid`);
    }
});

test('classifyPeerRange fails "not-a-range" and non-string values as invalid', () => {
    for (const v of ['not-a-range', 42, null, undefined, {}]) {
        assert.equal(classifyPeerRange(v, '6.1.0-edge.6'), 'invalid', `expected ${JSON.stringify(v)} to classify as invalid`);
    }
});

test('classifyPeerRange treats bare wildcards as valid ranges, never as invalid', () => {
    for (const v of ['*', 'x', 'X', '']) {
        assert.equal(classifyPeerRange(v, '6.1.0-edge.6'), 'no-prerelease', `expected "${v}" not to classify as invalid`);
    }
});

test('classifyPeerRange reads a ">= <" range\'s floor, ignoring its upper bound', () => {
    assert.equal(classifyPeerRange('>=6.1.0 <7.0.0', '6.1.0-edge.6'), 'no-prerelease');
    assert.equal(classifyPeerRange('>=6.1.0-edge.6 <7.0.0', '6.1.0-edge.6'), null);
});

test('classifyPeerRange reads a hyphen range\'s floor as its first comparator, not an intersection', () => {
    assert.equal(classifyPeerRange('6.1.1 - 6.2.0', '6.1.1'), 'no-prerelease');
});

// ── findExactMJDeps ─────────────────────────────────────────────────────────

test('an exact MJ devDependency is a violation', () => {
    const hits = findExactMJDeps(
        { name: 'p', devDependencies: { '@memberjunction/core': '6.1.1' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].dep, '@memberjunction/core');
    assert.equal(hits[0].block, 'devDependencies');
});

test('an exact MJ dependency (not devDependency) is a violation', () => {
    const hits = findExactMJDeps(
        { name: 'p', dependencies: { '@memberjunction/core': '6.1.1' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].dep, '@memberjunction/core');
    assert.equal(hits[0].block, 'dependencies');
});

test('a caret MJ devDependency is fine', () => {
    const hits = findExactMJDeps(
        { name: 'p', devDependencies: { '@memberjunction/core': '^6.1.1' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 0);
});

test('an exact NON-MJ devDependency is ignored — Angular anchors are the documented model', () => {
    const hits = findExactMJDeps(
        { name: 'p', devDependencies: { '@angular/core': '21.2.22' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 0);
});

test('findExactMJDeps normalizes a leading "=" so the suggested range is not "^=6.1.1"', () => {
    const hits = findExactMJDeps(
        { name: 'p', devDependencies: { '@memberjunction/core': '=6.1.1' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].bareVersion, '6.1.1');
});

// ── findNonPrereleasePeers ──────────────────────────────────────────────────

test('an MJ peer that admits no prerelease is a violation', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.1' } },
        'packages/P/package.json',
        '6.1.0-edge.6',
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].reason, 'no-prerelease');
});

test('an MJ peer anchored at the target line and its own prerelease is fine', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.0-edge.6' } },
        'packages/P/package.json',
        '6.1.0-edge.6',
    );
    assert.equal(hits.length, 0);
});

test('an MJ peer anchored to a different version line than mjVersionRange is a violation', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { '@memberjunction/core': '^6.0.0-edge.1' } },
        'packages/P/package.json',
        '6.1.0-edge.6',
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].reason, 'wrong-line');
});

test('an unparseable MJ peer range is invalid, not merely non-prerelease', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { '@memberjunction/core': 'workspace:*' } },
        'packages/P/package.json',
        '6.1.0-edge.6',
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].reason, 'invalid');
});

test('a non-MJ peer is ignored', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { 'type-graphql': '2.0.0-beta.3' } },
        'packages/P/package.json',
        '6.1.0-edge.6',
    );
    assert.equal(hits.length, 0);
});

// ── runCheck against synthetic trees ────────────────────────────────────────

test('runCheck flags an exact MJ devDependency under packages/', () => {
    const root = scratchRepo();
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({ name: 'p', devDependencies: { '@memberjunction/core': '6.1.1' } }),
    );
    const violations = runCheck(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /workspace sibling/);
});

test('runCheck flags an exact MJ devDependency in the repo-root manifest', () => {
    const root = scratchRepo({ rootManifest: { devDependencies: { '@memberjunction/cli': '6.1.1' } } });
    const violations = runCheck(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /^package\.json:/);
    assert.match(violations[0], /workspace sibling/);
});

test('runCheck does not apply Rule 2 to the repo root — an app root has no peer contract', () => {
    // peerDependencies on the root manifest would be unusual, but if present must not be policed:
    // Rule 2 is documented and implemented as packages/*-only.
    const root = scratchRepo({ rootManifest: { peerDependencies: { '@memberjunction/core': '^6.1.1' } } });
    assert.deepEqual(runCheck(root), []);
});

test('runCheck does not flag apps/ — exact MJ deps there are the documented model', () => {
    const root = scratchRepo();
    mkdirSync(path.join(root, 'apps', 'MJAPI'), { recursive: true });
    writeFileSync(
        path.join(root, 'apps', 'MJAPI', 'package.json'),
        JSON.stringify({ name: 'mjapi', dependencies: { '@memberjunction/core': '6.1.1' } }),
    );
    assert.deepEqual(runCheck(root), []);
});

test('runCheck flags an MJ peer that locks out Edge hosts', () => {
    const root = scratchRepo();
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({ name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.1' } }),
    );
    const violations = runCheck(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /ERESOLVE/);
});

test('runCheck flags an MJ peer anchored to the wrong version line with a distinct message', () => {
    const root = scratchRepo();
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({ name: 'p', peerDependencies: { '@memberjunction/core': '^6.0.0-edge.1' } }),
    );
    const violations = runCheck(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /different version line/);
    assert.doesNotMatch(violations[0], /ERESOLVE/);
});

test('runCheck reports an invalid MJ peer range with a distinct, accurate message', () => {
    const root = scratchRepo();
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({ name: 'p', peerDependencies: { '@memberjunction/core': '^^6.1.1' } }),
    );
    const violations = runCheck(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /not a valid.*semver range/);
    assert.doesNotMatch(violations[0], /ERESOLVE/);
});

test('runCheck throws a descriptive error when mj-app.json is missing but an MJ peer needs its floor tuple', () => {
    const root = scratchRepo({ mjAppRange: null });
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({ name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.0-edge.6' } }),
    );
    assert.throws(() => runCheck(root), /mj-app\.json/);
});

test('runCheck does not require mj-app.json when no manifest declares an MJ peer', () => {
    const root = scratchRepo({ mjAppRange: null });
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({ name: 'p', devDependencies: { '@memberjunction/core': '^6.1.1' } }),
    );
    assert.deepEqual(runCheck(root), []);
});

test('runCheck passes a clean tree', () => {
    const root = scratchRepo();
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({
            name: 'p',
            peerDependencies: { '@memberjunction/core': '^6.1.0-edge.6' },
            devDependencies: { '@angular/core': '21.2.22' },
        }),
    );
    assert.deepEqual(runCheck(root), []);
});

test('runCheck skips a stray non-directory entry directly under packages/ instead of crashing', () => {
    const root = scratchRepo();
    // A plain file sitting next to a real package dir — e.g. a stray README or .DS_Store — makes
    // join(base, entry, 'package.json') stat through a file, which is ENOTDIR, not ENOENT.
    writeFileSync(path.join(root, 'packages', 'README.md'), 'not a package');
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({ name: 'p', devDependencies: { '@memberjunction/core': '6.1.1' } }),
    );
    const violations = runCheck(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /workspace sibling/);
});

// ── the real repository must be clean ───────────────────────────────────────

test('this repository passes its own gate, having actually scanned its manifests', () => {
    const scanned = scannedManifests(REPO_ROOT);
    assert.ok(scanned.includes('package.json'), 'expected the root manifest to be scanned');
    assert.ok(
        scanned.includes('packages/Entities/package.json'),
        'expected packages/Entities/package.json to be scanned',
    );
    assert.ok(
        scanned.length >= 6,
        `expected the root manifest plus at least 5 package manifests, got ${scanned.length}: ${scanned.join(', ')}`,
    );
    assert.deepEqual(runCheck(REPO_ROOT), []);
});

// ── npm permits whitespace between an operator and its version ──────────────
// Regression guard for a defect in `rangeFloor`: it tokenized on whitespace BEFORE stripping the
// operator, so ">= 6.1.0-edge.6" made ">=" its own token and the version was unreachable. npm
// does not require the operator to be glued on — node-semver accepts ">= 6.1.0-edge.6", "^ 6.1.1"
// and "~ 6.1.1" and normalizes the space away. The sibling gate check-host-truth-codegen.mjs
// already allows it (`>=\s*` in its own lower-bound regex); this one did not, and turned a valid
// range into two different false statements: peers were reported as "not a valid semver range at
// all", and a spaced `mjVersionRange` made the whole gate throw "is not a usable semver range".

test('a peer range with a space after its operator is read, not called invalid', () => {
    assert.equal(classifyPeerRange('>= 6.1.0-edge.6', '6.1.0-edge.6'), null);
    assert.equal(classifyPeerRange('^ 6.1.0-edge.6', '6.1.0-edge.6'), null);
    assert.equal(classifyPeerRange('~ 6.1.0-edge.6', '6.1.0-edge.6'), null);
});

test('a spaced operator does not change a range verdict that is genuinely wrong', () => {
    // Still no prerelease -> still 'no-prerelease', not 'invalid'.
    assert.equal(classifyPeerRange('^ 6.1.1', '6.1.0-edge.6'), 'no-prerelease');
    // Still the wrong line -> still 'wrong-line'.
    assert.equal(classifyPeerRange('^ 6.0.0-edge.1', '6.1.0-edge.6'), 'wrong-line');
});

test('admitsOwnPrereleases sees through a space after the operator', () => {
    assert.equal(admitsOwnPrereleases('>= 6.1.0-edge.6'), true);
    assert.equal(admitsOwnPrereleases('>= 6.1.1'), false);
});

test('a spaced mjVersionRange yields its floor tuple instead of aborting the gate', () => {
    const root = scratchRepo({ mjAppRange: '>= 6.1.0-edge.6 <7.0.0' });
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({ name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.0-edge.6' } }),
    );
    assert.deepEqual(runCheck(root), []);
});

test('genuinely unparseable ranges are still reported as invalid', () => {
    // The fix must not turn the `invalid` classification into a catch-all pass.
    for (const bad of ['workspace:*', 'latest', '^^6.1.1', 'not-a-range', '>=', '^']) {
        assert.equal(classifyPeerRange(bad, '6.1.0-edge.6'), 'invalid', `expected ${JSON.stringify(bad)} to be invalid`);
    }
});

test('an empty range stays a wildcard, because npm reads "" as "*"', () => {
    // Not a defect and not changed by the whitespace fix: `semver.validRange('')` is `'*'`, so an
    // empty or all-whitespace range genuinely admits every version. It is therefore VALID and
    // fails Rule 2 on the accurate ground that it admits no prerelease of any specific tuple —
    // never on the false ground that it is unparseable.
    assert.equal(classifyPeerRange('', '6.1.0-edge.6'), 'no-prerelease');
    assert.equal(classifyPeerRange('   ', '6.1.0-edge.6'), 'no-prerelease');
    assert.equal(classifyPeerRange('*', '6.1.0-edge.6'), 'no-prerelease');
});

// ── Rule 2 must compare the WHOLE floor, not just its tuple ─────────────────
// A peer anchored to a HIGHER prerelease than mj-app.json's own floor passes a tuple-only
// comparison while refusing the very host the manifest names as supported: a 6.1.0-edge.6 host
// does not satisfy ^6.1.0-edge.9, so it ERESOLVEs — the #211 shape Rule 2 exists to refuse.
// The repo already had the right precedent: sync-app-version.mjs compares the full floor string,
// prerelease included, and this gate threw the prerelease away.

test('a peer anchored ABOVE mjVersionRange\'s own floor is a violation', () => {
    assert.equal(classifyPeerRange('^6.1.0-edge.9', '6.1.0-edge.6'), 'wrong-anchor');
    assert.equal(classifyPeerRange('^6.1.0-edge.99', '6.1.0-edge.6'), 'wrong-anchor');
});

test('a peer anchored BELOW mjVersionRange\'s own floor is a violation too', () => {
    // It claims support for hosts the app's own manifest refuses — drift in the other direction.
    assert.equal(classifyPeerRange('^6.1.0-edge.0', '6.1.0-edge.6'), 'wrong-anchor');
});

test('a peer anchored exactly at mjVersionRange\'s floor still passes', () => {
    assert.equal(classifyPeerRange('^6.1.0-edge.6', '6.1.0-edge.6'), null);
    assert.equal(classifyPeerRange('>=6.1.0-edge.6 <7.0.0', '6.1.0-edge.6'), null);
});

test('a wrong TUPLE is still reported as wrong-line, not conflated with a wrong anchor', () => {
    assert.equal(classifyPeerRange('^6.0.0-edge.1', '6.1.0-edge.6'), 'wrong-line');
    assert.equal(classifyPeerRange('^6.2.0-edge.1', '6.1.0-edge.6'), 'wrong-line');
});

test('runCheck catches an above-floor anchor in a real scan', () => {
    const root = scratchRepo({ mjAppRange: '>=6.1.0-edge.6 <7.0.0' });
    writeFileSync(
        path.join(root, 'packages', 'P', 'package.json'),
        JSON.stringify({ name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.0-edge.9' } }),
    );
    const violations = runCheck(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /anchor/i);
});

// ── a `||` union is judged on its first alternative, so refuse it by name ────
// rangeFloor reads one comparator. For "A || B" that silently judges A and ignores B, so
// "^6.1.1 || ^6.1.0-edge.6" — which semver confirms DOES admit 6.1.0-edge.6 — was reported as
// admitting no prerelease. Fails closed either way; the defect is the false explanation.

test('a union range is reported as unsupported, not misdiagnosed as no-prerelease', () => {
    assert.equal(classifyPeerRange('^6.1.1 || ^6.1.0-edge.6', '6.1.0-edge.6'), 'union');
    assert.equal(classifyPeerRange('^6.1.0-edge.6 || ^7.0.0', '6.1.0-edge.6'), 'union');
});

test('the union message names the real problem and does not claim the range is malformed', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.1 || ^6.1.0-edge.6' } },
        'packages/P/package.json',
        '6.1.0-edge.6',
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].reason, 'union');
});
