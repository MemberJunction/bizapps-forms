# Make CI Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pull request with a failing gate cannot be merged to `next` or `main`, and a local hook
refuses the commit that would produce one.

**Architecture:** Three moving parts, in a fixed order. (1) Every required job must *report on every
PR*, which means the `paths:` filtering moves out of the `on:` trigger — where a skip creates no
check run at all — and into a job-level `if:`, where a skip reports `skipped` and counts as passing.
(2) Only then do the two rulesets gain a `required_status_checks` rule, plus a bypass for the release
automation, which pushes directly to both branches. (3) A `PreToolUse` hook runs the same two checks
that caught #167 before a `git commit` or `git push` is allowed to run.

**Tech Stack:** GitHub Actions, GitHub repository rulesets (REST API), Node ≥20 stdlib only for every
gate and hook, turbo (content-cached `typecheck`), pnpm workspace.

**Spec:** Issue #173 (`gh issue view 173`) and the Phase-1 evidence recorded in this plan's
**Findings** section below.

---

## Global Constraints

- **Every gate and hook is Node stdlib only.** No `npm ci`, no marketplace actions, no `jq`, no
  shell shebang dependence. A gate on the build must not need the build. This is repo doctrine,
  stated in the header of every existing gate — do not introduce `dorny/paths-filter` or similar.
- **Every gate ships a spec, and the spec runs in CI.** `npm test` is Vitest and never executes a
  plain-Node `.mjs` spec, so a new spec must be wired into a workflow explicitly.
- **Node used by the gate workflows:** `20` for the stdlib gates, `24` for build/ui/generated —
  match whatever the workflow already declares; do not change it.
- **Required job names, exactly** (GitHub matches the *job* name, never the workflow name):
  `build-and-test` · `changes_and_migrations` · `codegen-append-gate` · `distribution-gate` ·
  `generated-scope-gate` · `migration-order-gate` · `ui-token-gate`
- **Ruleset ids:** `20589383` = `next-protect`, `18239666` = `protect-main`.
- **GitHub Actions app Integration id:** `15368` (verified: `gh api /apps/github-actions`).
- **Fail open, never closed, when deciding whether an expensive job runs.** Skipping a job reports
  *success*; a wrong "skip" is a silently-green gate, which is the failure class this repo keeps
  fixing. Any doubt ⇒ run the job.
- **Branching:** cut from `next`, track `origin/<same-name>`, PR into `next`. Never commit to `main`.
- **Changeset:** `patch` — this change ships no migration and no metadata
  (`.claude/rules/changesets.md`).

---

## Findings (Phase 1 evidence — argue from these, do not re-derive)

Measured on this machine; CI numbers are from the workflows' own recorded measurements.

| gate step | cost |
|---|---|
| `lint:ui` + self-test | 0.2s |
| `lint:migrations` + spec | 0.4s |
| `lint:generated` + self-test + `lint:codegen-compat(:test)` | 0.4s |
| `lint:codegen-append` + `:test` | 0.7s |
| `lint:distribution` + spec | 2.6s |
| `lint:distribution:mutants` | **7m08s on CI** |
| `build-and-test` (whole job) | **~30 min budget** |
| `turbo typecheck` warm | 13ms (content-cached) |

Trigger matrix as found:

| job | workflow | PR branches | `on: paths:` | push trigger |
|---|---|---|---|---|
| build-and-test | build.yml | **[next] only** | yes | **[next] only** |
| changes_and_migrations | changes.yml | [next, main] | **no** | none |
| codegen-append-gate | codegen-append-gate.yml | [next, main] | yes | [next, main] |
| distribution-gate | distribution-gate.yml | [next, main] | yes | [next, main] |
| generated-scope-gate | generated-scope-gate.yml | [next, main] | yes | [next, main] |
| migration-order-gate | migration-order-gate.yml | [next, main] | yes | [next, main] |
| ui-token-gate | ui-gate.yml | [next, main] | yes | **none** |

**B1 (root cause).** Neither ruleset carries `required_status_checks`. Both list only `deletion` and
`non_fast_forward`; `enforcement: active` enforces exactly what is listed, so merge-ability never
consults a check conclusion. No classic branch protection either (404 on both branches).

**B2 (blocker).** A workflow skipped by an `on: paths:` filter creates **no check run**, so a
required check stays at "Expected — Waiting for status" and the PR is unmergeable forever. Proven on
this repo's own history: PR #167 ran 3 of 7 jobs, PR #168 ran 4 of 7. A job skipped by a *job-level*
`if:` instead reports conclusion `skipped`, which required status checks treat as passing — Task 5
proves this empirically rather than trusting the documentation.

**B3 (release-breaking, new).** `ci/commit_push.mjs` runs `git push origin HEAD:main` with the commit
message `Version Packages [skip ci]` — live artifact `1ae7c02`, the current head of `origin/main` —
and `ci/merge_main_and_update_lock.mjs` runs `git push origin HEAD:next`. Ruleset required status
checks apply to **direct pushes**, and `[skip ci]` guarantees no workflow ever runs on that commit,
so its check can never report and the push is rejected permanently. Without a bypass actor, enabling
B1 breaks the release pipeline at the version-bump step.

**B4 (deadlock on main, new).** `build.yml` filters both triggers to `branches: [next]`. A
pull_request event never fires for a PR whose base is `main`, so requiring `build-and-test` on
`18239666` would hang every PR to `main`, including the `next` → `main` release promotion PR.

**B5 (coverage gap, new).** `ui-gate.yml` has no `push:` trigger at all, so a hardcoded colour
reaching `next` by direct push is never checked. Confirmed: `ui-token-gate` is absent from the check
runs on `87d43ef`, the current head of `next`.

**B6 (no local gate).** `.claude/settings.json` registers only `block-generated-edits.mjs` on
`Write|Edit|NotebookEdit`. Nothing runs `typecheck` or `lint:ui` before a commit or a push, which is
how both of #167's defects reached CI at all.

**B7 (record only).** Issue #173 quotes `"rules": []` for `20589383`. Today both rulesets carry
`deletion` + `non_fast_forward`. The enforcement gap is real; that one quoted line is out of date.
Do not go looking for an empty rule list.

**B8 (record only, no fix planned).** PR #43 shows two check runs both named `distribution-gate`.
Required checks resolve by the most recent run of a given name, so a stale duplicate can mis-report.
Left alone deliberately: no failure has been observed from it, and speculative work on it is outside
this change's blast radius.

**Precondition (satisfied).** PR #163 merged 2026-09-06T23:16:23Z; its merge commit `87d43ef` is the
head of `origin/next`; all five checks that ran on it are green, and `lint:ui` + `typecheck` pass
locally on it. The base is green — required checks can be enabled without blocking everything.

---

## File Structure

**Created**
- `scripts/check-paths-touched.mjs` — the one place that answers "did this diff touch anything
  matching these patterns?", including base-SHA resolution per event type and the fail-open rule.
  Consumed by the only two workflows that must stay conditional.
