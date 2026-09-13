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
