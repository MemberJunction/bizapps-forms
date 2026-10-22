# #328: a pending upload is not "nothing to submit" — Implementation Plan

> **Superseded in two places by the shipped code — read the code, not this plan, for these:**
> 1. **Architecture and Task 3 (`clearNothingToSubmitIfAnswered`).** The method is now
>    `clearResolvedRefusal` in `mj-form.component.ts`, and it has two rules, not one predicate swap.
>    The #124 sentence clears once `nothingToSubmit(rt, this.uploads)` is false, as planned. An
>    upload failure's sentence clears only once no visible question has a failed upload
>    (`failureAmong`), so answering another question does not clear it.
> 2. **Task 3 Step 3 ("swap both reads").** A swap alone does not give the refused-upload test its
>    message. The gate's refusal (`refuseWithNothingToSubmit`) reads `failureAmong` and names a
>    refused upload, and both the gate and `uploadsLanded` raise that message through
>    `refuseWithUploadFailure`, which records it in `uploadFailureShown` so the clear rule above can
>    recognise it.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Submit whose only answer is a file still `uploading` (or `unsaved`) falls through to the upload wait instead of being refused with the nothing-to-submit sentence, and both renderers' "You can submit now" line agrees.

**Architecture:** One pure read on `FormUploadStore` (`hasPendingAmong`) and one pure predicate (`nothingToSubmit(runtime, uploads)`) in `core/`. Three call sites read the predicate: the `onSubmit` gate, `clearNothingToSubmitIfAnswered` (both in `mj-form.component.ts`), and `readyToSubmit` in both renderers. `FormRuntime.wouldSubmitNothing` is unchanged.

**Tech Stack:** Angular 21 signals, Vitest (node, no TestBed).

