# Issue #311 — make an automation dead letter visible and recoverable — Implementation Plan

> **Status: implemented in PR #317.** The text below was corrected after review to describe the code as
> shipped. Where the first draft differed, the task says so: the dead-letter log line moved out of
> `settlementFor` (Task 1); the replay refuses a non-GUID id before any SQL (Tasks 5, 7); the server
> operation is registered from `packages/Server/src/index.ts` and drains as the system user through its
> own provider (Task 7); the Responses tab's reload reads on its own (Task 9); the teardown retires the
> two new core rows (Task 6).
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A final submit's `DeadLetter` logs an error, notifies the form's owner through MJ notifications, and can be replayed from the response detail panel; two diagnosis corrections land with it.

**Architecture:** The drain's `settlementFor` keeps deciding the settlement and hands back the steps it closed; `runAndSettle` writes the dead-letter log line and calls the notice only after `store.Settle` succeeded. A new `dead-letter-notice.ts` beside it does the best-effort owner lookup and send on its own isolated provider, behind a seam. The replay is one fenced `UPDATE` in `claim.ts`, driven by a new Manual Remote Operation `Forms.ReplayAutomationEvent` that then drains the one response. The detail panel reads the response's events through `Forms.GetResponseDetail`.

**Tech Stack:** TypeScript, Vitest, MJ 6.1.6 (`@memberjunction/core`, `@memberjunction/notifications`), Angular 21 standalone components.

**Spec:** the approved brief on issue #311 (pipeline run `i-bizapps-forms-311-20261019172041`, sha256 `25b993bcb8e0`).

## Global Constraints

- `MAX_ATTEMPTS`, `BACKOFF_BASE_SECONDS`, `BACKOFF_MAX_SECONDS`, `LEASE_SECONDS`, `DRAIN_BATCH_SIZE` do not change.
- Sweep job `CronExpression`, `ConcurrencyMode`, `NotifyUserID` do not change; the sweep never returns `Success: false` for a dead letter.
- `dispatch-automation.ts` Action/Agent `Success: false` stays non-retryable.
- Notification type name exactly `Form Automation Failed`; `DefaultInApp: true`, `DefaultEmail: false`, `DefaultSMS: false`, `AllowUserPreference: true`; no template lookups; no `sync` block; no `*__Metadata_Sync.sql`.
- `@memberjunction/notifications`: caret peer `^6.1.0-edge.6` in `packages/CoreEntitiesServer`, dependency `^6.1.6` in `apps/MJAPI`.
- Remote Operation `Forms.ReplayAutomationEvent`, `RequiredScope` `forms:write`, `GenerationType` `Manual`, category `Forms`; input `FormsReplayAutomationEventInput { FormAutomationEventID: string }`; output `FormsReplayAutomationEventOutput { FormAutomationEventID: string; Status: 'Pending' }`.
- Never hand-edit `packages/*/src/**/generated/**`; never write it from a script.
- Every `FormAutomationEvent` read passes `BypassCache: true`.
- UI: design tokens only, `<mjf-icon>` for icons in the new UI.
- No replay of `Abandoned` events; no event list on the Responses grid.

## Review Focus

- A `SendNotification` that RETURNS `success: false` (type not seeded on the host yet — the normal state before a release) must be logged as a failure with the response id, not as sent. Test in Task 2.
- A response whose `FormResponse` row cannot be read (deleted after submit) must log and send nothing, never throw into the settle. Test in Task 2.
- The notice must never run for `Pending`, `Complete` or `Abandoned` settlements, including an abandoned partial on its last attempt. Test in Task 2.
- A replay of an event that is `Running`/`Pending`/`Complete` must change nothing (fence on `Status = 'DeadLetter'`). Test in Task 5 (shape) and the opt-in DB suite.
- A notice failure must not delay or change the settle write (settle happens; status `DeadLetter`). Test in Task 2.

---

### Task 1: A final's dead letter logs one error

**Files:**
- Modify: `packages/CoreEntitiesServer/src/automation/outbox/drain.ts` (`settlementFor` returns the closed steps; `runAndSettle` logs)
- Test: `packages/CoreEntitiesServer/src/automation/outbox/__tests__/drain.spec.ts` (`describe('giving up')`)

**Interfaces:** Produces nothing new.

