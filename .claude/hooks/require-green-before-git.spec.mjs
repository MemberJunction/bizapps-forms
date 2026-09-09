import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGitWriteCommand, decisionFor, classifyCheckResult } from './require-green-before-git.mjs';

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

test('command substitution does not hide a git write', () => {
    assert.equal(isGitWriteCommand('out=$(git commit -m "x" 2>&1)'), true);
    assert.equal(isGitWriteCommand('(git commit -m x)'), true);
    assert.equal(isGitWriteCommand('`git push`'), true);
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