- `scripts/check-paths-touched.spec.mjs` — its spec. The restrictive-direction failure ("skip the
  build") reports *success*, so this logic must not be an untested regex in YAML.
- `.claude/hooks/require-green-before-git.mjs` — `PreToolUse` hook; refuses a `git commit`/`git push`
  Bash call when `lint:ui` or `typecheck` fails.
- `.claude/hooks/require-green-before-git.spec.mjs` — its spec, including the allow-cases that stop
  a future "deny everything" from passing as a fix.
- `.changeset/ci-required-status-checks.md` — `patch`.

**Modified**
- `.github/workflows/ui-gate.yml` — drop `on: paths:`; add the missing `push:` trigger (B5).
- `.github/workflows/migration-order-gate.yml` — drop `on: paths:`.
- `.github/workflows/generated-scope-gate.yml` — drop `on: paths:`.
- `.github/workflows/codegen-append-gate.yml` — drop `on: paths:`.
- `.github/workflows/build.yml` — add `main` to both triggers (B4); drop `on: paths:`; add a `scope`
  job and gate `build-and-test` on it (B2, expensive case).
- `.github/workflows/distribution-gate.yml` — drop `on: paths:`; gate only the 7-minute mutant step.
- `.claude/settings.json` — register the new hook on `Bash`.
- `package.json` — `lint:paths-touched:test`, `lint:git-gate:test`.
- `CLAUDE.md` — record that CI is now blocking and how to bypass in a genuine emergency.

**Changed outside the repo (Task 6, not a file)**
- Rulesets `20589383` and `18239666` via the REST API.

---

### Task 1: The four sub-3s gates report on every PR

The whole `paths:` apparatus on these four buys under three seconds of runner time each and costs a
permanently-hung PR the moment they are required. Delete the filter rather than teach it to skip
correctly — the special case ceases to exist. `ui-gate.yml` also gains the `push:` trigger it never
had (B5).

**Files:**
- Modify: `.github/workflows/ui-gate.yml`
- Modify: `.github/workflows/migration-order-gate.yml`
- Modify: `.github/workflows/generated-scope-gate.yml`
- Modify: `.github/workflows/codegen-append-gate.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: four jobs — `ui-token-gate`, `migration-order-gate`, `generated-scope-gate`,
  `codegen-append-gate` — that create a check run on **every** pull request to `next` or `main`,
  and on every push to those branches.

- [ ] **Step 1: Replace the `on:` block in `.github/workflows/ui-gate.yml`**

Everything from `on:` up to (not including) `concurrency:` becomes:

```yaml
on:
  workflow_dispatch:
  # No `paths:` filter, and that is the point. A workflow skipped by an `on: paths:` filter creates
  # NO check run, so a required check sits at "Expected — Waiting for status" and the pull request
  # can never be merged. This gate costs 0.2s; buying that back was never worth a filter, and once
  # `ui-token-gate` is a required check the filter is actively a deadlock. See #173.
  #
  # `push:` is new. Without it a hardcoded colour reaching next by direct push — the release
  # workflow's own `mergemain:update-lock`, or an admin push — was never checked at all, which is
  # why next's head carried no UI-token verdict.
  push:
    branches: [next, main]
  pull_request:
    branches: [next, main]
```

- [ ] **Step 2: Delete the `paths:` block from `.github/workflows/migration-order-gate.yml`**

Delete the `paths:` key and its list under **both** `push:` and `pull_request:`, leaving
`branches: [next, main]` in each. Directly above `push:`, add:

```yaml
  # No `paths:` filter: this gate is a required check, and a workflow skipped by `on: paths:`
  # creates no check run at all, which hangs the pull request on "Expected" forever. It costs 0.4s
  # to simply always run. See #173.
```

- [ ] **Step 3: Delete the `paths:` block from `.github/workflows/generated-scope-gate.yml`**

Same edit, same comment (this gate costs 0.4s). Keep `concurrency:` untouched.

- [ ] **Step 4: Delete the `paths:` block from `.github/workflows/codegen-append-gate.yml`**

Same edit, same comment (this gate costs 0.7s). Leave the two `if:` guards on the CHECK 2 steps
exactly as they are — they select the diff range by event type and are unrelated to path filtering.

- [ ] **Step 5: Verify the YAML still parses and no `paths:` survives in these four**

Run:
```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
for f in ui-gate migration-order-gate generated-scope-gate codegen-append-gate; do
  python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/$f.yml')); \
    t=d[True] if True in d else d['on']; \
    print('$f', {k:(v if not isinstance(v,dict) else list(v)) for k,v in t.items()})"
done
grep -n 'paths:' .github/workflows/ui-gate.yml .github/workflows/migration-order-gate.yml \
  .github/workflows/generated-scope-gate.yml .github/workflows/codegen-append-gate.yml || echo "NO paths: — correct"
```
Expected: each workflow prints `workflow_dispatch`, `push`, `pull_request` with `branches` only, and
the grep prints `NO paths: — correct`.

- [ ] **Step 6: Verify the gates themselves still pass locally**

Run:
```bash
npm run lint:ui && npm run lint:migrations && npm run lint:generated && npm run lint:codegen-append
```
Expected: all four exit 0.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ui-gate.yml .github/workflows/migration-order-gate.yml \
        .github/workflows/generated-scope-gate.yml .github/workflows/codegen-append-gate.yml
git commit -m "ci: the four sub-3s gates report on every PR, so they can be required

A workflow skipped by an \`on: paths:\` filter creates no check run, so requiring it
hangs the PR on \"Expected\" forever. These four cost 0.2-0.7s; the filter was never
worth its price and becomes a deadlock the moment the check is required. ui-gate also
gains the push trigger it never had, so next's own head finally gets a UI verdict.

Refs #173"
```

---

### Task 2: `scripts/check-paths-touched.mjs` and its spec

The two expensive jobs must stay conditional, and both need the same answer: *did this diff touch
anything relevant?* The subtle half is resolving the base SHA per event type and failing **open**.
Wrong in the permissive direction costs runner minutes; wrong in the restrictive direction skips the
job, which reports **success** — a silently-green gate. That asymmetry is why this is a tested Node
script and not a `grep -qE` in YAML.

**Files:**
- Create: `scripts/check-paths-touched.mjs`
- Create: `scripts/check-paths-touched.spec.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - CLI: `node scripts/check-paths-touched.mjs <baseSha> <headSha> <pattern...>` prints exactly
    `true` or `false` on stdout and exits 0. A pattern ending in `/` matches by prefix; any other
    pattern must match a changed path exactly.
  - Named export `pathsTouched({ changed, patterns })` → `boolean`, pure, for the spec.
  - Named export `resolveDecision({ baseSha, headSha, changedOrNull, patterns })` → `boolean`, pure;
    returns `true` (fail open) when `changedOrNull` is `null` or either SHA is missing/all-zeroes.
  - npm script `lint:paths-touched:test`.

- [ ] **Step 1: Write the failing spec**

Create `scripts/check-paths-touched.spec.mjs`:

```javascript
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
```

- [ ] **Step 2: Run the spec and watch it fail**

Run: `node --test scripts/check-paths-touched.spec.mjs`
Expected: FAIL — `Cannot find module .../check-paths-touched.mjs`.

- [ ] **Step 3: Write `scripts/check-paths-touched.mjs`**

```javascript
#!/usr/bin/env node
/**
 * Answers one question for the two workflows whose jobs are too expensive to run unconditionally:
 * did this diff touch anything matching these patterns?
 *
 * ── WHY THIS IS A SCRIPT WITH A SPEC AND NOT A `grep -qE` IN YAML ────────────────────────────────
 * Since #173 the gate jobs are REQUIRED checks, and the two skip mechanisms are not symmetric:
 *
 *   - A workflow skipped by an `on: paths:` filter creates NO check run. The pull request sits on
 *     "Expected — Waiting for status" and can never be merged.
 *   - A job skipped by a job-level `if:` reports conclusion `skipped`, which a required status
 *     check treats as PASSING.
 *
 * So the filtering moved out of `on:` and into the job — and that makes a wrong answer here
 * dangerous in a way it never was before. Answer `false` when the diff really was relevant and the
 * expensive job is skipped, reports SUCCESS, and the pull request goes green having built nothing.
 * That is a silently-green gate, which is the failure this repository keeps re-fixing.
 *
 * Therefore: every uncertainty resolves to `true`. An unreadable diff, a missing base SHA, the
 * all-zeroes base of a brand-new branch, an empty pattern list — all run the job. The cost of a
 * wrong `true` is runner minutes. The cost of a wrong `false` is a lie.
 *
 * ── NODE STDLIB ONLY ────────────────────────────────────────────────────────────────────────────
 * Like every other gate here: no dependencies, no marketplace action, so a dependency problem can
 * never be the reason nobody finds out the build did not run. `git` is the single external binary
 * and its absence is treated as an unreadable diff, i.e. fail open.
 *
 * ── PATTERN SYNTAX ──────────────────────────────────────────────────────────────────────────────
 * Deliberately two forms, not a glob engine. A trailing `/` means prefix ("packages/"); anything
 * else must match a changed path exactly ("turbo.json"). That is every shape the two callers need,
 * and a glob engine nobody needs is a second thing to get wrong.
 */
import { spawnSync } from 'node:child_process';

const ALL_ZEROES = /^0{40}$/;

/** Pure. Does any changed path match any pattern? */
export function pathsTouched({ changed, patterns }) {
    return changed.some((path) =>
        patterns.some((pattern) =>
            pattern.endsWith('/') ? path.startsWith(pattern) : path === pattern,
        ),
    );
}

/**
 * Pure. The whole fail-open policy lives here so the spec can pin it without a git repository.
 * `changedOrNull` is `null` when the diff could not be read at all.
 */
export function resolveDecision({ baseSha, headSha, changedOrNull, patterns }) {
    if (!baseSha || !headSha || ALL_ZEROES.test(baseSha)) return true;
    if (changedOrNull === null) return true;
    if (patterns.length === 0) return true;
    return pathsTouched({ changed: changedOrNull, patterns });
}

/** Returns the changed paths, or `null` if git could not tell us. */
function readChangedPaths(baseSha, headSha) {
    const result = spawnSync('git', ['diff', '--name-only', baseSha, headSha], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) return null;
    return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

// `import.meta.main` is Node 24+ and these workflows pin Node 20 as well, so compare argv instead.
if (process.argv[1] && process.argv[1].endsWith('check-paths-touched.mjs')) {
    const [baseSha = '', headSha = '', ...patterns] = process.argv.slice(2);
    const changedOrNull =
        !baseSha || !headSha || ALL_ZEROES.test(baseSha) ? null : readChangedPaths(baseSha, headSha);
    process.stdout.write(String(resolveDecision({ baseSha, headSha, changedOrNull, patterns })));
}
```

- [ ] **Step 4: Run the spec and watch it pass**

Run: `node --test scripts/check-paths-touched.spec.mjs`
Expected: PASS, 12 tests, 0 failures.

- [ ] **Step 5: Prove the CLI works against this repository's real history**

Run:
```bash
node scripts/check-paths-touched.mjs "$(git rev-parse HEAD~1)" "$(git rev-parse HEAD)" packages/ ; echo
node scripts/check-paths-touched.mjs "$(git rev-parse HEAD~1)" "$(git rev-parse HEAD)" no/such/path/ ; echo
node scripts/check-paths-touched.mjs "" "$(git rev-parse HEAD)" packages/ ; echo
node scripts/check-paths-touched.mjs "$(printf '0%.0s' {1..40})" "$(git rev-parse HEAD)" packages/ ; echo
```
Expected, in order: a `true`/`false` that matches what `git diff --name-only HEAD~1 HEAD` actually
shows for `packages/`; then `false`; then `true` (missing base ⇒ fail open); then `true` (all-zeroes
base ⇒ fail open).

- [ ] **Step 6: Add the npm script**

In `package.json` `scripts`, directly after `"lint:codegen-append:test"`, add:

```json
    "lint:paths-touched:test": "node --test scripts/check-paths-touched.spec.mjs",
```

- [ ] **Step 7: Verify the script runs through npm**

Run: `npm run lint:paths-touched:test`
Expected: PASS, 12 tests.

- [ ] **Step 8: Commit**

```bash
git add scripts/check-paths-touched.mjs scripts/check-paths-touched.spec.mjs package.json
git commit -m "ci: one tested answer to 'did the diff touch this?', failing open

The two expensive jobs stay conditional, but now that they are required checks the
skip mechanism changed underneath them: a job skipped by \`if:\` reports SUCCESS.
So a wrong 'no' no longer wastes nothing — it greens a PR that built nothing. Every
uncertainty here resolves to running the job, and the spec pins each one.

Refs #173"
```

---

### Task 3: `build-and-test` reports on every PR, and covers `main`

Two defects in one file. It is filtered to `branches: [next]`, so requiring it on `main` would hang
every release promotion PR (B4); and it is `paths:`-filtered, so requiring it on `next` would hang
every PR that touches no package (B2). The job is ~30 minutes, so unlike Task 1 it genuinely must
stay conditional — which means a `scope` job and a job-level `if:`.

**Files:**
- Modify: `.github/workflows/build.yml`

**Interfaces:**
- Consumes: `scripts/check-paths-touched.mjs` and `lint:paths-touched:test` from Task 2.
- Produces: job `build-and-test`, which creates a check run on every PR to `next` or `main` — either
  a real run, or conclusion `skipped` (which counts as passing).

- [ ] **Step 1: Replace the whole `on:` block**

Everything from `on:` up to (not including) `concurrency:` becomes:

```yaml
on:
  workflow_dispatch:
  # `main` as well as `next`. This workflow was filtered to `[next]` on both triggers, so a pull
  # request whose base is `main` — every next → main release promotion — never started it at all.
  # Once `build-and-test` is a required check on protect-main, that is a permanent deadlock on the
  # release PR. See #173.
  #
  # No `paths:` filter either. A workflow skipped by `on: paths:` creates NO check run, so the PR
  # hangs on "Expected — Waiting for status" forever; a job skipped by a job-level `if:` reports
  # `skipped`, which a required check treats as passing. The path list therefore moved down into
  # the `scope` job, which is the only place it is now allowed to live.
  push:
    branches: [next, main]
  pull_request:
    branches: [next, main]
```

- [ ] **Step 2: Insert the `scope` job above `build-and-test`**

Under `jobs:`, before `build-and-test:`, insert:

```yaml
  # Answers one question — is there anything here for build-and-test to do? — and nothing else.
  # It exists because the path list can no longer live in `on:` (see the header above), and a
  # job-level `if:` cannot read a diff by itself.
  #
  # The list below is the one that used to sit under `on: paths:`, carried over unchanged, and the
  # reasons each entry earns its place are unchanged too:
  #   - apps/**   the MJAPI dev harness is a workspace member, so its package.json participates in
  #               the lockfile and its code is what a developer's live verification actually runs.
  #   - .github/scripts/** and this file: the gates themselves live here, and a PR editing only a
  #               gate script must still run the gate. Four releases shipped without the widget
  #               bundle because it did not.
  scope:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      relevant: ${{ steps.decide.outputs.relevant }}
    steps:
      - uses: actions/checkout@v4
        with:
          # The decision is a diff against the base, which shallow history does not contain.
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      # The decider runs before it is trusted. Its restrictive-direction failure reports SUCCESS,
      # so an unwatched decider is indistinguishable from one that always says "nothing to do".
      - name: Check the path decider still fires
        run: npm run lint:paths-touched:test

      - name: Does this change touch anything build-and-test reads?
        id: decide
        env:
          # A pull_request diffs against its base; a push diffs against what was there before it.
          # A workflow_dispatch has neither, which check-paths-touched.mjs treats as fail-open.
          BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}
          HEAD_SHA: ${{ github.sha }}
        run: |
          RELEVANT=$(node scripts/check-paths-touched.mjs "$BASE_SHA" "$HEAD_SHA" \
            pnpm-lock.yaml \
            turbo.json \
            package.json \
            packages/ \
            apps/ \
            scripts/ \
            smoke/ \
            .github/scripts/ \
            .github/workflows/build.yml)
          echo "relevant=$RELEVANT" >> "$GITHUB_OUTPUT"
          echo "build-and-test relevant: $RELEVANT"
```

- [ ] **Step 3: Gate `build-and-test` on it**

Change the `build-and-test:` job header from:

```yaml
  build-and-test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
```

to:

```yaml
  build-and-test:
    needs: scope
    # A job skipped by this `if:` reports conclusion `skipped`, and a required status check treats
    # `skipped` as passing — which is the entire reason the path list moved out of `on:`. Do not
    # move it back.
    if: needs.scope.outputs.relevant == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 30
```

- [ ] **Step 4: Add the paths-decider spec to this workflow's own step list**

`npm test` is Vitest and never runs a plain-Node `.mjs` spec. The spec already runs in the `scope`
job (Step 2), which is the workflow that depends on it — no second wiring is needed. Confirm that is
so:

Run: `grep -n 'lint:paths-touched:test' .github/workflows/build.yml`
Expected: exactly one hit, inside the `scope` job.

- [ ] **Step 5: Verify the YAML parses and the job graph is what you think**

Run:
```bash
python3 -c "
import yaml
d = yaml.safe_load(open('.github/workflows/build.yml'))
on = d[True] if True in d else d['on']
print('triggers:', {k: (v or {}) for k, v in on.items()})
for name, job in d['jobs'].items():
    print(name, '| needs =', job.get('needs'), '| if =', job.get('if'))
"
```
Expected: `push` and `pull_request` each show `branches: [next, main]` and **no** `paths` key;
`scope` has no `needs`; `build-and-test` has `needs: scope` and
`if: needs.scope.outputs.relevant == 'true'`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci: build-and-test reports on every PR, main included

Two ways this job could not be required. It was filtered to branches: [next], so a
PR whose base is main never started it — a permanent deadlock on every release
promotion PR. And its paths filter lived in on:, where a skip creates no check run
at all. The list moves into a scope job, where a skip reports 'skipped' and counts
as passing, and main joins both triggers.

Refs #173"
```

---

### Task 4: `distribution-gate` reports on every PR

Different shape from Task 3: this job's cheap half is 2.6s and its expensive half —
`lint:distribution:mutants` — is 7m08s on CI, measured by the workflow's own comment. So the *job*
runs always and only the mutant step is conditional. That also inverts the "forgot to guard a new
step" risk in the safe direction: an unguarded new step simply always runs.

**Files:**
- Modify: `.github/workflows/distribution-gate.yml`

**Interfaces:**
- Consumes: `scripts/check-paths-touched.mjs` from Task 2.
- Produces: job `distribution-gate`, which creates a check run on every PR to `next` or `main`.

- [ ] **Step 1: Replace the `on:` block**

Everything from `on:` up to `jobs:` becomes:

```yaml
on:
  workflow_dispatch:
  # No `paths:` filter. This gate is a required check since #173, and a workflow skipped by an
  # `on: paths:` filter creates NO check run, so the pull request hangs on "Expected — Waiting for
  # status" forever. The checks this job runs cost 2.6s, so the job simply always runs; only the
  # 7-minute mutant suite below stays conditional, and that condition lives on the step.
  #
  # `push` as well as `pull_request`: the PR trigger alone would let a direct commit to next/main
  # land shipped SQL without the gate ever reading it.
  #
  # metadata/** was deliberately absent from the old filter (#105) and nothing about that judgement
  # changed: this gate reads shipped SQL and nothing else, so a metadata-only PR gives it nothing to
  # say. It now reports success on such a PR rather than not reporting at all, which is the only
  # difference.
  push:
    branches: [next, main]
  pull_request:
    branches: [next, main]
```

- [ ] **Step 2: Give the job a full-history checkout and a scope step**

Replace the job's `steps:` preamble — the `actions/checkout@v4` and `actions/setup-node@v4` steps —
with:

```yaml
    steps:
      - uses: actions/checkout@v4
        with:
          # The mutant-suite decision below is a diff against the base, which a shallow checkout
          # does not contain.
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # Only the 7m08s mutant suite is worth a condition; everything else here costs 2.6s and runs
      # unconditionally. The list is the one that used to sit under `on: paths:`, carried over.
      - name: Does this change touch anything the mutant suite covers?
        id: decide
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}
          HEAD_SHA: ${{ github.sha }}
        run: |
          RELEVANT=$(node scripts/check-paths-touched.mjs "$BASE_SHA" "$HEAD_SHA" \
            mj-app.json \
            migrations/ \
            migrations-pg/ \
            migrations-teardown/ \
            scripts/check-distribution-seed.mjs \
            scripts/check-distribution-seed.spec.mjs \
            scripts/check-distribution-seed.mutants.mjs \
            .github/workflows/distribution-gate.yml)
          echo "relevant=$RELEVANT" >> "$GITHUB_OUTPUT"
          echo "mutant suite relevant: $RELEVANT"
```

- [ ] **Step 3: Gate only the mutant step**

On the final step — `name: Check the gate's spec still kills what it claims to cover` — insert an
`if:` directly above its `run:`, and extend the existing comment:

```yaml
      # ... existing comment retained verbatim, then:
      #
      # Conditional since #173, and it is the ONLY conditional step here. The job itself now runs on
      # every pull request because it is a required check, but 7m08s of mutants on a PR that touches
      # no shipped SQL buys nothing. A step skipped this way does not fail the job.
      - name: Check the gate's spec still kills what it claims to cover
        if: steps.decide.outputs.relevant == 'true'
        run: npm run lint:distribution:mutants
```

- [ ] **Step 4: Verify the YAML parses and only one step is conditional**

Run:
```bash
python3 -c "
import yaml
d = yaml.safe_load(open('.github/workflows/distribution-gate.yml'))
on = d[True] if True in d else d['on']
assert 'paths' not in (on.get('pull_request') or {}), 'paths still on pull_request'
assert 'paths' not in (on.get('push') or {}), 'paths still on push'
job = d['jobs']['distribution-gate']
assert 'if' not in job, 'the JOB must not be conditional, only the mutant step'
for s in job['steps']:
    print(('IF  ' if 'if' in s else '    ') + str(s.get('name') or s.get('uses')))
"
```
Expected: no assertion fires; exactly one step is marked `IF`, and it is
`Check the gate's spec still kills what it claims to cover`.

- [ ] **Step 5: Verify the gate still passes locally**

Run: `npm run lint:distribution && node scripts/check-distribution-seed.spec.mjs`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/distribution-gate.yml
git commit -m "ci: distribution-gate reports on every PR; only the mutant suite stays conditional

Its on: paths: filter would hang every PR that ships no SQL once the check is
required, because a workflow skipped that way creates no check run. The cheap half
costs 2.6s and now always runs; the 7m08s mutant suite keeps a condition, moved onto
the step. An unguarded new step therefore fails safe — it just runs.

Refs #173"
```

---

### Task 5: The local gate — refuse the commit that would fail CI

Both of #167's defects were catchable in under a second on the machine that wrote them. Nothing
looked. This hook looks, on `git commit` and `git push`, and it runs the same two checks that caught
them: `lint:ui` (0.2s) and `typecheck` (13ms warm — turbo content-caches it, so no hand-rolled
"which packages changed" logic is needed).

**Files:**
- Create: `.claude/hooks/require-green-before-git.mjs`
- Create: `.claude/hooks/require-green-before-git.spec.mjs`
- Modify: `.claude/settings.json`
- Modify: `package.json`
- Modify: `.github/workflows/build.yml`

**Interfaces:**
- Consumes: `node_modules/turbo/bin/turbo` (a `#!/usr/bin/env node` **JavaScript** entry point —
  verified — so it runs as `process.execPath node_modules/turbo/bin/turbo`, needing no shell and no
  PATH lookup) and `scripts/check-ui-tokens.mjs`.
