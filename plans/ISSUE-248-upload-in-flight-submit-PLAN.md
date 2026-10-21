# #248 Submit waits for in-flight uploads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A submit (or Next) started while a FileUpload/Doodle upload is on the wire waits for it; uploads retry a bad moment by themselves; the two failures a respondent must act on show as one quiet line with a text link.

**Architecture:** `FormUploadStore` becomes the one owner of an upload's life: it runs the transport call it is handed, retries transient failures on a capped schedule, keeps the call so it can restart it, and answers `whenSettled()`. The transport classifies a failure with a typed `UploadError.kind`. `MjFormComponent.onSubmit` and both renderers' Next await the store before judging; the overlay reads a computed overlay phase.

**Tech Stack:** Angular 21 signals, Vitest (node, fake timers), the `MjFormHarness`.

**Spec:** GitHub issue #248 brief (design decided; Done-when list).

## Global Constraints

- All work in `packages/Angular/src/lib/widget`. No server change; `FormUploadService.upload`'s request shape unchanged.
- Do not touch `savePartial`, `AutosaveController`, `bankSubmitPoint(s)`, the Turnstile gate, the nothing-to-submit gate, or `doodle-pad.component.ts` export timing.
- Retry delays: `[5_000, 15_000, 60_000]`; the length is the cap (3 retries, 4 attempts). Never retry a 4xx.
- Copy, verbatim:
  - overlay while waiting: `Saving your file…`
  - refused fallback: `That file was not accepted. Choose a different file.`; link `Choose again`
  - retries spent: `Your file did not save. Check your connection and try again.`; link `Try again`
- CSS: `--mj-*`/`--mjf-*` tokens only; no icon on the failure line; normal text colour.

## Review Focus

1. A `connect()` (reload) while a retry is sleeping — the retry must stop (seq no longer current) and `whenSettled` must resolve. Test in Task 2.
2. Double-tap Next while it waits — must advance once. Guard: after the await, return if the current page/question changed. Test in Task 4.
3. A failed upload on a question a rule has hidden must not block submit — `onSubmit` judges only visible answerable questions. Test in Task 5.
4. A transport that throws a plain `Error` (mock service, parse error) — treated as transient (retried). Test in Task 2.
5. Submit again with an `unsaved` question restarts it and waits again; a `refused` one is not restarted. Test in Task 5.

---

### Task 1: Transport says which kind of failure it is

**Files:** Modify `api/form-upload.interface.ts`, `api/form-upload.service.ts`; Test `api/form-upload.service.spec.ts`.

**Interfaces — Produces:**
- `export type UploadFailureKind = 'refused' | 'transient';`
- `export class UploadError extends Error { constructor(message: string, readonly kind: UploadFailureKind) }` (in the interface file: it is part of the seam).
- `export function uploadFailure(status: number, body: unknown): UploadError` in the service file: kind `refused` for 400–499, else `transient`; message from `uploadErrorMessage`.

- [ ] Tests: `uploadFailure(413, '')` → kind `refused`, message `That file was not accepted. Choose a different file.`; `uploadFailure(500, '')` → `transient`; `uploadFailure(0, '')` → `transient`; server sentence wins for 415. Existing `uploadErrorMessage` specs updated to the new fallback.
- [ ] Service: `onload` non-2xx rejects `uploadFailure(...)`; `onerror`/`onabort` reject `UploadError(..., 'transient')`; the no-endpoint reject is `UploadError('Uploads are not available for this form.', 'refused')` (no retry can fix configuration). Parse errors on a 2xx stay plain `Error` (treated transient by the store).
- [ ] Run `npx vitest run src/lib/widget/api` → PASS. Commit.

### Task 2: The store runs, retries, restarts and waits

**Files:** Modify `core/upload-store.ts`; Test `core/upload-store.spec.ts`, `core/doodle-persistence.spec.ts` (update `fail` call shape).

