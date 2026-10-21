# Split `mj-form.component.ts` by sub-abstraction (#323) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move three self-contained pieces of per-fill state out of the respondent widget's root component into plain classes under `packages/Angular/src/lib/widget/core/`, with no behaviour change.

**Architecture:** One commit per class, in the order PrefetchScheduler, CommitLedger, SubmitTimer. Code moves verbatim into a class with a PascalCase public surface fixed by the issue; the component keeps every method that ACTS (sets a signal, ends the form, flushes the autosave) as a thin caller. Each class gets a behavioural Vitest spec beside it, in the shape of `core/autosave-controller.spec.ts`.

**Tech Stack:** Angular 21 signals, TypeScript, Vitest (fake timers), `ngc` + esbuild widget bundle.

**Spec:** issue #323 body ("Design decided", "Done when", "Out of scope").

## Global Constraints

- No behaviour change: no new logic, no changed timing constants (the 250 ms tick, `WELCOME_IMAGE_WAIT_MS`), no changed host event names or payloads, no changed console messages.
- Do not touch `builder/`, `mj-form.component.html`, `mj-form.component.css`, `core/autosave-controller.ts`, `core/image-prefetch.ts`, `core/welcome-gate.ts`, `core/turnstile-gate.ts`, `packages/CoreEntitiesServer`, `packages/Server`, `metadata/`, `migrations/`.
- `endEarly`, `sealEarlyEnd`, `trySeal`, `bankPassedSubmitPoints`, Turnstile handlers, host events, `load`, `adoptResume`, `showScreen`, `onSubmit`, `savePartial`, `buildSubmission` stay in the component.
- Every widget `*.spec.ts` other than `image-prefetch.wiring.spec.ts` stays byte-identical. No `it(...)` in a wiring spec is deleted; an assertion on a moved method body is replaced by a behavioural test in the new class's spec, and the wiring `it` keeps (or gains) the source assertion on the component's call site.
- At every commit, in `packages/Angular`: `pnpm test`, `npm run typecheck`, `pnpm run build` pass.
- Commit titles name the one class: `refactor(widget): extract PrefetchScheduler`, `refactor(widget): extract CommitLedger`, `refactor(widget): extract SubmitTimer`.
- Comments that explain a moved field or method move with it; comments in the component that named a moved member are updated to the new name.

## Review Focus

1. A stale idle callback from an earlier load (load → reload before the browser goes idle): must start nothing, and the new load's own callback must start exactly once. Test in Task 1.
2. A `load()` that resumes after `ngOnDestroy`: the component still sets `destroyed = true` before `Cancel()`, and the scheduler reads `isDisposed()` at `Start()` time, not at construction. Test in Task 1.
3. `load()` sets `loadedAnswers` after the resume prefill: the ledger's `Reset` is called twice in `load()` (the per-fill reset at the top, then `Reset(this.draftKeyNow())` after `adoptResume`). Between the two, phase is `'loading'`, so neither `onCommit` nor a new `savePartial` can write the ledger; a retry only runs from the `error` phase, which only a failed load sets, so no earlier autosave controller exists. The second `Reset` is therefore equivalent to today's single assignment. Test in Task 2 (`Reset` replaces all three).
4. `actOnVerdict` with `sentKey` while nothing is committed (`committed === undefined`): must not act. Test in Task 2 (`IsCommitted` false before any `Commit`, and after `Commit(undefined)`).
5. `Start()` called while a ticker is already running (two submits back to back): must leave exactly one interval, starting from 0. Test in Task 3.

---

### Task 1: `PrefetchScheduler`

**Files:**
- Create: `packages/Angular/src/lib/widget/core/prefetch-scheduler.ts`
- Create: `packages/Angular/src/lib/widget/core/prefetch-scheduler.spec.ts`
- Modify: `packages/Angular/src/lib/widget/mj-form.component.ts` (fields at 349-358, `ngOnDestroy`, `load`, `startIntake`, `holdForWelcomeImages`, methods at 637-690)
- Modify: `packages/Angular/src/lib/widget/image-prefetch.wiring.spec.ts` (`prefetch lifecycle` and `welcome gate wiring` blocks only)

**Interfaces:**
- Produces: `export class PrefetchScheduler { constructor(prefetch: (urls: readonly string[]) => PrefetchHandle, isDisposed: () => boolean); Plan(form: WidgetForm, opening: WidgetPhase, gated: boolean): void; Start(): void; Cancel(): void }`
- Component wiring: `private readonly prefetcher = new PrefetchScheduler(prefetchImages, () => this.destroyed);`