- Produces: named exports `isGitWriteCommand(command)` → `boolean` and `decisionFor({ command,
  runChecks })` → `{ decision: 'allow'|'deny'|'ask', reason: string }`, both pure; plus npm script
  `lint:git-gate:test`.

- [ ] **Step 1: Write the failing spec**

Create `.claude/hooks/require-green-before-git.spec.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGitWriteCommand, decisionFor } from './require-green-before-git.mjs';

const green = () => [];
const red = () => [{ name: 'lint:ui', output: "hardcoded color: DefaultColor: '#6366f1'," }];
const unrunnable = () => { throw new Error('turbo entry point not found'); };

test('a plain commit is a git write', () => {
    assert.equal(isGitWriteCommand('git commit -m "x"'), true);
});

test('a push is a git write', () => {
    assert.equal(isGitWriteCommand('git push origin HEAD:next'), true);
});

test('a git write buried in a compound command is still a git write', () => {
    assert.equal(isGitWriteCommand('npm run build && git commit -am wip'), true);
});

test('a -C form is still a git write', () => {
    assert.equal(isGitWriteCommand('git -C /tmp/x commit -m y'), true);
});

// Allow-cases. Without these a future "deny everything" would pass as a fix.
test('reads are not git writes', () => {
    assert.equal(isGitWriteCommand('git status'), false);
    assert.equal(isGitWriteCommand('git log --oneline -5'), false);
    assert.equal(isGitWriteCommand('git diff HEAD~1'), false);
    assert.equal(isGitWriteCommand('git add -A'), false);
});

test('a word merely containing commit or push is not a git write', () => {
    assert.equal(isGitWriteCommand('grep -rn "git commit" docs/'), false);
    assert.equal(isGitWriteCommand('echo pushing'), false);
    assert.equal(isGitWriteCommand('npm run commitpush'), false);
});

test('an unrelated command is not a git write', () => {
    assert.equal(isGitWriteCommand('ls -la'), false);
});

test('a non-git command never runs the checks at all', () => {
    let ran = false;
    const result = decisionFor({ command: 'ls', runChecks: () => { ran = true; return []; } });
    assert.equal(result.decision, 'allow');
    assert.equal(ran, false);
});

test('a green commit is allowed', () => {
    assert.equal(decisionFor({ command: 'git commit -m x', runChecks: green }).decision, 'allow');
});

test('a red commit is denied, and the reason names the failure', () => {
    const result = decisionFor({ command: 'git commit -m x', runChecks: red });
    assert.equal(result.decision, 'deny');
    assert.match(result.reason, /lint:ui/);
    assert.match(result.reason, /#6366f1/);
});

// The whole point of the hook is that a check nobody can run must not read as a check that passed.
test('checks that cannot run ask rather than silently allowing', () => {
    const result = decisionFor({ command: 'git commit -m x', runChecks: unrunnable });
    assert.equal(result.decision, 'ask');
    assert.match(result.reason, /turbo entry point not found/);
});
```

