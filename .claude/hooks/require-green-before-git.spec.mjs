import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGitWriteCommand, decisionFor, classifyCheckResult, gitToplevelOf } from './require-green-before-git.mjs';

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
    assert.equal(isGitWriteCommand('echo pushing'), false);
    assert.equal(isGitWriteCommand('npm run commitpush'), false);
});

// DELIBERATE FALSE POSITIVE (#178), and the reason it is the right way round.
// `grep -rn "git commit" docs/` used to be allowed BECAUSE quotes were not boundaries — the same
// property that let `bash -c "git commit -m x"` through. To a regex the two are identical: both put
// `git commit` immediately after a double quote. The difference is which program is being invoked,
// and no character class can see it. Under-inclusiveness ships a red tree; over-inclusiveness costs
// one check run (217 ms warm) and, on a red tree, one confusing deny — which is why the deny
// message names this case. Changing this expectation back re-opens the bypass.
test('a quoted phrase that only looks like a git write is checked anyway', () => {
    assert.equal(isGitWriteCommand('grep -rn "git commit" docs/'), true);
});

test('an unrelated command is not a git write', () => {
    assert.equal(isGitWriteCommand('ls -la'), false);
});

test('command substitution does not hide a git write', () => {
    assert.equal(isGitWriteCommand('out=$(git commit -m "x" 2>&1)'), true);
    assert.equal(isGitWriteCommand('(git commit -m x)'), true);
    assert.equal(isGitWriteCommand('`git push`'), true);
});

// A nested shell is the most ordinary way to run git from a script, and its payload always begins
// right after a quote. The boundary class had no quote characters, so `decisionFor` returned
// `allow` without calling `runChecks` at all — not a bypass an agent chose, just shell it wrote.
test('a quoted nested shell does not hide a git write', () => {
    assert.equal(isGitWriteCommand('bash -c "git commit -m x"'), true);
    assert.equal(isGitWriteCommand("sh -lc 'git push'"), true);
    assert.equal(isGitWriteCommand('ssh host "git push"'), true);
});

// `/` is not a boundary character and never should be — it is the middle of a path, not the start
// of a command. The fix is a path PREFIX arm before `git`, not another boundary. An absolute path
// is how git is invoked from a script that cannot trust PATH, and how Homebrew's git is reached.
test('a path-qualified git is still a git write', () => {
    assert.equal(isGitWriteCommand('/usr/bin/git commit -m x'), true);
    assert.equal(isGitWriteCommand('/opt/homebrew/bin/git push origin next'), true);
    assert.equal(isGitWriteCommand('./bin/git commit -m x'), true);
    assert.equal(isGitWriteCommand('../tools/git push'), true);
});

// The prefix must not swallow a word that merely ENDS in git, or a path with no subcommand after
// it. Without these, "match any path-ish blob before the word" would pass as a fix.
test('a path that merely ends in git is not a git write', () => {
    assert.equal(isGitWriteCommand('ls -l /usr/bin/git'), false);
    assert.equal(isGitWriteCommand('cat /var/log/legit commit'), false);
    assert.equal(isGitWriteCommand('cat digit push.txt'), false);
});

// macOS and Windows both mount case-insensitive, so `Git commit` really runs git — the same
// bypass block-generated-edits.mjs was bitten by.
test('a shifted capital does not hide a git write', () => {
    assert.equal(isGitWriteCommand('Git commit -m x'), true);
    assert.equal(isGitWriteCommand('GIT PUSH origin next'), true);
});

test('an env-prefixed git write is still a git write', () => {
    assert.equal(isGitWriteCommand('GIT_AUTHOR_DATE=x git commit -m y'), true);
});

// git accepts a whole family of global options BEFORE the subcommand, and every one of them sits
// exactly where `-C`/`-c` do. Enumerating two of them by name meant any other option was a silent
// bypass: isGitWriteCommand returned false, decisionFor returned `allow` without spawning either
// checker, and a red tree was committed with nothing having looked. Same class as the three
// bypasses above, in the one part of the pattern they did not revisit.
test('a global option before the subcommand does not hide a git write', () => {
    assert.equal(isGitWriteCommand('git --no-pager commit -m x'), true);
    assert.equal(isGitWriteCommand('git -P commit -m x'), true);
    assert.equal(isGitWriteCommand('git --no-pager push origin next'), true);
});

test('a global option that takes a value does not hide a git write', () => {
    assert.equal(isGitWriteCommand('git --git-dir=.git --work-tree=. commit -m x'), true);
    assert.equal(isGitWriteCommand('git --git-dir .git commit -m x'), true);
    assert.equal(isGitWriteCommand('git --exec-path=/x push'), true);
    assert.equal(isGitWriteCommand('git -c a=b -c c=d commit -m x'), true);
});