- [ ] **Step 1: Write the failing spec** `core/prefetch-scheduler.spec.ts`, fake timers, `requestIdleCallback` absent in node so the `setTimeout(start, 0)` path runs; one test stubs it with `vi.stubGlobal('requestIdleCallback', ...)` to prove that path is preferred. A fake `prefetch = vi.fn(() => ({ cancel: vi.fn() }))`. Minimal `WidgetForm` via `projectionForm`/`fullForm` fixtures already used in `core/widget-form.spec.ts` (or a hand-built object cast to `WidgetForm` with `render.pages` holding one image question). Tests:
  - `Plan with an opening other than welcome or ready collects no URLs` — for `'loading'`, `'done'`, `'error'`, `'expired'`: `Plan(form, phase, false)`, run timers, `Start()`: `prefetch` called with `[]` at most (assert never called with a non-empty array; with no schedule, after timers it was not called).
  - `Plan with gated = true does not schedule` — run all timers: `prefetch` not called; then `Start()`: called once with the form's later image URLs.
  - `Plan ungated starts when idle` — `prefetch` called once after `vi.runAllTimers()` with the URLs.
  - `prefers requestIdleCallback when present`.
  - `a Cancel before the idle callback fires makes that callback a no-op` — `Plan(..., false)`, `Cancel()`, run timers: not called.
  - `a stale idle callback from an earlier plan cannot start the new plan twice` — `Plan`, `Cancel`, `Plan`, run timers: called exactly once.
  - `Start after isDisposed() is true does not call prefetchImages` — disposed flag flipped after construction, before `Start()`.
  - `Start twice calls prefetchImages once`.
  - `Cancel cancels the running queue and lets the next plan start again` — handle's `cancel` called once; after a new `Plan`+`Start`, `prefetch` called a second time.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/widget/core/prefetch-scheduler.spec.ts` — FAIL (module not found).
- [ ] **Step 3: Implement** `prefetch-scheduler.ts`: move `prefetch`, `prefetchUrls`, `prefetchStarted`, `prefetchGeneration` and the bodies of `planPrefetch`, `schedulePrefetchWhenIdle` (private), `startPrefetch`, `cancelPrefetch` verbatim, renaming only `this.destroyed` → `this.isDisposed()` and `this.startPrefetch()` → `this.Start()`. Move the field doc comment and the `planPrefetch` doc comment with them. Component: replace the fields with `prefetcher`, delete the four methods, call `this.prefetcher.Cancel()` / `.Plan(form, opening, gated)` / `.Start()` at the same call sites in the same order (`ngOnDestroy`: `destroyed = true` then `Cancel()`).
- [ ] **Step 4: Update `image-prefetch.wiring.spec.ts`**: in each `it` that sliced a moved body, keep the `it`, keep/rewrite its assertions on component call sites (`this.prefetcher.Cancel()` before `this.prefetcher.Plan(form, opening, gated)` in `load()`; `this.destroyed = true` before `this.prefetcher.Cancel()` in `ngOnDestroy`; constructor wiring `new PrefetchScheduler(prefetchImages, () => this.destroyed)`; `startIntake` contains `this.prefetcher.Start()`; `imagesSettled: () => this.prefetcher.Start()`; `this.prefetcher.Plan(` before `this.holdForWelcomeImages(`), and replace each moved-body assertion with a comment naming its replacement test in `core/prefetch-scheduler.spec.ts`. Update the file header comment.
- [ ] **Step 5: Run** in `packages/Angular`: `pnpm test`, `npm run typecheck`, `pnpm run build` — all exit 0.
- [ ] **Step 6: Commit** `refactor(widget): extract PrefetchScheduler`.

### Task 2: `CommitLedger`

**Files:**
- Create: `packages/Angular/src/lib/widget/core/commit-ledger.ts`, `core/commit-ledger.spec.ts`
- Modify: `packages/Angular/src/lib/widget/mj-form.component.ts` (fields at 377-402, `load`, `judgeCommittedAnswers`, `judgedAnswers`, `noticeUnsavedCommit`, `actOnVerdict`, `savePartial`)

**Interfaces:**
- Produces: `export class CommitLedger { Reset(loadedAnswers: string | undefined): void; Commit(key: string | undefined): void; Acknowledge(answersKey: string, result: FormsSaveResponseOutput): void; JudgedAnswers(): string | undefined; VerdictFor(key: string): FormsSaveResponseOutput | undefined; HasUnjudgedCommit(): boolean; IsCommitted(key: string): boolean }`. No Angular import, no side effect.
- Component: `private readonly ledger = new CommitLedger();`

- [ ] **Step 1: Write the failing spec** `core/commit-ledger.spec.ts`:
  - `before any acknowledge, JudgedAnswers() is the loaded key` (`Reset('L')` → `'L'`; fresh ledger → `undefined`).
  - `after Acknowledge, JudgedAnswers() is the acknowledged key`.
  - `VerdictFor returns the result only for the acknowledged key` (other key → `undefined`; before any ack → `undefined`).
  - `HasUnjudgedCommit() is true after a Commit of a new key and false after that key is acknowledged`; false with no commit; false after `Commit(undefined)`.
  - `IsCommitted is true only for the committed key` (false before any commit, false after `Commit(undefined)`).
  - `Reset clears all three` — after commit+ack, `Reset('N')`: `JudgedAnswers()==='N'`, `VerdictFor(oldKey)` undefined, `HasUnjudgedCommit()` false, `IsCommitted(oldKey)` false; `Reset(undefined)` → `JudgedAnswers()` undefined.