- [ ] **Step 2: Run the spec and watch it fail**

Run: `node --test .claude/hooks/require-green-before-git.spec.mjs`
Expected: FAIL — `Cannot find module .../require-green-before-git.mjs`.

- [ ] **Step 3: Write `.claude/hooks/require-green-before-git.mjs`**

```javascript
#!/usr/bin/env node
/**
 * Refuse a `git commit` or `git push` whose tree would fail the two checks that are cheap enough to
 * run every time. Wired as a `PreToolUse` hook on `Bash` in `.claude/settings.json`.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * #167 merged two defects into `next`: a `TS2307` on a module declared in no package.json, and a
 * hardcoded `#6366f1` that `lint:ui` refuses because it breaks dark mode. Both were catchable in
 * under a second on the machine that wrote them. Nothing looked, because nothing was watching:
 * `.claude/settings.json` registered exactly one hook and it only guards CodeGen output. CI caught
 * both and CI was advisory, so both landed anyway (#173).
 *
 * CI is no longer advisory. This hook is the other half — a refusal at the moment of writing rather
 * than a report twenty minutes later.
 *
 * ── WHY BOTH CHECKS ARE CHEAP ENOUGH TO RUN EVERY TIME ──────────────────────────────────────────
 * `lint:ui` is 0.2s of Node stdlib. `typecheck` is a turbo task with `cache: true`, so a repeat run
 * with nothing changed is 13ms — turbo's content hash already answers "which packages changed"
 * better than anything this hook could compute, so it does not try.
 *
 * ── WHY IT ASKS RATHER THAN ALLOWS WHEN IT CANNOT RUN ───────────────────────────────────────────
 * `block-generated-edits.mjs` deliberately fails OPEN, and it is right to: it judges a payload it
 * may not understand. This hook judges something it always understands, so silence would recreate
 * exactly the gap it exists to close — a check nobody can run must never read as a check that
 * passed. An unrunnable checker returns `ask`, which surfaces the reason and lets a human decide.
 *
 * ── NO SHELL, NO PATH LOOKUP ────────────────────────────────────────────────────────────────────
 * This hook's ancestor started as a shell script and failed OPEN in testing, because the hook
 * environment resolved neither `bash` nor `grep`. So both checks are spawned as
 * `process.execPath <a .mjs or .js entry point>` with `shell: false`: `scripts/check-ui-tokens.mjs`
 * is plain Node, and `node_modules/turbo/bin/turbo` is a `#!/usr/bin/env node` JavaScript shim, not
 * the platform binary. Neither needs a shell or a PATH entry.
 *
 * ── HOW TO GET PAST IT, on the day there is a real reason ───────────────────────────────────────
 * Remove the hook from `.claude/settings.json` in the SAME commit as the bypass, so the exception is
 * reviewable rather than silent. Routing around it by shelling out differently is the same defect
 * with the evidence removed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * `commit` or `push` as a git SUBCOMMAND, not as a substring.
 *
 * The leading boundary makes `npm run commitpush` and `grep -rn "git commit" docs/` allow — the
 * first because `commitpush` is one word, the second because the match must begin a command.
 * `(?:-C \S+ |-c \S+ )*` covers `git -C <dir> commit`, which is otherwise a straight bypass.
 * Over-inclusiveness is cheap here (a needless check is 13ms warm) and under-inclusiveness is the
 * bug, so `&&`, `;`, `|` and newlines all count as command starts.
 */
const GIT_WRITE = /(?:^|[;&|]|\n)\s*git\s+(?:(?:-C|-c)\s+\S+\s+)*(?:commit|push)(?:\s|$)/;

export function isGitWriteCommand(command) {
    return typeof command === 'string' && GIT_WRITE.test(command);
}

/**
 * Pure. `runChecks` returns an array of `{ name, output }` failures, or throws if it could not run.
 */
export function decisionFor({ command, runChecks }) {
    if (!isGitWriteCommand(command)) return { decision: 'allow', reason: '' };

    let failures;
    try {
        failures = runChecks();
    } catch (error) {
        return {
            decision: 'ask',
            reason:
                `Could not run the pre-commit checks, so this commit is unverified: ${error.message}. ` +
                'Run `pnpm install` and then `npm run lint:ui && npm run typecheck` yourself before ' +
                'approving — a check nobody can run is not a check that passed.',
        };
    }

    if (failures.length === 0) return { decision: 'allow', reason: '' };

    const detail = failures
        .map(({ name, output }) => `── ${name} ──\n${output.trim()}`)
        .join('\n\n');
    return {
        decision: 'deny',
        reason:
            'This tree fails a check that is now REQUIRED to merge (#173), so committing it only ' +
            'moves the failure to CI. Fix it first:\n\n' +
            detail +
            '\n\nRe-run with `npm run lint:ui` and `npm run typecheck`.',
    };
}

/** Runs the real checks. Throws when a checker is missing rather than reporting it as clean. */
function runChecks() {
    const turbo = path.join(PROJECT_DIR, 'node_modules', 'turbo', 'bin', 'turbo');
    const uiGate = path.join(PROJECT_DIR, 'scripts', 'check-ui-tokens.mjs');
    for (const [label, entry] of [['scripts/check-ui-tokens.mjs', uiGate], ['turbo entry point', turbo]]) {
        if (!existsSync(entry)) throw new Error(`${label} not found at ${entry}`);
    }

    const invocations = [
        { name: 'lint:ui', argv: [uiGate] },
        { name: 'typecheck', argv: [turbo, 'typecheck', '--filter=@mj-biz-apps/forms-*'] },
    ];

    const failures = [];
    for (const { name, argv } of invocations) {
        const result = spawnSync(process.execPath, argv, {
            cwd: PROJECT_DIR,
            encoding: 'utf8',
            shell: false,
            maxBuffer: 32 * 1024 * 1024,
        });
        if (result.error) throw new Error(`${name} could not be spawned: ${result.error.message}`);
        if (result.status !== 0) {
            const combined = `${result.stdout || ''}${result.stderr || ''}`;
            failures.push({ name, output: combined.split('\n').slice(-40).join('\n') });
        }
    }
    return failures;
}

// Same argv comparison the other gates use rather than `import.meta.main`, which is Node 24+.
if (process.argv[1] && process.argv[1].endsWith('require-green-before-git.mjs')) {
    try {
        const command = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command;
        const { decision, reason } = decisionFor({ command, runChecks });
        if (decision !== 'allow') {
            process.stdout.write(
                JSON.stringify({
                    hookSpecificOutput: {
                        hookEventName: 'PreToolUse',
                        permissionDecision: decision,
                        permissionDecisionReason: reason,
                    },
                }),
            );
        }
    } catch {
        // A malformed payload is allowed through: like block-generated-edits.mjs, a hook must never
        // break tool calls whose input it cannot read. Note the difference from a check that cannot
        // RUN, above — that one asks, because the input was perfectly legible.
    }
}
```

- [ ] **Step 4: Run the spec and watch it pass**

Run: `node --test .claude/hooks/require-green-before-git.spec.mjs`
Expected: PASS, 11 tests, 0 failures.

- [ ] **Step 5: Prove the hook end-to-end on a real payload, green and red**

Run:
```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
echo '{"tool_input":{"command":"git status"}}' | node .claude/hooks/require-green-before-git.mjs; echo "[non-git → expect no output above]"
echo '{"tool_input":{"command":"git commit -m x"}}' | node .claude/hooks/require-green-before-git.mjs; echo "[clean tree → expect no output above]"
```
Expected: no output from either — an allowed tool call prints nothing.

Then prove it actually denies, using #167's own defect:
```bash
cat > packages/Angular/src/lib/issue-173-probe.ts <<'PROBE'
// #173 hook probe — a hardcoded colour lint:ui must refuse. Deleted on the next line.
export const ISSUE_173_PROBE_COLOR = '#6366f1';
PROBE
echo '{"tool_input":{"command":"git commit -m x"}}' | node .claude/hooks/require-green-before-git.mjs
rm packages/Angular/src/lib/issue-173-probe.ts
```
Expected: a JSON object with `"permissionDecision":"deny"` whose reason quotes the `#6366f1`
violation, then `lint:ui` is clean again. Verified in advance: this exact file makes
`check-ui-tokens.mjs` emit `hardcoded color (use a --mj-* token or var() fallback)` — the same
violation #167 shipped. A brand-new file rather than an edit to an existing one, so cleanup is `rm`
and never a `git checkout --` that could discard real work.

- [ ] **Step 6: Register the hook in `.claude/settings.json`**

Add a second entry to the `PreToolUse` array, after the existing `Write|Edit|NotebookEdit` entry:

```json
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/require-green-before-git.mjs\"",
            "statusMessage": "Checking this tree would pass CI"
          }
        ]
      }
```

- [ ] **Step 7: Add the npm script and wire the spec into CI**

In `package.json`, after `"lint:hook-guard:test"`, add:

```json
    "lint:git-gate:test": "node --test .claude/hooks/require-green-before-git.spec.mjs",
```

In `.github/workflows/build.yml`, directly after the existing `Generated-edit hook tests` step, add:

```yaml
      # Same reasoning as the step above, for the other hook. Its failure mode is also SILENCE: if
      # `isGitWriteCommand` stops matching, every commit sails through and nothing says so. The
      # allow-cases in the spec are what stop a future "deny everything" from passing as a fix.
      - name: Commit-gate hook tests
        run: npm run lint:git-gate:test
```

- [ ] **Step 8: Verify both the settings file and the new CI step**

Run:
```bash
node -p "JSON.stringify(require('./.claude/settings.json').hooks.PreToolUse.map(h=>h.matcher))"
npm run lint:git-gate:test
grep -n 'lint:git-gate:test' .github/workflows/build.yml
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build.yml')); print('build.yml parses')"
```
Expected: `["Write|Edit|NotebookEdit","Bash"]`; the spec passes; one grep hit; the YAML parses.

- [ ] **Step 9: Commit**

```bash
git add .claude/hooks/require-green-before-git.mjs .claude/hooks/require-green-before-git.spec.mjs \
        .claude/settings.json package.json .github/workflows/build.yml
git commit -m "ci: refuse the commit that would fail the checks it is about to be blocked on

Both of #167's defects were catchable in under a second on the machine that wrote
them, and nothing looked — settings.json registered one hook and it only guards
CodeGen output. This runs lint:ui (0.2s) and typecheck (13ms warm, turbo caches it)
before a git commit or push. A checker that cannot RUN asks rather than allowing;
silence there would recreate the gap the hook exists to close.

Refs #173"
```

---

### Task 6: Prove the skip path reports success — before anything is required

The load-bearing claim of Tasks 1–4 is that a job skipped by a job-level `if:` reports `skipped` and
that a required check treats `skipped` as passing. That is documented GitHub behaviour, and this repo
does not merge on documentation. Prove it on a real pull request **while the rulesets are still
inert**, so a wrong answer costs a closed PR rather than a jammed repository.

**Files:** none — this task opens and closes pull requests.

**Interfaces:**
- Consumes: everything from Tasks 1–5, pushed to `origin/ci/173-required-status-checks`.
- Produces: a recorded conclusion for `build-and-test` on a PR that touches no package, which
  Task 7 depends on.

- [ ] **Step 1: Add the changeset and push the branch**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
cat > .changeset/ci-required-status-checks.md <<'EOF'
---
"@mj-biz-apps/forms-entities": patch
---

CI is blocking: every gate reports on every PR and both rulesets require them. Adds a local
pre-commit gate running lint:ui and typecheck. No migration and no metadata, so patch.
EOF
git add .changeset/ci-required-status-checks.md plans/CI_ENFORCEMENT_PLAN.md
git commit -m "chore(changeset): patch — this ships no migration and no metadata

Refs #173"
git push -u origin ci/173-required-status-checks
```

- [ ] **Step 2: Open the real pull request as a draft**

```bash
gh pr create --repo MemberJunction/bizapps-forms --base next --draft \
  --title "ci: make a red check actually block a merge" \
  --body-file /dev/stdin <<'EOF'
Placeholder — Task 8 rewrites this body with the verification evidence.

Refs #173
EOF
```

- [ ] **Step 3: Confirm all seven checks report on this PR**

Wait for the run, then:
```bash
PR=$(gh pr view --repo MemberJunction/bizapps-forms --json number --jq .number)
gh pr view "$PR" --repo MemberJunction/bizapps-forms \
  --json statusCheckRollup --jq '.statusCheckRollup[] | "\(.conclusion)\t\(.name)"' | sort
```
Expected: **all seven** required job names appear. This PR touches `.github/workflows/**`,
`scripts/**` and `package.json`, so `build-and-test` and `distribution-gate` both run for real.
Every one must be `SUCCESS`. If any is `FAILURE`, stop and fix it here — do not proceed to Task 7.

- [ ] **Step 4: Open a throwaway PR that touches no package, to exercise the skip path**

```bash
git switch -c chore/173-skip-path-probe
printf '\n<!-- #173 skip-path probe — this branch is deleted in Task 7. -->\n' >> README.md
git add README.md
git commit -m "chore: probe the skip path (throwaway)"
git push -u origin chore/173-skip-path-probe
gh pr create --repo MemberJunction/bizapps-forms --base next --draft \
  --title "THROWAWAY: #173 skip-path probe" \
  --body "Verifies that build-and-test reports \`skipped\` rather than not reporting, on a PR that touches no package. Closed and deleted in Task 7." 
git switch ci/173-required-status-checks
```

- [ ] **Step 5: Confirm `build-and-test` reports `SKIPPED`, not "no run at all"**

Wait for the run, then:
```bash
PROBE=$(gh pr list --repo MemberJunction/bizapps-forms --head chore/173-skip-path-probe --json number --jq '.[0].number')
gh pr view "$PROBE" --repo MemberJunction/bizapps-forms \
  --json statusCheckRollup --jq '.statusCheckRollup[] | "\(.conclusion)\t\(.name)"' | sort
```
Expected: `build-and-test` is present with conclusion `SKIPPED`, and the other six are `SUCCESS`.
The failure this catches: if `build-and-test` is **absent** from the list, the job-level `if:` is not
producing a check run and Tasks 3–4 are wrong — stop, and do not enable the rulesets.

- [ ] **Step 6: Record the evidence for the PR body**

```bash
mkdir -p /private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/4709d054-5f27-489d-8f23-3d3841e92441/scratchpad
{ echo "## Task 6 — all seven report, and the skip path reports SKIPPED"; echo;
  echo "Real PR:"; gh pr view "$PR" --repo MemberJunction/bizapps-forms --json statusCheckRollup --jq '.statusCheckRollup[] | "  \(.conclusion)\t\(.name)"' | sort;
  echo; echo "Skip-path probe PR:"; gh pr view "$PROBE" --repo MemberJunction/bizapps-forms --json statusCheckRollup --jq '.statusCheckRollup[] | "  \(.conclusion)\t\(.name)"' | sort;
} > /private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/4709d054-5f27-489d-8f23-3d3841e92441/scratchpad/evidence.md
cat /private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/4709d054-5f27-489d-8f23-3d3841e92441/scratchpad/evidence.md
```

---

### Task 7: Require the checks on both rulesets, and let the release automation through

Only now. `bypass_actors` is not a convenience here: `ci/commit_push.mjs` pushes
`Version Packages [skip ci]` straight to `main` and `ci/merge_main_and_update_lock.mjs` pushes
straight to `next`. Required status checks apply to direct pushes, and `[skip ci]` guarantees no
workflow ever runs on that commit, so without the bypass the release pipeline stops at the
version-bump step and cannot be retried into success.

**Files:** none — this task edits two rulesets through the REST API.

**Interfaces:**
- Consumes: the seven reporting jobs proven in Task 6.
- Produces: `required_status_checks` on `20589383` and `18239666`, each with
  `strict_required_status_checks_policy: true` and a GitHub Actions bypass.

- [ ] **Step 1: Record the current rulesets so the change is revertible**

```bash
D=/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/4709d054-5f27-489d-8f23-3d3841e92441/scratchpad
gh api repos/MemberJunction/bizapps-forms/rulesets/20589383 > "$D/ruleset-20589383.before.json"
gh api repos/MemberJunction/bizapps-forms/rulesets/18239666 > "$D/ruleset-18239666.before.json"
jq -c '.rules' "$D/ruleset-20589383.before.json" "$D/ruleset-18239666.before.json"
```
Expected: both print `[{"type":"deletion"},{"type":"non_fast_forward"}]`.

- [ ] **Step 2: Build the request body once, for both rulesets**

```bash
D=/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/4709d054-5f27-489d-8f23-3d3841e92441/scratchpad
cat > "$D/required-checks-rule.json" <<'EOF'
{
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "build-and-test" },
          { "context": "changes_and_migrations" },
          { "context": "codegen-append-gate" },
          { "context": "distribution-gate" },
          { "context": "generated-scope-gate" },
          { "context": "migration-order-gate" },
          { "context": "ui-token-gate" }
        ]
      }
    }
  ],
  "bypass_actors": [
    { "actor_id": 15368, "actor_type": "Integration", "bypass_mode": "always" }
  ]
}
EOF
jq . "$D/required-checks-rule.json" > /dev/null && echo "body is valid JSON"
```

- [ ] **Step 3: Apply it to `next-protect` (20589383)**

```bash
D=/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/4709d054-5f27-489d-8f23-3d3841e92441/scratchpad
gh api --method PUT repos/MemberJunction/bizapps-forms/rulesets/20589383 \
  --input "$D/required-checks-rule.json" > "$D/ruleset-20589383.after.json"
jq '.rules[] | select(.type=="required_status_checks") | .parameters' "$D/ruleset-20589383.after.json"
```
Expected: `strict_required_status_checks_policy: true` and all seven contexts.

- [ ] **Step 4: Apply it to `protect-main` (18239666)**

```bash
D=/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/4709d054-5f27-489d-8f23-3d3841e92441/scratchpad
gh api --method PUT repos/MemberJunction/bizapps-forms/rulesets/18239666 \
  --input "$D/required-checks-rule.json" > "$D/ruleset-18239666.after.json"
jq '.rules[] | select(.type=="required_status_checks") | .parameters' "$D/ruleset-18239666.after.json"
```
Expected: the same.

- [ ] **Step 5: Confirm both rulesets, and confirm the release bypass survived the write**

```bash
for ID in 20589383 18239666; do
  echo "── ruleset $ID ──"
  gh api "repos/MemberJunction/bizapps-forms/rulesets/$ID" --jq \
    '{enforcement, rules: [.rules[].type], strict: (.rules[]|select(.type=="required_status_checks")|.parameters.strict_required_status_checks_policy), contexts: [.rules[]|select(.type=="required_status_checks")|.parameters.required_status_checks[].context], bypass: [.bypass_actors[]|{actor_id, actor_type, bypass_mode}]}'
done
```
Expected for both: `enforcement: "active"`; rules include `required_status_checks`; `strict: true`;
seven contexts; `bypass` contains `{actor_id: 15368, actor_type: "Integration", bypass_mode: "always"}`.
If `bypass` is empty, **stop** — the next release will fail on its push to `main` — and re-apply
Step 3/4, because `PUT` replaces the whole ruleset and an omitted `bypass_actors` clears it.

- [ ] **Step 6: Verify the skip-path probe is still MERGEABLE, now that checks are required**

This is the half of the acceptance test that a green ruleset dump cannot show.
```bash
PROBE=$(gh pr list --repo MemberJunction/bizapps-forms --head chore/173-skip-path-probe --json number --jq '.[0].number')
gh pr view "$PROBE" --repo MemberJunction/bizapps-forms --json mergeable,mergeStateStatus,statusCheckRollup \
  --jq '{mergeable, mergeStateStatus, checks: [.statusCheckRollup[] | "\(.conclusion) \(.name)"] | sort}'
```
Expected: `mergeStateStatus` is **not** `BLOCKED` on account of a missing check —
a draft PR reports `DRAFT`, so first run `gh pr ready "$PROBE"`, re-check, and then set it back with
`gh pr ready --undo "$PROBE"`. The failure this catches: `build-and-test` sitting at "Expected —
Waiting for status" means `skipped` is *not* being treated as passing and Task 6's premise was wrong.

---

### Task 8: Prove GitHub refuses the merge, then clean up and hand over

A green ruleset dump is necessary and not sufficient. The acceptance test in #173 is a PR that
GitHub **refuses to merge**, not one that merely reports a failure.

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the enabled rulesets from Task 7.
- Produces: a recorded merge refusal, a cleaned-up repository, and the finished PR body.

- [ ] **Step 1: Open the throwaway PR that hardcodes a colour**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
git switch ci/173-required-status-checks
git switch -c chore/173-red-check-probe
cat > packages/Angular/src/lib/issue-173-probe.ts <<'PROBE'
// #173 acceptance probe — a hardcoded colour lint:ui must refuse. This branch is deleted below.
export const ISSUE_173_PROBE_COLOR = '#6366f1';
PROBE
git add packages/Angular/src/lib/issue-173-probe.ts
git commit -m "chore: probe that a red gate blocks the merge (throwaway)" --no-verify
git push -u origin chore/173-red-check-probe
gh pr create --repo MemberJunction/bizapps-forms --base next \
  --title "THROWAWAY: #173 red-check probe" \
  --body "Hardcodes #6366f1 in packages/Angular/src so ui-token-gate fails. Verifies GitHub REFUSES the merge rather than merely reporting it. Closed and deleted immediately."
```

Note `--no-verify`: the Task 5 hook is doing its job and would otherwise refuse this commit, which is
itself a live demonstration that the local gate works.

- [ ] **Step 2: Confirm `ui-token-gate` is red**

```bash
RED=$(gh pr list --repo MemberJunction/bizapps-forms --head chore/173-red-check-probe --json number --jq '.[0].number')
gh pr view "$RED" --repo MemberJunction/bizapps-forms --json statusCheckRollup \
  --jq '.statusCheckRollup[] | "\(.conclusion)\t\(.name)"' | sort
```
Expected: `ui-token-gate` is `FAILURE`.

- [ ] **Step 3: Ask GitHub to merge it, and confirm the refusal**

```bash
RED=$(gh pr list --repo MemberJunction/bizapps-forms --head chore/173-red-check-probe --json number --jq '.[0].number')
gh pr view "$RED" --repo MemberJunction/bizapps-forms --json mergeable,mergeStateStatus
gh pr merge "$RED" --repo MemberJunction/bizapps-forms --merge 2>&1 | tee \
  /private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/4709d054-5f27-489d-8f23-3d3841e92441/scratchpad/merge-refusal.txt
```
Expected: `mergeStateStatus` is `BLOCKED`, and `gh pr merge` **fails** with a protected-branch /
required-status-check error. Capture the exact text — it is the evidence for the PR body and for
issue #173. If the merge **succeeds**, the change has failed its acceptance test: revert the
rulesets from the `.before.json` files saved in Task 7 Step 1 and re-open the investigation.

- [ ] **Step 4: Close both throwaway PRs and delete their branches**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
for B in chore/173-red-check-probe chore/173-skip-path-probe; do
  N=$(gh pr list --repo MemberJunction/bizapps-forms --head "$B" --json number --jq '.[0].number')
  [ -n "$N" ] && gh pr close "$N" --repo MemberJunction/bizapps-forms --delete-branch
done
git switch ci/173-required-status-checks
git branch -D chore/173-red-check-probe chore/173-skip-path-probe
git push origin --delete chore/173-red-check-probe chore/173-skip-path-probe 2>/dev/null || true
gh pr list --repo MemberJunction/bizapps-forms --state open --json number,headRefName --jq '.[] | select(.headRefName|startswith("chore/173-")) | .number'
```
Expected: the final command prints nothing.

- [ ] **Step 5: Record the new rule in `CLAUDE.md`**

Under the `## Branching model: next → main` section, append:

```markdown
- **CI is blocking (since #173).** Both rulesets require these seven jobs — `build-and-test`,
  `changes_and_migrations`, `codegen-append-gate`, `distribution-gate`, `generated-scope-gate`,
  `migration-order-gate`, `ui-token-gate` — with "branch must be up to date with base" on, so a
  stale branch must be updated before it can merge. Nobody can bypass it, including admins; the one
  bypass actor is the GitHub Actions app, because the publish workflow pushes `Version Packages
  [skip ci]` directly to `main` and a `[skip ci]` commit can never report a check.
- **Every gate now reports on every PR**, by design. The path filtering lives in a job-level `if:`
  (`scripts/check-paths-touched.mjs`), never in `on: paths:` — a workflow skipped by `on: paths:`
  creates no check run, and a required check that never reports blocks the PR forever. Do not move a
  path filter back up into `on:`.
```

- [ ] **Step 6: Commit and push**

```bash
git add CLAUDE.md
git commit -m "docs: CI is blocking, and why a path filter may never go back into on:

Refs #173"
git push
```

- [ ] **Step 7: Write the real PR body**

Replace the placeholder from Task 6 Step 2. The body must contain, as evidence rather than claim:
the `gh api .../rulesets/<id> --jq '.rules'` output for both rulesets; the captured merge refusal
from Step 3; the skip-path probe's `SKIPPED` conclusion from Task 6; and a **Revert** section giving
the exact `gh api --method PUT ... --input <D>/ruleset-<id>.before.json` command for each ruleset.
It must also state plainly that **merging this PR is the remaining action**, and that until it lands
on `next`, open PRs cut before it will show "Expected" for gates their paths do not touch and must be
updated onto `next` first — which `strict` requires of them regardless.

```bash
gh pr edit "$PR" --repo MemberJunction/bizapps-forms --body-file "$D/pr-body.md"
```

- [ ] **Step 8: Comment the outcome on issue #173**

Post the same evidence — the two ruleset dumps, the merge refusal, and the three findings the issue
did not have (B3 the release-pipeline bypass, B4 `build.yml` excluding `main`, B5 `ui-gate.yml`
having no push trigger) — plus the B7 correction that `20589383` was never `rules: []`.

```bash
gh issue comment 173 --repo MemberJunction/bizapps-forms --body-file "$D/issue-comment.md"
```

- [ ] **Step 9: Final verification sweep**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
git status --short
git branch -vv | grep ci/173
for ID in 20589383 18239666; do gh api "repos/MemberJunction/bizapps-forms/rulesets/$ID" --jq '[.rules[].type]'; done
gh pr view "$PR" --repo MemberJunction/bizapps-forms --json isDraft,mergeStateStatus,statusCheckRollup \
  --jq '{isDraft, mergeStateStatus, checks: [.statusCheckRollup[]|"\(.conclusion) \(.name)"]|sort}'
```
Expected: a clean tree; `ci/173-required-status-checks` tracking `origin/ci/173-required-status-checks`;
both rulesets listing `required_status_checks`; the PR still a draft with all seven checks `SUCCESS`.

---

## Self-Review

**Spec coverage.** Issue #173's Definition of Done, item by item:
`rulesets list required_status_checks` → Task 7 Steps 3–5. `A PR with a failing gate cannot be
merged` → Task 8 Steps 1–3. `build/typecheck/test/lint:ui green on next` → the Phase-1 precondition
check, re-confirmed on the PR in Task 6 Step 3. `A local hook fails a commit that would fail
typecheck or lint:ui` → Task 5, demonstrated in Task 8 Step 1 by the `--no-verify` it forces.
`Build and Test green on next's head` → verified in Phase 1 (`success` on `87d43ef`).
The issue's own suggestion of "a skip-job of the same name" is deliberately **not** taken: a second
workflow with an inverted `paths-ignore:` would duplicate the path list in two files and can emit two
check runs with the same name on one commit. The job-level `if:` reaches the same end with the
decision in one place, and Task 6 proves it before anything depends on it.

**Placeholder scan.** No TBDs. The only step whose text is generated at execution time is Task 8
Steps 7–8, and both enumerate exactly which evidence must appear.

**Type consistency.** `pathsTouched` / `resolveDecision` are used with the same argument names in
Task 2's spec, its implementation and both workflow call sites. `isGitWriteCommand` / `decisionFor`
likewise across Task 5. `steps.decide.outputs.relevant` is the id in both Task 3 and Task 4;
`needs.scope.outputs.relevant` matches the `outputs:` block declared on the `scope` job.

**Ordering.** Tasks 1–5 must land in the branch before Task 6 opens the PR; Task 6 must pass before
Task 7 touches a ruleset; Task 7 must be in place before Task 8 can observe a refusal. The rulesets
are deliberately the *last* thing enabled and the first thing revertible.