**Interfaces — Consumes:** `UploadError`, `UploadedFile`, `UploadProgress` from Task 1.
**Produces:**
- `export const UPLOAD_RETRY_DELAYS_MS = [5_000, 15_000, 60_000] as const;` (mirrors the autosave's private schedule; duplication documented as intentional — the autosave must not change in this PR).
- `export const UPLOAD_UNSAVED_MESSAGE = 'Your file did not save. Check your connection and try again.';`
- `export type UploadFailure = { readonly kind: 'refused' | 'unsaved'; readonly message: string };`
- `UploadView.error: string | null` is replaced by `UploadView.failure: UploadFailure | null`.
- `export type UploadSend = (onProgress: UploadProgress) => Promise<UploadedFile>;`
- `upload(questionId: string, file: File, send: UploadSend): Promise<void>` — `begin`, then attempts; before each attempt and after each sleep checks the token is current (stop silently if not); `UploadError` with kind `refused` → `fail` with `{kind:'refused', message}` at once; anything else → sleep the next delay (record stays `uploading`, progress `null`), after the cap → `fail` with `{kind:'unsaved', message: UPLOAD_UNSAVED_MESSAGE}`. The record keeps `send` (not in the view) so it can be restarted.
- `restart(questionId: string): Promise<void>` — re-runs `upload` with the record's file and send; no-op when there is none.
- `retryUnsaved(questionIds: readonly string[]): void` — restarts each listed question whose failure kind is `unsaved`.
- `whenSettled(questionIds?: readonly string[]): Promise<void>` — resolves when none of the listed (default: all) records is `uploading`; at once when none is. Waiters are re-checked inside `write()` (the only writer of the records signal), so `succeed`/`fail`/`clear`/`connect` resolve them.
- `readonly waiting: Signal<boolean>` — true while any `whenSettled` call is pending.
- `failureAmong(questionIds: readonly string[]): UploadFailure | null` — first failure among listed questions; pure.
- `begin`/`succeed`/`fail(token, failure: UploadFailure)`/`setProgress`/`clear` keep their supersede rules.

- [ ] Tests (fake timers): whenSettled resolves at once with no upload; after `succeed`, after `fail`, after `clear` of the only uploading record; `waiting` true while pending, false after. `upload` retries a transient failure at 5 s, 15 s, 60 s (send called 1,2,3,4 times exactly at those boundaries, not before), then `failure.kind === 'unsaved'` with the sentence; a refused `UploadError` is not retried (send called once, kind `refused`, its message); a plain `Error` is retried; a superseded token (a newer `begin` or `clear` during the sleep) is not retried; a `connect()` during the sleep stops retries and resolves `whenSettled`; `restart` after `unsaved` succeeds and stores the id; `retryUnsaved` skips `refused`.
- [ ] Implement; update existing `error:` assertions to `failure:`.
- [ ] Run `npx vitest run src/lib/widget/core` → PASS. Commit.

### Task 3: The question component delegates, and shows the quiet line

**Files:** Modify `components/questions/form-question.component.{ts,html,css}`; Test `components/questions/doodle-upload-race.wiring.spec.ts` (update), Create `components/questions/upload-failure.wiring.spec.ts`.

**Interfaces — Consumes:** Task 2's `upload`, `restart`, `clear`, `UploadView.failure`.

- [ ] `uploadFile(file, questionId)` becomes `this.uploads.upload(questionId, file, (onProgress) => this.uploader.upload(file, slug, questionId, onProgress, responseId))` with `slug`/`responseId` read before the call. `retryUpload` → `this.uploads.restart(this.question().id)`. `uploadError` → `uploadFailure = computed(() => this.upload().failure)`.
- [ ] Template, both FileUpload and Doodle branches: delete the `mjf-file__error` block and the Retry button. Add, when `uploadFailure(); as failure`: `<p class="mjf-file__failed" aria-live="polite">{{ failure.message }} <button type="button" class="mjf-file__failed-link" …>` — `refused`: label `Choose again`, FileUpload clears via `uploads.clear(q.id)` and resets the picker's value, Doodle calls the pad's public `clear()` through a `#pad` template ref; `unsaved`: label `Try again`, calls `retryUpload()`.
- [ ] CSS: remove `.mjf-file__error`/`.mjf-file__retry`; add `.mjf-file__failed` (colour `var(--mjf-page-ink)`, 0.875rem) and `.mjf-file__failed-link` (text-style: no background/border, `color: var(--mjf-accent)`, underline, `:focus-visible` uses `var(--mjf-focus-ring)`).
- [ ] Template spec asserts (comments stripped): neither branch contains `mjf-file__error` or `triangle-exclamation`; both contain `Choose again` and `Try again` links bound to the failure kind; the component source holds both sentences only through the store/transport (no `'Retry upload'`). `doodle-upload-race` guards now assert delegation to `this.uploads.upload(` and no `valueChange.emit` on the upload path.
- [ ] Run widget suite + `node scripts/check-ui-tokens.mjs` (repo root) → PASS. Commit.

### Task 4: Next waits for the section's uploads

**Files:** Create `core/settled-validation.ts` + `core/settled-validation.spec.ts`; Modify `components/form-scroll.component.ts`, `components/form-one-question.component.ts`.

**Interfaces — Produces:** `judgeWhenSettled(store: FormUploadStore, runtime: FormRuntime, questions: readonly PublishedFormQuestion[]): Promise<boolean>` — awaits `store.whenSettled(ids)`, then `runtime.touchAll(questions)`, returns `runtime.areValid(questions)`.

- [ ] Test: a required Doodle mid-upload → the promise is pending, no error is shown (`errorFor` null, not touched yet); after `succeed` it resolves `true`; after the retries are spent it resolves `false` with the required error.
- [ ] Scroll `onNext` (non-last), Scroll `onSubmit` (last section, whole form) and OneQuestion `onNext` become async and use `judgeWhenSettled` (both inject `FormUploadStore`); after the await they return if `current()` changed (double-tap guard).
- [ ] Run widget suite → PASS. Commit.

### Task 5: Submit waits, refuses on a failure, shows the overlay text

**Files:** Modify `mj-form.component.{ts,html}`, `core/submit-progress.ts`, `testing/mj-form-harness.ts`, `upload-in-flight-submit.spec.ts`, `mj-form-template.wiring.spec.ts`.

**Interfaces — Produces:** `SAVING_FILE_MESSAGE = 'Saving your file…'` in `submit-progress.ts`; `protected readonly overlay = computed<'saving-file' | 'sending' | null>` (store waiting → `saving-file`, else phase `submitting` → `sending`); harness `uploadStore: FormUploadStore` and `overlayNow`.

- [ ] Repro spec: replace `storeOf` cast with `form.uploadStore`. Add specs: final sent once after `succeed` with file id (and nothing sent before `succeed`); overlay reads `saving-file` while waiting, then `sending`/`done`; retries spent → no final, phase `ready`, banner = `UPLOAD_UNSAVED_MESSAGE`; refused state → no final, phase `ready`, banner = refused sentence; submit again restarts an `unsaved` upload and sends after it succeeds; a failed upload on a hidden question does not block.
- [ ] `onSubmit`: after the phase flip and `await this.autosave?.settle()` (moved before the Preview branch), `const ids = visible answerable ids; this.uploads.retryUnsaved(ids); await this.uploads.whenSettled(ids);` then `failureAmong(ids)` → phase `ready`, `errorText` = failure message, `focusBanner()`, return.
- [ ] Template: overlay `@if (overlay(); as o)` with `o === 'saving-file' ? savingFileMessage : waitMessage()`; template spec pins it.
- [ ] Run `pnpm test`, `pnpm run build` (packages/Angular), `pnpm run lint` (root) → PASS. Commit.
