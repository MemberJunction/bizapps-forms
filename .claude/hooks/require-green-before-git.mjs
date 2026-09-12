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

/**
 * The working tree whose commit is being judged — which is NOT necessarily the checkout the
 * session started in.
 *
 * `CLAUDE_PROJECT_DIR` names the directory the session was launched from and keeps naming it after
 * the session enters a git worktree, so a hook that trusted it alone ran both checks against the
 * MAIN checkout while the commit it was gating happened in the worktree. That is wrong in both
 * directions and silently so: a worktree whose tree is broken commits anyway because the main
 * checkout is green, and a worktree whose tree is green is refused because someone's half-finished
 * edit sits in the main checkout — which is what happened, and which blocks every worktree session
 * on unrelated work it must not touch.
 *
 * `git rev-parse --show-toplevel` answers the only question that matters here: which tree is
 * `git commit` about to write from. It reports the worktree's own root inside a linked worktree and
 * the checkout root outside one, so the ordinary single-checkout case is unchanged.
 *
 * Spawned the same way as the checks below — `shell: false`, no PATH assumption beyond `git`
 * itself. Falls back rather than throwing: a hook that cannot locate git must still gate something,
 * and the old behaviour is the right floor.
 */
export function gitToplevelOf(cwd) {
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
        cwd,
        encoding: 'utf8',
        shell: false,
        timeout: 5000,
    });
    if (result.error || result.status !== 0) return null;
    const top = (result.stdout || '').trim();
    return top.length > 0 ? top : null;
}

