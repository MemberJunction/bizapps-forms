@AGENTS.md

# Claude Code specifics

Everything above is shared with every other agent and lives in `AGENTS.md` — **edit it there**,
never here, or the two copies drift. This section holds only what is true of Claude Code alone.

- **Rules load themselves.** `.claude/rules/*.md` carry `paths:` frontmatter, so Claude Code loads
  each one when you touch a matching file. The "read before editing" table in `AGENTS.md` is the
  manual equivalent for agents that lack this; you can skip the manual step, not the rules.
- **Hooks enforce two of the rules** (`.claude/settings.json`): `block-generated-edits.mjs` refuses
  any Write/Edit under `**/generated/**`, and `require-green-before-git.mjs` refuses a `git commit`
  / `git push` unless `lint:ui` and `typecheck` pass. To make a genuine exception, remove the hook in
  the same commit as the edit so it is reviewable — never route around it through Bash.
- **Skills and commands are invocable directly:** `/mj-upgrade <version>`, `/commit`, `/create-pr`,
  `/update-pr`, `/notes`.
