#!/usr/bin/env node
/**
 * Refuse any hand edit of CodeGen output. Wired as a `PreToolUse` hook in `.claude/settings.json`.
 *
 * ── WHY A HOOK, WHEN CLAUDE.md ALREADY SAYS IT ──────────────────────────────────────────────────
 * "Never hand-edit generated files" has been in CLAUDE.md since the scaffold, and it was still
 * broken — on #156, by an agent that had read it, in a pull request that then argued the exception
 * was justified. A rule is advice at the moment of writing. This is a refusal at the moment of
 * writing, and that is the whole difference.
 *
 * The edit that prompted it looked harmless: four properties added to `entity_subclasses.ts` by
 * hand, and a later real `mj codegen` run produced those same lines byte-identical. What the near
 * miss hides is the part a hand edit structurally cannot reproduce — the same run also moved every
 * class into `generated/entities/<schema>.ts`, rewrote twelve Angular templates, and broke a drift
 * guard that read the old path. Hand-editing gets the LINES right and the LAYOUT wrong, and the
 * layout is what everything downstream reads.
 *
 * ── WHAT TO DO INSTEAD ──────────────────────────────────────────────────────────────────────────
 * Always the same, and it is not hard: apply your migration to a database, run `mj codegen`, commit
 * what it writes. `docs/database-operations.md` carries the clean-room recipe, which takes minutes
 * and does not touch the shared dev database.
 *
 * ── HOW TO GET PAST IT, on the day there is a real reason ───────────────────────────────────────
 * Remove the hook from `.claude/settings.json` in the SAME commit as the edit, so the exception is
 * reviewable rather than silent. Do not route around it by writing the file from Bash — that is the
 * same defect with the evidence removed.
 *
 * ── NODE, STDLIB ONLY, AND NO SHEBANG DEPENDENCE ────────────────────────────────────────────────
 * This started as a shell script and failed OPEN in testing: the hook environment resolved neither
 * `bash` (via `env`) nor `grep`, so every edit sailed through while the hook reported success —
 * precisely the silent failure the hook exists to prevent. So: no external binaries, no `jq`, and
 * `.claude/settings.json` invokes `node <path>` explicitly rather than relying on the shebang. This
 * matches every other gate in this repo, each of which says the same thing in its own header — a
 * gate on the build must not need the build.
 *
 * A malformed payload, a missing `file_path`, or any unexpected error is ALLOWED through
 * deliberately: a hook must never break tool calls it cannot judge. The cost of that choice is that
 * the guard is a tripwire, not a proof — `.claude/rules/generated-code.md` says what would be.
 */
import { readFileSync } from 'node:fs';

/**
 * Every generated tree this repo has, present and future: `packages/<Pkg>/src/**\/generated/**`.
 *
 * The `(?:.*\/)?` is load-bearing rather than defensive. Angular's output lives at
 * `src/lib/generated/`, not `src/generated/`, so a pattern anchored to the latter would have let
 * exactly half of the #156 edit through — the half that touches the two form templates.
 *
 * Backslashes are normalised to forward slashes first so the same pattern holds on Windows.
 */
const GENERATED_PATH = /packages\/[^/]+\/src\/(?:.*\/)?generated\//;

const DENIAL =
  'This file is CodeGen output and must never be hand-edited. Apply your migration to a database, ' +
  'run `mj codegen`, and commit what it writes — see .claude/rules/generated-code.md and ' +
  'docs/database-operations.md. Writing it from Bash instead is the same defect with the evidence removed.';

function filePathFromStdin() {
    // fd 0 rather than a stream: the payload is small, this runs once per tool call, and a
    // synchronous read cannot leave the hook hanging on a stdin that never closes.
    const raw = readFileSync(0, 'utf8');
    const path = JSON.parse(raw)?.tool_input?.file_path;
    return typeof path === 'string' ? path.replace(/\\/g, '/') : '';
}

try {
    if (GENERATED_PATH.test(filePathFromStdin())) {
        process.stdout.write(
            JSON.stringify({
                hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'deny',
                    permissionDecisionReason: DENIAL,
                },
            }),
        );
    }
} catch {
    // Allow through — see the header. Nothing is printed, because a hook that cannot read its own
    // input has nothing useful to say about the edit.
}