**Spec:** the issue brief (#328, "Design decided" and "Done when").

## Global Constraints

- Do not change `FormRuntime.wouldSubmitNothing` or `submitVerdict`.
- Keep the gate in `onSubmit` before the captcha gate and before the phase flip.
- Do not change `retryUnsaved`, `whenSettled`, `failureAmong`, `doodle-pad.component.ts`, the OneQuestion `onNext` wait, or any server package.
- `upload-in-flight-submit.spec.ts` stays byte-for-byte unchanged and green.
- Changeset: `@mj-biz-apps/forms-ng` at `patch`.
- Run tests with `cd packages/Angular && npx vitest run <file>`.

## Review Focus

1. A `refused` upload on the only question: must still be refused, with the refused message (Task 3 test).
2. A pending upload on a question a rule HID: must not count (predicate reads `visibleAnswerableQuestions()` only; Task 2 test).
3. A pending upload with other stored answers already present: predicate is false either way (Task 2 test: `wouldSubmitNothing` false short-circuits).
4. The renderer line must track the store reactively — `hasPendingAmong` reads `this.records()` so a `computed` re-evaluates (Task 4 tests read `readyToSubmit()` before/during/after on the same instance).
5. Upload start fires no renderer event; the stale banner clears on the respondent's next progress/commit event (Task 3 test drives `form.commit()` after `begin`).

---

### Task 1: `FormUploadStore.hasPendingAmong`

**Files:**
- Modify: `packages/Angular/src/lib/widget/core/upload-store.ts` (beside `failureAmong`)
- Test: `packages/Angular/src/lib/widget/core/upload-store.spec.ts` (new `describe('hasPendingAmong')`)

**Interfaces:**
- Produces: `public hasPendingAmong(questionIds: readonly string[]): boolean` — pure read of `this.records()`; true when any listed record has `status === 'uploading'` or `failure?.kind === 'unsaved'`.

- [ ] **Step 1: failing tests** — five cases: `uploading` (after `begin`) → true; `unsaved` (after `fail(token, {kind:'unsaved',...})`) → true; `refused` → false; `done` (after `succeed`) → false; no record → false. Also one test that a `computed(() => store.hasPendingAmong(['q']))` flips false→true→false across `begin`/`succeed`. Store needs `connect({ setValue: () => undefined })` first.
- [ ] **Step 2:** run, expect FAIL (`hasPendingAmong is not a function`).
- [ ] **Step 3:** implement; JSDoc says why `refused` is excluded (same bytes, same verdict: not an answer on its way).
- [ ] **Step 4:** run, expect PASS.
- [ ] **Step 5:** commit `feat(widget): FormUploadStore.hasPendingAmong (#328)`.

### Task 2: the shared predicate `nothingToSubmit`

**Files:**
- Create: `packages/Angular/src/lib/widget/core/nothing-to-submit.ts`
- Test: `packages/Angular/src/lib/widget/core/nothing-to-submit.spec.ts`

**Interfaces:**
- Consumes: `FormUploadStore.hasPendingAmong` (Task 1); `FormRuntime.wouldSubmitNothing()`, `FormRuntime.visibleAnswerableQuestions()`.
- Produces: `export function nothingToSubmit(runtime: FormRuntime, uploads: FormUploadStore): boolean` = `runtime.wouldSubmitNothing() && !uploads.hasPendingAmong(visible ids)`. Doc comment: a pending upload on a visible question is an answer on its way, so a submit must fall through to `uploadsLanded`, which waits for it or restarts it; the runtime stays free of upload state on purpose.

- [ ] **Step 1: failing tests** using a real `FormRuntime` (construct as `form-runtime.spec.ts` does) and a real store connected to it: blank form → true; `begin` on the only visible question → false; `unsaved` → false; `refused` → true; pending upload on a HIDDEN question (a rule hides it) → true; a stored text answer → false.
- [ ] **Step 2:** run, expect FAIL (module missing).
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run, expect PASS.
- [ ] **Step 5:** commit `feat(widget): one nothing-to-submit predicate that knows uploads (#328)`.

### Task 3: `mj-form` reads the predicate

**Files:**
- Modify: `packages/Angular/src/lib/widget/mj-form.component.ts` — the `rt.wouldSubmitNothing()` gate in `onSubmit` and `clearNothingToSubmitIfAnswered`.
- Test: `packages/Angular/src/lib/widget/nothing-to-submit-while-uploading.spec.ts` (repro, already committed; add a second `describe` below it, repro tests untouched).

**Interfaces:** Consumes `nothingToSubmit(rt, this.uploads)`.

- [ ] **Step 1: failing tests** (signature-only form from the repro file):
  - banner clears: `await form.submit()` → banner is `NOTHING_TO_SUBMIT_MESSAGE`; `form.uploadStore.begin('sig', drawing())`; `form.commit()` → banner `''`. Same with `form.progress()`.
  - refused: `begin`, then `fail(token, { kind: 'refused', message: 'That file type is not allowed.' })`; `await form.submit()` → banner is `'That file type is not allowed.'`, not the nothing-to-submit sentence; phase `ready`; no final save.
- [ ] **Step 2:** run the file, expect the banner-clear test and the two repro tests FAIL. (The refused test may pass or fail on `next`; record which.)
- [ ] **Step 3:** swap both reads to `nothingToSubmit(rt, this.uploads)`; update the gate comment: it now lets a pending upload through to the upload wait (`uploadsLanded`), which waits for or restarts it; the reasons for its position still hold. Update the `clearNothingToSubmitIfAnswered` doc: an upload the respondent started counts as answering.
- [ ] **Step 4:** run the file plus `nothing-to-submit.spec.ts` and `upload-in-flight-submit.spec.ts`, expect PASS.
- [ ] **Step 5:** commit `fix(widget): a pending upload passes the nothing-to-submit gate (#328)`.

### Task 4: both renderers' `readyToSubmit`

**Files:**
- Modify: `packages/Angular/src/lib/widget/components/form-one-question.component.ts`, `form-scroll.component.ts` — add `private readonly uploads = inject(FormUploadStore);` declared ABOVE `stepJudge`, pass `this.uploads` to `new StepJudge(...)`, and replace `!this.runtime().wouldSubmitNothing()` with `!nothingToSubmit(this.runtime(), this.uploads)` (update the adjacent comment).
- Modify: `components/next-waits-for-uploads.wiring.spec.ts` — the "keys the judge" regex accepts `new StepJudge(\s*this\.uploads,` and the "injects" test still requires `inject(FormUploadStore)` and no `new FormUploadStore(`.
- Test: create `components/ready-to-submit-uploads.spec.ts`.

**Interfaces:** Consumes `nothingToSubmit` (Task 2).

- [ ] **Step 1: failing test** — `describe.each([FormOneQuestionComponent, FormScrollComponent])`: mount the signature-only form with `mountForm` (harness), build the renderer with `runInInjectionContext(Injector.create({ providers: [ {provide: FormUploadStore, useValue: form.uploadStore}, {provide: ElementRef, useValue: new ElementRef({})}, {provide: ɵChangeDetectionScheduler, useValue: { notify: () => undefined, runningTick: false }}, {provide: ɵEffectScheduler, useValue: { add, schedule, flush, remove no-ops }} ] }), () => new C())`; set `runtime` input via `c.runtime[SIGNAL].applyValueToInputSignal(node, form.rt)` (the harness's documented technique). Assert `readyToSubmit()` false before any upload, true after `begin('sig', …)`, true after `succeed(token, 'file-sig')`. Header comment: why the two scheduler stubs (constructor effects need them; no effect needs to run for this computed), and that it replaces the source-reading pattern for this behaviour.
- [ ] **Step 2:** run, expect FAIL on the "while uploading" assertion.
- [ ] **Step 3:** implement the renderer changes and the wiring-spec regex.
- [ ] **Step 4:** run the new spec and `next-waits-for-uploads.wiring.spec.ts`, expect PASS.
- [ ] **Step 5:** commit `fix(widget): the ready line counts an upload on its way (#328)`.

### Task 5: changeset + full verification

- [ ] `.changeset/nothing-to-submit-waits-for-uploads.md`: `"@mj-biz-apps/forms-ng": patch`, two or three sentences on the symptom and the fix.
- [ ] `cd packages/Angular && npx vitest run` → all pass; `npm run typecheck` at the repo root → exit 0; Angular lint/build as the repo defines.
- [ ] commit `chore(changeset): forms-ng patch for #328`.
