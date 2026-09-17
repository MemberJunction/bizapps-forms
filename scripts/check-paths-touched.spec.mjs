import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('a missing head sha fails open', () => {
    assert.equal(resolveDecision({ baseSha: 'a1', headSha: '', changedOrNull: [], patterns: ['packages/'] }), true);
});

test('an all-zeroes head sha fails open', () => {
    assert.equal(resolveDecision({ baseSha: 'a1', headSha: ZERO, changedOrNull: [], patterns: ['packages/'] }), true);
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

// ── build.yml's scope list is only as good as what is IN it ─────────────────────────────────────
// Everything above pins the decider's logic. This pins the list it is asked to decide over, which
// is the half that actually skips the job. The two are not the same failure: a perfect decider fed
// a short list still answers "no" to a relevant diff, and `build-and-test` then reports `skipped`,
// which a required status check treats as PASSING — a green required check over a build that never
// ran. That is the exact bug .claude/ was added to fix, and it was not the only instance.
//
// Root-level build inputs are the ones a `packages/**`-shaped glob can never reach, so they have to
// be named. Each entry below is here because changing it can change the outcome of `pnpm run build`,
// `npm run typecheck` or `npm test` — verified for tsconfig.server.json by perturbing it and running
// `npx turbo typecheck --force`, which went from 9 successful to `error TS2688`, 0 of 2.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD_YML = path.join(HERE, '..', '.github', 'workflows', 'build.yml');

/** The argument list build.yml actually passes to this script, read from the workflow itself. */
function scopeListFromWorkflow() {
    const yml = readFileSync(BUILD_YML, 'utf8');
    const start = yml.indexOf('check-paths-touched.mjs "$BASE_SHA" "$HEAD_SHA"');
    assert.notEqual(start, -1, 'build.yml no longer invokes check-paths-touched.mjs as expected');
    const end = yml.indexOf(')', start);
    assert.notEqual(end, -1, 'could not find the end of the check-paths-touched.mjs invocation');
    return yml
        .slice(yml.indexOf('\\', start) + 1, end)
        .split('\n')
        .map((line) => line.replace(/\\\s*$/, '').trim())
        .filter(Boolean);
}

// F8: build.yml asserts "check-paths-touched.spec.mjs pins each of these". It has to be true of
// EVERY entry, not just the root files — dropping `smoke/` would silently stop three plain-Node
// specs (build.yml's "Smoke fixture wiring", "sqlcmd session-option" and "target resolution" steps)
// from ever running on a smoke-only PR, with the required check reporting `skipped` = pass.
const EXPECTED_SCOPE = {
    'pnpm-lock.yaml': 'the resolved dependency graph',
    'pnpm-workspace.yaml': 'workspace members and linkWorkspacePackages',
    '.npmrc': 'auto-install-peers and the @mj-biz-apps registry',
    'turbo.json': 'the task graph and cache keys',
    'package.json': 'the scripts build-and-test runs',
    'tsconfig.angular.json': 'extends target of packages/Angular',
    'tsconfig.server.json': 'extends target of the four server-side packages',
    'packages/': 'the product code and every Vitest suite',
    'apps/': 'the MJAPI harness is a workspace member, so it is in the lockfile',
    'scripts/': 'the gate scripts and their specs',
    'smoke/': 'smoke/lib/{fixture,sqlcmd,target}.spec.mjs run in build-and-test and nowhere else',
    'migrations/': 'question-types.spec.ts reads migrations/ and runs inside npm test',
    '.github/scripts/': 'validate-widget-bundle.sh and the package-lock case test run here',
    '.claude/': 'lint:hook-guard:test and lint:git-gate:test run nowhere else',
    '.github/workflows/': 'check-release-pushes.mjs reads every workflow, so a PR editing any one of them must run it',
    'ci/': 'the release scripts that pushed straight to main and next lived here (#177); a PR reintroducing the directory must run the gate that forbids it',
};

test('every entry build.yml relies on is pinned here, so shortening the list fails a required check', () => {
    const scope = scopeListFromWorkflow();
    assert.deepEqual(
        [...scope].sort(),
        Object.keys(EXPECTED_SCOPE).sort(),
        'build.yml\'s scope list and this spec have diverged — add the entry here with its reason, ' +
        'or explain the removal. A silently shortened list is a green required check over a skipped job.',
    );
});

const ROOT_LEVEL_BUILD_INPUTS = {
    'tsconfig.angular.json': 'extends target of packages/Angular/tsconfig.json',
    'tsconfig.server.json': 'extends target of Server, CoreEntitiesServer, Actions and Entities',
    'pnpm-workspace.yaml': 'workspace members and linkWorkspacePackages; pnpm install --frozen-lockfile reads it',
    '.npmrc': 'auto-install-peers and the @mj-biz-apps registry; decides what installs at all',
    'pnpm-lock.yaml': 'the resolved dependency graph',
    'package.json': 'the scripts build-and-test runs',
    'turbo.json': 'the task graph and cache keys',
};

test('the workflow scope list is readable from build.yml', () => {
    const scope = scopeListFromWorkflow();
    assert.ok(scope.includes('packages/'), `expected packages/ in the scope list, got ${scope.join(' ')}`);
    assert.ok(scope.includes('.claude/'), 'the .claude/ entry must not be dropped');
});

for (const [file, why] of Object.entries(ROOT_LEVEL_BUILD_INPUTS)) {
    test(`build-and-test runs when only ${file} changes (${why})`, () => {
        assert.equal(
            pathsTouched({ changed: [file], patterns: scopeListFromWorkflow() }),
            true,
            `${file} is a build input, but the scope list skips build-and-test for it — and a ` +
            'skipped job reports SUCCESS to a required status check.',
        );
    });
}

test('documentation-only root files still skip the job', () => {
    const scope = scopeListFromWorkflow();
    for (const doc of ['README.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'LICENSE']) {
        assert.equal(pathsTouched({ changed: [doc], patterns: scope }), false, `${doc} should not force a build`);
    }
});

// F1. Not a root FILE but a root DIRECTORY, and it was missed for the same reason the four root
// files were: nothing under `packages/**` names it, so no glob-shaped intuition reaches it. The
// coupling is real and load-bearing — packages/Entities/src/contracts/question-types.spec.ts reads
// every migration, extracts the last CK_FormQuestion_QuestionType CHECK, and asserts it equals the
// hand-written FORM_QUESTION_TYPES union. That spec runs under `vitest run`, i.e. inside `npm test`,
// i.e. inside build-and-test. Proven: adding a migration that widens the constraint and touching
// nothing else makes the decider answer `false` while that spec fails with
// `expected [ 'GauntletProbeType' ] to deeply equal [ 'Address', 'Checkbox', …(23) ]`.
// The append gate makes such PRs normal rather than exotic: check-codegen-append.mjs CHECK 2 wants
// CodeGen output appended INTO the migration file, so a DDL change legitimately touches only
// migrations/.
test('build-and-test runs when only a migration changes', () => {
    assert.equal(
        pathsTouched({
            changed: ['migrations/V202609071200__v0.3.0__WidenQuestionType.sql'],
            patterns: scopeListFromWorkflow(),
        }),
        true,
        'a migration-only PR skips build-and-test, and `skipped` passes a required check — over a ' +
        'suite that question-types.spec.ts would have turned red.',
    );
});

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
