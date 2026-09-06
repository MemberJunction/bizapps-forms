import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathsTouched, resolveDecision } from './check-paths-touched.mjs';

const ZERO = '0'.repeat(40);

test('a trailing slash matches by prefix', () => {
    assert.equal(pathsTouched({ changed: ['packages/Angular/src/a.ts'], patterns: ['packages/'] }), true);
});

test('a prefix pattern does not match a sibling with the same first letters', () => {
    assert.equal(pathsTouched({ changed: ['packages-old/a.ts'], patterns: ['packages/'] }), false);
});

test('a pattern without a trailing slash must match exactly', () => {
    assert.equal(pathsTouched({ changed: ['turbo.json'], patterns: ['turbo.json'] }), true);
    assert.equal(pathsTouched({ changed: ['a/turbo.json'], patterns: ['turbo.json'] }), false);
});

test('an exact pattern does not match a path that merely starts with it', () => {
    assert.equal(pathsTouched({ changed: ['package.json.bak'], patterns: ['package.json'] }), false);
});

test('any one matching path is enough', () => {
    assert.equal(pathsTouched({ changed: ['README.md', 'apps/MJAPI/x.mjs'], patterns: ['packages/', 'apps/'] }), true);
});

test('no changed paths means nothing was touched', () => {
    assert.equal(pathsTouched({ changed: [], patterns: ['packages/'] }), false);
});

// The asymmetry that matters: a wrong "false" skips the job, and a skipped job reports SUCCESS.
test('an unreadable diff fails open', () => {
    assert.equal(resolveDecision({ baseSha: 'a1', headSha: 'b2', changedOrNull: null, patterns: ['packages/'] }), true);
});

test('an all-zeroes base sha fails open', () => {
    assert.equal(resolveDecision({ baseSha: ZERO, headSha: 'b2', changedOrNull: [], patterns: ['packages/'] }), true);
});

test('a missing base sha fails open', () => {
    assert.equal(resolveDecision({ baseSha: '', headSha: 'b2', changedOrNull: [], patterns: ['packages/'] }), true);
});

test('a readable diff that misses every pattern is the one case that returns false', () => {
    assert.equal(resolveDecision({ baseSha: 'a1', headSha: 'b2', changedOrNull: ['README.md'], patterns: ['packages/'] }), false);
});

test('a readable diff that hits a pattern returns true', () => {
    assert.equal(resolveDecision({ baseSha: 'a1', headSha: 'b2', changedOrNull: ['packages/x.ts'], patterns: ['packages/'] }), true);
});

test('no patterns at all fails open rather than skipping everything', () => {
    assert.equal(resolveDecision({ baseSha: 'a1', headSha: 'b2', changedOrNull: ['README.md'], patterns: [] }), true);
});
