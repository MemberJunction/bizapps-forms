# Static Import in question-types.spec.ts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the dynamic `await import('../generated/entity_subclasses')` in `packages/Entities/src/contracts/question-types.spec.ts` to a top-level static `import` so module transformation happens during Vitest collection instead of inside the 5000 ms per-test timeout.

**Architecture:** Replace the in-test dynamic import of `mjBizAppsFormsFormQuestionSchema` in `packages/Entities/src/contracts/question-types.spec.ts` with a static `import { mjBizAppsFormsFormQuestionSchema } from '../generated/entity_subclasses';` at the top of the file, and make the `'matches the generated QuestionType value list'` test callback synchronous while keeping its three assertion lines unchanged.

**Tech Stack:** TypeScript, Vitest, Turborepo (`@mj-biz-apps/forms-entities`).

**Spec:** GitHub issue #316 brief (`packages/Entities/src/contracts/question-types.spec.ts`).

## Global Constraints

- `packages/Entities/src/contracts/question-types.spec.ts` contains no `await import(`.
- The spec imports `mjBizAppsFormsFormQuestionSchema` from `'../generated/entity_subclasses'` with a static `import` statement at the top of the file.
- The callback of `"matches the generated QuestionType value list"` is not `async`.
- `git diff origin/next -- packages/Entities/src/contracts/question-types.spec.ts` shows changes only to import lines, to the removed `await import` line, and to the `async` keyword. The three assertion lines in the test are unchanged.
- `cd packages/Entities && npx vitest run src/contracts/question-types.spec.ts --reporter=verbose` passes, and the line for `"matches the generated QuestionType value list"` shows a duration under 50 ms.
- After `pnpm run build`, `npx turbo test --force --only -- --reporter=verbose` passes for all packages, and the line for `"matches the generated QuestionType value list"` shows a duration under 50 ms.
- `cd packages/Entities && pnpm run build` succeeds.
- Out of scope: Do not edit any file under `packages/Entities/src/generated/`, do not change `packages/Entities/vitest.config.ts` or add a `testTimeout` anywhere, do not change the assertions of any test in `question-types.spec.ts`, do not change `await import(...)` in other spec files, and do not add a changeset.

## Review Focus

None — the spec restricts the diff to moving one import statement out of the test callback in `packages/Entities/src/contracts/question-types.spec.ts` and removing `async` from that test callback, with all assertions unchanged.

---

### Task 1: Replace dynamic import with top-level static import in `question-types.spec.ts`

**Files:**
- Modify: `packages/Entities/src/contracts/question-types.spec.ts:1-20,219-225`
- Test: `packages/Entities/src/contracts/question-types.spec.ts`

**Interfaces:**
- Consumes: `mjBizAppsFormsFormQuestionSchema` from `'../generated/entity_subclasses'`
- Produces: synchronous test `'matches the generated QuestionType value list'` in `packages/Entities/src/contracts/question-types.spec.ts`

- [x] **Step 1: Verify the red condition (duration >= 50 ms before the fix)**

Run:
`cd packages/Entities && npx vitest run src/contracts/question-types.spec.ts --reporter=verbose`
and
`npx turbo test --force --only -- --reporter=verbose`
Expected: `"matches the generated QuestionType value list"` takes ~480–550 ms alone and >2000 ms under full turbo load (exceeding the 50 ms ceiling).

- [x] **Step 2: Move `mjBizAppsFormsFormQuestionSchema` to a top-level static import and make the test callback synchronous**

In `packages/Entities/src/contracts/question-types.spec.ts`:
1. Add at the top of the file:
   ```ts
   import { mjBizAppsFormsFormQuestionSchema } from '../generated/entity_subclasses';
   ```
2. In `describe('the taxonomy and the generated entity', ...)`:
   Change:
   ```ts
   it('matches the generated QuestionType value list', async () => {
     const { mjBizAppsFormsFormQuestionSchema } = await import('../generated/entity_subclasses');
     const field = mjBizAppsFormsFormQuestionSchema.shape.QuestionType;
     const generated = field.options.map((o) => o.value as string);
     expect([...generated].sort()).toEqual([...FORM_QUESTION_TYPES].sort());
   });
   ```
   to:
   ```ts
   it('matches the generated QuestionType value list', () => {
     const field = mjBizAppsFormsFormQuestionSchema.shape.QuestionType;
     const generated = field.options.map((o) => o.value as string);
     expect([...generated].sort()).toEqual([...FORM_QUESTION_TYPES].sort());
   });
   ```

- [x] **Step 3: Verify diff and run tests to confirm duration < 50 ms**

Run:
- `git diff origin/next -- packages/Entities/src/contracts/question-types.spec.ts`
- `cd packages/Entities && npx vitest run src/contracts/question-types.spec.ts --reporter=verbose`
- `cd packages/Entities && pnpm run build`
- `pnpm run build && npx turbo test --force --only -- --reporter=verbose`

Expected:
- Diff touches only the added static import line, the removed `await import` line, and the removed `async` keyword.
- All 22 tests in `question-types.spec.ts` pass and `"matches the generated QuestionType value list"` takes < 50 ms (typically 0–2 ms) both alone and under `npx turbo test --force --only -- --reporter=verbose`.

- [x] **Step 4: Commit**

Commit `packages/Entities/src/contracts/question-types.spec.ts` with `git commit -F <msg-file>`.
