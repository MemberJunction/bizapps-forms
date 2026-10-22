# #333 Doodle export reservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Doodle drawing that is still being exported to PNG holds Next and Submit until its upload is known, so Scroll never destroys the section with the drawing in flight.

**Architecture:** `FormUploadStore` gains `reserve`/`release`: a reservation is an `uploading` record with no file and no transport call, so `whenSettled` (Next, `uploadsLanded`) and `hasPendingAmong` (submit gate) see the export with no change. The pad reports the export through a callback input (`exportSink`) instead of `output()`, because a function survives the component's destruction and an output does not. Every export ends in exactly one of `delivered` or `released` (try/finally).

**Tech Stack:** Angular 21 signals, Vitest (node environment, no DOM/canvas).

**Spec:** the brief in issue #333 (Design decided, Done when).

## Global Constraints

- Do not change `StepJudge`, `judgeWhenSettled`, `firstProblemIn` (`core/settled-validation.ts`).
- Do not change `onNext`/`onBack`/`onSubmit` in `form-scroll.component.ts` or `form-one-question.component.ts`, nor `uploadsLanded`/the nothing-to-submit gate in `mj-form.component.ts`.
- No settle timer or coalescing in `DoodlePadComponent.onPointerUp`; `UPLOAD_RETRY_DELAYS_MS` and `refused`/`unsaved` handling unchanged.
- `onFileSelected` and the FileUpload clear path unchanged. No jsdom/canvas env in `vitest.config.ts`.
- No new `UploadStatus`. Reserve record: `status: 'uploading'`, `file: null`, `progress: null`, `fileName: 'doodle.png'`, `send: null`, fresh `seq`; reserve commits `null` as the answer.
- `pad-captures.spec.ts` and `settled-validation.spec.ts` stay byte-identical to `origin/next`.
- Changeset: `@mj-biz-apps/forms-ng`, `patch`.

## Review Focus

1. Two strokes in quick succession: export 1 ends (superseded) after export 2 has reserved. Releasing export 1 must not release export 2's reservation. The pad hands back the token `started` returned, so the store's `seq` check makes it a no-op (Spec 1 case 3; wiring spec "releases in a finally block").
2. A throw from `getContext`/`toBlob`/the canvas: the reservation must still be released, or Next hangs for ever (finally block; wiring spec).
3. Clear while an export is in flight: `clear` drops the record, so the late `release` is stale and a no-op; `whenSettled` resolves on clear (Task 1 store case).
4. Widget teardown/reload with a reservation pending: `dispose`/`connect` drop records and release waiters (Task 1 store case).
5. Undo re-exports: it goes through the same `emitPng`, so it reserves too (started lives inside `emitPng`, before its first await).

---

### Task 1: `reserve` / `release` in `FormUploadStore`

**Files:**
- Modify: `packages/Angular/src/lib/widget/core/upload-store.ts` (next to `begin`; refactor `start` to take the record fields)
- Test: `packages/Angular/src/lib/widget/core/upload-store.spec.ts` (new `describe('FormUploadStore — reserve and release')` at the end), `core/export-reservation.spec.ts` (already committed)

**Interfaces:**
- Produces: `reserve(questionId: string): UploadToken`; `release(token: UploadToken): void`.

- [ ] **Step 1: Add the store cases** (use `connectedStore()`, `fileNamed`):
  - `counts a reservation as pending`: `store.reserve('q-resume')` → `hasPendingAmong(['q-resume'])` true.
  - `release of a stale token is a no-op`: `const a = reserve; reserve again; release(a)` → `viewFor(...).status === 'uploading'`.
  - `release of the current token writes idle and resolves whenSettled`: reserve, `const settled = vi.fn(); void store.whenSettled(['q-resume']).then(settled)`, release, `await Promise.resolve()` → `settled` called, status `idle`.
  - `clear after reserve resolves whenSettled` (same shape, `store.clear('q-resume')`).
  - `dispose after reserve resolves whenSettled` (same shape, `store.dispose()`).
  - `reserve commits null over a stored answer`: succeed an upload with `file-1`, reserve → `runtime.valueFor('q-resume')` null.