- [ ] **Step 1: Write the failing test** — `it('a final dead letter logs ONE error line naming the response, the trigger and the steps closed')`: `engine.next = failing`, `claimed({ AttemptCount: MAX_ATTEMPTS })`; filter `logged` for `'dead-lettered'`; expect length 1, containing `RESPONSE`, `'OnComplete'`, `'step-a, step-b'`.
- [ ] **Step 2: Run** `cd packages/CoreEntitiesServer && npx vitest run src/automation/outbox/__tests__/drain.spec.ts` — expect the new test FAILS (0 lines).
- [ ] **Step 3: Implement** — one `LogError` shaped like the Abandoned line: `[Forms automation drain] ${event.Trigger} automations of response ${id} dead-lettered: ${reason} Steps closed: ${closed list or 'none'}.` Share the "steps closed" formatting between the two lines (`stepsClosed` in `dead-letter-notice.ts`). As shipped, the line is written in `runAndSettle`, outside the settle's `try` and only after `store.Settle` returned true, so a drain that lost its lease logs no dead letter (the first draft put it in `settlementFor`'s non-partial branch, before the settle).
- [ ] **Step 4: Run** the spec — all pass. **Step 5: Commit** `feat(automation): log a final submit's dead letter`.

### Task 2: Notify the form's owner of a final's dead letter