- [ ] **Step 2: Run** the spec — FAIL (module not found).
- [ ] **Step 3: Implement** the class, moving the three field doc comments with their fields. Component edits, each a read of the ledger then the same act:
  - `load()`: the three `= undefined` lines → `this.ledger.Reset(undefined);`; `this.loadedAnswers = this.draftKeyNow();` → `this.ledger.Reset(this.draftKeyNow());` keeping its comment and adding why a second Reset is equivalent (Review Focus 3).
  - `judgeCommittedAnswers`: `this.ledger.Commit(key)`; `key === this.ledger.JudgedAnswers()`; the two-check comment stays; `const verdict = this.ledger.VerdictFor(key); if (verdict) { this.actOnVerdict(verdict, key); }`.
  - Delete `judgedAnswers()`; `savePartial` uses `this.ledger.JudgedAnswers()` and `VerdictFor(sentKey)` the same way, and `this.ledger.Acknowledge(sentKey, res)` in place of the `lastAcknowledged` assignment.
  - `noticeUnsavedCommit`: `if (this.ledger.HasUnjudgedCommit()) { this.saveNotice.set(true); }`.
  - `actOnVerdict`: `!this.ledger.IsCommitted(sentKey)` in place of `sentKey !== this.committedAnswers`.
  - Update `{@link lastAcknowledged}` / `judgedAnswers` mentions in component comments.
- [ ] **Step 4: Run** the three gates — exit 0.
- [ ] **Step 5: Commit** `refactor(widget): extract CommitLedger`.

### Task 3: `SubmitTimer`

**Files:**
- Create: `packages/Angular/src/lib/widget/core/submit-timer.ts`, `core/submit-timer.spec.ts`
- Modify: `packages/Angular/src/lib/widget/mj-form.component.ts` (fields at 261-272, `onSubmit`, methods at 1111-1147)

**Interfaces:**
- Produces: `export class SubmitTimer { readonly Elapsed: Signal<number>; Start(): void; Stop(): void; LogOutcome(ok: boolean): void }` — `Elapsed` is a private `signal(0)` exposed with `.asReadonly()`; `Start()` records `Date.now()` for `LogOutcome`.
- Component: `private readonly submitTimer = new SubmitTimer();` declared before `waitMessage`, which becomes `computed(() => submitWaitMessage(this.submitTimer.Elapsed()))`.

- [ ] **Step 1: Write the failing spec** `core/submit-timer.spec.ts` (fake timers, `vi.setSystemTime`):
  - `Elapsed() is 0 before Start`.
  - `Elapsed() grows after 250 ms` (`advanceTimersByTime(249)` → 0; `250` → 250; `500` → 500).
  - `Elapsed() is 0 again after Stop, and stays 0` (advance after Stop).
  - `Stop twice does not throw`; `Stop before Start does not throw`.
  - `Start while running restarts from 0 with one interval` (`vi.getTimerCount()` is 1).
  - `LogOutcome writes one console.info line containing completed or failed and the elapsed ms` — spy `console.info`; `Start()`, advance 1234, `LogOutcome(true)` → one call, string equal to `[mj-form] submit completed in 1234ms (client round trip; see the API log for the server-side stage breakdown)`; same for `false` → `failed`.
- [ ] **Step 2: Run** the spec — FAIL (module not found).
- [ ] **Step 3: Implement**, moving the `submitElapsed` doc comment, the `startSubmitTicker` doc comment and the `logSubmitTiming` doc comment with their code; the 250 and the message text verbatim; keep the `eslint-disable-next-line no-console` line. Component `onSubmit`: drop the local `const startedAt = Date.now();`; `this.submitTimer.Start()`; `LogOutcome(true)` / `LogOutcome(false)` where `logSubmitTiming` was; `this.submitTimer.Stop()` in the `finally`.
- [ ] **Step 4: Run** the three gates — exit 0. Then `grep -nE "^\s*(private|protected|public)?\s*(readonly )?(prefetchUrls|prefetchStarted|prefetchGeneration|committedAnswers|lastAcknowledged|loadedAnswers|submitElapsed|submitTicker)\b" mj-form.component.ts` — no output.
- [ ] **Step 5: Commit** `refactor(widget): extract SubmitTimer`.

### Task 4: Verify (no code)

- [ ] Check out each of the three commits; run `pnpm test`, `npm run typecheck`, `pnpm run build` in `packages/Angular`.
- [ ] `git diff origin/next --stat -- packages/Angular/src/lib/widget/*.spec.ts` lists only `image-prefetch.wiring.spec.ts`.
- [ ] `pnpm run build:widget`, then in the slot: open a published form's `/f/:slug` on the slot API, fill one answer, blur, see "Saved"; submit, reach the ending screen.
- [ ] Publish-only checks from the repo root: `pnpm run check:release-seed`, `pnpm run check:seed-cadence`.