- [ ] **Step 2:** `npx vitest run src/lib/widget/core/upload-store.spec.ts src/lib/widget/core/export-reservation.spec.ts` in `packages/Angular` → FAIL (`reserve is not a function`).
- [ ] **Step 3: Implement.** `start(questionId, fields: { file: File | null; fileName: string; progress: number | null; send: UploadSend | null })`; `begin`/`upload` pass `{ file, fileName: file.name, progress: 0, send }`; `reserve` passes `{ file: null, fileName: 'doodle.png', progress: null, send: null }`. `release(token)`: return if `!isCurrent(token)`; else `write(token.questionId, idleRecord(token.seq, null))`. Never commits.
- [ ] **Step 4:** same command → PASS; also `settled-validation.spec.ts` PASS unchanged.
- [ ] **Step 5: Commit** `feat(forms-ng): reserve a question while its drawing is still exporting (#333)`.

### Task 2: Pad reports through `exportSink`; question component wires it to the store

**Files:**
- Modify: `components/questions/doodle-pad.component.ts` (`drawn` output → `exportSink` input; `emitPng`)
- Modify: `components/questions/form-question.component.ts` (`onDoodleDrawn` → `doodleExports`), `form-question.component.html:428`
- Modify: `components/questions/doodle-upload-race.wiring.spec.ts` — ONE assertion, `this.drawn.emit({ subject: claim.subject,` → `sink.delivered({ subject: claim.subject,` (the output it names no longer exists; same intent). Recorded under Rulings.
- Test: `components/questions/doodle-export-reservation.wiring.spec.ts` (already committed)

**Interfaces:**
- Consumes: Task 1 `reserve`/`release`, `UploadToken`.
- Produces (in `doodle-pad.component.ts`):
  ```ts
  export interface DoodleExportSink<R> {
    started(subject: string): R;
    delivered(capture: DoodleCapture): void;
    released(reservation: R): void;
  }
  public readonly exportSink = input.required<DoodleExportSink<unknown>>();
  ```
  Method syntax on purpose (bivariant params) so a `DoodleExportSink<UploadToken>` binds.
- In `form-question.component.ts`:
  ```ts
  protected readonly doodleExports: DoodleExportSink<UploadToken> = {
    started: (subject) => this.uploads.reserve(subject),
    delivered: (capture) => { void this.onDoodleDrawn(capture) },  // keeps `await this.uploadFile(capture.file, capture.subject);`
    released: (reservation) => this.uploads.release(reservation),
  };
  ```
  Template: `[exportSink]="doodleExports"` replaces `(drawn)="onDoodleDrawn($event)"`.

- [ ] **Step 1:** wiring spec already red (7/8).
- [ ] **Step 2: Implement `emitPng`.** First statements, before any await: `const claim = ...; const sink = this.exportSink(); const reservation = sink.started(claim.subject); let delivered = false; try { ...existing body...; sink.delivered({ subject: claim.subject, file }); delivered = true; } finally { if (!delivered) { sink.released(reservation); } }`. Callers (`onPointerUp`, `undo`) unchanged: `void this.emitPng();`.
- [ ] **Step 3:** Update the pad's `onPointerUp` comment and the `drawn` doc to describe the callback (an output emit after destroy is dropped; a function call is not).
- [ ] **Step 4:** `npx vitest run src/lib/widget/components/questions` → PASS (incl. `pad-captures.spec.ts` unchanged).
- [ ] **Step 5:** `pnpm run typecheck` at repo root → PASS.
- [ ] **Step 6: Commit** `fix(forms-ng): a drawing still exporting holds Next and Submit (#333)` with changeset `.changeset/doodle-export-holds-next.md` (`"@mj-biz-apps/forms-ng": patch`).

### Task 3: Verify

- [ ] `npx vitest run` in `packages/Angular`; `pnpm run typecheck`; `pnpm run lint:ui`; `pnpm run check:release-seed`; `pnpm run check:seed-cadence`.
- [ ] `git diff --quiet origin/next HEAD -- <pad-captures.spec.ts>` and `<settled-validation.spec.ts>`.
- [ ] `pnpm run build:widget`, then `node agent/live-repro.mjs 1500` and `0` against the slot (`:4502/f/doodle-scroll`): one `POST /forms/upload`, no NG0953, thank-you ending; newest Doodle answer row holds a file id.
