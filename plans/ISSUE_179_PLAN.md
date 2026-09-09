# Issue #179 — an unrunnable checker must `ask`, not `deny`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `.claude/hooks/require-green-before-git.mjs` from reporting a checker that never ran
as a tree that failed a check — a broken turbo install currently produces `deny` under the heading
`typecheck`, blaming a green tree for the machine.

**Architecture:** `classifyCheckResult` decides what one finished check meant, and it is deliberately
the only place that decision is made. Today it infers "the check ran" from the *absence* of negative
signals (`result.error`, `result.signal`, a non-numeric `status`). A checker that exits non-zero
before executing anything has none of those, so it is indistinguishable from a red tree. The fix
replaces that inference with a **positive** signal: each check declares the pattern it prints once it
has reached a verdict, and a non-zero exit that never printed it throws — which `decisionFor` already
turns into `ask`.

**Tech Stack:** Plain Node ESM (`node:test`, `node:assert/strict`). No dependencies. The hook and its
spec both run without `node_modules`.

**Spec:** [`https://github.com/MemberJunction/bizapps-forms/issues/179`](https://github.com/MemberJunction/bizapps-forms/issues/179)

---

## Global Constraints

- **Do not touch `runChecks`'s spawn options, `CHECK_TIMEOUT_MS`, `GIT_WRITE`, or `decisionFor`.**
  The blast radius of this issue is `classifyCheckResult` and the check descriptors that feed it.
- **The signal must not be turbo-shaped only.** `lint:ui` is plain Node with no `Tasks:` line; a fix
  that hardcodes turbo's summary format breaks it. Each check carries its own pattern.
- **Only the non-zero arm gets the new requirement.** Verified below: a turbo `--filter` glob that
  matches nothing exits **0** and still prints `Tasks: 0 successful, 0 total`, so requiring the
  marker on the success arm would not catch that hole and would only add risk. That hole is a
  different defect with a different signal — file it, do not fix it here.
- **No `any`, no weak typing** (CLAUDE.md §2/§2b). This file is plain JS, so the equivalent
  obligation is: validate the descriptor up front with a guard clause rather than letting an
  undefined pattern silently decide.
- **Changeset level is `patch`** (`.claude/rules/changesets.md`): this ships no migration and no
  metadata. `minor` would move all four packages in the fixed group for nothing.
- **Never `git commit` without the user asking** (CLAUDE.md critical rule 1). The commit steps below
  run only once the user has asked for a commit.

## Measured facts this plan rests on

Every one of these was observed on this machine, not recalled. Re-measure if you doubt one.

| Invocation | exit | prints `Tasks:` | prints `PASS`/`FAIL` |
|---|---|---|---|
| `turbo typecheck --filter='@mj-biz-apps/forms-*'` (real repo, all cached) | 0 | yes — ` Tasks:    9 successful, 9 total` | n/a |
| `turbo typecheck` on a package whose script exits 2 with `error TS2307` | 2 | yes — ` Tasks:    0 successful, 1 total` | n/a |
| `turbo typecheck` with the platform binary unresolvable | 1 | **no** | n/a |
| `turbo no-such-task` (config error) | 1 | **no** | n/a |
| `turbo typecheck --filter='@nope/*'` (glob matches nothing) | 0 | yes — ` Tasks:    0 successful, 0 total` | n/a |
| `node scripts/check-ui-tokens.mjs`, clean tree | 0 | n/a | `PASS — no UI gate violations.` |
| `node scripts/check-ui-tokens.mjs`, one hardcoded colour | 1 | n/a | `FAIL — 1 UI gate violation(s).` |

Two shapes to note, because a careless regex misses both:

- turbo's summary line has **leading whitespace** — `/^Tasks:/m` does not match it.
- `lint:ui`'s verdict uses an **em dash** (`PASS — `). Anchor on the word, not the dash.

## File Structure

- **Modify** `.claude/hooks/require-green-before-git.mjs` — `classifyCheckResult` gains a check
  descriptor instead of a bare name; `runChecks`'s `invocations` array gains the `verdictPattern`
  field. Nothing else in the file changes.
- **Modify** `.claude/hooks/require-green-before-git.spec.mjs` — the five existing
  `classifyCheckResult` tests move to the new call shape; five new tests pin the new behaviour.
- **Create** `.changeset/unrunnable-checker-asks.md` — `patch`.

There is no new file. The decision stays in one function, which is the property the header calls out
as deliberate; splitting it would be the "classitis" the design rules warn against.

---

### Task 1: A non-zero exit with no verdict marker throws

**Files:**
- Modify: `.claude/hooks/require-green-before-git.mjs:151-165` (`classifyCheckResult`)
- Modify: `.claude/hooks/require-green-before-git.mjs:175-178` (the `invocations` array)
- Test: `.claude/hooks/require-green-before-git.spec.mjs:141-169`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `classifyCheckResult(check, result)` where
  `check = { name: string, verdictPattern: RegExp }` and `result` is a `spawnSync` return value.
  Returns `null` when the check passed, `{ name, output }` when it ran and failed, and **throws**
  when it did not run to completion. `decisionFor` already maps a throw to `ask`; do not change it.

- [ ] **Step 1: Write the failing tests**

Replace the five existing `classifyCheckResult` tests at the bottom of
`.claude/hooks/require-green-before-git.spec.mjs` (from the comment banner
`// ── A check that did not FINISH must reach ask…` to end of file) with this block. The banner
comment above them stays — it explains why the throw exists at all and is still true.

```js
// Each check declares the pattern it prints once it has REACHED A VERDICT. Measured, not guessed:
// turbo prints ` Tasks:    N successful, M total` on every completed run — success (9 successful),
// task failure (exit 2, `0 successful, 1 total`) and fully-cached alike — and prints nothing of the
// sort when it never resolved its platform binary. `check-ui-tokens.mjs` is plain Node and ends
// with `PASS — …` or `FAIL — N UI gate violation(s).`.
const TYPECHECK = { name: 'typecheck', verdictPattern: /^\s*Tasks:\s/m };
const LINT_UI = { name: 'lint:ui', verdictPattern: /^(?:PASS|FAIL)\b/m };

test('a check that passed is not a failure', () => {
    assert.equal(
        classifyCheckResult(TYPECHECK, { status: 0, stdout: ' Tasks:    9 successful, 9 total', stderr: '' }),
        null,
    );
});

test('a check that ran and failed is reported with its output', () => {
    const f = classifyCheckResult(LINT_UI, {
        status: 1,
        stdout: 'hardcoded color\n\nFAIL — 1 UI gate violation(s).',
        stderr: '',
    });
    assert.equal(f.name, 'lint:ui');
    assert.match(f.output, /hardcoded color/);
});

test('a check that could not be spawned throws, so the decision becomes ask', () => {
    assert.throws(
        () => classifyCheckResult(TYPECHECK, { error: new Error('ENOENT'), status: null }),
        /typecheck/,
    );
});

test('a check killed before it finished throws rather than reporting a failure', () => {
    // spawnSync surfaces a timeout as signal SIGTERM. Reporting that as `deny` would blame the
    // tree for the harness; reporting it as a pass would be the silence this hook exists to stop.
    assert.throws(
        () => classifyCheckResult(TYPECHECK, { status: null, signal: 'SIGTERM', stdout: '', stderr: '' }),
        /SIGTERM|finish/i,
    );
});

test('a check with no exit status at all throws', () => {
    assert.throws(() => classifyCheckResult(LINT_UI, { status: null, stdout: '', stderr: '' }), /lint:ui/);
});

// ── A checker that EXITED non-zero without ever running is not a red tree (#179) ─────────────────
// `node_modules/turbo/bin/turbo` is a JavaScript shim that resolves and execs a platform-specific
// optional dependency (`@turbo/darwin-arm64`, `@turbo/linux-64`, …). When that dependency is missing
// or a stale postinstall left it unlinked, the shim EXISTS (so runChecks' existsSync guard passes),
// SPAWNS CLEANLY (so `result.error` is unset) and EXITS 1 with a resolution error. Every negative
// signal classifyCheckResult had was absent, so a perfectly green tree was denied under the heading
// `typecheck` and the human was pointed at `npm run typecheck`, which fails the same way for the
// same unrelated reason. That is the mirror image of the bug `ask` exists to prevent: the header
// spends a section establishing that a check nobody can run must never read as a check that passed,
// and the same distinction is what makes a `deny` honest.
test('a checker that exited non-zero without reaching a verdict throws rather than blaming the tree', () => {
    const turboCouldNotStart = {
        status: 1,
        signal: null,
        stdout: '',
        stderr: [
            'Turborepo failed to start.',
            'Turborepo detected that you are running:\ndarwin arm64',
            'We did not find any binaries on this system.',
            'This can happen if you run installation with the --no-optional flag.',
        ].join('\n'),
    };
    assert.throws(() => classifyCheckResult(TYPECHECK, turboCouldNotStart), /typecheck/);
});

// The pair above and below is the point: "throw on everything non-zero" would satisfy the first
// test and break this one, so a future fix cannot pass by collapsing the distinction the other way.
test('a genuine type error still reports a failure, so the decision stays deny', () => {
    const realTypeError = {
        status: 2,
        signal: null,
        stdout: '@mj-biz-apps/forms-ng:typecheck: src/a.ts(3,5): error TS2307: Cannot find module x\n' +
            ' Tasks:    0 successful, 1 total\nFailed:    @mj-biz-apps/forms-ng#typecheck',
        stderr: '',
    };
    const f = classifyCheckResult(TYPECHECK, realTypeError);
    assert.equal(f.name, 'typecheck');
    assert.match(f.output, /error TS2307/);
});

// The signal must not be turbo-shaped only. `lint:ui` is plain Node and never prints a `Tasks:`
// line, so a fix that hardcoded turbo's summary would turn every real UI-gate failure into `ask`
// and quietly stop blocking the hardcoded colours that #167 merged.
test('a plain-Node checker reaches a verdict without a turbo summary line', () => {
    const uiGateFailed = {
        status: 1,
        signal: null,
        stdout: 'UI token gate\n[color] hardcoded-color gate: 1 violation(s)\n' +
            "  packages/Angular/src/a.css:1  color: #6366f1;\n\nFAIL — 1 UI gate violation(s).",
        stderr: '',
    };
    const f = classifyCheckResult(LINT_UI, uiGateFailed);
    assert.equal(f.name, 'lint:ui');
    assert.match(f.output, /#6366f1/);
});

test('a plain-Node checker that crashed before its verdict throws', () => {
    const uiGateCrashed = {
        status: 1,
        signal: null,
        stdout: 'UI token gate\n',
        stderr: "TypeError: Cannot read properties of undefined (reading 'length')\n    at walk (...)",
    };
    assert.throws(() => classifyCheckResult(LINT_UI, uiGateCrashed), /lint:ui/);
});

// A descriptor with no pattern must not decide anything. Without this guard an added check that
// forgot the field would silently classify every non-zero exit as unrunnable, and every commit
// would `ask` — the check would still be dead, just noisily rather than quietly.
test('a check descriptor with no verdict pattern is a programming error, not a verdict', () => {
    assert.throws(
        () => classifyCheckResult({ name: 'typecheck' }, { status: 1, stdout: '', stderr: '' }),
        /verdictPattern/,
    );
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm run lint:git-gate:test`

Expected: FAIL. `classifyCheckResult` still takes a string first argument, so `${name}` in its throw
messages renders `[object Object]` and the `/typecheck/` and `/lint:ui/` assertions miss; the two
"throws rather than blaming the tree" tests fail because it returns a failure record instead of
throwing; and the `verdictPattern` guard test fails because there is no guard.

Confirm you saw real failures before writing any implementation. If the run errors out before any
test executes, fix that first — an import error is not a red test.

- [ ] **Step 3: Change `classifyCheckResult` to take the check descriptor**

In `.claude/hooks/require-green-before-git.mjs`, replace the whole `classifyCheckResult` function
(and the doc comment above it) with:

```js
/**
 * Pure. Decides what one finished check MEANT: `null` if it passed, a failure record if it ran and
 * failed, and a throw if it did not run to completion.
 *
 * The throw is the point. `decisionFor` turns it into `ask`, and the distinction it preserves is
 * the one the header calls the reason this hook differs from block-generated-edits.mjs — "a check
 * nobody can run must never read as a check that passed". Before this existed, only a MISSING
 * checker and a failed spawn reached `ask`; a killed or timed-out one had no path at all, and the
 * absence of a path meant silence.
 *
 * ── WHY A NON-ZERO EXIT IS NOT ENOUGH TO BLAME THE TREE (#179) ──────────────────────────────────
 * The three signals above are all NEGATIVE — they detect a checker that failed to start or to
 * finish. A checker can do neither and still never judge anything: `node_modules/turbo/bin/turbo`
 * is a JavaScript shim that execs a platform-specific optional dependency, and when that dependency
 * is missing or unlinked the shim exists, spawns cleanly, and exits 1 with a resolution error. No
 * negative signal fires, so a green tree was denied under the heading `typecheck` and the human was
 * sent to `npm run typecheck`, which fails identically for the same unrelated reason.
 *
 * So the last question is asked POSITIVELY: did this checker get far enough to reach a verdict?
 * Each check answers for itself via `verdictPattern`, because the evidence is not the same shape
 * for both — turbo prints a `Tasks:` summary on every completed run, and `check-ui-tokens.mjs` is
 * plain Node that ends in `PASS`/`FAIL`. Matching turbo's format alone would turn every real
 * UI-gate failure into `ask`, which is the same bug pointed the other way.
 *
 * Deliberately asked only of a NON-ZERO exit. A `--filter` glob that matches no package exits 0 and
 * still prints ` Tasks:    0 successful, 0 total`, so the marker cannot catch a run that passed
 * without checking anything; that hole needs a different signal and is tracked separately. Asking
 * here anyway would add a way for a green commit to start prompting without closing it.
 *
 * Matching a printed marker is a heuristic, and it fails SAFE in both directions: a wording change
 * in turbo turns real failures into `ask` (a human looks) rather than into silence. Prefer it to
 * string-matching the error text, which is what changes between releases.
 */
export function classifyCheckResult({ name, verdictPattern }, result) {
    if (!(verdictPattern instanceof RegExp)) {
        throw new Error(`${name} has no verdictPattern, so nothing can say whether it ran.`);
    }
    if (result.error) throw new Error(`${name} could not be spawned: ${result.error.message}`);
    if (result.signal) {
        throw new Error(
            `${name} was killed by ${result.signal} before it could finish, so this tree is ` +
            'unverified rather than clean.',
        );
    }
    if (typeof result.status !== 'number') {
        throw new Error(`${name} did not run to completion, so this tree is unverified.`);
    }
    if (result.status === 0) return null;
    const combined = `${result.stdout || ''}${result.stderr || ''}`;
    if (!verdictPattern.test(combined)) {
        throw new Error(
            `${name} exited ${result.status} without ever reaching a verdict, so this is a broken ` +
            'checker rather than a failing tree — most likely an incomplete install. It reported: ' +
            combined.trim().split('\n').slice(-5).join(' ').slice(0, 300),
        );
    }
    return { name, output: combined.split('\n').slice(-40).join('\n') };
}
```

- [ ] **Step 4: Give each real check its verdict pattern**

In the same file, replace the `invocations` array and the loop's `classifyCheckResult` call inside
`runChecks`:

```js
    const invocations = [
        { name: 'lint:ui', argv: [uiGate], verdictPattern: /^(?:PASS|FAIL)\b/m },
        {
            name: 'typecheck',
            argv: [turbo, 'typecheck', '--filter=@mj-biz-apps/forms-*'],
            // Leading whitespace is load-bearing: turbo prints ` Tasks:    9 successful, 9 total`,
            // so `/^Tasks:/m` matches nothing and would send every commit to `ask`.
            verdictPattern: /^\s*Tasks:\s/m,
        },
    ];

    const failures = [];
    for (const check of invocations) {
        const result = spawnSync(process.execPath, check.argv, {
            cwd: PROJECT_DIR,
            encoding: 'utf8',
            shell: false,
            maxBuffer: 32 * 1024 * 1024,
            timeout: CHECK_TIMEOUT_MS,
        });
        const failure = classifyCheckResult(check, result);
        if (failure) failures.push(failure);
    }
    return failures;
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npm run lint:git-gate:test`

Expected: PASS, every test, no failures. The count should be the previous total plus five.

- [ ] **Step 6: Prove it against a really-broken turbo, not just a synthetic result**

The unit tests pin a hand-written `spawnSync` shape. This step proves that shape is the one a real
broken install produces. It does not modify the repo's `node_modules`: it copies the turbo package
somewhere else, deletes the platform dependency the copy self-installed, and blocks the shim's
`npm install` self-repair by pointing npm at a dead registry — which is what an offline or
firewalled machine looks like.

```bash
MAIN_NM=/Users/sohamdesai/Projects/mj-dev/bizapps-forms  # a worktree has no node_modules; borrow the main checkout's
SP=$(mktemp -d)
REAL=$(cd "$MAIN_NM/node_modules/turbo" && pwd -P)
mkdir -p "$SP/node_modules" && cp -R "$REAL" "$SP/node_modules/turbo"
rm -rf "$SP/node_modules/turbo/node_modules"          # drop any self-installed platform binary

SP="$SP" MAIN_NM="$MAIN_NM" node --input-type=module -e '
const { spawnSync } = await import("node:child_process");
const { classifyCheckResult, decisionFor } = await import("./.claude/hooks/require-green-before-git.mjs");
const check = { name: "typecheck", verdictPattern: /^\s*Tasks:\s/m,
                argv: [process.env.SP + "/node_modules/turbo/bin/turbo", "typecheck", "--filter=@mj-biz-apps/forms-*"] };
const result = spawnSync(process.execPath, check.argv, {
  encoding: "utf8", cwd: process.env.MAIN_NM, shell: false,
  env: { ...process.env, npm_config_registry: "http://127.0.0.1:1/", npm_config_offline: "true", npm_config_fetch_retries: "0" },
});
console.log("status:", result.status, "| error:", result.error?.message ?? "none");
const d = decisionFor({ command: "git commit -m x",
                        runChecks: () => { const f = classifyCheckResult(check, result); return f ? [f] : []; } });
console.log("permissionDecision:", d.decision);
console.log(d.reason.split("\n").slice(0, 3).join("\n"));
'
rm -rf "$SP"
```

Expected: `status: 1 | error: none`, then `permissionDecision: ask`, and a reason naming
`typecheck` and the install problem. Before the fix this same script printed `deny`.

- [ ] **Step 7: Prove the hook still blocks a real red tree end to end**

A fix that turns everything into `ask` would pass Step 6 and destroy the hook. Drive the real
`runChecks` — not a synthetic result — against a tree with a real UI-gate violation:

```bash
printf '.x { color: #6366f1; }\n' > packages/Angular/src/__issue179probe.css
echo '{"tool_input":{"command":"git commit -m x"}}' | node .claude/hooks/require-green-before-git.mjs
rm -f packages/Angular/src/__issue179probe.css
```

Expected: JSON on stdout with `"permissionDecision":"deny"` and `#6366f1` quoted under
`── lint:ui ──`. Then re-run with the probe file deleted and expect **no output at all** (silence is
`allow`). Delete the probe file even if the command fails — leaving it behind reds the real gate.

- [ ] **Step 8: Add the changeset**

Create `.changeset/unrunnable-checker-asks.md`:

```markdown
---
"@mj-biz-apps/forms-entities": patch
---

The pre-commit gate no longer reports a checker that never ran as a tree that failed a check. A
turbo install missing its platform binary exits non-zero without running anything, which read as a
failing `typecheck` and denied a green commit. Each check now declares the marker it prints once it
has reached a verdict, and a non-zero exit without that marker asks instead of denying. Ships no
migration and no metadata, so patch.
```

- [ ] **Step 9: Commit** *(only once the user has asked for a commit — CLAUDE.md critical rule 1)*

```bash
git add .claude/hooks/require-green-before-git.mjs \
        .claude/hooks/require-green-before-git.spec.mjs \
        .changeset/unrunnable-checker-asks.md \
        plans/ISSUE_179_PLAN.md
git commit -m "fix(hooks): a checker that never ran is not a tree that failed"
```

---

## Definition of done (from the issue)

- [ ] A failing test driving `classifyCheckResult` with a synthetic infrastructure-failure result
      (non-zero status, no `Tasks:` line), watched fail, then green — Task 1 Steps 1–5.
- [ ] That case throws (⇒ `ask`), and a genuine `error TS…` failure still returns a failure record
      (⇒ `deny`) — both pinned, so a future "throw on everything non-zero" cannot pass as a fix —
      the adjacent test pair in Step 1.
- [ ] `lint:ui`'s own non-zero exit is unaffected: it is plain Node and has no such summary line, so
      whatever signal is chosen must not be turbo-shaped only — the two `LINT_UI` tests in Step 1,
      plus the real end-to-end `deny` in Step 7.
- [ ] `npm run lint:git-gate:test` green — Step 5.
- [ ] Verify by: the repro yields `ask` naming the install problem, while a real failure still
      yields `deny` — Steps 6 and 7.

## Task 2: a pass that judged nothing is not a green tree (#196)

Folded in on request after #179 landed on the branch. The measurement that had justified deferring
it is the same one that shapes it: `turbo typecheck --filter='@nope/*'` exits **0** and prints
` Tasks:    0 successful, 0 total`, so `verdictPattern` is present and proves nothing — the
distinguishing evidence is the **count**. `lint:ui` fails the same way for a moved scan root
(`walk()` swallows a missing directory), reporting `Scanned 0 file(s)` and then `PASS`.

So each check gains a second pattern, `coveredWorkPattern`, asked only of a **zero** exit:

| Check | `verdictPattern` (non-zero arm) | `coveredWorkPattern` (zero arm) |
|---|---|---|
| `typecheck` | `/^\s*Tasks:\s/m` | `/^\s*Tasks:\s+\d+ successful,\s+[1-9]\d* total/m` |
| `lint:ui` | `/^(?:PASS\|FAIL)\b/m` | `/^Scanned [1-9]\d* file\(s\)/m` |

Both are positive and both fail toward `ask`. That direction is deliberate and is the one judgement
call here: this arm is the one every green commit takes, so a wrong pattern prompts on every commit.
That is the cost worth paying, because a pattern that stopped matching would silently reopen the
hole, and a wrong `ask` announces itself while a wrong `allow` does not.

Six tests pin it — three that must throw (turbo empty run, `lint:ui` empty scan, a descriptor
missing the field) and three that must still pass (an ordinary green run, a fully-cached
`>>> FULL TURBO` run, a `lint:ui` run that scanned files and found nothing). The second trio is what
stops "throw on every zero exit" passing as a fix.

### Verified from real checker output, not synthetic results

| Invocation | exit | decision |
|---|---|---|
| `turbo typecheck --filter='@nope/does-not-exist-*'` | 0 | **ask** — "passed without covering anything" |
| `check-ui-tokens.mjs` copied where its scan root does not exist | 0 | **ask** — same |
| turbo with its platform binary unresolvable (#179) | 1 | **ask** — "without ever reaching a verdict" |
| `turbo typecheck --filter='@mj-biz-apps/forms-*'` (control) | 0 | **allow** |

Plus the real hook end to end: a green tree writes nothing, and a hardcoded `#6366f1` still denies.
