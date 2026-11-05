# Issue #313: record the on-submit mechanism decision (`FormAutomation` only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write down, in the repo, that Forms runs every owner-configured submission behaviour through `FormAutomation` and authors no MJ `EntityAction` bindings, with the reason.

**Architecture:** Documentation only. Four Markdown files change; no package, migration, metadata or changeset.

**Tech Stack:** Markdown.

**Spec:** the agent brief on issue #313 (approved design).

## Global Constraints

- No file under `packages/`, `migrations/`, `metadata/` or `.changeset/` changes.
- No `metadata/entity-actions/` or `metadata/action-filters/` directory is added.
- The archived plan's body is byte-for-byte `git show origin/claude/sales-deal-management-app-ueporb:plans/mj-entity-action-workflow-adoption.md` (commit `2cd138f`); only a blockquote header is added above it.
- Decision date `2026-10-21`, issue `#313`, decision id `DG-7`.

## Review Focus

- A reader landing on `docs/on-submit-automations.md` from a search for `EntityAction` must find the rule without reading the build plan: the section states it on its own.
- The archived file's header must not be mistaken for part of the original body: it is a blockquote followed by one blank line, then the original first line.
- Every code reference in the new prose must exist on `next` (`resolveOnSubmitDispatch` in `packages/Entities/src/contracts/on-submit-dispatch.ts`, `dispatch-automation.ts`, `entity-refusal.ts`, `FormSubmissionEngine.ts`, the `CK_FormVersion_Status` CHECK).
- The existing "Durable entity actions run in-process for the runner" section talks about *other apps'* entity actions that fire on rows Forms writes; the new section must not contradict it.
- `plans/done/README.md` names the archived file exactly once (the done-when greps for a count of 1).

The test for every task is the run-local script `check-done-when.mjs` (in the run's agent dir), which encodes each done-when row; it was observed red on `next` before any edit.

---

### Task 1: Record DG-7 in the build plan and the operator doc

**Files:**
- Modify: `plans/FORMS_BUILD_PLAN.md` (§3.3 table row "On-submit automation"; end of §10 list after `DG-6`; top of §12 Progress Log)
- Modify: `docs/on-submit-automations.md` (new `## Why not MJ \`EntityAction\` bindings` section, placed last, after `## Configuring a form in the builder`)

- [ ] **Step 1:** Confirm red: `node <agent>/check-done-when.mjs` shows the DG-7 and section rows FAIL.
- [ ] **Step 2:** §10: add `- **DG-7 — On-submit mechanism: \`FormAutomation\` only, no \`EntityAction\` bindings. ✅ DECIDED (2026-10-21, #313).**` with the rule, the one-paragraph why, the transition-filter question marked moot, and the bizapps-common `metadata/action-filters/` note.
- [ ] **Step 3:** §3.3: the "On-submit automation" row's MJ capability cell says Forms reaches Actions / Agents / AI Prompts through its own `FormAutomation` trigger layer (see DG-7).
- [ ] **Step 4:** §12: a `2026-10-21` entry at the top, 2–4 sentences, naming DG-7 and the three other files.
- [ ] **Step 5:** Operator doc: the new section, with the rule, the four hidden things and where each lives, the `EntityAction` behaviour on MJ 6.1.6 (`RunMode` default `Inline`, `OnAfterSaveExecute` no await, only `Validate` refuses), and the grain rule as the last paragraph.
- [ ] **Step 6:** Re-run the check script: the DG-7 and section rows PASS. Commit.

### Task 2: Archive the PR #22 analysis

**Files:**
- Create: `plans/done/mj-entity-action-workflow-adoption.md`
- Modify: `plans/done/README.md` (one table row)

- [ ] **Step 1:** Write the blockquote header (superseded, `DG-7` in `plans/FORMS_BUILD_PLAN.md`, 2026-10-21, kept for the verified MJ facts: RunMode default, `After*` no-await, fail-closed scope resolution, no seeded filters) plus one blank line to the file, then append `git show origin/claude/sales-deal-management-app-ueporb:plans/mj-entity-action-workflow-adoption.md` unchanged.
- [ ] **Step 2:** README row: `mj-entity-action-workflow-adoption.md` | decision only, #313 (not adopted) | `docs/on-submit-automations.md` "Why not MJ `EntityAction` bindings" and `DG-7` in the build plan.
- [ ] **Step 3:** Re-run the check script: all rows PASS; the brief's literal `diff <(tail -n +N …) <(git show …)` is empty. Commit.

### Task 3: Verify

- [ ] `pnpm run build:packages`, `pnpm test`, the lint gates, `pnpm run check:release-seed`, `pnpm run check:seed-cadence`, each fresh, output read.
