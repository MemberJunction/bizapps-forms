import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
    SCANNED_DIRS,
    isExactVersion,
    admitsOwnPrereleases,
    findExactMJDeps,
    findNonPrereleasePeers,
    runCheck,
} from './check-mj-version-ranges.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

// ── isExactVersion ──────────────────────────────────────────────────────────

test('a bare version is exact', () => {
    assert.equal(isExactVersion('6.1.1'), true);
});

test('a prerelease version is exact', () => {
    assert.equal(isExactVersion('6.1.0-edge.6'), true);
});

test('a caret range is not exact', () => {
    assert.equal(isExactVersion('^6.1.1'), false);
});

test('a workspace protocol is not exact', () => {
    assert.equal(isExactVersion('workspace:*'), false);
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

// ── findNonPrereleasePeers ──────────────────────────────────────────────────

test('an MJ peer that admits no prerelease is a violation', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.1' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 1);
});

test('an MJ peer anchored at a prerelease is fine', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { '@memberjunction/core': '^6.1.0-edge.6' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 0);
});

test('a non-MJ peer is ignored', () => {
    const hits = findNonPrereleasePeers(
        { name: 'p', peerDependencies: { 'type-graphql': '2.0.0-beta.3' } },
        'packages/P/package.json',
    );
    assert.equal(hits.length, 0);
});

// ── runCheck against synthetic trees ────────────────────────────────────────

function scratchRepo() {
    const root = mkdtempSync(path.join(tmpdir(), 'mjrange-'));
    mkdirSync(path.join(root, 'packages', 'P'), { recursive: true });
    return root;
}

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

test('runCheck scans only packages/ — apps/ exact deps are the documented model', () => {
    assert.deepEqual([...SCANNED_DIRS], ['packages']);
});

// ── the real repository must be clean ───────────────────────────────────────

test('this repository passes its own gate', () => {
    assert.deepEqual(runCheck(REPO_ROOT), []);
});