**Files:**
- Create: `packages/CoreEntitiesServer/src/automation/outbox/dead-letter-notice.ts`
- Create: `packages/CoreEntitiesServer/src/automation/outbox/__tests__/dead-letter-notice.spec.ts`
- Modify: `drain.ts` (call it after a final settles `DeadLetter`; thread the seam), `drain.spec.ts` (drain-level: notice called once for a final dead letter, never for an abandoned partial or a retry)
- Modify: `packages/CoreEntitiesServer/package.json` (peer `"@memberjunction/notifications": "^6.1.0-edge.6"`), `apps/MJAPI/package.json` (dep `"@memberjunction/notifications": "^6.1.6"`), `pnpm-lock.yaml` (both importers, pointing at the existing `@memberjunction/notifications@6.1.6(...)` snapshot with the same peer suffix as each importer's other MJ entries)
- Create: `metadata/notification-types/.mj-sync.json` (entity `MJ: User Notification Types`, `filePattern` `**/.*.json`, pull block like `metadata/remote-operations/.mj-sync.json`, no template lookups), `metadata/notification-types/.form-automation-failed-type.json` (one record, `primaryKey.ID` from `uuidgen`, fields per Global Constraints plus `Description`, `Icon: "fa-triangle-exclamation"`, `Priority` like MJ's)

**Interfaces:**
- Produces:
  ```ts
  export const DEAD_LETTER_NOTIFICATION_TYPE = 'Form Automation Failed';
  export interface DeadLetterNotice { responseId: string; eventId: string; trigger: ResponseSubmittedTrigger; reason: string; stepsClosed: string[] }
  /** The two MJ effects the notice needs — a seam, so specs need no database or engine. */
  export interface DeadLetterNoticeSeams {
    readonly findOwner?: (responseId: string, provider: DatabaseProviderBase, contextUser: UserInfo) => Promise<{ formName: string; ownerUserId: string | null } | null>;
    readonly send?: (params: SendNotificationParams, contextUser: UserInfo) => Promise<{ success: boolean; errors?: string[] }>;
  }
  /** Best-effort; never throws. */
  export async function sendDeadLetterNotice(notice: DeadLetterNotice, contextUser: UserInfo, source: IMetadataProvider | null, seams?: DeadLetterNoticeSeams): Promise<void>;
  ```
  `DrainSeams` gains `readonly notice?: DeadLetterNoticeSeams`.

- [ ] **Step 1: Failing tests in `dead-letter-notice.spec.ts`** (fake provider via `makeFakeProvider` for the isolated instance, as `drain.spec.ts` `source()` does):
  - owner present → `send` called once with `{ userId: owner, typeNameOrId: 'Form Automation Failed', title containing formName, message containing reason and 'step-a, step-b', resourceConfiguration: { FormResponseID: RESPONSE, FormAutomationEventID: EVENT } }`, context user = drain user.
  - `ownerUserId: null` → `send` not called; exactly one `LogStatus` line containing `RESPONSE`.
  - `findOwner` returns `null` (response gone) → no send; one status line with `RESPONSE`.
  - `send` throws → resolves; exactly one `LogError` containing `RESPONSE`.
  - `send` returns `{ success: false, errors: ['Notification type not found: Form Automation Failed'] }` → one `LogError` containing `RESPONSE` and the error.
  - `findOwner` throws → resolves; one `LogError` with `RESPONSE`.
- [ ] **Step 2: Failing drain tests** in `drain.spec.ts`: inject `notice: { findOwner, send }` through `DrainSeams`; final last-attempt retry → one send, settlement still `DeadLetter`; `send` throws → settlement `DeadLetter`, `report.deadLettered === 1`; abandoned partial on last attempt → zero sends; a retry → zero sends.
- [ ] **Step 3: Run both specs — new tests fail.**
- [ ] **Step 4: Implement.** Default `findOwner`: on an isolated provider (`withIsolatedProvider`, as `closeOpenRuns`), `RunViews` with `BypassCache` not needed (not outbox): `FormResponse` by `ID` (`Fields: ['FormID']`, `ResultType: 'simple'`) then `Form` by that ID (`Fields: ['Name','OwnerUserID']`); a failed `RunView` throws with its `ErrorMessage`. Default `send`: `await NotificationEngine.Instance.Config(false, contextUser); return NotificationEngine.Instance.SendNotification(params, contextUser)`. In `drain.ts`, call `sendDeadLetterNotice` from `runAndSettle` only after `store.Settle` returned true and `settlement.status === 'DeadLetter'` (a lost lease sends nothing), passing the closed steps and reason — so `settlementFor` returns the closed steps alongside the settlement, or the call moves to where both are known; keep `settlementFor` small.
- [ ] **Step 5: Package wiring** — add the peer/dep and lockfile importer entries; for local resolution only, replace the worktree's `packages/CoreEntitiesServer/node_modules` symlink with a real directory of symlinks to every entry of the main checkout's, plus `@memberjunction/notifications → /Users/sohamdesai/Projects/mj-dev/MJ/packages/Communication/notifications` (never `pnpm install`).
- [ ] **Step 6: Metadata** — write the two files under `metadata/notification-types/`.
- [ ] **Step 7: Run** specs, `pnpm --filter @mj-biz-apps/forms-core-entities-server run typecheck`, `node .github/scripts/check-dependency-model.mjs`. **Commit** `feat(automation): notify a form's owner when a final submit dead-letters`.

### Task 3: A failed record write is not retryable

**Files:** Modify `packages/CoreEntitiesServer/src/binding/binding-executor.ts:381`; test `packages/CoreEntitiesServer/src/binding/__tests__/binding-executor.spec.ts:310`.

- [ ] **Step 1:** Change the spec at line 310 to `it('reports a failed write as NOT retryable — a Save() the entity layer refuses fails the same way every attempt')`, expecting `retryable` `false`. Run — FAILS.
- [ ] **Step 2:** `fail('candidate', false, …)` in the `writeRecord` catch, with a one-line why comment. Run — passes. **Commit** `fix(binding): a refused record write is not retryable`.

### Task 4: State the real retry window

**Files:** `docs/local-host.md` ("Operating the automation outbox" paragraph), `metadata/scheduled-jobs/.forms-scheduled-jobs.json` (`_comments` only), `drain.ts` header ("every 30 seconds").

- [ ] Replace "about 30, 60, 90 and 120 s" / "about two minutes" with: the scheduler treats a job as due up to 1 s early and then runs it again at the same mark, so the sweep runs about every 15 s; the fifth attempt lands 55 to 85 s after submit. Add the same to the job's `_comments`; leave `CronExpression` and `Name` as they are.
- [ ] Verify: `grep -rn "about two minutes\|30, 60, 90" docs metadata packages/CoreEntitiesServer/src` → nothing. **Commit** `docs(automation): state the measured retry window`.

### Task 5: The replay statement

**Files:** Modify `packages/CoreEntitiesServer/src/automation/outbox/claim.ts`; test `__tests__/claim.spec.ts`; opt-in DB test in `packages/CoreEntitiesServer/src/engines/__tests__/FormSubmissionEngine.integration.spec.ts` (it owns the DB world; `claim.spec.ts` points there already).

**Interfaces:** Produces
```ts
/** Re-queue a DeadLetter event for a replay; `false` when it is not dead-lettered (nothing written). */
export async function replayDeadLetteredEvent(provider: DatabaseProviderBase, eventId: string, contextUser: UserInfo): Promise<boolean>;
```

- [ ] **Step 1: Failing shape tests**: SQL Server statement contains `[Status] = 'Pending'`, `[AttemptCount] = 0`, `[IsReplay] = 1`, `[NextAttemptAt] = SYSDATETIMEOFFSET()`, `[LastError] = NULL`, `[CompletedAt] = NULL`, and `WHERE [ID] = '<event id>' AND [Status] = 'DeadLetter'` for a GUID event id; PostgreSQL uses `true` and `now()`; `{AffectedRows: 0}` → `false`; no readable count → throws naming the event; a non-GUID id throws before any SQL (SQL Server would fail the `uniqueidentifier` conversion).
- [ ] **Step 2: Implement** through `affectedOne`, both dialects, also stamping `__mj_UpdatedAt`; `LockedBy`/`LockedUntil` are already NULL on a settled event.
- [ ] **Step 3: DB test** (skipped unless `FORMS_INTEGRATION_DB`): insert a `DeadLetter` row and a `Complete` row for a fixture response; replay both; assert the five columns on the first and that the second is unchanged and returned `false`.
- [ ] **Step 4: Run** `claim.spec.ts`. **Commit** `feat(automation): the fenced replay of a dead-lettered event`.

### Task 6: The Remote Operation metadata

**Files:** `metadata/remote-operations/.forms-remote-operations.json` (new record after `Get Response Detail`, `primaryKey.ID` from `uuidgen`, `Name` `Replay Automation Event`, `Description` saying it re-queues a dead-lettered final's automations and runs them once now, `InputTypeDefinition: "@file:types/forms-replay-automation-event.input.ts"`, output likewise, `ExecutionMode Sync`, `RequiredScope forms:write`, `RequiresSystemUser false`, `GenerationType Manual`, `CodeApprovalStatus Approved`, `Status Active`); `metadata/remote-operations/types/forms-replay-automation-event.{input,output}.ts`; `types/forms-get-response-detail.output.ts` gains `FormsResponseAutomationEvent { ID; Trigger: 'OnComplete' | 'OnPartial'; Status: 'Pending' | 'Running' | 'Complete' | 'DeadLetter' | 'Abandoned'; AttemptCount: number; LastError: string | null; CompletedAt: string | null }` and `AutomationEvents: FormsResponseAutomationEvent[]` (oldest first). No import lines.

- [ ] Write, check the JSON parses, **commit** `feat(operations): declare Forms.ReplayAutomationEvent`.
- [ ] Both new records are created under fixed UUIDs, so list them as roots in `migrations-teardown/V001__Retire_Forms_Core_Rows.sql` (the operation's `CategoryID` and the notice type's references are nullable or absent, so nothing else reaches them and `mj app remove` would leave them behind). Added in review.

---

**Tasks 7–9 need `npx mj codegen --skipdb` against a database that holds Task 6's metadata.** They ran
in a later slot-placed run, against the slot's own database.

### Task 7: Regenerate and the server operation

**Files:** generated `packages/Entities/src/generated/remote_operations.ts` (CodeGen only); create `packages/CoreEntitiesServer/src/operations/ReplayAutomationEventServerOperation.ts`; modify `packages/CoreEntitiesServer/src/index.ts` (export the class and `LoadReplayAutomationEventOperation`) and `packages/Server/src/index.ts` (call `LoadReplayAutomationEventOperation()` in `LoadBizAppsFormsServer()`, which lives there); test `operations/__tests__/ReplayAutomationEventServerOperation.spec.ts`.

**Interfaces:** `ReplayAutomationEventServerOperation extends FormsReplayAutomationEventOperation`, registered `'Forms.ReplayAutomationEvent'`. No module-level seam: the spec drives `ExecuteServer` and replaces `replayDeadLetteredEvent` (`claim.js`), `drainAutomationOutbox` (`drain.js`) and `UserCache`'s system user with `vi.mock`.

- [ ] Tests: `DeadLetter` event → the fenced update, then `drainAutomationOutbox({ reason: 'replay', responseId }, systemUser, { source: database })` once — as the host's system user (the author may lack the Form Versions grant the drain reads with) and through the provider the dispatcher gave the operation, not the process provider — output `{ FormAutomationEventID, Status: 'Pending' }`; a drain failure after the update is logged with both ids and the call still returns `Pending`; `false` from the replay → refusal naming the event: "is not dead-lettered (it is <Status>)", or "already replayed or changed" when the event read as `DeadLetter` (a concurrent replay won); a non-GUID id → refused as input before any read; unauthorized (magic-link user) → `Authorize` false before any write. `Authorize` = `authorizeFormAuthoring`. The response id comes from a `BypassCache: true` read of the event.
- [ ] `packages/Entities/src/remote-operations.spec.ts` passes.

### Task 8: `GetResponseDetail` returns the events

**Files:** `packages/CoreEntitiesServer/src/engines/FormReportingEngine.ts` (`GetResponseDetail`: one more view in the same `RunViews`, `FormAutomationEvent` by `FormResponseID`, `BypassCache: true`, order `__mj_CreatedAt`, degrade as "automation events"); engine harness spec.

### Task 9: The badge and the button

**Files:** `packages/Angular/src/lib/responses/response-models.ts`, `response-aggregations.ts` (map events), `response-detail.component.ts` (badge `DeadLetter` + `LastError`, "Retry automations" button only for a `DeadLetter` event, calls `runOperation(new FormsReplayAutomationEventOperation(), { FormAutomationEventID }, …)` then emits `Reload`), `responses-tab.component.ts` and the record-view host `response-form.component.ts` (reload on `Reload`, keeping the open detail on screen; the tab's `ReloadDetail` reads on its own, without the open lock, and lands only while the detail it re-reads is still open, so a reader who pressed Back is not given it again); component spec with the fake operations helper; `docs/local-host.md` `DeadLetter` row names the button first, SQL kept as fallback.