// The fix must stay linear. This regex runs on EVERY Bash tool call, so a pattern that backtracks
// exponentially on non-matching input would hang the agent — strictly worse than the bug. The
// obvious general form, `-\S+(?:\s+\S+)?\s+`, does exactly that: 0.02ms at 15 options, 0.25ms at
// 20, 1.65ms at 24. Budget is deliberately loose so this fails on a blow-up, not on a slow machine.
test('the matcher stays linear on pathological input', () => {
    const evil = `git ${'-a '.repeat(64)}x`;
    const start = process.hrtime.bigint();
    isGitWriteCommand(evil);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    assert.ok(ms < 50, `isGitWriteCommand took ${ms.toFixed(1)}ms on 64 options — backtracking blow-up`);
});

// Same reasoning as the test above, for the path prefix added in #178: a long path-shaped string is
// non-matching input that the matcher must reject cheaply, on every Bash tool call.
test('the path prefix stays linear on pathological input', () => {
    for (const evil of [`${'a/'.repeat(200)}x`, `${'/'.repeat(400)}x`]) {
        const start = process.hrtime.bigint();
        isGitWriteCommand(evil);
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        assert.ok(ms < 50, `isGitWriteCommand took ${ms.toFixed(1)}ms on ${evil.length} chars`);
    }
});

// A subcommand that is not commit/push must stay allowed even behind global options, so the
// broadened middle does not turn every read into a check.
test('global options do not turn a read into a git write', () => {
    assert.equal(isGitWriteCommand('git --no-pager log --oneline -5'), false);
    assert.equal(isGitWriteCommand('git --no-pager status'), false);
    assert.equal(isGitWriteCommand('git -c core.pager=cat diff'), false);
    assert.equal(isGitWriteCommand('git --git-dir=.git add -A'), false);
});

