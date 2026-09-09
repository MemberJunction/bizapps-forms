# Issue 178 — Quoted and path-qualified git invocations walk past the commit gate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `.claude/hooks/require-green-before-git.mjs` recognise a git write that is invoked
through a quoted nested shell (`bash -c "…"`, `sh -lc '…'`, `ssh host "…"`) or through an absolute
or relative path (`/usr/bin/git`), so the pre-commit checks actually run on those commands.

**Architecture:** The hook decides "is this a git write?" with a single regex, `GIT_WRITE`, whose
leading boundary class encodes *what characters can precede a command*. That class omits the two
quote characters, and the pattern anchors `git` as a bare word. Two additions close both gaps: the
quote characters join the boundary class, and an optional `(?:[\w.\/-]*\/)?` path prefix is allowed
before `git`. Both stay inside the existing regex — no tokeniser, no shell parsing (see
*Design decision* below for why option (b) from the issue is rejected).

The change is deliberately **over-inclusive**, which is the file's stated policy, and it costs one
documented false positive that the current spec pins as an allow-case. That expectation is flipped
on purpose, with the reason written into the spec, and the deny message is widened to explain
itself so a developer who trips it is not left guessing.

**Tech Stack:** Plain Node ESM (no dependencies), `node:test` + `node:assert/strict`.
Run the suite with `npm run lint:git-gate:test`.