const PROJECT_DIR = gitToplevelOf(process.cwd()) || process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * `commit` or `push` as a git SUBCOMMAND, not as a substring.
 *
 * The leading boundary makes `npm run commitpush` allow, because `commitpush` is one word.
 * (`commitpush` was a real script here until #177 deleted it; it stays as the example because the
 * boundary it exercises is what matters, not whether the script exists.) It no longer makes
 * `grep -rn "git commit" docs/` allow — see the QUOTE bullet below, which explains why that trade
 * was taken, and the spec case that pins it deliberately.
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
 * Over-inclusiveness is cheap here (a needless check costs one measured run — 217 ms warm, ~6.9 s
 * when a leaf source file changed, per the header above; the "13ms" this sentence used to quote was
 * the same stale figure the header already corrects) and under-inclusiveness is the
 * bug, so `&&`, `;`, `|` and newlines all count as command starts — and so do the pieces below,
 * each closing a real bypass found in review rather than a hypothetical one:
 *
 * - The boundary class also includes a bare space, `(`, and a backtick. A space is a command
 *   start because an env-prefixed invocation — `GIT_AUTHOR_DATE=x git commit -m y` — has nothing
 *   but whitespace before `git`. `(` and a backtick are command starts because a subshell
 *   (`(git commit -m x)`) and command substitution (`out=$(git commit -m "x" 2>&1)`, `` `git
 *   push` ``) both put `git` right after them — an ordinary way to capture commit output, not an
 *   exotic one.
 * - The class also includes both QUOTE characters. A nested shell — `bash -c "git commit -m x"`,
 *   `sh -lc 'git push'`, `ssh host "git push"` — always puts `git` immediately after a quote, so
 *   without them every quoted invocation returned `allow` with neither checker spawned (#178).
 *   This is the one boundary that costs a REAL false positive: `grep -rn "git commit" docs/` is
 *   structurally identical to `bash -c "git commit -m x"` — both put `git commit` right after a
 *   double quote — and it is now checked too. The difference between them is which program is being
 *   invoked, and no character class can see it. Parsing the command instead of matching it could
 *   tell them apart; a shell tokeniser handling nested quoting, escapes, `--` terminators and
 *   per-shell `-c` placement is far more machinery than the rest of this hook, and every corner of
 *   it is a new way for the gate to be silently wrong, so it was weighed and rejected rather than
 *   missed. The deny message names this over-match, so a grep denied on a red tree can explain
 *   itself.
 * - An optional PATH PREFIX, `(?:[\w.\/-]*\/)?`, sits before `git`. `/` is deliberately NOT in the
 *   boundary class — it is the middle of a path, not the start of a command — so `/usr/bin/git
 *   commit` and `/opt/homebrew/bin/git push` matched nothing at all before (#178). The class must
 *   END in a slash, so a word that merely ends in `git` (`/var/log/legit commit`, `digit push.txt`)
 *   still does not match. One flat greedy class also keeps this arm linear, where the tempting
 *   `(?:[\w.-]*\/)+` is the nested-quantifier shape the paragraph above warns about.
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
    /(?:^|[\s;&|(`'"])\s*(?:[\w.\/-]*\/)?git\s+(?:(?:-[Cc]|--(?:git-dir|work-tree|exec-path|namespace|config-env|attr-source))[=\s]\S+\s+|-\S+\s+)*(?:commit|push)(?![\w-])/i;

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
            '\n\nRe-run with `npm run lint:ui` and `npm run typecheck`.' +
            '\n\nIf this command was not actually a git write — a grep for the phrase, or prose ' +
            'quoting it — the gate cannot tell the difference: a quote character counts as a ' +
            'command start on purpose (#178), because missing a real nested-shell invocation is ' +
            'the worse error. Nothing was written; run the command again once the tree is green.',
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
 * ANSI SGR escapes, stripped before any pattern is matched against a checker's output.
 *
 * Every pattern below anchors at a LINE START and every one was measured against output captured
 * WITHOUT colour. `runChecks` passed no `env`, so a checker inherited the session's — and
 * `FORCE_COLOR`, which plenty of people export, makes turbo colour its summary even through a pipe:
 *
 *     plain          " Tasks:    9 successful, 9 total"
 *     FORCE_COLOR=1  "\x1b[1m Tasks:    \x1b[32m\x1b[1m9 successful\x1b[0m, 9 total\x1b[0m"
 *
 * The line now begins with the escape byte, which is not in `\s`, so NEITHER pattern matches
 * anywhere. A green tree asked on every commit, and — the direction that matters — a genuinely red
 * one was downgraded from `deny` to `ask` under a message blaming the install rather than the code.
 * That is #179 reintroduced through a different door.
 *
 * `scripts/check-guard-mutants.mjs` met this exact bug first and its comment records the fix this
 * repo settled on: strip the escapes AND ask the child not to emit them. Both, and here is why the
 * pair is not accidental duplication — measured on turbo 2.10.9:
 *
 *   - `NO_COLOR=1` alone does NOT suppress turbo's colour when `FORCE_COLOR` is set. Only
 *     `FORCE_COLOR=0` does. So the env half depends on each checker honouring a convention that
 *     the checker we actually run partly ignores; the strip does not depend on cooperation at all.
 *   - The strip only understands SGR. A checker that emitted cursor control would walk past it,
 *     and the env half is what stops those being produced in the first place.
 *
 * Stripping once, where output becomes evidence, also means the text quoted back in a `deny` is
 * plain — that message is read as JSON-embedded text, where escapes are noise.
 */
const ANSI_SGR = /\x1b\[[0-9;]*m/g;

/** Colour off at the source. See ANSI_SGR above for why this is paired with the strip. */
export const CHECKER_ENV = { NO_COLOR: '1', FORCE_COLOR: '0' };

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
 * ── AND A PASS MUST HAVE COVERED SOMETHING (#196) ───────────────────────────────────────────────
 * The same question, asked of the other arm. A non-zero exit is a claim of FAILURE, so before
 * believing it, require proof the checker judged the tree. A zero exit is a claim of SUCCESS, so
 * before believing that, require proof the success covered any work — `coveredWorkPattern`.
 *
 * It is not the same evidence, which is why it is not the same pattern. `--filter=@mj-biz-apps/
 * forms-*` is a hardcoded npm-scope glob, and a scope rename or a package moved out of `packages/*`
 * makes it match nothing; turbo does not call that an error, it exits 0 and prints
 * ` Tasks:    0 successful, 0 total` — which still contains the `Tasks:` marker, so the check above
 * cannot catch it. The distinguishing evidence is the COUNT. `lint:ui` fails the same way for a
 * moved `packages/Angular/src`, because its `walk()` swallows a missing directory and reports
 * `Scanned 0 file(s)`; its count lives in a different line entirely.
 *
 * This arm is the one every green commit takes, so a wrong pattern here prompts on every commit.
 * That is the cost worth paying rather than the reverse: a pattern that stopped matching would
 * silently reopen the hole, and this file's whole argument is that silence is the failure that
 * cannot be noticed. A wrong `ask` announces itself and gets fixed; a wrong `allow` does not.
 *
 * Matching printed output is a heuristic, and both of these fail toward `ask` — a human looks —
 * rather than toward silence. Prefer that to string-matching error text, which is what changes
 * between releases.
 */
export function classifyCheckResult({ name, verdictPattern, coveredWorkPattern }, result) {
    if (!(verdictPattern instanceof RegExp)) {
        throw new Error(`${name} has no verdictPattern, so nothing can say whether it ran.`);
    }
    if (!(coveredWorkPattern instanceof RegExp)) {
        throw new Error(`${name} has no coveredWorkPattern, so nothing can say what it covered.`);
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
    // Colour is stripped HERE, where output becomes evidence, so every pattern below and the text
    // quoted back to the human all read the same plain shape. See ANSI_SGR.
    const combined = `${result.stdout || ''}${result.stderr || ''}`.replace(ANSI_SGR, '');
    // Lazy: only the two throws below need it, and `combined` runs to maxBuffer (32MB) in the worst
    // case, so the everyday green commit should not pay to split it.
    const tail = () => combined.trim().split('\n').slice(-5).join(' ').slice(0, 300);

    if (result.status === 0) {
        if (!coveredWorkPattern.test(combined)) {
            throw new Error(
                `${name} passed without covering anything, so nothing was actually checked — most ` +
                `likely its filter or scan root no longer matches this repo. It reported: ${tail()}`,
            );
        }
        return null;
    }

    if (!verdictPattern.test(combined)) {
        throw new Error(
            `${name} exited ${result.status} without ever reaching a verdict, so this is a broken ` +
            `checker rather than a failing tree — most likely an incomplete install. It reported: ${tail()}`,
        );
    }
    return { name, output: combined.split('\n').slice(-40).join('\n') };
}

/**
 * The checks this hook runs, and the evidence each one prints. EXPORTED, and that is the point:
 * these descriptors used to be a local `const` inside `runChecks`, reachable by nothing, so the
 * spec kept private copies and asserted those. Every shipped pattern could therefore be broken
 * without a single test failing — measured on this file: four such mutations survived the whole
 * suite, including `/^\s*Tasks:\s/m` -> `/^Tasks:/m`, which the comment below says would send
 * every commit to `ask`. A pattern nothing tests is a pattern nobody can trust.
 *
 * `entryPoint` is relative because the absolute path depends on `PROJECT_DIR`, which is resolved
 * per invocation; `label` is what a missing checker is called in the throw.
 */
export const CHECKS = [
    {
        name: 'lint:ui',
        label: 'scripts/check-ui-tokens.mjs',
        entryPoint: ['scripts', 'check-ui-tokens.mjs'],
        args: [],
        verdictPattern: /^(?:PASS|FAIL)\b/m,
        // `Scanned 197 file(s) under: packages/Angular/src`. Zero means the scan root moved and
        // the colour gate is checking nothing — which it reports as a PASS.
        coveredWorkPattern: /^Scanned [1-9]\d* file\(s\)/m,
    },
    {
        name: 'typecheck',
        label: 'turbo entry point',
        entryPoint: ['node_modules', 'turbo', 'bin', 'turbo'],
        args: ['typecheck', '--filter=@mj-biz-apps/forms-*'],
        // Leading whitespace is load-bearing: turbo prints ` Tasks:    9 successful, 9 total`,
        // so `/^Tasks:/m` matches nothing and would send every commit to `ask`.
        verdictPattern: /^\s*Tasks:\s/m,
        // Same line, but the COUNT: an empty run prints ` Tasks:    0 successful, 0 total` and
        // exits 0, so the marker above is present and proves nothing.
        coveredWorkPattern: /^\s*Tasks:\s+\d+ successful,\s+[1-9]\d* total/m,
    },
];

/**
 * Runs the real checks. Throws — never reports "clean" — when a checker is missing, when one ran
 * and never reached a verdict, and when one passed without covering any work. Each entry carries
 * the two patterns that prove it got that far and that its verdict was about something.
 */
function runChecks() {
    const resolved = CHECKS.map((check) => ({ ...check, entry: path.join(PROJECT_DIR, ...check.entryPoint) }));
    for (const { label, entry } of resolved) {
        if (!existsSync(entry)) throw new Error(`${label} not found at ${entry}`);
    }

    return collectFailures(resolved, (check) => spawnSync(process.execPath, [check.entry, ...check.args], {
        cwd: PROJECT_DIR,
        encoding: 'utf8',
        shell: false,
        maxBuffer: 32 * 1024 * 1024,
        timeout: CHECK_TIMEOUT_MS,
        env: { ...process.env, ...CHECKER_ENV },
    }));
}

/**
 * What a whole RUN of checks meant, given a way to run one. Exported, and separated from
 * `runChecks` deliberately.
 *
 * ── WHY A THROW MUST NOT DISCARD WHAT IS ALREADY PROVEN ─────────────────────────────────────────
 * This loop used to live inline in `runChecks`, pushing into a local array with no `catch`. Any
 * throw from `classifyCheckResult` propagated straight out, so the array — and every violation
 * already proven — died with the stack frame, and `decisionFor` built its `ask` from the thrown
 * message alone. With a hardcoded colour in the tree AND a turbo that cannot resolve its platform
 * binary, the answer was `ask`, naming only the broken checker and never mentioning the colour.
 * A definitively red tree stopped being refused.
 *
 * The two throws added for #179 and #196 are what made that reachable: before them a throw meant a
 * rare spawn-level failure, and one of them now fires on precisely the #179 incident — the moment a
 * developer is most likely to ALSO be holding a red tree.
 *
 * So the two questions are kept apart. "Did anything fail?" is answered from evidence that survives;
 * "could everything be checked?" is answered separately. A proven failure outranks an unrunnable
 * checker, because the tree is known-red either way and `deny` says so with the proof attached,
 * while `ask` throws the proof away. The unrunnable checker is still reported — under its own name,
 * marked NOT RUN, so a partial verdict is never dressed up as a complete one.
 *
 * With nothing proven, the original error is RETHROWN rather than summarised, so the `ask` a broken
 * install produces is byte-identical to what it was before this function existed.
 *
 * It is exported because nothing could test this: `runChecks` is not exported, so the suite could
 * only stub it wholly green, wholly red or wholly unrunnable, and the mixed run had no seam to
 * reach. That is the same shape as the untested check descriptors above — a thing that ships,
 * asserted by nothing.
 */
export function collectFailures(checks, runOne) {
    const failures = [];
    const unrunnable = [];
    for (const check of checks) {
        try {
            const failure = classifyCheckResult(check, runOne(check));
            if (failure) failures.push(failure);
        } catch (error) {
            unrunnable.push({ name: check.name, error });
        }
    }
    if (failures.length > 0) {
        return [
            ...failures,
            ...unrunnable.map(({ name, error }) => ({ name, output: `NOT RUN — ${error.message}` })),
        ];
    }
    if (unrunnable.length > 0) throw unrunnable[0].error;
    return [];
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
