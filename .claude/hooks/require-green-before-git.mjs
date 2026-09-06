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