test('a longer subcommand that merely starts with commit or push is not a git write', () => {
    assert.equal(isGitWriteCommand('git commitpush'), false);
    assert.equal(isGitWriteCommand('git pushall'), false);
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

// The accepted false positive (#178) is only acceptable if it can explain itself. The message is
// this hook's entire user interface: a grep denied on a red tree otherwise shows a wall of
// typecheck output about a commit the developer was never making.
test('a deny says a non-git command may have been matched on purpose', () => {
    const result = decisionFor({ command: 'grep -rn "git commit" docs/', runChecks: red });
    assert.equal(result.decision, 'deny');
    assert.match(result.reason, /quote/i);
    assert.match(result.reason, /178/);
});

// The whole point of the hook is that a check nobody can run must not read as a check that passed.
test('checks that cannot run ask rather than silently allowing', () => {
    const result = decisionFor({ command: 'git commit -m x', runChecks: unrunnable });
    assert.equal(result.decision, 'ask');
    assert.match(result.reason, /turbo entry point not found/);
});

// ── A check that did not FINISH must reach `ask`, like one that could not START ─────────────────
// The file's stated principle is that a check nobody can run must never read as a check that
// passed. `runChecks` honoured that for a MISSING checker and for a failed spawn, and nowhere else:
// every other outcome became "ran and failed" or, worse, silence. spawnSync had no `timeout` and
// .claude/settings.json sets none, so a stalled checker ran until the harness cancelled the hook,
// which writes nothing — and writing nothing is `allow`. That is the exact hole the header forbids,
// reached by the most ordinary failure there is: a check that hangs.
//
// It matters because the header's cost claim does not survive contact with the invocation context.
// `turbo.json` gives `typecheck` `dependsOn: ["^build"]`, and the hook fires on `git commit`, which
// by construction happens after source changed. Measured on this repo: 217 ms with nothing changed,
// 6931 ms after touching one leaf source file, 6507 ms cold. Not the 13 ms the comment claims.
//
// Each check declares the pattern it prints once it has REACHED A VERDICT. Measured, not guessed:
// turbo prints ` Tasks:    N successful, M total` on every completed run — success (9 successful),
// task failure (exit 2, `0 successful, 1 total`) and fully-cached alike — and prints nothing of the
// sort when it never resolved its platform binary. `check-ui-tokens.mjs` is plain Node and ends
// with `PASS — …` or `FAIL — N UI gate violation(s).`.
//
// `coveredWorkPattern` is the same question asked of the OTHER arm: a zero exit claims success, and
// this is the proof the success covered anything. Both are positive and both are measured — turbo
// prints ` Tasks:    9 successful, 9 total`, and `check-ui-tokens.mjs` prints
// `Scanned 197 file(s) under: packages/Angular/src`.
const TYPECHECK = {
    name: 'typecheck',
    verdictPattern: /^\s*Tasks:\s/m,
    coveredWorkPattern: /^\s*Tasks:\s+\d+ successful,\s+[1-9]\d* total/m,
};
const LINT_UI = {
    name: 'lint:ui',
    verdictPattern: /^(?:PASS|FAIL)\b/m,
    coveredWorkPattern: /^Scanned [1-9]\d* file\(s\)/m,
};

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
// and the same distinction is what makes a deny honest.
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

// ── A PASS THAT JUDGED NOTHING IS NOT A GREEN TREE (#196) ────────────────────────────────────
// The same hole as #179, reached from the success side, where it is SILENT rather than merely wrong.
// `--filter=@mj-biz-apps/forms-*` is a hardcoded npm-scope glob; a scope rename, a package moved out
// of `packages/*`, or a `pnpm-workspace.yaml` edit each make it match nothing. turbo does not treat
// that as an error — it exits 0 and prints ` Tasks:    0 successful, 0 total`. `lint:ui` behaves the
// same way for a moved `packages/Angular/src`, because its `walk()` swallows a missing directory and
// reports `Scanned 0 file(s)`. Either way the hook wrote nothing, and writing nothing is `allow`.
//
// Note the trap for anyone re-deriving this: the empty run STILL PRINTS a `Tasks:` line, so the
// marker #179 added does not catch it. The distinguishing evidence is the count, not the marker.
test('a turbo pass that ran no tasks at all throws rather than reporting the tree clean', () => {
    const nothingMatchedTheFilter = {
        status: 0,
        signal: null,
        stdout: ' WARNING  No tasks were executed as part of this run.\n\n' +
            ' Tasks:    0 successful, 0 total\nCached:    0 cached, 0 total\n  Time:    9ms',
        stderr: '',
    };
    assert.throws(() => classifyCheckResult(TYPECHECK, nothingMatchedTheFilter), /typecheck/);
});

// The pair below is what stops "throw on every zero exit" passing as a fix. Both are real output.
test('an ordinary green run is still a pass', () => {
    assert.equal(
        classifyCheckResult(TYPECHECK, {
            status: 0,
            stdout: ' Tasks:    9 successful, 9 total\nCached:    0 cached, 9 total',
            stderr: '',
        }),
        null,
    );
});

test('a fully cached green run is still a pass', () => {
    // `>>> FULL TURBO` is the everyday case: the hook fires on every commit and turbo caches.
    assert.equal(
        classifyCheckResult(TYPECHECK, {
            status: 0,
            stdout: ' Tasks:    9 successful, 9 total\nCached:    9 cached, 9 total\n' +
                '  Time:    11ms >>> FULL TURBO',
            stderr: '',
        }),
        null,
    );
});

// Not turbo-shaped only, on this arm either. `lint:ui`'s empty run has no `Tasks:` line to count.
test('a ui gate that scanned no files throws rather than reporting the tree clean', () => {
    const scanRootMoved = {
        status: 0,
        signal: null,
        stdout: 'UI token gate\n-------------\nScanned 0 file(s) under: packages/Angular/src\n\n' +
            '[color] hardcoded-color gate: 0 violation(s)\n\nPASS — no UI gate violations.',
        stderr: '',
    };
    assert.throws(() => classifyCheckResult(LINT_UI, scanRootMoved), /lint:ui/);
});

test('a ui gate that scanned files and found none is still a pass', () => {
    assert.equal(
        classifyCheckResult(LINT_UI, {
            status: 0,
            stdout: 'UI token gate\n-------------\nScanned 197 file(s) under: packages/Angular/src\n\n' +
                'PASS — no UI gate violations.',
            stderr: '',
        }),
        null,
    );
});

test('a check descriptor with no covered-work pattern is a programming error, not a verdict', () => {
    assert.throws(
        () => classifyCheckResult({ name: 'lint:ui', verdictPattern: /x/ }, { status: 0, stdout: '', stderr: '' }),
        /coveredWorkPattern/,
    );
});

// ── Which tree gets checked ─────────────────────────────────────────────────────────────────────
// The hook used to run both checks in `CLAUDE_PROJECT_DIR`, which keeps naming the launch checkout
// after a session enters a git worktree. A worktree session was therefore refused for a stranger's
// half-finished edit in the main checkout, and — the direction that actually matters — a broken
// worktree would have been waved through because the main checkout was green.

test('resolves the worktree root, not the checkout the session started in', () => {
    // This spec file lives in a linked worktree whenever the suite runs from one, so the assertion
    // is simply: whatever git says is the top of THIS tree is a directory this file sits under.
    const top = gitToplevelOf(new URL('.', import.meta.url).pathname);
    assert.ok(top, 'git rev-parse --show-toplevel should answer inside the repo');
    assert.ok(
        new URL('.', import.meta.url).pathname.startsWith(top),
        `the hook's own directory should sit under the resolved toplevel (got ${top})`,
    );
});

test('answers null outside a repository, so the caller can fall back rather than crash', () => {
    // A hook that threw here would break every Bash call in a non-repo cwd.
    assert.equal(gitToplevelOf('/'), null);
});
