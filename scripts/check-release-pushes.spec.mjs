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
    assert.deepEqual(findProtectedPushes('git push origin refs/tags/v1.2.3\n'), []);
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
