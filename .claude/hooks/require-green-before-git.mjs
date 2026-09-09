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
 * `lint:ui` is 0.2s of Node stdlib. `typecheck` is a turbo task with `cache: true`, so turbo's
 * content hash already answers "which packages changed" better than anything this hook could
 * compute, and it does not try.
 *
 * Measure it rather than quoting the warm number, which is what an earlier version of this comment
 * did ("13ms"). That figure describes a repeat run with nothing changed, and this hook fires on
 * `git commit`, which by construction happens AFTER something changed — and `turbo.json` gives
 * `typecheck` `dependsOn: ["^build"]`, so the realistic invocation rebuilds the changed package and
 * everything downstream. On this repo: 217 ms warm, 6.9 s after touching one leaf source file,
 * 6.5 s cold. Seconds, not milliseconds. Still worth paying before a commit; not worth
 * misdescribing, because the number is what a reader uses to judge whether the design is sound.
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
 * The middle segment covers GLOBAL OPTIONS between `git` and the subcommand, which are otherwise a
 * straight bypass. It describes their SHAPE rather than naming them: an earlier version enumerated
 * `-C` and `-c` only, so `git --no-pager commit`, `git -P commit`, `git --git-dir=… commit` and
 * `git --exec-path=/x push` all walked past unchecked — the same under-inclusiveness this comment
 * warns about, in the one part of the pattern the earlier fixes did not revisit. The general
 * `-\S+\s+` arm means an unknown option can never cause a miss; the first arm exists only because
 * `-C <dir>` and friends put their value in a SEPARATE word, which would otherwise break the chain.
 *
 * The obvious general form, `(?:-\S+(?:\s+\S+)?\s+)*`, is deliberately NOT used: its nested
 * optional inside a `*` backtracks exponentially on non-matching input (measured: 0.02ms at 15
 * options, 0.25ms at 20, 1.65ms at 24). This pattern runs on EVERY Bash tool call, so that is a
 * ReDoS in a hot path — strictly worse than the bug it would fix. The form below stays flat.
 * Over-inclusiveness is cheap here (a needless check is 13ms warm) and under-inclusiveness is the
 * bug, so `&&`, `;`, `|` and newlines all count as command starts — and so do the pieces below,
 * each closing a real bypass found in review rather than a hypothetical one:
 *
 * - The boundary class also includes a bare space, `(`, and a backtick. A space is a command
 *   start because an env-prefixed invocation — `GIT_AUTHOR_DATE=x git commit -m y` — has nothing
 *   but whitespace before `git`. `(` and a backtick are command starts because a subshell
 *   (`(git commit -m x)`) and command substitution (`out=$(git commit -m "x" 2>&1)`, `` `git
 *   push` ``) both put `git` right after them — an ordinary way to capture commit output, not an
 *   exotic one.
 * - `/i` makes the match case-insensitive. macOS and Windows both mount case-insensitive, so
 *   `Git commit` and `GIT PUSH` really invoke `git` on this machine — the identical bug class
 *   `block-generated-edits.mjs`'s header records being bitten by ("the path pattern was
 *   case-sensitive ... so one shifted capital walked straight past it").
 * - The trailing `(?![\w-])` replaces what used to be `(?:\s|$)`. A closing backtick is neither
 *   whitespace nor end-of-string, so `` `git push` `` was still missed by the old trailing check
 *   even after fixing the leading boundary — the lookahead terminates the match on any
 *   non-word-or-hyphen character instead, while still correctly leaving `git commitpush`,
 *   `git pushall` and `git commit-tree x` allowed (their next character is a word character or a
 *   hyphen, so the lookahead fails and `commit`/`push` never matches as its own subcommand).
 */
const GIT_WRITE =
    /(?:^|[\s;&|(`])\s*git\s+(?:(?:-[Cc]|--(?:git-dir|work-tree|exec-path|namespace|config-env|attr-source))[=\s]\S+\s+|-\S+\s+)*(?:commit|push)(?![\w-])/i;

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

/**
 * How long one checker may take before it is treated as unrunnable rather than as slow. Generous
 * against measurement, not a guess: `typecheck` is 217 ms warm, 6.9 s after one leaf source file
 * changes, and 6.5 s cold on this repo. The cap exists for a checker that HANGS, not for a slow
 * one. Without it spawnSync waits forever, the harness eventually cancels the hook, the hook writes
 * nothing — and writing nothing is `allow`, which is the silence this file exists to prevent.
 */
const CHECK_TIMEOUT_MS = 120_000;

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

/**
 * Runs the real checks. Throws — never reports "clean" — when a checker is missing, or when one
 * ran and never reached a verdict. Each entry carries the marker that proves it got that far.
 */
function runChecks() {
    const turbo = path.join(PROJECT_DIR, 'node_modules', 'turbo', 'bin', 'turbo');
    const uiGate = path.join(PROJECT_DIR, 'scripts', 'check-ui-tokens.mjs');
    for (const [label, entry] of [['scripts/check-ui-tokens.mjs', uiGate], ['turbo entry point', turbo]]) {
        if (!existsSync(entry)) throw new Error(`${label} not found at ${entry}`);
    }

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
