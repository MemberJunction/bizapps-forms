import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
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

// npm normalises a leading `v` away, so `v21.1.3` is the same pin written like a git tag.
test('a v-prefixed version is exact', () => {
    assert.equal(isExactVersion('v21.1.3'), true);
});

test('a v-prefixed caret range is not exact', () => {
    assert.equal(isExactVersion('^v21.1.3'), false);
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

test('an allowance is scoped to its package — another package may not claim the same peer', () => {
    // The allowance is keyed on package AND peer AND version. The version key is covered above;
    // without this, dropping `a.package === packageName` would let ANY package inherit
    // forms-server's type-graphql exception, and the gate would go quiet on a real exact peer.
    const found = findExactPeers(
        { name: '@mj-biz-apps/forms-impostor', peerDependencies: { 'type-graphql': '2.0.0-beta.3' } },
        'packages/Impostor/package.json',
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].package, '@mj-biz-apps/forms-impostor');
    assert.equal(found[0].peer, 'type-graphql');
});

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

// The message must not tell the operator to "write a range" for a pair that already has a
// documented allowance — that advice contradicts the allowance's own reasoning (a range IS the
// lie for type-graphql's prerelease line). It must instead say the exception has expired and name
// the version it still expects.
test('runCheck tells an expired allowance to be re-argued, not to write a range', () => {
    const allowed = ALLOWED_EXACT_PEERS[0];
    const root = writeTree({
        'packages/Server/package.json': {
            name: allowed.package,
            peerDependencies: { [allowed.peer]: '2.0.0-rc.4' },
        },
    });
    const { violations } = runCheck(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /expired/i);
    assert.match(violations[0], new RegExp(allowed.version.replace(/\./g, '\\.')));
    assert.doesNotMatch(violations[0], /Write a range: "\^/);
});

// An empty tree has no manifest for the documented type-graphql allowance to match, so `stale` is
// correctly non-empty here too — this test is only about the scan tolerating a missing directory,
// not about the allowlist being satisfied, so both outcomes are asserted rather than just one.
test('runCheck tolerates a missing scanned directory (and correctly reports the allowlist as stale on it)', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'peer-ranges-empty-'));
    const { violations, stale } = runCheck(root);
    assert.deepEqual(violations, []);
    assert.equal(stale.length, ALLOWED_EXACT_PEERS.length);
});

test('the scanned directories are the ones this repo publishes from', () => {
    assert.deepEqual([...SCANNED_DIRS], ['packages', 'apps']);
});

// ── Fail-fast guards ────────────────────────────────────────────────────────────────────────────
// Per this repo's design rules, a manifest that cannot be trusted must throw with context, never
// be swallowed into an empty result. Neither guard below had a test before this.

test('findExactPeers throws a TypeError when the manifest did not parse to an object', () => {
    assert.throws(() => findExactPeers(null, 'packages/Broken/package.json'), TypeError);
    assert.throws(
        () => findExactPeers('not an object', 'packages/Broken/package.json'),
        (err) => {
            assert.ok(err instanceof TypeError);
            assert.match(err.message, /packages\/Broken\/package\.json/);
            return true;
        },
    );
});

test('runCheck throws a SyntaxError naming the file for invalid JSON', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'peer-ranges-badjson-'));
    mkdirSync(path.join(root, 'packages/Broken'), { recursive: true });
    writeFileSync(path.join(root, 'packages/Broken/package.json'), '{ not valid json');
    assert.throws(
        () => runCheck(root),
        (err) => {
            assert.ok(err instanceof SyntaxError);
            assert.match(err.message, /packages\/Broken\/package\.json/);
            return true;
        },
    );
});

// ── The CLI ─────────────────────────────────────────────────────────────────────────────────────
// The exit code is the whole point of the CI step: `build-and-test` is a required check on both
// rulesets with no bypass, so a gate that exits 0 on violations reports PASS forever and says
// nothing. That failure mode is silence, which is why each case below is driven through the real
// process rather than through runCheck().
//
// main() reads REPO_ROOT from the script's own location (`import.meta.url`), not from an argument
// — so a synthetic tree is reached by COPYING the script into one, no root-override mechanism
// required. The gate imports only node builtins, so the copy runs standalone.
//
// Pattern: scripts/check-codegen-append.spec.mjs, which asserts both directions — a clean `exits 0`
// plus `FIRES:` cases wrapping execFileSync in assert.throws and checking err.status.