**Spec:** [GitHub issue #178](https://github.com/MemberJunction/bizapps-forms/issues/178) — read its
*Definition of done* and *Verify by* sections; every one of its five DoD boxes maps to a step below.

---

## Global Constraints

- **Node only, no dependencies.** The hook and its spec must run with bare `node` in a worktree that
  has no `node_modules` — the spec imports the hook directly and stubs `runChecks`.
- **The matcher runs on EVERY Bash tool call.** Any pattern change must stay linear on
  non-matching input. A backtracking blow-up here hangs the agent and is strictly worse than the
  bug being fixed. Budget: the existing 64-option test asserts `< 50 ms`.
- **Over-inclusiveness is the intended direction.** A needless check costs one `lint:ui` +
  `typecheck` run — measured in this file's own header at 217 ms warm, ~6.9 s after one leaf source
  file changed. Under-inclusiveness is the bug the hook exists to prevent.
- **Comments in this file are load-bearing and must not go stale.** The header documents each
  boundary character and the bypass it closes; a future reader uses that list to judge whether a new
  case has been thought through. Every pattern change updates it in the same commit.
- **Never hand-edit generated files** and **no `git commit` without explicit approval from the
  user** (repo CLAUDE.md). This plan's commit steps run only when the user has asked.
- **This PR ships no changeset.** It touches `.claude/` and `plans/` only — no publishable package
  changes, and `.changeset/config.json` puts all four packages in one fixed group, so a changeset
  here would move four versions for a release that gained nothing. CI only requires a changeset when
  `migrations/*.sql` changed (`.github/workflows/changes.yml`).

## Design decision — why regex widening, not a shell parser

The issue offers three options. This plan takes **(a) accept the false positive**, plus the
`/usr/bin/git` prefix, plus a piece of (c): the limit that remains is written down.

- **(b) tokenise and recurse into `bash -c` payloads** is the correct answer to "which program is
  being invoked", and it is much more machinery than the rest of this ~200-line hook: a shell
  tokeniser must handle nested quoting, escapes, `--` terminators, and per-shell `-c` argument
  placement, and every one of those is a new way for the gate to be silently wrong. A gate whose own
  correctness is hard to see is worse than one that over-matches. Rejected on those grounds, and the
  rejection is recorded in the file header so it is not re-litigated.
- **(a)** keeps the decision procedure something a reader can verify by eye, and errs in the
  direction the file already declares safe.

What (a) costs, exactly: `grep -rn "git commit" docs/` and `bash -c "git commit -m x"` are
*structurally identical* to a regex — both put `git commit` immediately after a double quote. So
the grep now runs the checks too. On a green tree that is invisible (it allows). On a red tree it is
a deny with a message about a commit the developer was not making — which is why Task 3 makes the
message say so.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `.claude/hooks/require-green-before-git.mjs` | Modify (`GIT_WRITE` regex + its doc comment + the deny reason in `decisionFor`) | Decides whether a Bash command is a git write, and what to say when it refuses one |
| `.claude/hooks/require-green-before-git.spec.mjs` | Modify (add cases; flip one) | Pins the matcher's behaviour, including the allow-cases that stop "deny everything" passing as a fix |
| `plans/ISSUE_178_PLAN.md` | Create (this file) | The plan |

No other file changes. There is no `packages/*` source in this diff.

---

### Task 1: A quoted nested shell no longer hides a git write

**Files:**
- Modify: `.claude/hooks/require-green-before-git.mjs:83-84` (the `GIT_WRITE` literal) and its
  doc comment above it (`:55-82`)
- Test: `.claude/hooks/require-green-before-git.spec.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `isGitWriteCommand(command: string): boolean` — unchanged signature, widened behaviour.
  Task 2 widens the same literal further; Task 3 depends only on `decisionFor`.

- [ ] **Step 1: Write the failing test**

Add to `.claude/hooks/require-green-before-git.spec.mjs`, after the existing
`command substitution does not hide a git write` test:

```js
// A nested shell is the most ordinary way to run git from a script, and its payload always begins
// right after a quote. The boundary class had no quote characters, so `decisionFor` returned
// `allow` without calling `runChecks` at all — not a bypass an agent chose, just shell it wrote.
test('a quoted nested shell does not hide a git write', () => {
    assert.equal(isGitWriteCommand('bash -c "git commit -m x"'), true);
    assert.equal(isGitWriteCommand("sh -lc 'git push'"), true);
    assert.equal(isGitWriteCommand('ssh host "git push"'), true);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm run lint:git-gate:test`
Expected: FAIL — `a quoted nested shell does not hide a git write`, with
`Expected values to be strictly equal: false !== true`. The other 24 tests still pass.

- [ ] **Step 3: Flip the one allow-case this deliberately breaks**

In the same file, the existing test at line 33 asserts `grep -rn "git commit" docs/` is `false`.
Remove that one assertion from it (leaving `echo pushing` and `npm run commitpush`) and add its
replacement immediately below, so the change is a recorded decision rather than a silent edit:

```js
test('a word merely containing commit or push is not a git write', () => {
    assert.equal(isGitWriteCommand('echo pushing'), false);
    assert.equal(isGitWriteCommand('npm run commitpush'), false);
});

// DELIBERATE FALSE POSITIVE (#178), and the reason it is the right way round.
// `grep -rn "git commit" docs/` used to be allowed BECAUSE quotes were not boundaries — the same
// property that let `bash -c "git commit -m x"` through. To a regex the two are identical: both put
// `git commit` immediately after a double quote. The difference is which program is being invoked,
// and no character class can see it. Under-inclusiveness ships a red tree; over-inclusiveness costs
// one check run (217 ms warm) and, on a red tree, one confusing deny — which is why the deny
// message now names this case. Changing this expectation back re-opens the bypass.
test('a quoted phrase that only looks like a git write is checked anyway', () => {
    assert.equal(isGitWriteCommand('grep -rn "git commit" docs/'), true);
});
```

- [ ] **Step 4: Widen the boundary class**

In `.claude/hooks/require-green-before-git.mjs`, add `'` and `"` to the leading boundary class:

```js
const GIT_WRITE =
    /(?:^|[\s;&|(`'"])\s*git\s+(?:(?:-[Cc]|--(?:git-dir|work-tree|exec-path|namespace|config-env|attr-source))[=\s]\S+\s+|-\S+\s+)*(?:commit|push)(?![\w-])/i;
```

- [ ] **Step 5: Update the doc comment that the change makes false**

The comment above `GIT_WRITE` currently opens with:

> The leading boundary makes `npm run commitpush` and `grep -rn "git commit" docs/` allow — the
> first because `commitpush` is one word, the second because the match must begin a command.

The second clause is now untrue. Replace that sentence, and extend the bullet list of boundary
characters with the quote entry (keep the existing `(`/backtick bullet, the `/i` bullet and the
trailing-lookahead bullet as they are):

```
 * The leading boundary makes `npm run commitpush` allow, because `commitpush` is one word. It no
 * longer makes `grep -rn "git commit" docs/` allow — see the quote bullet below, and the spec case
 * that pins the trade deliberately.
```

and add, to the bullet list:

```
 * - The class also includes both QUOTE characters. A nested shell — `bash -c "git commit -m x"`,
 *   `sh -lc 'git push'`, `ssh host "git push"` — always puts `git` immediately after a quote, so
 *   without them every quoted invocation returned `allow` with neither checker spawned (#178).
 *   This is the one boundary that costs a real false positive: `grep -rn "git commit" docs/` is
 *   structurally identical to `bash -c "git commit -m x"` and is now checked too. That is the
 *   policy of this file applied honestly — a needless check costs one measured run (217 ms warm,
 *   ~6.9 s when a leaf source file changed), a missed one ships a red tree. Parsing the command
 *   instead of matching it would tell the two apart; a shell tokeniser handling nested quoting,
 *   escapes and per-shell `-c` placement is far more machinery than this hook, and every corner of
 *   it is a new way to be silently wrong, so it was considered and rejected rather than missed.
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npm run lint:git-gate:test`
Expected: PASS — 26 tests, 0 failures (24 before, +1 quoted-shell test, +1 deliberate-false-positive
test; the flipped assertion moved out of an existing test rather than adding one).

- [ ] **Step 7: Commit** (only when the user has asked for a commit)

```bash
git add .claude/hooks/require-green-before-git.mjs .claude/hooks/require-green-before-git.spec.mjs
git commit -F <a message file>
```

Message: `fix(hooks): a quoted nested shell no longer walks past the commit gate`, body explaining
the flipped allow-case and the rejected parser, `Refs #178`.

---

### Task 2: A path-qualified git no longer hides a git write

**Files:**
- Modify: `.claude/hooks/require-green-before-git.mjs` (the `GIT_WRITE` literal + its comment)
- Test: `.claude/hooks/require-green-before-git.spec.mjs`

**Interfaces:**
- Consumes: `isGitWriteCommand` as widened by Task 1.
- Produces: same signature; `/usr/bin/git commit` now matches.

- [ ] **Step 1: Write the failing test**

```js
// `/` is not a boundary character and never should be — it is the middle of a path, not the start
// of a command. The fix is a path PREFIX arm before `git`, not another boundary. Absolute paths are
// how git is invoked from a script that cannot trust PATH, and how Homebrew's git is reached.
test('a path-qualified git is still a git write', () => {
    assert.equal(isGitWriteCommand('/usr/bin/git commit -m x'), true);
    assert.equal(isGitWriteCommand('/opt/homebrew/bin/git push origin next'), true);
    assert.equal(isGitWriteCommand('./bin/git commit -m x'), true);
    assert.equal(isGitWriteCommand('../tools/git push'), true);
});

// The prefix must not swallow a word that merely ENDS in git, or a path with no subcommand after
// it. Without these, "match any path-ish blob" would pass as a fix.
test('a path that merely ends in git is not a git write', () => {
    assert.equal(isGitWriteCommand('ls -l /usr/bin/git'), false);
    assert.equal(isGitWriteCommand('cat /var/log/legit commit'), false);
    assert.equal(isGitWriteCommand('cat digit push.txt'), false);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm run lint:git-gate:test`
Expected: FAIL — `a path-qualified git is still a git write` (`false !== true`). The
`a path that merely ends in git is not a git write` test passes already; it is a guard for the next
step, not a red test.

- [ ] **Step 3: Add the path prefix arm**

```js
const GIT_WRITE =
    /(?:^|[\s;&|(`'"])\s*(?:[\w.\/-]*\/)?git\s+(?:(?:-[Cc]|--(?:git-dir|work-tree|exec-path|namespace|config-env|attr-source))[=\s]\S+\s+|-\S+\s+)*(?:commit|push)(?![\w-])/i;
```

`(?:[\w.\/-]*\/)?` is one flat, greedy class that must end in a literal `/`, so it cannot match a
bare word: `/var/log/legit commit` fails at every backtrack point because the only characters
following a `/` are `var`, `log` and `legit`, none of which is `git`. One class with a required
terminator also keeps the arm linear — the nested-quantifier form `(?:[\w.-]*\/)+` is the shape this
file's header already warns about.

- [ ] **Step 4: Extend the comment's bullet list**

```
 * - An optional PATH PREFIX, `(?:[\w.\/-]*\/)?`, sits before `git`. `/` is deliberately NOT a
 *   boundary character — it is the middle of a path, not the start of a command — so
 *   `/usr/bin/git commit` matched nothing at all before (#178). The class must END in a slash, so a
 *   word that merely ends in `git` (`/var/log/legit commit`, `digit push.txt`) still does not
 *   match, and one flat greedy class keeps it linear where the tempting `(?:[\w.-]*\/)+` would not.
```

- [ ] **Step 5: Pin linearity for the new arm**

Add next to the existing 64-option linearity test:

```js
// Same reasoning as the 64-option test above, for the path prefix: a long path-shaped string is
// non-matching input the matcher must reject cheaply, on every Bash tool call.
test('the path prefix stays linear on pathological input', () => {
    for (const evil of [`${'a/'.repeat(200)}x`, `${'/'.repeat(400)}x`]) {
        const start = process.hrtime.bigint();
        isGitWriteCommand(evil);
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        assert.ok(ms < 50, `isGitWriteCommand took ${ms.toFixed(1)}ms on ${evil.length} chars`);
    }
});
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npm run lint:git-gate:test`
Expected: PASS — 29 tests, 0 failures.

- [ ] **Step 7: Commit** (only when the user has asked)

Message: `fix(hooks): an absolute-path git invocation is a git write too`, `Refs #178`.

---

### Task 3: The deny message explains the false positive it can produce

**Files:**
- Modify: `.claude/hooks/require-green-before-git.mjs` (the `deny` branch of `decisionFor`)
- Test: `.claude/hooks/require-green-before-git.spec.mjs`

**Interfaces:**
- Consumes: `decisionFor({ command, runChecks })` → `{ decision, reason }`, unchanged signature.
- Produces: nothing new; the `reason` string gains a sentence.

**Why this task exists:** it is the half of the issue's option (a) that stops the accepted false
positive from being a papercut. Without it, a developer who runs `grep -rn "git commit" docs/` on a
red tree gets a wall of typecheck output about a commit they were not making, and the only way to
understand it is to read the hook. The message is the hook's entire user interface.

- [ ] **Step 1: Write the failing test**

```js
// The accepted false positive (#178) is only acceptable if it can explain itself. A grep denied on
// a red tree must say why a grep was ever checked.
test('a deny says a non-git command may have been matched on purpose', () => {
    const result = decisionFor({ command: 'grep -rn "git commit" docs/', runChecks: red });
    assert.equal(result.decision, 'deny');
    assert.match(result.reason, /quote/i);
    assert.match(result.reason, /178/);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm run lint:git-gate:test`
Expected: FAIL — `The input did not match the regular expression /quote/i`.

- [ ] **Step 3: Widen the deny reason**

In `decisionFor`, the `deny` branch currently ends with
`'\n\nRe-run with \`npm run lint:ui\` and \`npm run typecheck\`.'`. Append:

```js
            '\n\nIf this command was not actually a git write — a grep for the phrase, or prose ' +
            'quoting it — the gate cannot tell: a quote character counts as a command start on ' +
            'purpose (#178), because missing a real `bash -c "git commit …"` is the worse error.',
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run lint:git-gate:test`
Expected: PASS — 30 tests, 0 failures.

- [ ] **Step 5: Verify against the issue's own repro**

Run the exact snippet from the issue's *Repro* section (or the equivalent script in the scratchpad).
Expected: `true` for `bash -c "git commit -m x"`, `sh -lc 'git push'`, `/usr/bin/git commit -m x`
and `ssh host "git push"`; `true` for `grep -rn "git commit" docs/` with the spec now stating why.

- [ ] **Step 6: Commit** (only when the user has asked)

Message: `fix(hooks): a deny explains the over-match it is allowed to produce`, `Refs #178`.

---

## Definition of done (from the issue, mapped)

| Issue DoD | Where |
|---|---|
| Failing test for `bash -c "git commit -m x"`, watched fail, then green | Task 1, Steps 1–2, 6 |
| `/usr/bin/git commit -m x` matches | Task 2, Steps 1–3 |
| The `grep` case is changed **deliberately**, with the reason in the spec | Task 1, Step 3 |
| The 64-option linearity test still passes | Task 1 Step 6, Task 2 Step 6; plus a new path-shaped case, Task 2 Step 5 |
| `npm run lint:git-gate:test` green | Task 3, Step 4 |

## Notes for whoever executes this

- **A hook edited in a worktree is not the hook that runs.** `.claude/settings.json` invokes hooks
  through `CLAUDE_PROJECT_DIR`, which keeps naming the directory the session launched from. So this
  change has no effect on your own tool calls until it merges and the main checkout has it. Verify
  through `npm run lint:git-gate:test` and the repro script — never by "seeing whether the hook
  behaves differently".
- **PR #187 (`fix/177-publish-pushes-via-pr`) edits the same doc comment**, adding a sentence noting
  that `commitpush` is no longer a real script. It is a two-line textual conflict in the paragraph
  Task 1 Step 5 rewrites; whoever merges second keeps both facts.
- Do not add a changeset (see Global Constraints).
