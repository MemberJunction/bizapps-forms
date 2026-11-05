# Submission Module Header Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the module header comments in `packages/CoreEntitiesServer/src/submission/persistence.ts` and `packages/CoreEntitiesServer/src/submission/response-lookup.ts` so they accurately state that reads and writes run as MJ's system user supplied by `FormSubmissionEngine` after `Authorize`, rather than the anonymous `contextUser`.

**Architecture:** Comment-only edit to the two module headers in `packages/CoreEntitiesServer/src/submission/`. No executable code, tests, or schema files move, and `published-link.ts` stays untouched because its header already distinguishes the respondent-scoped distribution read from the `systemReader` reads that follow.

**Tech Stack:** TypeScript (`@mj-biz-apps/forms-core-entities-server`), Vitest.

**Spec:** GitHub issue #327 brief (`packages/CoreEntitiesServer/src/submission/persistence.ts`, `packages/CoreEntitiesServer/src/submission/response-lookup.ts`).

## Global Constraints

- `grep -n "anonymous \`contextUser\`" packages/CoreEntitiesServer/src/submission/persistence.ts` prints nothing.
- `grep -n "anonymous \`contextUser\`" packages/CoreEntitiesServer/src/submission/response-lookup.ts` prints nothing.
- `sed -n 20,32p packages/CoreEntitiesServer/src/submission/persistence.ts` names the system user as the identity and `FormSubmissionEngine` as the caller that supplies it.
- `sed -n 16,22p packages/CoreEntitiesServer/src/submission/response-lookup.ts` names the system user as the reader.
- `git diff --stat next -- packages/CoreEntitiesServer/src/submission/published-link.ts` is empty.
- `git diff next --stat -- packages` lists only `persistence.ts` and `response-lookup.ts`, and `git diff next -- packages | grep '^[-+]' | grep -v '^[-+][-+]' | grep -v '^[-+]\s*\*'` prints nothing (every changed line is a comment line).
- `cd packages/CoreEntitiesServer && pnpm run build && pnpm test` passes.
- Out of scope: Do not change any executable line in `persistence.ts`, `response-lookup.ts` or `FormSubmissionEngine.ts`; do not edit `published-link.ts` or `FormSubmissionEngine.ts`; do not add a test that asserts on comment text; do not touch `save-gates.ts` or `scoped-response.ts`.

## Review Focus

None — this is a comment-only change to two module headers with no executable code changes, and adding a test that greps prose is explicitly out of scope in the brief.

---

### Task 1: Update module header comments in `persistence.ts` and `response-lookup.ts`

**Files:**
- Modify: `packages/CoreEntitiesServer/src/submission/persistence.ts:26-27`
- Modify: `packages/CoreEntitiesServer/src/submission/response-lookup.ts:18-19`

**Interfaces:**
- Consumes: none (comment-only update)
- Produces: accurate module header comments in `persistence.ts` and `response-lookup.ts`

- [x] **Step 1: Confirm the repro on `next` before editing**

Run:
- `sed -n 26,27p packages/CoreEntitiesServer/src/submission/persistence.ts`
- `sed -n 18,19p packages/CoreEntitiesServer/src/submission/response-lookup.ts`
Expected: Both headers still say `anonymous \`contextUser\``.

- [x] **Step 2: Rewrite the `contextUser` sentence in `persistence.ts` and `response-lookup.ts`**

1. In `packages/CoreEntitiesServer/src/submission/persistence.ts`, replace lines 26-27:
   ```ts
    * All entity objects are created via `provider.GetEntityObject<T>(name, contextUser)`
    * (never `new`), passing the anonymous `contextUser`. Every `Save()`/`Delete()` boolean is
   ```
   with:
   ```ts
    * All entity objects are created via `provider.GetEntityObject<T>(name, contextUser)` (never `new`),
    * and the `contextUser` the caller passes is MJ's system user, supplied by `FormSubmissionEngine`
    * after the operation's `Authorize` has admitted the anonymous respondent. Every `Save()`/`Delete()` boolean is
   ```
   Keep lines 28-30 (`checked; on failure ...`) unchanged.

2. In `packages/CoreEntitiesServer/src/submission/response-lookup.ts`, replace lines 18-19:
   ```ts
    * All reads go through the per-request provider with the anonymous `contextUser`; RunView
    * results are checked for `.Success` (RunView never throws). Callers decide fail-open vs
   ```
   with:
   ```ts
    * All reads go through the per-request provider as MJ's system user, the elevated reader the
    * engine supplies, because the respondent's read grant is row-filtered to its own response;
    * RunView results are checked for `.Success` (RunView never throws). Callers decide fail-open vs
   ```
   Keep the `fail-closed from the returned \`ok\` flag.` line unchanged.

- [x] **Step 3: Verify all Done-when conditions, build, and tests**

Run:
- `grep -n -F -f <anon-pattern-file> packages/CoreEntitiesServer/src/submission/persistence.ts` (must print nothing)
- `grep -n -F -f <anon-pattern-file> packages/CoreEntitiesServer/src/submission/response-lookup.ts` (must print nothing)
- `sed -n 20,32p packages/CoreEntitiesServer/src/submission/persistence.ts`
- `sed -n 16,22p packages/CoreEntitiesServer/src/submission/response-lookup.ts`
- `git diff --stat next -- packages/CoreEntitiesServer/src/submission/published-link.ts`
- `git diff next --stat -- packages`
- `cd packages/CoreEntitiesServer && pnpm run build && pnpm test`
Expected: All done-when checks pass, every changed line under `packages` is a `*` comment line, build and unit tests pass.

- [x] **Step 4: Commit**

Commit `packages/CoreEntitiesServer/src/submission/persistence.ts` and `packages/CoreEntitiesServer/src/submission/response-lookup.ts` with `git commit -F <msg-file>`.