/** A minimal repo the gate can scan, with the gate itself copied in so REPO_ROOT resolves to it. */
function syntheticRepo(label, manifests) {
    const root = mkdtempSync(path.join(tmpdir(), `peer-ranges-${label}-`));
    mkdirSync(path.join(root, 'scripts'), { recursive: true });
    copyFileSync(path.join(HERE, 'check-peer-ranges.mjs'), path.join(root, 'scripts/check-peer-ranges.mjs'));
    for (const [rel, manifest] of Object.entries(manifests)) {
        mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
        writeFileSync(path.join(root, rel), JSON.stringify(manifest, null, 2));
    }
    return root;
}

/** Runs the gate's CLI in `root` and returns { status, stdout, stderr }, never throwing. */
function runCli(root) {
    const r = spawnSync('node', ['scripts/check-peer-ranges.mjs'], { cwd: root, encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

test('the CLI exits 0 on this repo and prints the pass line', () => {
    const out = execFileSync('node', ['scripts/check-peer-ranges.mjs'], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.match(out, /Peer-range gate passed \(packages, apps\)\./);
});

test('FIRES: the CLI exits 1 and names the offender when a peer is exact', () => {
    // #211 itself, planted. Without this, `process.exit(1)` could become `exit(0)` — one
    // character — and the required check would go green over every exact peer forever, with all
    // the other tests here still passing.
    const root = syntheticRepo('violation', {
        'packages/Angular/package.json': { name: '@mj-biz-apps/forms-ng', peerDependencies: { '@angular/cdk': '21.1.3' } },
        'packages/Server/package.json': { name: '@mj-biz-apps/forms-server', peerDependencies: { 'type-graphql': '2.0.0-beta.3' } },
    });
    const { status, stderr } = runCli(root);
    assert.equal(status, 1, `expected a failing exit code, got ${status}`);
    assert.match(stderr, /Peer-range gate FAILED/);
    assert.match(stderr, /packages\/Angular\/package\.json/);
    assert.match(stderr, /@angular\/cdk/);
    assert.match(stderr, /1 exact peer\(s\), 0 stale allowance\(s\)\./);
});

test('FIRES: the CLI exits 1 when the only problem is a stale allowance', () => {
    // The `|| stale.length > 0` disjunct in main() is the only thing that reaches exit(1) here.
    // Dropping it leaves a dead exception reading as a considered decision, which is the exact
    // thing ALLOWED_EXACT_PEERS' own docstring says must not be allowed to sit around.
    const root = syntheticRepo('stale', {
        'packages/Server/package.json': { name: '@mj-biz-apps/forms-server', peerDependencies: { 'type-graphql': '^2.0.0-beta.3' } },
    });
    const { status, stderr } = runCli(root);
    assert.equal(status, 1, `a stale allowance alone must fail the gate, got exit ${status}`);
    assert.match(stderr, /no longer appears in any manifest/);
    assert.match(stderr, /0 exact peer\(s\), 1 stale allowance\(s\)\./);
});

test('FIRES: the CLI exits 1 when a documented allowance has expired', () => {
    // The pin moved and ALLOWED_EXACT_PEERS was not re-argued to follow it. Distinct from the two
    // cases above because it reports BOTH a violation and a stale allowance for the same entry.
    const root = syntheticRepo('expired', {
        'packages/Server/package.json': { name: '@mj-biz-apps/forms-server', peerDependencies: { 'type-graphql': '2.0.0-beta.4' } },
    });
    const { status, stderr } = runCli(root);
    assert.equal(status, 1);
    assert.match(stderr, /has simply expired, and must be re-argued/);
    assert.doesNotMatch(stderr, /Write a range/);
});

// ── The repo itself ─────────────────────────────────────────────────────────────────────────────

test('this repository has no exact peer ranges', () => {
    const { violations, stale } = runCheck(REPO_ROOT);
    assert.deepEqual(violations, [], violations.join('\n'));
    assert.deepEqual(stale, [], stale.join('\n'));
});
